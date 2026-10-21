"""Synthetic face-window generator: pulse + optional periodic motion contamination."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from torch.utils.data import Dataset

from research.motion.curves import ROI_IDS


@dataclass
class SyntheticWindow:
    video: np.ndarray  # (3, T, H, W) float32 in [0, 1]
    waveform: np.ndarray  # (T,) ground-truth pulse
    motion: np.ndarray  # (T-1,) signed global motion for conflict
    hr_bpm: float
    motion_amp: float
    quality: Dict[str, float]
    motion_mag: Dict[str, float]
    landmarks: List[List[Tuple[float, float]]]


def generate_synthetic_window(
    frames: int = 128,
    height: int = 36,
    width: int = 36,
    sample_rate_hz: float = 30.0,
    hr_bpm: Optional[float] = None,
    motion_amp: float = 0.0,
    motion_at_pulse_freq: bool = True,
    seed: Optional[int] = None,
    n_landmarks: int = 468,
) -> SyntheticWindow:
    """Build one training window with a spatiotemporal pulse pattern.

    When ``motion_amp > 0`` and ``motion_at_pulse_freq``, motion shares the
    pulse frequency so conflict scores rise (contamination demo).
    """
    rng = np.random.default_rng(seed)
    hr = float(hr_bpm if hr_bpm is not None else rng.uniform(55.0, 110.0))
    f_pulse = hr / 60.0
    t = np.arange(frames, dtype=np.float64) / sample_rate_hz
    pulse = np.sin(2.0 * np.pi * f_pulse * t)
    # Mild harmonics for a less-perfect sinusoid
    pulse += 0.25 * np.sin(4.0 * np.pi * f_pulse * t)
    pulse = (pulse - pulse.mean()) / (pulse.std() + 1e-8)

    # Spatiotemporal video: green-channel pulse + skin-like base
    video = np.zeros((3, frames, height, width), dtype=np.float32)
    yy, xx = np.mgrid[0:height, 0:width]
    skin = 0.55 + 0.08 * np.sin(xx / 7.0) + 0.05 * np.cos(yy / 5.0)
    for ti in range(frames):
        amp = 0.04 * pulse[ti]
        video[0, ti] = np.clip(skin * 1.05 + 0.3 * amp, 0, 1)
        video[1, ti] = np.clip(skin + amp, 0, 1)  # strongest pulse in G
        video[2, ti] = np.clip(skin * 0.95 + 0.2 * amp, 0, 1)
        video[:, ti] += rng.normal(0, 0.01, size=video[:, ti].shape).astype(np.float32)
    video = np.clip(video, 0.0, 1.0)

    # Landmark grid + optional shake at pulse (or other) frequency
    f_motion = f_pulse if motion_at_pulse_freq else float(rng.uniform(0.4, 2.5))
    shake = motion_amp * np.sin(2.0 * np.pi * f_motion * t)
    # Base face landmark layout (normalized coords)
    base = []
    for i in range(n_landmarks):
        # Rough face oval
        ang = 2.0 * np.pi * (i % 64) / 64.0
        r = 0.18 + 0.02 * (i % 5)
        cx, cy = 0.5, 0.48
        base.append((cx + r * np.cos(ang), cy + r * np.sin(ang) * 1.15))
    # Place eye landmarks for scale
    if n_landmarks > 263:
        base[33] = (0.38, 0.42)
        base[263] = (0.62, 0.42)

    landmarks: List[List[Tuple[float, float]]] = []
    for ti in range(frames):
        dx = float(shake[ti])
        dy = float(0.6 * shake[ti])
        frame = [(float(x + dx), float(y + dy)) for x, y in base]
        landmarks.append(frame)

    # Signed global motion series (T-1) from centroid translation / scale
    motion = np.zeros(frames - 1, dtype=np.float64)
    for ti in range(1, frames):
        motion[ti - 1] = float(shake[ti] - shake[ti - 1]) * 8.0  # scale-ish

    # ROI quality / motion magnitudes for reliability module
    # Higher motion_amp → lower quality on lower face, higher motion mags
    quality = {
        "forehead": float(np.clip(0.85 - 0.2 * motion_amp, 0.2, 1.0)),
        "leftCheek": float(np.clip(0.75 - 0.35 * motion_amp, 0.15, 1.0)),
        "rightCheek": float(np.clip(0.75 - 0.35 * motion_amp, 0.15, 1.0)),
        "lowerFace": float(np.clip(0.55 - 0.5 * motion_amp, 0.05, 1.0)),
    }
    motion_mag = {
        "forehead": float(np.clip(0.15 + 0.4 * motion_amp, 0.0, 1.0)),
        "leftCheek": float(np.clip(0.25 + 0.5 * motion_amp, 0.0, 1.0)),
        "rightCheek": float(np.clip(0.25 + 0.5 * motion_amp, 0.0, 1.0)),
        "lowerFace": float(np.clip(0.35 + 0.7 * motion_amp, 0.0, 1.0)),
    }
    # Ensure keys match ROI_IDS
    assert set(quality) == set(ROI_IDS)

    return SyntheticWindow(
        video=video,
        waveform=pulse.astype(np.float32),
        motion=motion.astype(np.float32),
        hr_bpm=hr,
        motion_amp=float(motion_amp),
        quality=quality,
        motion_mag=motion_mag,
        landmarks=landmarks,
    )


class SyntheticRppgDataset(Dataset):
    """On-the-fly synthetic windows for smoke training / RQ1 analysis."""

    def __init__(
        self,
        size: int = 64,
        frames: int = 128,
        height: int = 36,
        width: int = 36,
        sample_rate_hz: float = 30.0,
        motion_prob: float = 0.5,
        motion_amp_range: Tuple[float, float] = (0.0, 0.8),
        seed: int = 0,
    ) -> None:
        self.size = size
        self.frames = frames
        self.height = height
        self.width = width
        self.sample_rate_hz = sample_rate_hz
        self.motion_prob = motion_prob
        self.motion_amp_range = motion_amp_range
        self.seed = seed

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        rng = np.random.default_rng(self.seed + idx)
        use_motion = rng.random() < self.motion_prob
        amp = float(rng.uniform(*self.motion_amp_range)) if use_motion else 0.0
        win = generate_synthetic_window(
            frames=self.frames,
            height=self.height,
            width=self.width,
            sample_rate_hz=self.sample_rate_hz,
            motion_amp=amp,
            motion_at_pulse_freq=True,
            seed=self.seed + idx * 17,
        )
        return {
            "video": torch.from_numpy(win.video),
            "waveform": torch.from_numpy(win.waveform),
            "motion": torch.from_numpy(win.motion),
            "hr_bpm": torch.tensor(win.hr_bpm, dtype=torch.float32),
            "motion_amp": torch.tensor(win.motion_amp, dtype=torch.float32),
            "quality": {k: torch.tensor(v, dtype=torch.float32) for k, v in win.quality.items()},
            "motion_mag": {
                k: torch.tensor(v, dtype=torch.float32) for k, v in win.motion_mag.items()
            },
        }
