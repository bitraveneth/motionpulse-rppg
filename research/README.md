# Research pipeline (thesis RQ1–RQ4 scaffold)

Python scientific path for motion-aware rPPG. The MotioPulse Vite demo stays the primary UI; this package trains/evaluates a **PhysNet-style** waveform backbone plus conflict and regional-reliability modules.

**This scaffold does not claim RQ1–RQ4 are scientifically answered.** Until real datasets are present, everything runs on **synthetic** windows.

## Install

From the repo root:

```bash
python3 -m pip install -e ".[research]"
# or
python3 -m pip install -r requirements-research.txt
python3 -m pip install -e .
```

Requires Python ≥ 3.9. Uses CPU by default (`device: cpu` in YAML).

## Backbone

Compact PhysNet-style 3D CNN (`research/models/physnet.py`).

> Yu, Z., Li, X., & Zhao, G. *Remote Photoplethysmograph Signal Measurement from Facial Videos Using Spatio-Temporal Networks.* **BMVC 2019**.

## Synthetic smoke (must pass without datasets)

```bash
# 1–2 tiny epochs
python -m research.train --config research/configs/synthetic.yaml

# HR metrics + waveform correlation
python -m research.eval --config research/configs/synthetic.yaml

# RQ1 offline: conflict C vs |HR error| on synthetic (descriptive only)
python -m research.rq1_conflict_analysis --config research/configs/synthetic.yaml
```

Outputs land in `research/out/` (gitignored): checkpoints, `eval_*.json`, `rq1_*.csv/json`.

## Modules

| Module | Role |
|--------|------|
| `research.models.physnet` | Waveform backbone |
| `research.motion.curves` | Landmark displacement formulas (global / local / residual) |
| `research.conflict.scores` | \(C_{temp}\), \(C_{spec}\), \(C\); soft gate + residual; conflict-weighted loss (**stop-grad on C**) |
| `research.reliability.regional` | \(R_i=\sigma(a_Q Q_i - a_M M_i + b)\); soft weights; aggregate |
| `research.metrics.hr` | MAE / RMSE / MAPE / Pearson on HR; waveform correlation |
| `research.data.synthetic` | Pulse windows + optional periodic motion contamination |

## Configs

- `configs/synthetic.yaml` — smoke training (default)
- `configs/ubfc.yaml` / `pure.yaml` / `mmpd.yaml` — stubs; fail clearly if `data/` missing

## When you add UBFC

1. Download UBFC-rPPG from the [official page](https://sites.google.com/view/ybenezeth/ubfcrppg) (do **not** commit it).
2. Place under `data/UBFC` (already gitignored), e.g.:

```text
data/UBFC/
  subject1/
  subject2/
  ...
```

3. Then:

```bash
# Expect a clear FileNotFoundError until the folder exists;
# once present, loader is still stubbed until subject-independent
# windowing is wired — extend research/data/loaders.py.
python -m research.train --config research/configs/ubfc.yaml
python -m research.eval --config research/configs/ubfc.yaml --split test
python -m research.rq1_conflict_analysis --config research/configs/ubfc.yaml
```

Same pattern for PURE → `data/PURE`, MMPD → `data/MMPD`.

## Phase C experiments (after data + loaders)

- **RQ1:** conflict vs error (this script, then real data)
- **RQ2:** ROI ablations (uniform / motion-only / quality-only / joint)
- **RQ3:** motion- and conflict-stratified metrics
- **RQ4:** cross-dataset (e.g. UBFC→MMPD)

Export tables/CSV to `research/out/`.
