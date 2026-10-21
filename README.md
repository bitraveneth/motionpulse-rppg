# MotionPulse

Estimate pulse from a face video in the browser. See when face motion may muddy the signal, and which face areas look most trustworthy.

**Main job:** Load sample → Upload video → Use webcam → read pulse BPM, motion risk, and a trust map.

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

## How to upload a video

1. Open the app and click **Upload face video**.
2. Pick a short clip (MP4 / WebM / MOV) of a face in good light — about 5–20 seconds.
3. Wait while landmarks are sampled; the status bar shows progress.
4. Results panels update automatically: motion, risk score, cleaned pulse, and trust map.

For research datasets (PURE / UBFC / etc.), use local folders later; this demo analyzes **one video at a time**.

## What the panels mean

| Panel | Plain meaning |
|-------|----------------|
| How the face moved | Overall head motion vs local expression/talk |
| Motion vs pulse risk | Risk score when motion lines up with the pulse estimate — **not proof** |
| Cleaned pulse estimate | Soft cleanup when risk is high; pulse is never fully wiped |
| Which face areas to trust | Stable skin regions get more weight |

## Dataset links (optional, later)

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
