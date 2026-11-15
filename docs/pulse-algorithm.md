# Pulse algorithm and why the research metrics are blank

The app is MotionPulse, on this Mac at `/Users/alex/STUDY/Apps/motionpulse-rppg`. The live heart-rate code is TypeScript under `src/lib/rppg/`. The Python folder `research/` is a separate scaffold. It does not produce the numbers on the 120 saved clips.

## Why MAE, RMSE, Pearson r, and Bland–Altman are blank

Those four numbers compare two heart rates:

- the camera estimate, already stored as `settledHeartRate`
- a known heart rate from a pulse oximeter, a counted pulse, or a dataset file

The saved camera rows are no longer shown as the study. They had a camera BPM and no known heart rate, so those four metrics stayed blank. The algorithm cannot invent the second number.

One labeled clip can show MAE, RMSE, and the Bland–Altman difference. For a single clip, MAE and RMSE are the same absolute gap. Pearson r and the Bland–Altman band (`bias ± 1.96 SD`) need two labeled clips.

SNR is different. It does not need a known heart rate. Each saved clip already has one, computed from the stored pulse trace. On the newest clip that ratio is about 6.7, which is 8.2 dB. Pearson r on a single clip stays `—` even when SNR is filled, because one clip has no correlation.

## The 120 clips cannot be re-run as video

A saved clip does not keep the video. In `prisma/schema.prisma`, `Clip.thumb` is a small still, and the comment on that field says the raw video is not stored. `Clip.waveform` is a short pulse trace, at most 240 samples, written in `src/lib/saveScan.ts` around line 68.

What is gone:

- the camera frames
- the red, green, and blue samples from the face
- the face landmarks

Without those, CHROM and POS cannot be run again on these 120 rows. The only trace left is the pulse curve that was saved at the end of the scan.

There is a second limit, and it matters if a teacher asks whether the saved curve is exactly the curve that produced the BPM:

- The BPM on the card is the loudest frequency of the equal-weight mix of the four face patches. See `gatedBpm` in `src/lib/rppg/pipeline.ts` lines 136–138.
- The saved waveform is a different mix: the four patches combined with the trust weights, then shortened. See `weightedAggregate` in `src/lib/rppg/reliability.ts` lines 114–132, and the save in `src/lib/saveScan.ts` line 68.
- A signal-to-noise ratio computed from the saved waveform is the ratio of that weighted curve, not of the exact series that chose the BPM.

The trust weights are calculated and stored. They are not used to choose the displayed BPM.

## Where the live algorithm is

Webcam frames are taken at a fixed 15 Hz. That rate is set in `src/pages/ScanPage.tsx` at lines 891 and 1093. It is not measured from the camera clock.

| Step | File | Lines | What it does |
| --- | --- | --- | --- |
| Face color | `src/lib/mediapipe/faceLandmarker.ts` | 139–171 | Average red, green, and blue in a 3×3 patch around each landmark |
| Which landmarks | `src/lib/rppg/motion.ts` | 11–16 | Forehead, left cheek, right cheek, lower face |
| Called from the camera loop | `src/pages/ScanPage.tsx` | 1071–1094 | One color sample per patch per frame, kept for the last 200 frames |
| Equal-weight mix | `src/lib/rppg/candidate.ts` | 173–193 | Average the four patches. This mix is what the BPM uses |
| CHROM, the default method | `src/lib/rppg/candidate.ts` | 28–92 | Blood-volume pulse from RGB |
| POS, only if selected | `src/lib/rppg/candidate.ts` | 95–159 | The other classical method |
| Band-limit, then scale | `src/lib/rppg/candidate.ts` | 161–170 | Keep 0.7–4 Hz, remove the trend, set mean 0 and variance 1 |
| Window and defaults | `src/lib/rppg/types.ts` | 62–72 | 8 seconds, band 0.7–4 Hz, CHROM, conflict weights 0.5 and 0.5 |
| Put the window together | `src/lib/rppg/pipeline.ts` | 58–153 | Motion, CHROM, conflict, weights, spectrum, BPM |
| The BPM line | `src/lib/rppg/pipeline.ts` | 136–138 | Loudest frequency in the band, times 60 |
| Spectrum | `src/lib/rppg/dsp.ts` | 102–122 | Discrete Fourier transform, power at each frequency |
| Loudest bin | `src/lib/rppg/dsp.ts` | 152–169 | Search only inside 0.7–4 Hz |
| SNR | `src/lib/rppg/dsp.ts` | 175–204 | Peak power divided by the other bins in that band |
| Conflict | `src/lib/rppg/conflict.ts` | 29–117 | How much the pulse trace resembles face motion |
| Trust weights | `src/lib/rppg/reliability.ts` | 41–132 | Per-patch quality. Stored. Not used for the BPM |
| Save | `src/lib/saveScan.ts` | 54–69 | BPM, weights, shortened weighted trace, thumbnail. No video |
| Comparison metrics | `src/lib/research/comparison.ts` | 73–140 | MAE, RMSE, Pearson r, Bland–Altman, mean SNR |

## Mathematics, as this code computes it

### 1. Color at each face patch

For every landmark in the patch, take the 3×3 pixels around it. Divide each channel by 255 and average. That gives one `(R, G, B)` triple per patch per frame. Four patches: forehead, left cheek, right cheek, lower face.

The BPM path then averages those four triples with equal weight:

```text
R_bar(t) = (R_forehead + R_left + R_right + R_lower) / 4
```

The same for green and blue.

### 2. CHROM

This follows de Haan and Jeanne. For each time `t`, use a trailing window of length `w`. The code sets `w` to `n/4`, but not below 8 and not above 64.

Inside that window, divide each channel by its own mean, written `R'`, `G'`, `B'`. Then:

```text
Xs = 3 R' − 2 G'
Ys = 1.5 R' + G' − 1.5 B'
α  = σ(X) / σ(Y)
S(t) = Xs − α Ys
```

`σ` is the standard deviation of that channel inside the same window. If `σ(Y)` is almost 0, `α` is set to 1.

POS, if it is selected instead, uses the same window mean and then:

```text
Cr = R' − 1,   Cg = G' − 1,   Cb = B' − 1
S1 = Cg − Cb
S2 = −2 Cr + Cg + Cb
α  = σ(S1) / σ(S2)
S(t) = S1 + α S2
```

After either method, the trace is band-limited, detrended, and standardized. The band is 0.7–4.0 Hz, which is 42–240 BPM. The filter is a discrete Fourier transform: bins outside that band are set to 0, then the signal is rebuilt. A straight line is subtracted. The result is shifted to mean 0 and scaled to variance 1.

### 3. Heart rate from the spectrum

The periodogram uses a real discrete Fourier transform of the detrended trace. For `n` samples and sample rate `fs`:

```text
f_k = k · fs / n
P_k = (re_k² + im_k²) / n²
```

`k` runs from 0 to `n/2`. The heart rate is 60 times the frequency inside 0.7–4 Hz whose power `P_k` is largest.

On a webcam scan, `fs` is 15 Hz and the window is 8 seconds, so `n` is about 120, sometimes 119 after the motion trace is aligned. The frequency step is:

```text
Δf = 15 / 119 ≈ 0.126 Hz
ΔBPM = 60 · Δf ≈ 7.6 BPM
```

That is why saved heart rates sit on a grid such as 52.9, 68.1, 75.6, 90.8. The estimator can only return one of those bins. It does not interpolate between them.

### 4. Why the conflict score does not move the BPM

Conflict is a number from 0 to 1:

```text
C_temp = largest |correlation| between face motion and the pulse, over lags of ±0.5 s
C_spec = cosine similarity of the two spectra inside 0.7–4 Hz
C      = 0.5 C_temp + 0.5 C_spec
gain   = (1 − C) · (1 − 0.15) + 0.15
gated  = gain · S(t)
```

`gain` is one positive constant for the whole window. Multiplying every sample by the same constant changes the height of the spectrum, not which bin is tallest. So the gated BPM and the ungated BPM are the same frequency. The conflict score is a warning. It is not a corrected heart rate.

### 5. Trust weights, and why they are not the BPM

For each patch:

```text
Q = 0.7 · log(1 + SNR) / log(1 + 40)  +  0.3 · a peak-strength score
M = mean absolute local motion, divided by the busiest patch
R = 1 / (1 + exp(−4 (Q − M)))
w = R / (R_forehead + R_left + R_right + R_lower)
```

The saved waveform is the weighted sum of the four CHROM traces, then shortened to at most 240 samples. The BPM on the card does not use `w`. It uses the equal-weight mix from step 1.

### 6. SNR

Inside 0.7–4 Hz, find the loudest bin. Skip that bin and the bin on each side of it. SNR is the peak power divided by the average power of the bins that remain:

```text
SNR = P_peak / mean(P_other)
dB  = 10 log10(SNR)     when SNR > 0
```

When a saved waveform is scored, the ratio uses that clip’s stored frame rate, or 15 Hz if the rate is missing.

### 7. The four comparison metrics

Let the camera heart rate be `ŷ` and the known heart rate be `y`. Over `n` labeled clips:

```text
MAE  = mean |ŷ − y|
RMSE = sqrt( mean (ŷ − y)² )
bias = mean (ŷ − y)
```

RMSE is at least as large as MAE. A few large misses pull RMSE up more than MAE.

Pearson r, for `n ≥ 2` and both series actually varying:

```text
r = Σ (ŷ − mean ŷ)(y − mean y)  /  sqrt( Σ (ŷ − mean ŷ)² · Σ (y − mean y)² )
```

If `n` is 1, or every camera value is the same, or every reference value is the same, `r` is left blank.

Bland–Altman uses the same differences. The spread is the sample standard deviation, with `n − 1` in the denominator. The limits are `bias ± 1.96 SD`. One labeled clip has a bias and no limits, because one difference has no spread.

## What would fill the blank cells

The comparison needs a known BPM that came with the dataset, such as a pulse file next to the video. One labeled clip can show MAE, RMSE, and the Bland–Altman difference. A second labeled clip turns on Pearson r and the `± 1.96 SD` band.

That work belongs on the local-lab page, with the videos left on disk. The saved camera rows are not that dataset.
