"""SCAMPS (.mat) loader for PhysNet windows.

Reads the official SCAMPS MATLAB/HDF5 clips (``Xsub`` / ``RawFrames`` + ``d_ppg``),
builds fixed-length video windows, and derives a simple motion proxy for the
conflict module from head-pose channels or frame differences.

See: https://github.com/danmcduff/scampsdataset
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import torch
from torch.utils.data import Dataset

from research.dsp import dominant_hr_bpm
from research.motion.curves import ROI_IDS

try:
    import h5py
except ImportError as exc:  # pragma: no cover
    h5py = None  # type: ignore[assignment]
    _H5PY_ERR = exc
else:
    _H5PY_ERR = None


def _require_h5py() -> Any:
    if h5py is None:
        raise ImportError(
            "h5py is required for SCAMPS. Install with: "
            'python3 -m pip install -e ".[research]"'
        ) from _H5PY_ERR
    return h5py


def discover_scamps_mats(root: Path) -> List[Path]:
    """Find ``*.mat`` under ``root``, preferring Train/Val/Test layout."""
    root = Path(root)
    if not root.exists():
        return []
    split_dirs = [root / name for name in ("Train", "Val", "Test", "train", "val", "test")]
    if any(d.is_dir() for d in split_dirs):
        mats: List[Path] = []
        for d in split_dirs:
            if d.is_dir():
                mats.extend(sorted(d.rglob("*.mat")))
        if mats:
            return mats
    return sorted(root.rglob("*.mat"))


def _read_vector(f: Any, key: str) -> Optional[np.ndarray]:
    if key not in f:
        return None
    arr = np.asarray(f[key], dtype=np.float64).reshape(-1)
    return arr


def _to_cthw(frames: np.ndarray) -> np.ndarray:
    """Normalize SCAMPS frame tensors to ``(C=3, T, H, W)`` float32 in [0, 1]."""
    x = np.asarray(frames)
    if x.ndim != 4:
        raise ValueError(f"Expected 4D frame tensor, got shape {x.shape}")

    # Prefer explicit layouts: MATLAB/HDF5 often reverses to (T,H,W,C) or (T,W,H,C)
    if x.shape[-1] == 3:
        c_ax = 3
    elif x.shape[0] == 3:
        c_ax = 0
    else:
        c_axes = [i for i, s in enumerate(x.shape) if s == 3]
        if not c_axes:
            raise ValueError(f"No channel dim of size 3 in shape {x.shape}")
        c_ax = c_axes[0]

    # Time = largest non-channel dim (SCAMPS clips are hundreds of frames)
    other = [i for i in range(4) if i != c_ax]
    t_ax = max(other, key=lambda i: x.shape[i])
    spat = [i for i in other if i != t_ax]
    # Spatial: treat remaining dims as (H, W). Square 240×240 crops make swap a no-op.
    h_ax, w_ax = spat[0], spat[1]

    x = np.transpose(x, (c_ax, t_ax, h_ax, w_ax))
    x = x.astype(np.float32)
    # SCAMPS RGB is often stored in [0, 1] or [0, 255]
    if float(np.nanmax(x)) > 1.5:
        x = x / 255.0
    return np.clip(x, 0.0, 1.0)


def _resize_video(video: np.ndarray, height: int, width: int) -> np.ndarray:
    """Nearest-neighbor resize ``(C,T,H,W)`` → ``(C,T,height,width)``."""
    c, t, h, w = video.shape
    if h == height and w == width:
        return video
    # Map output pixels to nearest source
    ys = (np.arange(height) * (h / height)).astype(np.int64)
    xs = (np.arange(width) * (w / width)).astype(np.int64)
    ys = np.clip(ys, 0, h - 1)
    xs = np.clip(xs, 0, w - 1)
    return video[:, :, ys][:, :, :, xs].astype(np.float32)


def _motion_from_pose(
    pitch: Optional[np.ndarray],
    yaw: Optional[np.ndarray],
    roll: Optional[np.ndarray],
    n_frames: int,
) -> Optional[np.ndarray]:
    parts = []
    for v in (pitch, yaw, roll):
        if v is None:
            continue
        if v.size < n_frames:
            continue
        parts.append(v[:n_frames])
    if not parts:
        return None
    pose = np.stack(parts, axis=0)  # (K, T)
    # Signed proxy: mean of per-axis first differences (T-1,)
    diffs = np.diff(pose, axis=1)
    motion = diffs.mean(axis=0)
    # Scale to a stable range for conflict
    std = float(motion.std()) + 1e-8
    return (motion / std).astype(np.float32)


def _motion_from_frame_diff(video: np.ndarray) -> np.ndarray:
    """Mean absolute RGB frame difference → signed-ish series via green-channel mean Δ."""
    # video: (C, T, H, W)
    g = video[1]  # (T, H, W)
    means = g.mean(axis=(1, 2))
    motion = np.diff(means)
    std = float(motion.std()) + 1e-8
    return (motion / std).astype(np.float32)


def _roi_quality_motion(motion: np.ndarray) -> Tuple[Dict[str, float], Dict[str, float]]:
    amp = float(np.clip(np.mean(np.abs(motion)), 0.0, 2.0))
    quality = {
        "forehead": float(np.clip(0.85 - 0.15 * amp, 0.2, 1.0)),
        "leftCheek": float(np.clip(0.75 - 0.25 * amp, 0.15, 1.0)),
        "rightCheek": float(np.clip(0.75 - 0.25 * amp, 0.15, 1.0)),
        "lowerFace": float(np.clip(0.55 - 0.35 * amp, 0.05, 1.0)),
    }
    motion_mag = {
        "forehead": float(np.clip(0.15 + 0.25 * amp, 0.0, 1.0)),
        "leftCheek": float(np.clip(0.25 + 0.3 * amp, 0.0, 1.0)),
        "rightCheek": float(np.clip(0.25 + 0.3 * amp, 0.0, 1.0)),
        "lowerFace": float(np.clip(0.35 + 0.4 * amp, 0.0, 1.0)),
    }
    assert set(quality) == set(ROI_IDS)
    return quality, motion_mag


def load_scamps_clip(path: Path) -> dict:
    """Load one SCAMPS ``.mat`` into frames, PPG, motion, HR."""
    h5 = _require_h5py()
    path = Path(path)
    with h5.File(path, "r") as f:
        keys = set(f.keys())
        frame_key = "Xsub" if "Xsub" in keys else ("RawFrames" if "RawFrames" in keys else None)
        if frame_key is None:
            raise KeyError(f"{path}: need Xsub or RawFrames; keys={sorted(keys)}")
        if "d_ppg" not in keys:
            raise KeyError(f"{path}: missing d_ppg; keys={sorted(keys)}")

        video = _to_cthw(np.array(f[frame_key]))
        ppg = _read_vector(f, "d_ppg")
        assert ppg is not None
        pitch = _read_vector(f, "d_pitch")
        yaw = _read_vector(f, "d_yaw")
        roll = _read_vector(f, "d_rol")  # SCAMPS spelling

    t = video.shape[1]
    n = min(t, int(ppg.size))
    video = video[:, :n]
    ppg = ppg[:n].astype(np.float32)
    ppg = (ppg - ppg.mean()) / (ppg.std() + 1e-8)

    motion = _motion_from_pose(pitch, yaw, roll, n)
    if motion is None or motion.size < n - 1:
        motion = _motion_from_frame_diff(video)
    else:
        motion = motion[: n - 1]

    return {
        "path": path,
        "video": video,
        "waveform": ppg,
        "motion": motion,
        "frame_key": frame_key,
    }


def _file_split_label(path: Path, root: Path) -> Optional[str]:
    """Return train/val/test if path sits under a named split directory."""
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        rel = Path(*path.parts[-3:])
    parts = [p.lower() for p in rel.parts[:-1]]
    for name in ("train", "val", "test"):
        if name in parts or (name == "val" and "validation" in parts):
            return "val" if name == "val" else name
    return None


def assign_splits(
    mats: Sequence[Path],
    root: Path,
    ratios: Tuple[int, int, int] = (7, 1, 2),
) -> Dict[str, List[Path]]:
    """Subject-independent-ish file split.

    Prefer Train/Val/Test folders when present; otherwise partition sorted files
    with ``ratios`` (default 7/1/2 for the 10-video example).
    """
    by_dir: Dict[str, List[Path]] = {"train": [], "val": [], "test": []}
    unlabeled: List[Path] = []
    for p in mats:
        lab = _file_split_label(p, root)
        if lab:
            by_dir[lab].append(p)
        else:
            unlabeled.append(p)

    if sum(len(v) for v in by_dir.values()) == len(mats) and all(
        len(by_dir[k]) > 0 for k in ("train", "test")
    ):
        return by_dir

    files = sorted(unlabeled if unlabeled else list(mats), key=lambda p: p.name)
    n = len(files)
    if n == 0:
        return by_dir

    rt, rv, rte = ratios
    total = rt + rv + rte
    # Scale ratios to n while keeping at least 1 test when n>=2
    n_train = max(1, int(round(n * rt / total))) if n >= 3 else max(1, n - 1)
    n_val = max(0, int(round(n * rv / total))) if n >= 3 else 0
    n_test = n - n_train - n_val
    if n_test < 1 and n >= 2:
        n_test = 1
        if n_train > 1:
            n_train -= 1
        elif n_val > 0:
            n_val -= 1
    if n_train + n_val + n_test != n:
        n_train = n - n_val - n_test

    # Classic 10-file example: exactly 7/1/2
    if n == 10 and ratios == (7, 1, 2):
        n_train, n_val, n_test = 7, 1, 2

    return {
        "train": files[:n_train],
        "val": files[n_train : n_train + n_val],
        "test": files[n_train + n_val :],
    }


def build_windows(
    clip: dict,
    frames: int,
    height: int,
    width: int,
    stride: int,
    sample_rate_hz: float,
    phys_band_hz: Tuple[float, float],
) -> List[dict]:
    video = _resize_video(clip["video"], height, width)
    wave = clip["waveform"]
    motion = clip["motion"]
    t = video.shape[1]
    if t < frames:
        return []

    windows: List[dict] = []
    for start in range(0, t - frames + 1, max(1, stride)):
        end = start + frames
        v = video[:, start:end]
        w = wave[start:end]
        m = motion[start : end - 1]
        if m.size < frames - 1:
            # pad if pose shorter
            pad = np.zeros(frames - 1 - m.size, dtype=np.float32)
            m = np.concatenate([m, pad])
        hr = dominant_hr_bpm(w.astype(np.float64), sample_rate_hz, phys_band_hz)
        quality, motion_mag = _roi_quality_motion(m)
        windows.append(
            {
                "video": v,
                "waveform": w.astype(np.float32),
                "motion": m.astype(np.float32),
                "hr_bpm": float(hr),
                "quality": quality,
                "motion_mag": motion_mag,
                "source": str(clip["path"]),
                "start": start,
            }
        )
    return windows


class ScampsRppgDataset(Dataset):
    """Windowed SCAMPS clips for PhysNet train/eval."""

    def __init__(
        self,
        root: str | Path,
        split: str = "train",
        frames: int = 128,
        height: int = 72,
        width: int = 72,
        sample_rate_hz: float = 30.0,
        phys_band_hz: Tuple[float, float] = (0.7, 4.0),
        stride: Optional[int] = None,
        split_ratios: Tuple[int, int, int] = (7, 1, 2),
        max_windows: Optional[int] = None,
    ) -> None:
        self.root = Path(root)
        self.split = split
        self.frames = frames
        self.height = height
        self.width = width
        self.sample_rate_hz = sample_rate_hz
        self.phys_band_hz = phys_band_hz
        self.stride = int(stride if stride is not None else max(frames // 2, 1))

        mats = discover_scamps_mats(self.root)
        if not mats:
            raise FileNotFoundError(
                f"No .mat files under {self.root}. "
                f"Download the SCAMPS example into data/SCAMPS/ "
                f"(see README / scripts/download_scamps_example.sh)."
            )

        splits = assign_splits(mats, self.root, ratios=split_ratios)
        files = splits.get(split, [])
        if not files:
            # Fall back: use all for train if only one split requested and unlabeled
            if split == "train" and mats:
                files = mats
            else:
                raise FileNotFoundError(
                    f"No SCAMPS files for split='{split}' under {self.root} "
                    f"(found {len(mats)} mat(s) total)."
                )

        self._items: List[dict] = []
        for path in files:
            clip = load_scamps_clip(path)
            self._items.extend(
                build_windows(
                    clip,
                    frames=frames,
                    height=height,
                    width=width,
                    stride=self.stride,
                    sample_rate_hz=sample_rate_hz,
                    phys_band_hz=phys_band_hz,
                )
            )

        if max_windows is not None and max_windows > 0:
            self._items = self._items[: int(max_windows)]

        if not self._items:
            raise RuntimeError(
                f"SCAMPS split '{split}': files found but no windows of length "
                f"{frames}. Check clip duration / frames setting."
            )

    def __len__(self) -> int:
        return len(self._items)

    def __getitem__(self, idx: int) -> dict:
        item = self._items[idx]
        return {
            "video": torch.from_numpy(item["video"]),
            "waveform": torch.from_numpy(item["waveform"]),
            "motion": torch.from_numpy(item["motion"]),
            "hr_bpm": torch.tensor(item["hr_bpm"], dtype=torch.float32),
            "quality": {
                k: torch.tensor(v, dtype=torch.float32) for k, v in item["quality"].items()
            },
            "motion_mag": {
                k: torch.tensor(v, dtype=torch.float32)
                for k, v in item["motion_mag"].items()
            },
        }
