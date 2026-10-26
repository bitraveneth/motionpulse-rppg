# MotionPulse

Estimate pulse from a face video in the browser. See when face motion may muddy the signal, and which face areas look most trustworthy.

**Main job:** Face monitoring — upload up to 10 clips (or load a demo set), watch vitals update live while analyzing, then settle on HR / waveform / trust / risk. Optionally share **metric summaries** (+ tiny face thumb + pulse sparkline) to a public feed. Blood pressure stays **Not available**.

## Run locally

```bash
npm install
npm run dev
```

Dev server: **http://127.0.0.1:4731**

```bash
npm test
npm run build
```

## Demo clips (5–10 face videos)

1. Drop short face videos into [`public/demo-clips/`](public/demo-clips/) (`.mp4` / `.webm` / `.mov`).
2. Restart or refresh `npm run dev`, then click **Load demo set**.
3. Browse one-by-one with the session slider under the preview.

Until that folder has files, use **Upload face video** (multi-select) or **Try sample**.

## Upload flow

1. Click **Upload face video** and pick one or more short clips (MP4 / WebM / MOV), up to 10 per session.
2. The browser **optimizes** first: caps resolution (~720p) and duration (~15s) via canvas — no video leaves the device.
3. Progress stages: **Optimizing → Finding face → Estimating pulse** — HR, waveform, and risk update **progressively** as frames accumulate, then settle when done.
4. Use the **session slider** to flip between clips. Detail panels (motion / spectrum / trust) stay under Advanced.
5. Optionally **Share to feed** (nickname blank → Anonymous). Only metrics + optional tiny thumb/sparkline are posted — never raw face video.

## How to read your results

The in-app **How to read your results** section covers:

| Item | Meaning |
|------|---------|
| **BPM** | Educational pulse estimate from the cleaned waveform — not a clinical measurement |
| **Motion risk** | How much face motion lines up with the pulse estimate |
| **Stable / Mixed / Unreliable** | Signal-quality badges from that risk — **not** heart-health grades |
| **Cleaned pulse** | Soft cleanup when risk is high; pulse is never fully wiped |
| **Trusted face areas** | Which skin regions (forehead / cheeks / lower face) carried more weight |

**High motion risk ≠ a health problem** — it only flags that motion may have affected the estimate. Educational demo — **not for medical use**.

## Results feed (Supabase or mock)

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, the UI reads/writes a public `runs` table. Otherwise the feed uses **localStorage** so the gallery still works offline (including thumbnails as compressed data URLs).

### Enable Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) (creates `runs` + RLS for public read/insert of metric rows).
3. Copy Project URL + anon key into `.env` (see [`.env.example`](.env.example)):

```bash
cp .env.example .env
# edit VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

4. Restart `npm run dev`.

Schema fields: `id`, `created_at`, `nickname` (nullable), `bpm`, `conflict_score`, `risk_level`, `roi_weights` (json), `source` (`upload`|`webcam`|`sample`|`batch`), `client_id` (optional), `thumbnail_url` / `thumbnail_data` (optional tiny face crop), `sparkline` (SVG path). **No video blobs.**

### Migrating an existing Supabase project

If you already created `runs` before thumbnails/sparklines, run:

```sql
alter table public.runs add column if not exists thumbnail_url text null;
alter table public.runs add column if not exists thumbnail_data text null;
alter table public.runs add column if not exists sparkline text null;
```

Optionally create a public-read Storage bucket named `thumbs` for ~128–192px JPEG/WebP (~40–80KB). Prefer `thumbnail_url` when using Storage; otherwise `thumbnail_data` (text) is fine under the schema size checks. Re-apply the insert RLS policy from `schema.sql` so the new column length checks apply.

## Local lab (in-app + CLI)

The **Local lab** nav item appears when running `npm run dev`, or when `VITE_ENABLE_LOCAL_LAB=true`. It is **gated** so casual public deploys do not nudge visitors toward multi‑GB dataset downloads.

In Local lab you can:

1. Read a short privacy note (datasets stay on this machine).
2. Open UBFC / PURE / MMPD download links.
3. Enter a dataset folder path and copy exact `npm run batch` / `npm run publish-results` commands.
4. Reload `out/batch-results.json` (Vite dev serves it at `/api/local-lab/batch-results`) or load the JSON file manually.
5. **Publish summaries online** — metrics (+ optional thumb/sparkline fields) via the same feed API. Without Supabase keys, rows go to the localStorage demo feed and the UI explains how to go live. **Never uploads video.**

### Local batch CLI (UBFC / PURE / …)

Process a dataset folder on your Mac. Metrics only — **never commit datasets**.

```bash
# Put datasets under ./data (gitignored), e.g. ./data/UBFC
npm run batch -- ./data/UBFC
```

Writes:

- `out/batch-results.json`
- `out/batch-results.csv`

### How batch analysis works

MediaPipe Face Landmarker is browser-oriented. The CLI reuses `src/lib/rppg` and:

1. Prefers companion traces next to each video: `clip.motionpulse.json`, `traces.json`, etc. (landmarks + ROI RGB).
2. If none exist, uses a **synthetic proxy** seeded by the video path so CSV + publish wiring still works. For real landmark analysis, export traces from the web UI or run analysis in-browser per clip.

Optional: convert awkward codecs with ffmpeg before batching (`ffmpeg -i in.avi -c:v libx264 out.mp4`).

### Publish batch summaries

```bash
npm run publish-results
```

Posts rows from `out/batch-results.json` to Supabase when keys are set; otherwise prints setup instructions. The in-app **Publish summaries online** button uses the same metric-only payload (and falls back to the mock feed without keys). **Never uploads video.**

## Admin backend (Prisma + Hono API)

The `/admin` area (content editor, users, sessions, ground truth, CSV/JSON export) and the optional subject sign-in run on one Prisma Postgres database with a Hono API. In dev, Vite mounts the API at `/api/*`; on Vercel the same app runs as a serverless function (`api/index.ts`).

Local setup:

```bash
cp .env.example .env   # fill DATABASE_URL (+ DIRECT_URL only if migrate needs it) and AUTH_SECRET
npx prisma migrate dev
npm run db:seed        # seeds one admin (prints a random password) + default copy
npm run dev            # admin at http://127.0.0.1:4731/admin
```

Passwords are hashed with Node `crypto.scrypt`; sign-in uses an httpOnly cookie session.

### Deploy to Vercel (later)

- Framework preset: **Vite** (build `npm run build`, output `dist`). `vercel.json` routes `/api/*` to the function and falls back to `index.html` for the SPA.
- Env vars to set in the Vercel dashboard: `DATABASE_URL` (pooled Prisma Postgres), `AUTH_SECRET` (random hex). `DIRECT_URL` only if migrations need the non-pooled host. No other secrets — do **not** put connection strings in the repo or README.
- `postinstall` runs `prisma generate`; apply migrations from a machine that has the env (`npx prisma migrate deploy`).

## Privacy

- Face video and webcam frames stay in the browser (or on your local batch machine).
- The feed and `publish-results` store **metrics summaries only** (BPM, risk, ROI weights, optional nickname, optional tiny thumb + sparkline).
- Educational demo — **not a medical device**.

## What the panels mean

| Panel | Plain meaning |
|-------|----------------|
| Before you upload | Face, light, still, ~5–15s tips |
| How to read your results | BPM, risk, cleaned pulse, trust, Stable/Mixed/Unreliable |
| Result story | BPM, reliability badge, thumb, sparkline, trust dots |
| How the face moved | Overall head motion vs local expression/talk |
| Motion vs pulse risk | Risk score when motion lines up with the pulse estimate — **not proof** |
| Cleaned pulse estimate | Soft cleanup when risk is high; pulse is never fully wiped |
| Which face areas to trust | Stable skin regions get more weight |
| Recent runs | Public/local gallery of shared metric cards |
| Local lab | Dev-gated batch helper: dataset links, CLI commands, results table, publish |

## Dataset links (local use only)

| Dataset | Access |
|---------|--------|
| **SCAMPS** (synthetic, public example) | [GitHub + Azure example ~1.2GB](https://github.com/danmcduff/scampsdataset) → `data/SCAMPS/` via `scripts/download_scamps_example.sh` |
| **UBFC-rPPG** | [Official page](https://sites.google.com/view/ybenezeth/ubfcrppg) |
| **PURE** | [TU Ilmenau PURE](https://www.tu-ilmenau.de/en/university/departments/department-of-computer-science-and-automation/profile/institutes-and-groups/institute-of-computer-and-systems-engineering/group-for-neuroinformatics-and-cognitive-robotics/data-sets-code/pulse-rate-detection-dataset-pure) |
| **MMPD** | [Release agreement](https://github.com/McJackTang/MMPD_rPPG_dataset/blob/main/MMPD_Release_Agreement.pdf) |

Training baselines: [rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox).

## Research pipeline

Thesis scientific path (PhysNet + conflict + regional reliability) lives under [`research/`](research/README.md). MotioPulse remains the primary interactive UI; the Python package smokes on **synthetic** data, or on the public **SCAMPS** 10-video example, until you drop UBFC/PURE/MMPD under `data/` (gitignored).

```bash
python3 -m pip install -e ".[research]"
python3 -m research.train --config research/configs/synthetic.yaml
python3 -m research.eval --config research/configs/synthetic.yaml
python3 -m research.rq1_conflict_analysis --config research/configs/synthetic.yaml
```

### SCAMPS example (public download, ~1.2GB)

No faculty gate. Official README: [danmcduff/scampsdataset](https://github.com/danmcduff/scampsdataset).  
**Academic note:** SCAMPS is synthetic faces — pipeline check only, not a substitute for PURE/UBFC/MMPD for final thesis claims.

```bash
bash scripts/download_scamps_example.sh
# or:
# mkdir -p data/SCAMPS && cd data/SCAMPS
# curl -L -o scamps_videos_example.tar.gz \
#   "https://facesyntheticspubwedata.z6.web.core.windows.net/neurips-2022/scamps_videos_example.tar.gz"
# tar -xzf scamps_videos_example.tar.gz

python3 -m research.train --config research/configs/scamps.yaml
python3 -m research.eval --config research/configs/scamps.yaml
python3 -m research.rq1_conflict_analysis --config research/configs/scamps.yaml
```

See [research/README.md](research/README.md) for install details, PhysNet citation (Yu et al., BMVC 2019), and how to point configs at `data/UBFC` later. **Does not claim RQ1–RQ4 are answered.**

## Notes

- Classical CHROM / POS candidate; MediaPipe Face Landmarker for upload/webcam.
- Bundled synthetic sample works offline.
- Not a medical device.
