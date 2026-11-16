"""Train PhysNet (+ conflict-weighted loss) on synthetic or configured data.

Usage:
  python -m research.train --config research/configs/synthetic.yaml
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

from research.config import load_config, resolve_out_dir
from research.conflict.scores import (
    compute_conflict,
    conflict_weighted_waveform_loss,
)
from research.data.loaders import get_dataset
from research.models.physnet import PhysNet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train PhysNet research scaffold")
    p.add_argument(
        "--config",
        default="research/configs/synthetic.yaml",
        help="YAML config path",
    )
    p.add_argument("--epochs", type=int, default=None)
    p.add_argument("--device", default=None)
    p.add_argument("--data-root", default=None)
    p.add_argument("--dataset", default=None)
    p.add_argument("--max-windows", type=int, default=None)
    p.add_argument("--max-subjects", type=int, default=None)
    p.add_argument("--cross-root", default=None, help="Another dataset folder to score after training")
    return p.parse_args()


def _batch_conflict(
    pred: torch.Tensor,
    motion: torch.Tensor,
    sample_rate_hz: float,
    phys_band_hz: tuple[float, float],
    alpha: float,
    beta: float,
    max_lag_sec: float,
) -> torch.Tensor:
    """Compute per-sample conflict C; used with stop-grad in the loss."""
    scores = []
    pred_np = pred.detach().cpu().numpy()
    mot_np = motion.detach().cpu().numpy()
    for i in range(pred_np.shape[0]):
        # Align lengths: motion is T-1, waveform is T
        m = mot_np[i]
        c = pred_np[i]
        n = min(m.shape[0], c.shape[0] - 1 if c.shape[0] > 1 else c.shape[0])
        if n < 8:
            scores.append(0.0)
            continue
        cs = compute_conflict(
            m[:n],
            c[: n + 1][1:] if c.shape[0] > n else c[:n],
            sample_rate_hz=sample_rate_hz,
            phys_band_hz=phys_band_hz,
            alpha=alpha,
            beta=beta,
            max_lag_sec=max_lag_sec,
        )
        scores.append(cs.combined)
    return torch.tensor(scores, device=pred.device, dtype=pred.dtype)


def main() -> int:
    args = parse_args()
    cfg = load_config(args.config)
    if args.data_root:
        cfg["data_root"] = args.data_root
    if args.dataset:
        cfg["dataset"] = args.dataset
    if args.max_windows is not None:
        cfg["max_train_windows"] = args.max_windows
    if args.max_subjects is not None:
        cfg["max_subjects"] = args.max_subjects
    out_dir = resolve_out_dir(cfg)
    device = torch.device(args.device or cfg.get("device", "cpu"))
    epochs = int(args.epochs if args.epochs is not None else cfg.get("epochs", 2))

    try:
        train_ds = get_dataset(cfg, split="train")
    except (FileNotFoundError, NotImplementedError, RuntimeError, ValueError) as exc:
        print(str(exc))
        return 1
    loader = DataLoader(
        train_ds,
        batch_size=int(cfg.get("batch_size", 4)),
        shuffle=True,
        num_workers=0,
    )

    model = PhysNet(
        frames=int(cfg.get("frames", 64)),
        base_ch=int(cfg.get("base_ch", 8)),
    ).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=float(cfg.get("lr", 1e-3)))

    phys = tuple(cfg.get("phys_band_hz", [0.7, 4.0]))
    fs = float(cfg.get("sample_rate_hz", 30.0))
    history = []

    model.train()
    for epoch in range(1, epochs + 1):
        losses = []
        for batch in tqdm(loader, desc=f"epoch {epoch}/{epochs}", leave=False):
            video = batch["video"].to(device)
            target = batch["waveform"].to(device)
            motion = batch["motion"].to(device)

            pred = model(video)
            conflict = _batch_conflict(
                pred,
                motion,
                sample_rate_hz=fs,
                phys_band_hz=(float(phys[0]), float(phys[1])),
                alpha=float(cfg.get("alpha", 0.5)),
                beta=float(cfg.get("beta", 0.5)),
                max_lag_sec=float(cfg.get("max_lag_sec", 0.5)),
            )
            loss = conflict_weighted_waveform_loss(
                pred,
                target,
                conflict,
                base_weight=1.0,
                conflict_boost=float(cfg.get("conflict_boost", 1.0)),
            )
            opt.zero_grad()
            loss.backward()
            opt.step()
            losses.append(float(loss.item()))

        mean_loss = float(np.mean(losses)) if losses else float("nan")
        history.append({"epoch": epoch, "loss": mean_loss})
        print(f"epoch {epoch}/{epochs}  loss={mean_loss:.6f}")

    ckpt = Path(cfg.get("checkpoint", out_dir / "physnet_synthetic.pt"))
    ckpt.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": model.state_dict(),
            "config": {k: v for k, v in cfg.items() if not str(k).startswith("_")},
            "history": history,
        },
        ckpt,
    )
    hist_path = out_dir / "train_history.json"
    clean_history = []
    for row in history:
        loss = row.get("loss")
        if isinstance(loss, float) and math.isfinite(loss):
            clean_history.append({"epoch": int(row["epoch"]), "loss": loss})
    hist_path.write_text(json.dumps(clean_history, indent=2), encoding="utf-8")
    counts = getattr(train_ds, "subject_windows", {})
    names = getattr(train_ds, "subjects", [])
    learned = []
    if isinstance(counts, dict) and isinstance(names, list):
        learned = [
            {"name": str(name), "windows": int(counts.get(name, 0))}
            for name in names
        ]
    held = [str(name) for name in getattr(train_ds, "held_out", [])]
    print(f"saved checkpoint → {ckpt}")
    print(f"saved history → {hist_path}")
    held_mae, held_count, held_people, cross_name, cross_mae, cross_count = _score_checkpoint(
        model, cfg, device, args.cross_root
    )
    if held_mae is not None:
        print(f"held out  MAE {held_mae:.1f} BPM  {held_count} people")
    if cross_mae is not None and cross_name:
        print(f"cross  {cross_name}  MAE {cross_mae:.1f} BPM  {cross_count} people")
    print(
        "record "
        + json.dumps(
            {
                "windows": len(train_ds),
                "learned": learned,
                "heldOut": held_people or held,
                "heldMae": None if held_mae is None else round(held_mae, 2),
                "heldCount": held_count,
                "crossName": cross_name,
                "crossMae": None if cross_mae is None else round(cross_mae, 2),
                "crossCount": cross_count,
                "history": clean_history,
                "checkpoint": str(ckpt),
            },
            separators=(",", ":"),
        )
    )
    return 0


def _people_dataset(root: str, split: str, cfg: dict, max_windows: int, max_subjects: int | None):
    from research.data.facevideo import FaceVideoDataset

    return FaceVideoDataset(
        root=root,
        split=split,
        frames=int(cfg.get("frames", 128)),
        height=int(cfg.get("height", 72)),
        width=int(cfg.get("width", 72)),
        max_windows=max_windows,
        max_subjects=max_subjects,
    )


def _score_checkpoint(model, cfg: dict, device, cross_root: str | None):
    """Held-out miss on the training folder, then an optional other folder."""
    from research.heldout import people_miss

    root = str(cfg.get("data_root", ""))
    raw_subjects = cfg.get("max_subjects")
    max_subjects = int(raw_subjects) if raw_subjects else None
    held_mae = None
    held_count = 0
    held_people: list = []
    cross_name = ""
    cross_mae = None
    cross_count = 0
    try:
        held_ds = _people_dataset(root, "test", cfg, 24, max_subjects)
        held = people_miss(model, held_ds, cfg, device)
        held_mae = held["mae"]
        held_count = int(held["count"])
        by_name = {person["name"]: person for person in held["people"]}
        for name in getattr(held_ds, "held_out", []):
            info = by_name.get(str(name))
            held_people.append(info or {"name": str(name), "windows": 0})
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"held out  error  {exc}")
    if cross_root:
        try:
            other = _people_dataset(cross_root, "all", cfg, 40, None)
            scored = people_miss(model, other, cfg, device)
            cross_name = Path(cross_root).name
            cross_mae = scored["mae"]
            cross_count = int(scored["count"])
        except (FileNotFoundError, RuntimeError, ValueError) as exc:
            print(f"cross  error  {exc}")
    return held_mae, held_count, held_people, cross_name, cross_mae, cross_count


if __name__ == "__main__":
    raise SystemExit(main())
