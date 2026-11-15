"""Parser and one-clip checks for the PhysNet folder loader."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

from research.data.facevideo import (
    align_waveform,
    discover_clips,
    ffmpeg_bin,
    summarize_folder,
    training_subjects,
    waveform_from_ground_truth,
    waveform_from_pure_json,
)


def _pulse(count: int, bpm: float = 72.0) -> np.ndarray:
    t = np.arange(count, dtype=np.float64) / 30.0
    return np.sin(2.0 * np.pi * (bpm / 60.0) * t)


def _write_video(path: Path, frames: int = 160) -> None:
    height, width = 12, 16
    raw = np.zeros((frames, height, width, 3), dtype=np.uint8)
    wave = _pulse(frames)
    for index, value in enumerate(wave):
        raw[index, :, :, 1] = np.clip(80 + 40 * value, 0, 255)
    proc = subprocess.run(
        [
            ffmpeg_bin(),
            "-y",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{width}x{height}",
            "-r",
            "30",
            "-i",
            "pipe:0",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        input=raw.tobytes(),
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace")[-200:])


class FaceVideoTests(unittest.TestCase):
    def test_ground_truth_and_pure_waveforms(self) -> None:
        text = "1 2 3 4 5 6 7 8\n70 80\n0 1 2 3 4 5 6 7\n"
        wave = waveform_from_ground_truth(text)
        self.assertIsNotNone(wave)
        assert wave is not None
        self.assertEqual(wave.tolist(), [1, 2, 3, 4, 5, 6, 7, 8])
        packed = {
            "/FullPackage": [{"Value": {"pulseRate": 70, "waveform": float(i)}} for i in range(16)]
        }
        pure = waveform_from_pure_json(packed)
        self.assertIsNotNone(pure)
        assert pure is not None
        self.assertEqual(pure.shape, (16,))
        self.assertIsNone(waveform_from_pure_json({"/FullPackage": [{"Value": {"waveform": 0.2}}]}))

    def test_align_uses_the_start_of_a_long_curve(self) -> None:
        wave = np.arange(100, dtype=np.float64)
        out = align_waveform(wave, n_frames=10, full_count=100)
        self.assertEqual(out.shape, (10,))
        self.assertLess(float(out[0]), float(out[-1]))

    def test_holdout_keeps_the_last_person(self) -> None:
        train, held = training_subjects(["subject1", "subject2", "subject10"], None)
        self.assertEqual(train, ["subject1", "subject2"])
        self.assertEqual(held, ["subject10"])
        short, extra = training_subjects(["subject1", "subject2", "subject10"], 1)
        self.assertEqual(short, ["subject1"])
        self.assertEqual(extra, ["subject2"])

    def test_discover_video_and_images(self) -> None:
        if shutil.which(ffmpeg_bin()) is None and not Path(ffmpeg_bin()).is_file():
            self.skipTest("ffmpeg is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subject = root / "subject1"
            subject.mkdir()
            _write_video(subject / "vid.mp4")
            curve = _pulse(160)
            (subject / "ground_truth.txt").write_text(
                " ".join(str(value) for value in curve) + "\n"
                + " ".join(["72"] * 160) + "\n"
                + " ".join(str(i / 30) for i in range(160)) + "\n",
                encoding="utf-8",
            )
            images = root / "01-01" / "01-01"
            images.mkdir(parents=True)
            for index in range(16):
                _write_video(images / f"frame-{index:02d}.mp4", frames=1)
            # The image folder needs stills, not videos. Write pngs via ffmpeg.
            for path in images.glob("*.mp4"):
                path.unlink()
            raw = np.zeros((8, 8, 3), dtype=np.uint8)
            raw[:, :, 1] = 120
            for index in range(16):
                png = images / f"frame-{index:02d}.png"
                subprocess.run(
                    [ffmpeg_bin(), "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "8x8", "-i", "pipe:0", str(png)],
                    input=raw.tobytes(),
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
            payload = {"waveform": _pulse(16).tolist()}
            (root / "01-01" / "01-01.json").write_text(json.dumps(payload), encoding="utf-8")
            clips, _notes = discover_clips(root)
            subjects = sorted(clip.subject for clip in clips)
            self.assertEqual(subjects, ["01-01", "subject1"])
            summary = summarize_folder(root)
            self.assertEqual(summary["clips"], 2)
            self.assertEqual(summary["videos"], 1)
            self.assertEqual(summary["frameFolders"], 1)


if __name__ == "__main__":
    unittest.main()
