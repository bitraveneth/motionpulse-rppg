"""Dataset adapters. Real loaders activate once user drops data under ``data/``."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from research.data.synthetic import SyntheticRppgDataset


def missing_dataset_message(name: str, expected: Path) -> str:
    hint = (
        "Until then, use --config research/configs/synthetic.yaml"
        if name != "scamps"
        else (
            "Download the official 10-video example (~1.2GB), see README / "
            "scripts/download_scamps_example.sh, then re-run with "
            "research/configs/scamps.yaml"
        )
    )
    return (
        f"Dataset '{name}' not found at {expected}.\n"
        f"Place the dataset there (gitignored), then re-run.\n"
        f"See research/README.md for layout notes.\n"
        f"{hint}"
    )


def get_dataset(cfg: dict[str, Any], split: str = "train"):
    """Return a Dataset from config. Raises FileNotFoundError for missing real data."""
    name = str(cfg.get("dataset", "synthetic")).lower()
    data_root = Path(cfg.get("data_root", "data"))
    frames = int(cfg.get("frames", 128))
    height = int(cfg.get("height", 36))
    width = int(cfg.get("width", 36))
    fs = float(cfg.get("sample_rate_hz", 30.0))

    if name in ("synthetic", "synth"):
        size = int(cfg.get("train_size" if split == "train" else "val_size", 64))
        if split == "test":
            size = int(cfg.get("test_size", cfg.get("val_size", 32)))
        return SyntheticRppgDataset(
            size=size,
            frames=frames,
            height=height,
            width=width,
            sample_rate_hz=fs,
            motion_prob=float(cfg.get("motion_prob", 0.5)),
            motion_amp_range=tuple(cfg.get("motion_amp_range", [0.0, 0.8])),
            seed=int(cfg.get("seed", 0)) + (0 if split == "train" else 10_000),
        )

    if name == "scamps":
        from research.data.scamps import ScampsRppgDataset, discover_scamps_mats

        expected = data_root / "SCAMPS"
        if not expected.exists() or not discover_scamps_mats(expected):
            raise FileNotFoundError(missing_dataset_message(name, expected))
        ratios = tuple(cfg.get("split_ratios", [7, 1, 2]))
        if len(ratios) != 3:
            ratios = (7, 1, 2)
        phys = tuple(float(x) for x in cfg.get("phys_band_hz", [0.7, 4.0]))
        max_key = {
            "train": "max_train_windows",
            "val": "max_val_windows",
            "test": "max_test_windows",
        }.get(split)
        max_windows = cfg.get(max_key) if max_key else None
        return ScampsRppgDataset(
            root=expected,
            split=split,
            frames=frames,
            height=height,
            width=width,
            sample_rate_hz=fs,
            phys_band_hz=(float(phys[0]), float(phys[1])),
            stride=cfg.get("stride"),
            split_ratios=(int(ratios[0]), int(ratios[1]), int(ratios[2])),
            max_windows=int(max_windows) if max_windows is not None else None,
        )

    # Stubs for real datasets — fail clearly until user supplies files
    expected_map = {
        "ubfc": data_root / "UBFC",
        "pure": data_root / "PURE",
        "mmpd": data_root / "MMPD",
    }
    if name not in expected_map:
        raise ValueError(
            f"Unknown dataset '{name}'. Use synthetic|scamps|ubfc|pure|mmpd."
        )

    expected = expected_map[name]
    if not expected.exists():
        raise FileNotFoundError(missing_dataset_message(name, expected))

    raise NotImplementedError(
        f"Loader for '{name}' is stubbed. Files found at {expected}, but "
        f"subject-independent windowing is not wired yet. "
        f"Use synthetic or scamps for smoke tests; extend research/data/loaders.py next."
    )
