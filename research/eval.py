"""Evaluate a PhysNet checkpoint: HR MAE/RMSE/MAPE/Pearson + waveform corr.

Usage:
  python -m research.eval --config research/configs/synthetic.yaml
  python -m research.eval --config research/configs/ubfc.yaml --split test
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from research.config import load_config, resolve_out_dir
from research.conflict.scores import compute_conflict, soft_suppress
from research.data.loaders import get_dataset
from research.metrics.hr import hr_metrics, waveform_correlation, waveform_to_hr
from research.models.physnet import PhysNet
from research.reliability.regional import compute_reliability


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Evaluate PhysNet research scaffold")
    p.add_argument("--config", default="research/configs/synthetic.yaml")
    p.add_argument("--checkpoint", default=None)
    p.add_argument("--split", default="test", choices=["train", "val", "test"])
    p.add_argument("--device", default=None)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = load_config(args.config)
    out_dir = resolve_out_dir(cfg)
    device = torch.device(args.device or cfg.get("device", "cpu"))

    try:
        ds = get_dataset(cfg, split=args.split)
    except FileNotFoundError as e:
        print(str(e))
        return 2

    ckpt_path = Path(args.checkpoint or cfg.get("checkpoint", out_dir / "physnet_synthetic.pt"))
    if not ckpt_path.exists():
        print(
            f"Checkpoint not found: {ckpt_path}\n"
            f"Train first: python -m research.train --config {args.config}"
        )
        return 2

    try:
        blob = torch.load(ckpt_path, map_location=device, weights_only=False)
    except TypeError:
        blob = torch.load(ckpt_path, map_location=device)
    model = PhysNet(
        frames=int(cfg.get("frames", 64)),
        base_ch=int(cfg.get("base_ch", 8)),
    ).to(device)
    model.load_state_dict(blob["model"])
    model.eval()

    loader = DataLoader(ds, batch_size=int(cfg.get("batch_size", 4)), shuffle=False)
    fs = float(cfg.get("sample_rate_hz", 30.0))
    phys = tuple(float(x) for x in cfg.get("phys_band_hz", [0.7, 4.0]))

    pred_hrs = []
    true_hrs = []
    wave_corrs = []
    conflicts = []

    with torch.no_grad():
        for batch in loader:
            video = batch["video"].to(device)
            target = batch["waveform"].cpu().numpy()
            motion = batch["motion"].cpu().numpy()
            hr_true = batch["hr_bpm"].cpu().numpy()
            pred = model(video).cpu().numpy()

            for i in range(pred.shape[0]):
                p = pred[i]
                t = target[i]
                m = motion[i]
                n = min(m.shape[0], p.shape[0] - 1 if p.shape[0] > 1 else p.shape[0])
                cand = p[1 : n + 1] if p.shape[0] > n else p[:n]
                cs = compute_conflict(
                    m[:n],
                    cand,
                    sample_rate_hz=fs,
                    phys_band_hz=phys,
                    alpha=float(cfg.get("alpha", 0.5)),
                    beta=float(cfg.get("beta", 0.5)),
                )
                gated = soft_suppress(
                    p,
                    cs.combined,
                    residual_floor=float(cfg.get("residual_floor", 0.15)),
                )["gated"]

                # Regional reliability (using batch quality/motion mag if present)
                q = {k: float(batch["quality"][k][i]) for k in batch["quality"]}
                mm = {k: float(batch["motion_mag"][k][i]) for k in batch["motion_mag"]}
                _ = compute_reliability(
                    q,
                    mm,
                    a_q=float(cfg.get("a_q", 4.0)),
                    a_m=float(cfg.get("a_m", 4.0)),
                    b=float(cfg.get("b", 0.0)),
                )

                pred_hrs.append(waveform_to_hr(gated, fs, phys))
                true_hrs.append(float(hr_true[i]))
                wave_corrs.append(waveform_correlation(gated, t))
                conflicts.append(cs.combined)

    metrics = hr_metrics(pred_hrs, true_hrs)
    metrics["waveform_corr_mean"] = float(np.mean(wave_corrs)) if wave_corrs else float("nan")
    metrics["conflict_mean"] = float(np.mean(conflicts)) if conflicts else float("nan")
    metrics["split"] = args.split
    metrics["checkpoint"] = str(ckpt_path)

    out_path = out_dir / f"eval_{args.split}.json"
    out_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
