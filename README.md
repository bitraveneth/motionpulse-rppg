# MotionPulse

Estimate pulse from a face video in the browser. See when face motion may muddy the signal, and which face areas look most trustworthy.

**Main job:** Load sample → Upload video → Use webcam → read pulse BPM, motion risk, and a trust map. Optionally share **metric summaries** to a public feed.

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

## Upload flow

1. Click **Upload face video** and pick a short clip (MP4 / WebM / MOV).
2. The browser **optimizes** first: caps resolution (~720p) and duration (~15s) via canvas — no video leaves the device.
3. Progress stages: **Optimizing → Finding face → Estimating pulse**.
4. A **result story** card summarizes BPM, motion risk, and trust. Detail panels expand below.
5. Optionally **Share to feed** (nickname blank → Anonymous). Only metrics are posted — never raw face video.

## Results feed (Supabase or mock)

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, the UI reads/writes a public `runs` table. Otherwise the feed uses **localStorage** so the gallery still works offline.

### Enable Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) (creates `runs` + RLS for public read/insert of metric rows).
3. Copy Project URL + anon key into `.env` (see [`.env.example`](.env.example)):

```bash
cp .env.example .env
# edit VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

4. Restart `npm run dev`.

Schema fields: `id`, `created_at`, `nickname` (nullable), `bpm`, `conflict_score`, `risk_level`, `roi_weights` (json), `source` (`upload`|`webcam`|`sample`|`batch`), `client_id` (optional). **No video blobs.**

## Local batch (UBFC / PURE / …)

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

Posts rows from `out/batch-results.json` to Supabase when keys are set; otherwise prints setup instructions. **Never uploads video.**

## Privacy

- Face video and webcam frames stay in the browser (or on your local batch machine).
- The feed and `publish-results` store **metrics summaries only** (BPM, risk, ROI weights, optional nickname).
- Educational demo — **not a medical device**.

## What the panels mean

| Panel | Plain meaning |
|-------|----------------|
| Result story | BPM, motion risk level, trust summary after a run |
| How the face moved | Overall head motion vs local expression/talk |
| Motion vs pulse risk | Risk score when motion lines up with the pulse estimate — **not proof** |
| Cleaned pulse estimate | Soft cleanup when risk is high; pulse is never fully wiped |
| Which face areas to trust | Stable skin regions get more weight |
| Recent runs | Public/local gallery of shared metric cards |

## Dataset links (local use only)

| Dataset | Access |
|---------|--------|
| **UBFC-rPPG** | [Official page](https://sites.google.com/view/ybenezeth/ubfcrppg) |
| **PURE** | [TU Ilmenau PURE](https://www.tu-ilmenau.de/en/university/departments/department-of-computer-science-and-automation/profile/institutes-and-groups/institute-of-computer-and-systems-engineering/group-for-neuroinformatics-and-cognitive-robotics/data-sets-code/pulse-rate-detection-dataset-pure) |
| **MMPD** | [Release agreement](https://github.com/McJackTang/MMPD_rPPG_dataset/blob/main/MMPD_Release_Agreement.pdf) |

Training baselines: [rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox).

## Notes

- Classical CHROM / POS candidate; MediaPipe Face Landmarker for upload/webcam.
- Bundled synthetic sample works offline.
- Not a medical device.
