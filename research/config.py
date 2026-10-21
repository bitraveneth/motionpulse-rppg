"""YAML config loading."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def load_config(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Config not found: {p}")
    with p.open("r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    if not isinstance(cfg, dict):
        raise ValueError(f"Config must be a mapping: {p}")
    cfg["_config_path"] = str(p.resolve())
    return cfg


def resolve_out_dir(cfg: dict[str, Any]) -> Path:
    out = Path(cfg.get("out_dir", "research/out"))
    out.mkdir(parents=True, exist_ok=True)
    return out
