"""Motion-adaptive regional reliability (thesis §3.1.4).

R_i = σ(a_Q · Q_i − a_M · M_i + b); soft weights sum to 1; weighted aggregate.
"""

from __future__ import annotations

from typing import Dict, Mapping, Sequence

import numpy as np
from numpy.typing import NDArray

from research.dsp import clamp01, sigmoid, standardize
from research.motion.curves import ROI_IDS, RoiId


def soft_weights(
    reliability: Mapping[RoiId, float],
) -> tuple[Dict[RoiId, float], float]:
    scores = [max(1e-9, float(reliability.get(rid, 0.0))) for rid in ROI_IDS]
    total = sum(scores)
    weights = {rid: scores[i] / total for i, rid in enumerate(ROI_IDS)}
    entropy = 0.0
    for w in weights.values():
        if w > 0:
            entropy -= w * float(np.log2(w))
    return weights, entropy


def regional_reliability(
    quality: Mapping[RoiId, float],
    motion: Mapping[RoiId, float],
    a_q: float = 4.0,
    a_m: float = 4.0,
    b: float = 0.0,
) -> Dict[RoiId, float]:
    """R_i = σ(a_Q Q_i − a_M M_i + b)."""
    out: Dict[RoiId, float] = {}
    for rid in ROI_IDS:
        q = clamp01(float(quality.get(rid, 0.0)))
        m = clamp01(float(motion.get(rid, 0.0)))
        out[rid] = float(sigmoid(a_q * q - a_m * m + b))
    return out


def _normalize_magnitudes(values: Mapping[RoiId, float]) -> Dict[RoiId, float]:
    arr = [float(values.get(rid, 0.0)) for rid in ROI_IDS]
    mx = max(arr + [1e-9])
    return {rid: clamp01(float(values.get(rid, 0.0)) / mx) for rid in ROI_IDS}


def compute_reliability(
    quality: Mapping[RoiId, float],
    motion_raw: Mapping[RoiId, float],
    a_q: float = 4.0,
    a_m: float = 4.0,
    b: float = 0.0,
) -> dict:
    motion = _normalize_magnitudes(motion_raw)
    reliability = regional_reliability(quality, motion, a_q=a_q, a_m=a_m, b=b)
    weights, entropy = soft_weights(reliability)
    return {
        "quality": {rid: clamp01(float(quality.get(rid, 0.0))) for rid in ROI_IDS},
        "motion": motion,
        "reliability": reliability,
        "weights": weights,
        "entropy": entropy,
    }


def aggregate_weighted(
    roi_signals: Mapping[RoiId, Sequence[float] | NDArray[np.floating]],
    weights: Mapping[RoiId, float],
) -> NDArray[np.float64]:
    lens = [len(roi_signals[rid]) for rid in ROI_IDS if rid in roi_signals and len(roi_signals[rid]) > 0]
    if not lens:
        return np.zeros(0, dtype=np.float64)
    n = min(lens)
    out = np.zeros(n, dtype=np.float64)
    for t in range(n):
        s = 0.0
        for rid in ROI_IDS:
            sig = roi_signals.get(rid)
            if sig is None or len(sig) <= t:
                continue
            s += float(weights.get(rid, 0.0)) * float(sig[t])
        out[t] = s
    return standardize(out)
