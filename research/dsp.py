"""Shared DSP helpers (detrend, spectra, correlation) for conflict/metrics."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def clamp01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0))


def detrend(x: NDArray[np.floating]) -> NDArray[np.float64]:
    x = np.asarray(x, dtype=np.float64)
    if x.size < 2:
        return x.copy()
    t = np.arange(x.size, dtype=np.float64)
    a, b = np.polyfit(t, x, 1)
    return x - (a * t + b)


def standardize(x: NDArray[np.floating], eps: float = 1e-8) -> NDArray[np.float64]:
    x = np.asarray(x, dtype=np.float64)
    return (x - x.mean()) / (x.std() + eps)


def pearson(a: NDArray[np.floating], b: NDArray[np.floating]) -> float:
    a = standardize(np.asarray(a, dtype=np.float64))
    b = standardize(np.asarray(b, dtype=np.float64))
    n = min(a.size, b.size)
    if n < 2:
        return 0.0
    return float(np.clip(np.mean(a[:n] * b[:n]), -1.0, 1.0))


def max_lag_abs_corr(
    a: NDArray[np.floating],
    b: NDArray[np.floating],
    max_lag: int,
) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    n = min(a.size, b.size)
    if n < 4:
        return 0.0
    a, b = a[:n], b[:n]
    best = 0.0
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            aa, bb = a[lag:], b[: n - lag] if lag else b
        else:
            aa, bb = a[: n + lag], b[-lag:]
        if aa.size < 4:
            continue
        best = max(best, abs(pearson(aa, bb)))
    return float(best)


def periodogram(
    x: NDArray[np.floating],
    sample_rate_hz: float,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Return (freqs_hz, power) one-sided periodogram."""
    x = standardize(detrend(np.asarray(x, dtype=np.float64)))
    n = x.size
    if n < 4:
        return np.zeros(1), np.zeros(1)
    window = np.hanning(n)
    spec = np.fft.rfft(x * window)
    power = (np.abs(spec) ** 2) / (np.sum(window**2) + 1e-12)
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate_hz)
    return freqs.astype(np.float64), power.astype(np.float64)


def spectral_overlap(
    freqs: NDArray[np.floating],
    power_a: NDArray[np.floating],
    power_b: NDArray[np.floating],
    f_lo: float,
    f_hi: float,
) -> float:
    mask = (freqs >= f_lo) & (freqs <= f_hi)
    if not np.any(mask):
        return 0.0
    a = np.asarray(power_a[mask], dtype=np.float64)
    b = np.asarray(power_b[mask], dtype=np.float64)
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return clamp01(float(np.dot(a, b) / (na * nb)))


def dominant_hr_bpm(
    x: NDArray[np.floating],
    sample_rate_hz: float,
    phys_band_hz: tuple[float, float] = (0.7, 4.0),
) -> float:
    freqs, power = periodogram(x, sample_rate_hz)
    f_lo, f_hi = phys_band_hz
    mask = (freqs >= f_lo) & (freqs <= f_hi)
    if not np.any(mask):
        return 0.0
    idx = int(np.argmax(power[mask]))
    f = float(freqs[mask][idx])
    return f * 60.0


def sigmoid(x: float | NDArray[np.floating]) -> float | NDArray[np.float64]:
    x = np.asarray(x, dtype=np.float64)
    out = 1.0 / (1.0 + np.exp(-np.clip(x, -40.0, 40.0)))
    if out.ndim == 0:
        return float(out)
    return out
