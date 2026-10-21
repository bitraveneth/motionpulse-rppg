"""Motion–physiology conflict scores and soft gate (thesis §3.1.3).

C_temp, C_spec, C = α C_temp + β C_spec.
Soft gate with residual floor; conflict-weighted loss stops gradients on C.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import torch
import torch.nn.functional as F
from numpy.typing import NDArray

from research.dsp import (
    clamp01,
    detrend,
    max_lag_abs_corr,
    periodogram,
    spectral_overlap,
    standardize,
)


@dataclass
class ConflictScores:
    c_temp: float
    c_spec: float
    combined: float


def temporal_conflict(
    motion: Sequence[float] | NDArray[np.floating],
    candidate: Sequence[float] | NDArray[np.floating],
    sample_rate_hz: float,
    max_lag_sec: float = 0.5,
) -> float:
    m = np.asarray(motion, dtype=np.float64)
    c = np.asarray(candidate, dtype=np.float64)
    n = min(m.size, c.size)
    if n < 8:
        return 0.0
    m = standardize(detrend(m[:n]))
    c = standardize(detrend(c[:n]))
    max_lag = max(1, int(round(max_lag_sec * sample_rate_hz)))
    return clamp01(max_lag_abs_corr(m, c, max_lag))


def spectral_conflict(
    motion: Sequence[float] | NDArray[np.floating],
    candidate: Sequence[float] | NDArray[np.floating],
    sample_rate_hz: float,
    phys_band_hz: tuple[float, float] = (0.7, 4.0),
) -> float:
    m = np.asarray(motion, dtype=np.float64)
    c = np.asarray(candidate, dtype=np.float64)
    n = min(m.size, c.size)
    if n < 8:
        return 0.0
    fm, pm = periodogram(m[:n], sample_rate_hz)
    fc, pc = periodogram(c[:n], sample_rate_hz)
    # Align to shared frequency grid length (same n → same rfft length)
    k = min(fm.size, fc.size)
    return spectral_overlap(fm[:k], pm[:k], pc[:k], phys_band_hz[0], phys_band_hz[1])


def combined_conflict(
    c_temp: float,
    c_spec: float,
    alpha: float = 0.5,
    beta: float = 0.5,
) -> ConflictScores:
    w = max(1e-9, alpha + beta)
    a, b = alpha / w, beta / w
    return ConflictScores(
        c_temp=clamp01(c_temp),
        c_spec=clamp01(c_spec),
        combined=clamp01(a * c_temp + b * c_spec),
    )


def compute_conflict(
    motion: Sequence[float] | NDArray[np.floating],
    candidate: Sequence[float] | NDArray[np.floating],
    sample_rate_hz: float,
    phys_band_hz: tuple[float, float] = (0.7, 4.0),
    alpha: float = 0.5,
    beta: float = 0.5,
    max_lag_sec: float = 0.5,
) -> ConflictScores:
    ct = temporal_conflict(motion, candidate, sample_rate_hz, max_lag_sec)
    cs = spectral_conflict(motion, candidate, sample_rate_hz, phys_band_hz)
    return combined_conflict(ct, cs, alpha, beta)


def soft_suppress(
    candidate: Sequence[float] | NDArray[np.floating],
    conflict: float,
    residual_floor: float = 0.15,
) -> dict:
    """gain = (1 − C)·(1 − floor) + floor; pulse never fully wiped."""
    floor = clamp01(residual_floor)
    c = clamp01(conflict)
    gain = (1.0 - c) * (1.0 - floor) + floor
    cand = np.asarray(candidate, dtype=np.float64)
    return {"gated": cand * gain, "gain": gain, "residual_floor": floor}


def conflict_weighted_waveform_loss(
    pred: torch.Tensor,
    target: torch.Tensor,
    conflict: torch.Tensor,
    base_weight: float = 1.0,
    conflict_boost: float = 1.0,
) -> torch.Tensor:
    """MSE weighted by (base + boost · C) with **stop-grad on C**.

    Higher conflict up-weights the sample so the network learns harder
    contamination cases without treating C as a learnable target.
    """
    # Stop gradient on conflict score
    c = conflict.detach()
    if c.ndim == 0:
        c = c.expand(pred.shape[0])
    # Broadcast to (B,) then to pred shape
    w = base_weight + conflict_boost * c
    while w.ndim < pred.ndim:
        w = w.unsqueeze(-1)
    per = F.mse_loss(pred, target, reduction="none")
    return (per * w).mean()
