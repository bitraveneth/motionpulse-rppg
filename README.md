# MotionPulse — Motion-Aware rPPG Demo

Interactive browser demo of the four thesis mechanisms from *Remote Photoplethysmography via Motion-Aware Physiological Representation Learning* (§§3.1.2–3.1.4):

1. **Global / local facial motion** — scale-normalized landmark displacement; rigid vs residual local motion  
2. **Temporal + spectral conflict** — graded sync risk (`C_temp`, `C_spec`, combined `C`) — **not causality**  
3. **Bounded soft suppression** — soft gate with residual floor so pulse is never fully wiped  
4. **Regional reliability weights** — forehead / L·R cheek / lower face via `σ(λ(Q−M))`

Classical **CHROM / POS** candidate rPPG (no PhysNet). **MediaPipe Face Landmarker** for upload/webcam. A **bundled synthetic sample** runs everything without datasets.

## Run locally

```bash
npm install
npm run dev
```

Dev server binds to **http://127.0.0.1:4731** (see `vite.config.ts`).

```bash
npm test      # unit tests (synthetic conflict / reliability cases)
npm run build
```

## Dataset download / request links

The demo does **not** require these. Request them in parallel for later research:

| Dataset | Access |
|---------|--------|
| **UBFC-rPPG** | [Official page](https://sites.google.com/view/ybenezeth/ubfcrppg) (~42 subjects + PPG GT) — usually the fastest start |
| **PURE** | Email `nikr-datasets-request@tu-ilmenau.de` from the [TU Ilmenau PURE page](https://www.tu-ilmenau.de/en/university/departments/department-of-computer-science-and-automation/profile/institutes-and-groups/institute-of-computer-and-systems-engineering/group-for-neuroinformatics-and-cognitive-robotics/data-sets-code/pulse-rate-detection-dataset-pure) — controlled motion protocols |
| **MMPD** | Sign the [release agreement](https://github.com/McJackTang/MMPD_rPPG_dataset/blob/main/MMPD_Release_Agreement.pdf); faculty email to `tjk24@mails.tsinghua.edu.cn` (cc `yuntaowang@tsinghua.edu.cn`) |

Drop real clips into `samples/` later and reuse the same pipeline. Training baselines: [rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox).

## Project layout

```
src/lib/rppg/          # Pure TS: motion, CHROM/POS, conflict, reliability, synthetic
src/lib/mediapipe/     # Face Landmarker for upload / webcam
src/components/        # Charts, face overlay, controls
src/App.tsx            # Interactive panels
```

## Notes

- Conflict UI labels scores as **graded risk**, never causal claims.  
- Not a medical device.  
- Webcam/upload need network once to fetch the MediaPipe model/WASM.
