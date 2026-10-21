/** Lightweight DSP helpers for browser-side rPPG analysis. */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) {
    const d = x - m
    s += d * d
  }
  return Math.sqrt(s / (xs.length - 1))
}

/** Remove linear trend (least-squares fit). */
export function detrend(xs: number[]): number[] {
  const n = xs.length
  if (n < 2) return xs.slice()
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumXY = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += xs[i]!
    sumXX += i * i
    sumXY += i * xs[i]!
  }
  const denom = n * sumXX - sumX * sumX
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return xs.map((y, i) => y - (intercept + slope * i))
}

/** Zero-mean, unit-variance (ε-safe). */
export function standardize(xs: number[]): number[] {
  const m = mean(xs)
  const s = std(xs)
  if (s < 1e-12) return xs.map(() => 0)
  return xs.map((x) => (x - m) / s)
}

export function pearsonCorr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  const aa = a.slice(0, n)
  const bb = b.slice(0, n)
  const ma = mean(aa)
  const mb = mean(bb)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const xa = aa[i]! - ma
    const xb = bb[i]! - mb
    num += xa * xb
    da += xa * xa
    db += xb * xb
  }
  const den = Math.sqrt(da * db)
  if (den < 1e-12) return 0
  return num / den
}

/** Max absolute Pearson correlation over lag ±maxLag samples. */
export function maxLagAbsCorr(
  a: number[],
  b: number[],
  maxLag: number,
): number {
  const n = Math.min(a.length, b.length)
  if (n < 4) return Math.abs(pearsonCorr(a, b))
  const lag = Math.max(0, Math.min(maxLag, Math.floor(n / 4)))
  let best = 0
  for (let k = -lag; k <= lag; k++) {
    const aa: number[] = []
    const bb: number[] = []
    for (let i = 0; i < n; i++) {
      const j = i + k
      if (j < 0 || j >= n) continue
      aa.push(a[i]!)
      bb.push(b[j]!)
    }
    if (aa.length < 4) continue
    best = Math.max(best, Math.abs(pearsonCorr(aa, bb)))
  }
  return best
}

export type Spectrum = {
  freqs: number[]
  power: number[]
}

/** Real DFT magnitude-squared periodogram (O(n²), fine for short windows). */
export function periodogram(xs: number[], sampleRateHz: number): Spectrum {
  const n = xs.length
  const freqs: number[] = []
  const power: number[] = []
  if (n === 0) return { freqs, power }
  const centered = detrend(xs)
  const half = Math.floor(n / 2)
  for (let k = 0; k <= half; k++) {
    let re = 0
    let im = 0
    const omega = (2 * Math.PI * k) / n
    for (let t = 0; t < n; t++) {
      const v = centered[t]!
      re += v * Math.cos(omega * t)
      im -= v * Math.sin(omega * t)
    }
    freqs.push((k * sampleRateHz) / n)
    power.push((re * re + im * im) / (n * n))
  }
  return { freqs, power }
}

/** Cosine similarity of power spectra restricted to [fLo, fHi]. */
export function spectralOverlap(
  a: Spectrum,
  b: Spectrum,
  fLo: number,
  fHi: number,
): number {
  const n = Math.min(a.freqs.length, b.freqs.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const f = a.freqs[i]!
    if (f < fLo || f > fHi) continue
    const pa = Math.max(0, a.power[i]!)
    const pb = Math.max(0, b.power[i]!)
    const sa = Math.sqrt(pa)
    const sb = Math.sqrt(pb)
    dot += sa * sb
    na += pa
    nb += pb
  }
  const den = Math.sqrt(na * nb)
  if (den < 1e-18) return 0
  return Math.min(1, Math.max(0, dot / den))
}

/** Dominant frequency in band (Hz). */
export function dominantFrequency(
  spectrum: Spectrum,
  fLo: number,
  fHi: number,
): { freqHz: number; power: number } {
  let bestF = 0
  let bestP = -1
  for (let i = 0; i < spectrum.freqs.length; i++) {
    const f = spectrum.freqs[i]!
    if (f < fLo || f > fHi) continue
    const p = spectrum.power[i]!
    if (p > bestP) {
      bestP = p
      bestF = f
    }
  }
  return { freqHz: bestF, power: Math.max(0, bestP) }
}

/**
 * Spectral SNR proxy in the phys band:
 * peak power / mean power of other phys-band bins.
 */
export function spectralSnr(
  spectrum: Spectrum,
  fLo: number,
  fHi: number,
): number {
  const band: { f: number; p: number }[] = []
  for (let i = 0; i < spectrum.freqs.length; i++) {
    const f = spectrum.freqs[i]!
    if (f < fLo || f > fHi) continue
    band.push({ f, p: spectrum.power[i]! })
  }
  if (band.length < 2) return 0
  let peak = 0
  let peakIdx = 0
  for (let i = 0; i < band.length; i++) {
    if (band[i]!.p > peak) {
      peak = band[i]!.p
      peakIdx = i
    }
  }
  let sum = 0
  let count = 0
  for (let i = 0; i < band.length; i++) {
    if (Math.abs(i - peakIdx) <= 1) continue
    sum += band[i]!.p
    count++
  }
  const noise = count > 0 ? sum / count : 1e-12
  return peak / (noise + 1e-12)
}

/** Simple causal IIR-ish bandpass via FFT zeroing (zero-phase via full DFT). */
export function bandpass(
  xs: number[],
  sampleRateHz: number,
  fLo: number,
  fHi: number,
): number[] {
  const n = xs.length
  if (n < 4) return xs.slice()
  const centered = detrend(xs)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    let r = 0
    let i = 0
    const omega = (2 * Math.PI * k) / n
    for (let t = 0; t < n; t++) {
      const v = centered[t]!
      r += v * Math.cos(omega * t)
      i -= v * Math.sin(omega * t)
    }
    const f = (k * sampleRateHz) / n
    const pass = f >= fLo && f <= fHi
    re[k] = pass ? r : 0
    im[k] = pass ? i : 0
  }
  const out = new Array<number>(n)
  for (let t = 0; t < n; t++) {
    let s = 0
    for (let k = 0; k < n; k++) {
      const omega = (2 * Math.PI * k) / n
      s += re[k]! * Math.cos(omega * t) - im[k]! * Math.sin(omega * t)
    }
    out[t] = s / n
  }
  return out
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

export function sigmoid(x: number): number {
  if (x > 30) return 1
  if (x < -30) return 0
  return 1 / (1 + Math.exp(-x))
}

export function movingAverage(xs: number[], win: number): number[] {
  const w = Math.max(1, Math.floor(win))
  const out = new Array<number>(xs.length)
  let sum = 0
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i]!
    if (i >= w) sum -= xs[i - w]!
    const den = Math.min(i + 1, w)
    out[i] = sum / den
  }
  return out
}
