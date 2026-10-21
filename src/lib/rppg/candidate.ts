/**
 * Classical CHROM / POS candidate rPPG from per-frame RGB ROI means.
 * de Haan & Jeanne (CHROM); Wang et al. (POS).
 */

import { bandpass, detrend, standardize } from './dsp'
import type { CandidateMethod, RgbSample } from './types'

export type CandidateOptions = {
  sampleRateHz: number
  physBandHz: [number, number]
  method?: CandidateMethod
}

function channelSeries(rgb: RgbSample[]): { r: number[]; g: number[]; b: number[] } {
  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  for (const s of rgb) {
    r.push(s.r)
    g.push(s.g)
    b.push(s.b)
  }
  return { r, g, b }
}

/** Sliding-window normalized CHROM projection. */
export function chromSignal(rgb: RgbSample[]): number[] {
  const { r, g, b } = channelSeries(rgb)
  const n = r.length
  if (n === 0) return []
  const win = Math.max(8, Math.min(64, Math.floor(n / 4) || 8))
  const out = new Array<number>(n).fill(0)

  for (let t = 0; t < n; t++) {
    const i0 = Math.max(0, t - win + 1)
    const len = t - i0 + 1
    let mr = 0
    let mg = 0
    let mb = 0
    for (let i = i0; i <= t; i++) {
      mr += r[i]!
      mg += g[i]!
      mb += b[i]!
    }
    mr /= len
    mg /= len
    mb /= len
    const rn = mr < 1e-9 ? 0 : r[t]! / mr
    const gn = mg < 1e-9 ? 0 : g[t]! / mg
    const bn = mb < 1e-9 ? 0 : b[t]! / mb
    const xs = 3 * rn - 2 * gn
    const ys = 1.5 * rn + gn - 1.5 * bn
    // α ≈ σ(Xs)/σ(Ys) estimated over window
    let sx = 0
    let sy = 0
    let mx = 0
    let my = 0
    const tmpX: number[] = []
    const tmpY: number[] = []
    for (let i = i0; i <= t; i++) {
      let mri = 0
      let mgi = 0
      let mbi = 0
      // use global window means for speed on short synthetic clips
      mri = mr
      mgi = mg
      mbi = mb
      const rni = mri < 1e-9 ? 0 : r[i]! / mri
      const gni = mgi < 1e-9 ? 0 : g[i]! / mgi
      const bni = mbi < 1e-9 ? 0 : b[i]! / mbi
      const xi = 3 * rni - 2 * gni
      const yi = 1.5 * rni + gni - 1.5 * bni
      tmpX.push(xi)
      tmpY.push(yi)
      mx += xi
      my += yi
    }
    mx /= tmpX.length
    my /= tmpY.length
    for (let i = 0; i < tmpX.length; i++) {
      const dx = tmpX[i]! - mx
      const dy = tmpY[i]! - my
      sx += dx * dx
      sy += dy * dy
    }
    const alpha =
      Math.sqrt(sy) < 1e-12 ? 1 : Math.sqrt(sx / Math.max(sy, 1e-18))
    out[t] = xs - alpha * ys
  }
  return out
}

/** POS: project onto plane orthogonal to skin-tone direction. */
export function posSignal(rgb: RgbSample[]): number[] {
  const { r, g, b } = channelSeries(rgb)
  const n = r.length
  if (n === 0) return []
  const win = Math.max(8, Math.min(64, Math.floor(n / 4) || 8))
  const out = new Array<number>(n).fill(0)

  for (let t = 0; t < n; t++) {
    const i0 = Math.max(0, t - win + 1)
    let mr = 0
    let mg = 0
    let mb = 0
    const len = t - i0 + 1
    for (let i = i0; i <= t; i++) {
      mr += r[i]!
      mg += g[i]!
      mb += b[i]!
    }
    mr /= len
    mg /= len
    mb /= len
    const rn = mr < 1e-9 ? 0 : r[t]! / mr
    const gn = mg < 1e-9 ? 0 : g[t]! / mg
    const bn = mb < 1e-9 ? 0 : b[t]! / mb
    // Temporal normalization around window mean already applied
    const cnR = rn - 1
    const cnG = gn - 1
    const cnB = bn - 1
    const s1 = cnG - cnB
    const s2 = -2 * cnR + cnG + cnB
    // α ≈ σ(S1)/σ(S2)
    const tmp1: number[] = []
    const tmp2: number[] = []
    for (let i = i0; i <= t; i++) {
      const rni = mr < 1e-9 ? 0 : r[i]! / mr
      const gni = mg < 1e-9 ? 0 : g[i]! / mg
      const bni = mb < 1e-9 ? 0 : b[i]! / mb
      const cR = rni - 1
      const cG = gni - 1
      const cB = bni - 1
      tmp1.push(cG - cB)
      tmp2.push(-2 * cR + cG + cB)
    }
    let m1 = 0
    let m2 = 0
    for (let i = 0; i < tmp1.length; i++) {
      m1 += tmp1[i]!
      m2 += tmp2[i]!
    }
    m1 /= tmp1.length
    m2 /= tmp2.length
    let v1 = 0
    let v2 = 0
    for (let i = 0; i < tmp1.length; i++) {
      const d1 = tmp1[i]! - m1
      const d2 = tmp2[i]! - m2
      v1 += d1 * d1
      v2 += d2 * d2
    }
    const alpha =
      Math.sqrt(v2) < 1e-12 ? 1 : Math.sqrt(v1 / Math.max(v2, 1e-18))
    out[t] = s1 + alpha * s2
  }
  return out
}

export function extractCandidate(
  rgb: RgbSample[],
  options: CandidateOptions,
): number[] {
  const method = options.method ?? 'CHROM'
  const raw = method === 'POS' ? posSignal(rgb) : chromSignal(rgb)
  const [fLo, fHi] = options.physBandHz
  const filtered = bandpass(raw, options.sampleRateHz, fLo, fHi)
  return standardize(detrend(filtered))
}

/** Average RGB traces across ROIs (equal weight) for a quick global candidate. */
export function averageRgbTraces(
  traces: Record<string, RgbSample[]>,
): RgbSample[] {
  const keys = Object.keys(traces)
  if (keys.length === 0) return []
  const len = Math.min(...keys.map((k) => traces[k]!.length))
  const out: RgbSample[] = []
  for (let t = 0; t < len; t++) {
    let r = 0
    let g = 0
    let b = 0
    for (const k of keys) {
      const s = traces[k]![t]!
      r += s.r
      g += s.g
      b += s.b
    }
    out.push({ r: r / keys.length, g: g / keys.length, b: b / keys.length })
  }
  return out
}
