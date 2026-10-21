"""RQ1 offline analysis: conflict score vs HR error on synthetic data.

Does **not** claim the scientific RQ is answered — only that the analysis
pipeline runs and writes a scatter/CSV for later real-data use.

Usage:
  python -m research.rq1_conflict_analysis --config research/configs/synthetic.yaml
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from research.config import load_config, resolve_out_dir
from research.conflict.scores import compute_conflict
from research.data.loaders import get_dataset
from research.data.synthetic import generate_synthetic_window
from research.metrics.hr import waveform_to_hr
from research.models.physnet import PhysNet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="RQ1: conflict vs error (offline)")
    p.add_argument("--config", default="research/configs/synthetic.yaml")
    p.add_argument("--checkpoint", default=None)
    p.add_argument("--n", type=int, default=48, help="Number of synthetic windows")
    p.add_argument("--device", default=None)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = load_config(args.config)
    out_dir = resolve_out_dir(cfg)
    device = torch.device(args.device or cfg.get("device", "cpu"))
    fs = float(cfg.get("sample_rate_hz", 30.0))
    phys = tuple(float(x) for x in cfg.get("phys_band_hz", [0.7, 4.0]))
    frames = int(cfg.get("frames", 64))
    h = int(cfg.get("height", 36))
    w = int(cfg.get("width", 36))

    ckpt_path = Path(args.checkpoint or cfg.get("checkpoint", out_dir / "physnet_synthetic.pt"))
    model = PhysNet(frames=frames, base_ch=int(cfg.get("base_ch", 8))).to(device)
    if ckpt_path.exists():
        try:
            blob = torch.load(ckpt_path, map_location=device, weights_only=False)
        except TypeError:
            blob = torch.load(ckpt_path, map_location=device)
        model.load_state_dict(blob["model"])
        print(f"loaded checkpoint {ckpt_path}")
    else:
        print(f"no checkpoint at {ckpt_path}; using randomly initialized PhysNet")
    model.eval()

    rows = []
    rng = np.random.default_rng(int(cfg.get("seed", 42)))

    with torch.no_grad():
        for i in range(args.n):
            amp = float(rng.uniform(0.0, 1.0))
            win = generate_synthetic_window(
                frames=frames,
                height=h,
                width=w,
                sample_rate_hz=fs,
                motion_amp=amp,
                motion_at_pulse_freq=True,
                seed=int(cfg.get("seed", 42)) + i,
            )
            video = torch.from_numpy(win.video).unsqueeze(0).to(device)
            pred = model(video).cpu().numpy()[0]
            m = win.motion
            n = min(m.shape[0], pred.shape[0] - 1)
            cand = pred[1 : n + 1]
            cs = compute_conflict(
                m[:n],
                cand,
                sample_rate_hz=fs,
                phys_band_hz=phys,
                alpha=float(cfg.get("alpha", 0.5)),
                beta=float(cfg.get("beta", 0.5)),
            )
            pred_hr = waveform_to_hr(pred, fs, phys)
            err = abs(pred_hr - win.hr_bpm)
            rows.append(
                {
                    "idx": i,
                    "hr_true": win.hr_bpm,
                    "hr_pred": pred_hr,
                    "abs_err": err,
                    "c_temp": cs.c_temp,
                    "c_spec": cs.c_spec,
                    "c": cs.combined,
                    "motion_amp": amp,
                }
            )

    # Pearson between C and |HR error| (descriptive only)
    c_arr = np.array([r["c"] for r in rows], dtype=np.float64)
    e_arr = np.array([r["abs_err"] for r in rows], dtype=np.float64)
    if c_arr.std() > 1e-9 and e_arr.std() > 1e-9:
        corr = float(np.corrcoef(c_arr, e_arr)[0, 1])
    else:
        corr = float("nan")

    summary = {
        "n": len(rows),
        "pearson_C_vs_abs_err": corr,
        "mean_C": float(c_arr.mean()),
        "mean_abs_err": float(e_arr.mean()),
        "note": (
            "Offline descriptive association on synthetic data only. "
            "Does not answer RQ1 scientifically."
        ),
    }

    csv_path = out_dir / "rq1_conflict_vs_error.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    json_path = out_dir / "rq1_summary.json"
    json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"wrote {csv_path}")
    print(f"wrote {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
