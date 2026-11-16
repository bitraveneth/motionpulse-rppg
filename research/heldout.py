"""Heart-rate miss for people the trainer did not learn, and for another folder."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Dict, List

import numpy as np
import torch
from torch.utils.data import DataLoader

from research.conflict.scores import compute_conflict, soft_suppress
from research.metrics.hr import waveform_to_hr


def subject_mae(rows: List[dict]) -> dict:
    """One estimate and one file rate per person, then the mean absolute miss."""
    if not rows:
        return {"mae": None, "count": 0, "people": []}
    gaps = [abs(float(row["bpm"]) - float(row["reference"])) for row in rows]
    return {
        "mae": float(np.mean(gaps)),
        "count": len(rows),
        "people": rows,
    }


def people_miss(model, dataset, cfg: dict, device: torch.device) -> dict:
    """Mean predicted BPM against the file curve, grouped by person."""
    fs = float(cfg.get("sample_rate_hz", 30.0))
    phys = tuple(float(value) for value in cfg.get("phys_band_hz", [0.7, 4.0]))
    buckets: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: {"pred": [], "true": []})
    loader = DataLoader(dataset, batch_size=int(cfg.get("batch_size", 4)), shuffle=False)
    model.eval()
    with torch.no_grad():
        for batch in loader:
            video = batch["video"].to(device)
            motion = batch["motion"].cpu().numpy()
            truth = batch["hr_bpm"].cpu().numpy()
            names = batch.get("subject")
            if names is None:
                names = [""] * int(truth.shape[0])
            pred = model(video).cpu().numpy()
            for index in range(pred.shape[0]):
                wave = pred[index]
                move = motion[index]
                length = min(move.shape[0], wave.shape[0] - 1 if wave.shape[0] > 1 else wave.shape[0])
                candidate = wave[1 : length + 1] if wave.shape[0] > length else wave[:length]
                scores = compute_conflict(
                    move[:length],
                    candidate,
                    sample_rate_hz=fs,
                    phys_band_hz=phys,
                    alpha=float(cfg.get("alpha", 0.5)),
                    beta=float(cfg.get("beta", 0.5)),
                )
                gated = soft_suppress(
                    wave,
                    scores.combined,
                    residual_floor=float(cfg.get("residual_floor", 0.15)),
                )["gated"]
                estimate = float(waveform_to_hr(gated, fs, phys))
                reference = float(truth[index])
                name = str(names[index]).strip()
                if not name or not math.isfinite(estimate) or estimate <= 0:
                    continue
                if not math.isfinite(reference) or reference <= 0:
                    continue
                buckets[name]["pred"].append(estimate)
                buckets[name]["true"].append(reference)
    people = []
    for name in sorted(buckets):
        pred_values = buckets[name]["pred"]
        true_values = buckets[name]["true"]
        if not pred_values:
            continue
        people.append(
            {
                "name": name,
                "windows": len(pred_values),
                "bpm": round(float(np.mean(pred_values)), 2),
                "reference": round(float(np.mean(true_values)), 2),
            }
        )
    return subject_mae(people)
