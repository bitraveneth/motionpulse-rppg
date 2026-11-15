"""UBFC and PURE windows for PhysNet.

A clip is a video plus a pulse curve, or a folder of face images plus a pulse
curve. CHROM and POS never enter this file. The curve is the contact recording
in the dataset, not a heart-rate average.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

import numpy as np

VIDEO_EXT = {".avi", ".mp4", ".mov", ".webm", ".m4v", ".mkv"}
IMAGE_EXT = {".png", ".jpg", ".jpeg"}
WALK_LIMIT = 80_000
MAX_CLIPS = 200
READ_FPS = 30.0
MAX_READ_FRAMES = 900


def ffmpeg_bin() -> str:
    for candidate in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
        if Path(candidate).is_file():
            return candidate
    return "ffmpeg"


def ffprobe_bin() -> str:
    for candidate in ("/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"):
        if Path(candidate).is_file():
            return candidate
    return "ffprobe"


def natural_key(name: str) -> list:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


def ground_truth_rows(text: str) -> List[np.ndarray]:
    rows: List[np.ndarray] = []
    for raw in text.splitlines():
        nums: List[float] = []
        for part in raw.replace(",", " ").split():
            try:
                value = float(part)
            except ValueError:
                continue
            if math.isfinite(value):
                nums.append(value)
        if nums:
            rows.append(np.asarray(nums, dtype=np.float64))
    return rows


def waveform_from_ground_truth(text: str) -> Optional[np.ndarray]:
    rows = ground_truth_rows(text)
    if not rows or rows[0].size < 8:
        return None
    return rows[0]


def times_from_ground_truth(text: str) -> Optional[np.ndarray]:
    rows = ground_truth_rows(text)
    if len(rows) < 3 or rows[0].size < 8 or rows[2].size != rows[0].size:
        return None
    return rows[2]


def waveform_from_pure_json(value: object) -> Optional[np.ndarray]:
    if not isinstance(value, dict):
        return None
    pack = value.get("/FullPackage", value.get("FullPackage"))
    if isinstance(pack, list):
        samples: List[float] = []
        for item in pack:
            if not isinstance(item, dict):
                continue
            raw = item.get("Value", item.get("value"))
            if not isinstance(raw, dict):
                continue
            wave = raw.get("waveform", raw.get("Waveform"))
            if isinstance(wave, list):
                nums = [float(x) for x in wave if isinstance(x, (int, float)) and math.isfinite(float(x))]
                if len(nums) >= 8:
                    return np.asarray(nums, dtype=np.float64)
            elif isinstance(wave, (int, float)) and math.isfinite(float(wave)):
                samples.append(float(wave))
        if len(samples) >= 8:
            return np.asarray(samples, dtype=np.float64)
    for key in ("waveform", "Waveform", "bvp", "BVP", "ppg", "PPG"):
        series = value.get(key)
        if not isinstance(series, list):
            continue
        nums = [float(x) for x in series if isinstance(x, (int, float)) and math.isfinite(float(x))]
        if len(nums) >= 8:
            return np.asarray(nums, dtype=np.float64)
    return None


def align_waveform(
    wave: np.ndarray,
    n_frames: int,
    full_count: int,
    times: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Take the start of the contact curve and stretch it onto the frames we kept."""
    wave = np.asarray(wave, dtype=np.float64).reshape(-1)
    if n_frames < 2 or wave.size < 2:
        raise ValueError("need at least two frames and two pulse samples")
    if times is not None and times.size == wave.size and float(times[-1]) > float(times[0]):
        clock = times - float(times[0])
        span = float(clock[-1]) * (n_frames / max(full_count, 1))
        span = min(span, float(clock[-1]))
        target = np.linspace(0.0, span, n_frames)
        out = np.interp(target, clock, wave)
    else:
        end = int(round(wave.size * (n_frames / max(full_count, n_frames))))
        end = min(wave.size, max(end, 2))
        prefix = wave[:end]
        out = np.interp(
            np.linspace(0.0, 1.0, n_frames),
            np.linspace(0.0, 1.0, prefix.size),
            prefix,
        )
    out = (out - out.mean()) / (float(out.std()) + 1e-8)
    return out.astype(np.float32)


def training_subjects(names: Sequence[str], max_subjects: Optional[int]) -> Tuple[List[str], List[str]]:
    """People to learn from, and people held out of that learning."""
    ordered = sorted(set(names), key=natural_key)
    if not ordered:
        return [], []
    if max_subjects is not None and max_subjects > 0 and max_subjects < len(ordered):
        return list(ordered[:max_subjects]), [ordered[max_subjects]]
    if len(ordered) == 1:
        return ordered, []
    held = max(1, int(round(len(ordered) * 0.2)))
    if held >= len(ordered):
        held = 1
    return ordered[:-held], ordered[-held:]


@dataclass
class ClipRecord:
    subject: str
    kind: str
    source: Path
    wave: np.ndarray
    times: Optional[np.ndarray]
    images: Tuple[Path, ...]
    image_count: int


def _subject_name(root: Path, directory: Path) -> str:
    try:
        rel = directory.resolve().relative_to(root.resolve())
    except ValueError:
        rel = Path(directory.name)
    if rel.parts and rel.parts[0] not in (".", ""):
        return rel.parts[0]
    return root.name or directory.name


def _read_json(path: Path) -> Optional[object]:
    try:
        if path.stat().st_size <= 0 or path.stat().st_size > 8_000_000:
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None


def _label_for_dir(directory: Path, root: Path) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    candidates = [directory]
    if directory.resolve() != root.resolve():
        candidates.append(directory.parent)
    for folder in candidates:
        try:
            names = list(folder.iterdir())
        except OSError:
            continue
        for path in names:
            lower = path.name.lower()
            if not path.is_file():
                continue
            if lower == "ground_truth.txt" or lower.endswith("_gt.txt"):
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                wave = waveform_from_ground_truth(text)
                if wave is not None:
                    return wave, times_from_ground_truth(text)
            if path.suffix.lower() == ".json":
                parsed = _read_json(path)
                wave = waveform_from_pure_json(parsed)
                if wave is not None:
                    return wave, None
    return None, None


def discover_clips(root: Path) -> Tuple[List[ClipRecord], List[str]]:
    root = Path(root)
    clips: List[ClipRecord] = []
    notes: List[str] = []
    seen = 0
    if not root.is_dir():
        return [], ["folder is not on this Mac"]
    for directory, dirnames, filenames in os_walk(root):
        dirnames[:] = [name for name in dirnames if not name.startswith(".") and name != "__MACOSX"]
        seen += 1
        if seen > WALK_LIMIT or len(clips) >= MAX_CLIPS:
            notes.append("stopped after a very large folder")
            break
        folder = Path(directory)
        videos: List[Path] = []
        images: List[Path] = []
        for name in filenames:
            if name.startswith("."):
                continue
            path = folder / name
            ext = path.suffix.lower()
            if ext in VIDEO_EXT:
                videos.append(path)
            elif ext in IMAGE_EXT:
                images.append(path)
        if videos:
            chosen = max(videos, key=lambda item: item.stat().st_size if item.is_file() else 0)
            if len(videos) > 1:
                notes.append(f"{_subject_name(root, folder)} uses {chosen.name} and leaves the other videos")
            wave, times = _label_for_dir(folder, root)
            if wave is None:
                notes.append(f"{_subject_name(root, folder)} has video and no pulse curve")
                continue
            clips.append(
                ClipRecord(
                    subject=_subject_name(root, folder),
                    kind="video",
                    source=chosen,
                    wave=wave,
                    times=times,
                    images=(),
                    image_count=0,
                )
            )
            continue
        if len(images) < 16:
            continue
        wave, times = _label_for_dir(folder, root)
        if wave is None:
            continue
        ordered = tuple(sorted(images, key=lambda item: natural_key(item.name)))
        clips.append(
            ClipRecord(
                subject=_subject_name(root, folder),
                kind="frames",
                source=folder,
                wave=wave,
                times=times,
                images=ordered,
                image_count=len(ordered),
            )
        )
    clips.sort(key=lambda item: (natural_key(item.subject), natural_key(item.source.name)))
    return clips, notes


def os_walk(root: Path):
    import os

    return os.walk(root)


def _run_raw(cmd: Sequence[str], height: int, width: int) -> np.ndarray:
    proc = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace")[-300:].strip()
        raise RuntimeError(detail or "ffmpeg could not read the clip")
    frame_bytes = height * width * 3
    count = len(proc.stdout) // frame_bytes
    if count < 1:
        raise RuntimeError("ffmpeg produced no frames")
    raw = proc.stdout[: count * frame_bytes]
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(count, height, width, 3)
    video = np.transpose(frames, (3, 0, 1, 2)).astype(np.float32) / 255.0
    return np.ascontiguousarray(video)


def _scale_filter(height: int, width: int) -> str:
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height}"
    )


def read_video(path: Path, height: int, width: int, max_frames: int) -> np.ndarray:
    cmd = [
        ffmpeg_bin(),
        "-v",
        "error",
        "-i",
        str(path),
        "-an",
        "-vf",
        f"fps={int(READ_FPS)},{_scale_filter(height, width)}",
        "-frames:v",
        str(max_frames),
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
    ]
    return _run_raw(cmd, height, width)


def read_images(files: Sequence[Path], height: int, width: int, max_frames: int) -> np.ndarray:
    chosen = list(files[:max_frames])
    if not chosen:
        raise RuntimeError("no images")
    with tempfile.NamedTemporaryFile("w", suffix=".ffconcat", delete=False, encoding="utf-8") as handle:
        handle.write("ffconcat version 1.0\n")
        duration = 1.0 / READ_FPS
        for path in chosen:
            escaped = str(path).replace("'", "'\\''")
            handle.write(f"file '{escaped}'\n")
            handle.write(f"duration {duration:.6f}\n")
        escaped = str(chosen[-1]).replace("'", "'\\''")
        handle.write(f"file '{escaped}'\n")
        list_path = handle.name
    try:
        cmd = [
            ffmpeg_bin(),
            "-v",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-vf",
            _scale_filter(height, width),
            "-frames:v",
            str(len(chosen)),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ]
        return _run_raw(cmd, height, width)
    finally:
        Path(list_path).unlink(missing_ok=True)


def media_duration(path: Path) -> Optional[float]:
    proc = subprocess.run(
        [
            ffprobe_bin(),
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        value = float(proc.stdout.strip())
    except ValueError:
        return None
    if not math.isfinite(value) or value <= 0:
        return None
    return value


def green_motion(video: np.ndarray) -> np.ndarray:
    means = video[1].mean(axis=(1, 2))
    motion = np.diff(means).astype(np.float32)
    std = float(motion.std()) + 1e-8
    return (motion / std).astype(np.float32)


def frames_to_keep(window: int, stride: int, per_clip: Optional[int]) -> int:
    if per_clip is None or per_clip < 1:
        return MAX_READ_FRAMES
    need = window + max(1, stride) * (per_clip - 1)
    return max(window, min(MAX_READ_FRAMES, need))


def make_windows(
    video: np.ndarray,
    wave: np.ndarray,
    window: int,
    stride: int,
    per_clip: Optional[int],
) -> List[dict]:
    total = int(video.shape[1])
    if total < window or wave.size != total:
        return []
    motion = green_motion(video)
    rows: List[dict] = []
    for start in range(0, total - window + 1, max(1, stride)):
        if per_clip is not None and len(rows) >= per_clip:
            break
        end = start + window
        piece = motion[start : end - 1]
        if piece.size < window - 1:
            piece = np.pad(piece, (0, window - 1 - piece.size))
        rows.append(
            {
                "video": np.ascontiguousarray(video[:, start:end]),
                "waveform": np.ascontiguousarray(wave[start:end]),
                "motion": piece.astype(np.float32),
            }
        )
    return rows


def summarize_folder(root: Path) -> dict:
    clips, notes = discover_clips(root)
    subjects = sorted({clip.subject for clip in clips}, key=natural_key)
    return {
        "ok": True,
        "path": str(Path(root).resolve()),
        "subjects": subjects,
        "clips": len(clips),
        "videos": sum(1 for clip in clips if clip.kind == "video"),
        "frameFolders": sum(1 for clip in clips if clip.kind == "frames"),
        "notes": notes[:12],
    }


class FaceVideoDataset:
    """Windowed face videos. Imported torch stays inside the methods so a summary can run without it."""

    def __init__(
        self,
        root: str | Path,
        split: str = "train",
        frames: int = 128,
        height: int = 72,
        width: int = 72,
        stride: Optional[int] = None,
        max_windows: Optional[int] = None,
        max_subjects: Optional[int] = None,
    ) -> None:
        import torch
        from torch.utils.data import Dataset

        class _TorchDataset(Dataset):
            def __init__(self, items: List[dict]) -> None:
                self._items = items

            def __len__(self) -> int:
                return len(self._items)

            def __getitem__(self, idx: int) -> dict:
                item = self._items[idx]
                return {
                    "video": torch.from_numpy(item["video"]),
                    "waveform": torch.from_numpy(item["waveform"]),
                    "motion": torch.from_numpy(item["motion"]),
                    "hr_bpm": torch.tensor(0.0, dtype=torch.float32),
                    "quality": {},
                    "motion_mag": {},
                }

        root = Path(root)
        clips, notes = discover_clips(root)
        if not clips:
            detail = notes[0] if notes else "no video or image folder has a pulse curve"
            raise FileNotFoundError(
                f"No trainable clips in {root}. {detail}. "
                "UBFC needs ground_truth.txt beside the video. "
                "PURE needs the waveform in the JSON, not only the pulse rate."
            )
        train_names, hold_names = training_subjects([clip.subject for clip in clips], max_subjects)
        chosen_names = {"train": train_names, "val": hold_names, "test": hold_names}.get(split, train_names)
        if split == "val" and not chosen_names:
            chosen_names = hold_names
        selected = [clip for clip in clips if clip.subject in set(chosen_names)]
        if not selected:
            raise FileNotFoundError(
                f"No clips for split '{split}' in {root}. "
                f"Training people: {', '.join(train_names) or 'none'}. "
                f"Held out: {', '.join(hold_names) or 'none'}."
            )
        self.split = split
        self.subjects = list(chosen_names)
        self.held_out = list(hold_names)
        self.notes = notes
        stride = int(stride if stride is not None else max(int(frames) // 2, 1))
        per_clip = None
        if max_windows is not None and int(max_windows) > 0:
            per_clip = max(1, math.ceil(int(max_windows) / len(selected)))
        keep = frames_to_keep(int(frames), stride, per_clip)
        items: List[dict] = []
        for index, clip in enumerate(selected, start=1):
            print(f"read  {index}/{len(selected)}  {clip.subject}  {clip.source.name}", flush=True)
            if clip.kind == "video":
                video = read_video(clip.source, int(height), int(width), keep)
                duration = media_duration(clip.source)
                full_count = int(video.shape[1])
                if duration and duration > 0:
                    full_count = max(full_count, int(round(duration * READ_FPS)))
            else:
                video = read_images(clip.images, int(height), int(width), keep)
                full_count = max(clip.image_count, int(video.shape[1]))
            wave = align_waveform(clip.wave, int(video.shape[1]), full_count, clip.times)
            items.extend(make_windows(video, wave, int(frames), stride, per_clip))
        if max_windows is not None and int(max_windows) > 0:
            items = items[: int(max_windows)]
        if not items:
            raise RuntimeError(
                f"Clips in {root} are shorter than {frames} frames after the first "
                f"{keep} frames are read. A training window is {frames} frames at {int(READ_FPS)} fps."
            )
        print(
            f"windows  {len(items)}  people  {' '.join(self.subjects)}  "
            f"held out  {' '.join(self.held_out) or 'none'}",
            flush=True,
        )
        self._delegate = _TorchDataset(items)

    def __len__(self) -> int:
        return len(self._delegate)

    def __getitem__(self, idx: int) -> dict:
        return self._delegate[idx]


def main() -> int:
    import sys

    if len(sys.argv) != 2:
        print("usage: python -m research.data.facevideo <folder>", file=sys.stderr)
        return 2
    payload = summarize_folder(Path(sys.argv[1]))
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
