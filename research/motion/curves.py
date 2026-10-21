"""Landmark displacement motion curves (thesis §3.1.2).

Compatible with MotioPulse / thesis formulas:
- scale-normalized global centroid translation (signed) for conflict
- unsigned landmark speed for reliability magnitude
- local ROI motion and residual = max(0, local − global_magnitude)
"""

from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

import numpy as np
from numpy.typing import NDArray

RoiId = str
Landmark = Tuple[float, float]
FrameLandmarks = Sequence[Landmark]

ROI_IDS: Tuple[RoiId, ...] = ("forehead", "leftCheek", "rightCheek", "lowerFace")

# Approximate MediaPipe Face Mesh indices (same as MotioPulse demo)
ROI_LANDMARK_INDICES: Dict[RoiId, List[int]] = {
    "forehead": [10, 67, 69, 104, 108, 151, 337, 299, 333, 298],
    "leftCheek": [50, 101, 118, 205, 36, 137, 123, 147],
    "rightCheek": [280, 330, 347, 425, 266, 366, 352, 376],
    "lowerFace": [152, 176, 148, 152, 377, 400, 378, 17, 18, 200],
}


def face_scale(landmarks: FrameLandmarks) -> float:
    """Inter-ocular distance (indices 33 / 263) or bbox diagonal fallback."""
    if len(landmarks) > 263:
        left = landmarks[33]
        right = landmarks[263]
        d = float(np.hypot(left[0] - right[0], left[1] - right[1]))
        if d > 1e-6:
            return d
    xs = np.array([p[0] for p in landmarks], dtype=np.float64)
    ys = np.array([p[1] for p in landmarks], dtype=np.float64)
    return float(max(1e-6, np.hypot(xs.max() - xs.min(), ys.max() - ys.min())))


def _as_xy(frame: FrameLandmarks) -> NDArray[np.float64]:
    return np.asarray(frame, dtype=np.float64)


def global_motion_series(frames: Sequence[FrameLandmarks]) -> NDArray[np.float64]:
    """Signed scale-normalized centroid translation; length T−1."""
    if len(frames) < 2:
        return np.zeros(0, dtype=np.float64)
    out: List[float] = []
    for t in range(1, len(frames)):
        prev = _as_xy(frames[t - 1])
        cur = _as_xy(frames[t])
        scale = 0.5 * (face_scale(frames[t - 1]) + face_scale(frames[t]))
        n = min(len(prev), len(cur))
        if n == 0:
            out.append(0.0)
            continue
        dx = float(np.sum(cur[:n, 0] - prev[:n, 0]))
        dy = float(np.sum(cur[:n, 1] - prev[:n, 1]))
        out.append((dx + dy) / (n * scale))
    return np.asarray(out, dtype=np.float64)


def global_motion_magnitude_series(
    frames: Sequence[FrameLandmarks],
) -> NDArray[np.float64]:
    """Unsigned scale-normalized mean landmark speed; length T−1."""
    if len(frames) < 2:
        return np.zeros(0, dtype=np.float64)
    out: List[float] = []
    for t in range(1, len(frames)):
        prev = _as_xy(frames[t - 1])
        cur = _as_xy(frames[t])
        scale = 0.5 * (face_scale(frames[t - 1]) + face_scale(frames[t]))
        n = min(len(prev), len(cur))
        if n == 0:
            out.append(0.0)
            continue
        deltas = np.hypot(cur[:n, 0] - prev[:n, 0], cur[:n, 1] - prev[:n, 1])
        out.append(float(np.mean(deltas) / scale))
    return np.asarray(out, dtype=np.float64)


def local_motion_series(
    frames: Sequence[FrameLandmarks],
    roi: RoiId,
    indices: Sequence[int] | None = None,
) -> NDArray[np.float64]:
    """Mean scale-normalized displacement of ROI landmarks; length T−1."""
    if len(frames) < 2:
        return np.zeros(0, dtype=np.float64)
    idx = list(indices if indices is not None else ROI_LANDMARK_INDICES[roi])
    out: List[float] = []
    for t in range(1, len(frames)):
        prev = _as_xy(frames[t - 1])
        cur = _as_xy(frames[t])
        scale = 0.5 * (face_scale(frames[t - 1]) + face_scale(frames[t]))
        vals: List[float] = []
        for i in idx:
            if i >= len(prev) or i >= len(cur):
                continue
            vals.append(
                float(np.hypot(cur[i, 0] - prev[i, 0], cur[i, 1] - prev[i, 1]))
            )
        out.append(0.0 if not vals else float(np.mean(vals) / scale))
    return np.asarray(out, dtype=np.float64)


def residual_local_motion(
    local: NDArray[np.floating],
    global_mag: NDArray[np.floating],
) -> NDArray[np.float64]:
    n = min(len(local), len(global_mag))
    return np.maximum(
        0.0,
        np.asarray(local[:n], dtype=np.float64)
        - np.asarray(global_mag[:n], dtype=np.float64),
    )


def compute_motion_bundle(frames: Sequence[FrameLandmarks]) -> dict:
    global_signed = global_motion_series(frames)
    global_mag = global_motion_magnitude_series(frames)
    local: Dict[RoiId, NDArray[np.float64]] = {}
    residual: Dict[RoiId, NDArray[np.float64]] = {}
    local_mean: Dict[RoiId, float] = {}
    residual_mean: Dict[RoiId, float] = {}
    for roi in ROI_IDS:
        loc = local_motion_series(frames, roi)
        res = residual_local_motion(loc, global_mag)
        local[roi] = loc
        residual[roi] = res
        local_mean[roi] = float(np.mean(loc)) if loc.size else 0.0
        residual_mean[roi] = float(np.mean(res)) if res.size else 0.0
    return {
        "global": global_signed,
        "global_magnitude": global_mag,
        "local": local,
        "residual": residual,
        "global_mean": float(np.mean(global_mag)) if global_mag.size else 0.0,
        "local_mean": local_mean,
        "residual_mean": residual_mean,
    }
