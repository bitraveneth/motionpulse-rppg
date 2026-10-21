"""HR and waveform evaluation metrics."""

from __future__ import annotations

from typing import Sequence

import numpy as np
from numpy.typing import NDArray

from research.dsp import dominant_hr_bpm, pearson


def mae(pred: Sequence[float], target: Sequence[float]) -> float:
    p = np.asarray(pred, dtype=np.float64)
    t = np.asarray(target, dtype=np.float64)
    n = min(p.size, t.size)
    if n == 0:
        return float("nan")
    return float(np.mean(np.abs(p[:n] - t[:n])))


def rmse(pred: Sequence[float], target: Sequence[float]) -> float:
    p = np.asarray(pred, dtype=np.float64)
    t = np.asarray(target, dtype=np.float64)
    n = min(p.size, t.size)
    if n == 0:
        return float("nan")
    return float(np.sqrt(np.mean((p[:n] - t[:n]) ** 2)))


def mape(pred: Sequence[float], target: Sequence[float], eps: float = 1e-6) -> float:
    p = np.asarray(pred, dtype=np.float64)
    t = np.asarray(target, dtype=np.float64)
    n = min(p.size, t.size)
    if n == 0:
        return float("nan")
    denom = np.maximum(np.abs(t[:n]), eps)
    return float(np.mean(np.abs(p[:n] - t[:n]) / denom) * 100.0)


def pearson_corr(pred: Sequence[float], target: Sequence[float]) -> float:
    return pearson(np.asarray(pred), np.asarray(target))


def waveform_correlation(
    pred: Sequence[float] | NDArray[np.floating],
    target: Sequence[float] | NDArray[np.floating],
) -> float:
    """Pearson correlation helper for recovered vs ground-truth waveforms."""
    return pearson_corr(pred, target)


def hr_metrics(
    pred_hr: Sequence[float],
    target_hr: Sequence[float],
) -> dict:
    return {
        "mae": mae(pred_hr, target_hr),
        "rmse": rmse(pred_hr, target_hr),
        "mape": mape(pred_hr, target_hr),
        "pearson": pearson_corr(pred_hr, target_hr),
        "n": min(len(pred_hr), len(target_hr)),
    }


def waveform_to_hr(
    wave: Sequence[float] | NDArray[np.floating],
    sample_rate_hz: float,
    phys_band_hz: tuple[float, float] = (0.7, 4.0),
) -> float:
    return dominant_hr_bpm(np.asarray(wave, dtype=np.float64), sample_rate_hz, phys_band_hz)
