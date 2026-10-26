import type { FrameLandmarks } from '../rppg/types'

/** Lower forehead. The hairline point is left out so hair alone is not a cap. */
export const HAT_FOREHEAD_INDICES = [151, 108, 337, 69, 299, 104, 333, 67, 298]

/** Cheek points used as this person's skin color. */
export const HAT_CHEEK_INDICES = [50, 101, 118, 205, 280, 330, 347, 425]

export const HAT_COVERED_FRAMES = 4
export const HAT_CLEAR_FRAMES = 3
/** About 3 seconds at the 15 fps camera loop, then start even with no face. */
export const HAT_NO_FACE_FRAMES = 45

export type Rgb = { r: number; g: number; b: number }

export type HatGateState = {
  covered: boolean | null
  coveredStreak: number
  clearStreak: number
  noFaceFrames: number
  prompt: boolean
  skip: boolean
}

type Chroma = { y: number; cb: number; cr: number }

/** 0–255 RGB to YCbCr. Skin on the cheeks and forehead share Cb/Cr. */
export function rgbChroma(rgb: Rgb): Chroma {
  const { r, g, b } = rgb
  return {
    y: 0.299 * r + 0.587 * g + 0.114 * b,
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  }
}

function averageChroma(pixels: Rgb[]): Chroma {
  const sum = pixels.reduce(
    (acc, p) => {
      const c = rgbChroma(p)
      acc.y += c.y
      acc.cb += c.cb
      acc.cr += c.cr
      return acc
    },
    { y: 0, cb: 0, cr: 0 },
  )
  const n = pixels.length
  return { y: sum.y / n, cb: sum.cb / n, cr: sum.cr / n }
}

/**
 * True when the forehead does not match this face's cheek skin.
 * Null when there are not enough pixels to decide.
 */
export function foreheadLooksCovered(
  forehead: Rgb[],
  cheeks: Rgb[],
): boolean | null {
  if (forehead.length < 6 || cheeks.length < 6) return null
  const cheek = averageChroma(cheeks)
  if (cheek.y < 30) return null
  let likeSkin = 0
  for (const pixel of forehead) {
    const c = rgbChroma(pixel)
    const distance = Math.hypot(c.cb - cheek.cb, c.cr - cheek.cr)
    const brim = c.y < cheek.y * 0.5 && c.y < 90
    if (distance <= 18 && !brim) likeSkin += 1
  }
  return likeSkin / forehead.length < 0.4
}

/** Advance the "ask only if a cap is visible" gate by one camera frame. */
export function nextHatGate(state: HatGateState): HatGateState & { start: boolean } {
  if (state.skip) {
    return {
      covered: state.covered,
      coveredStreak: 0,
      clearStreak: 0,
      noFaceFrames: 0,
      prompt: false,
      skip: true,
      start: true,
    }
  }
  if (state.covered === null) {
    const noFaceFrames = state.noFaceFrames + 1
    return {
      ...state,
      coveredStreak: 0,
      noFaceFrames,
      start: !state.prompt && noFaceFrames >= HAT_NO_FACE_FRAMES,
    }
  }
  if (state.covered) {
    const coveredStreak = state.coveredStreak + 1
    return {
      ...state,
      coveredStreak,
      clearStreak: 0,
      noFaceFrames: 0,
      prompt: state.prompt || coveredStreak >= HAT_COVERED_FRAMES,
      start: false,
    }
  }
  const clearStreak = state.clearStreak + 1
  const start = clearStreak >= HAT_CLEAR_FRAMES
  return {
    ...state,
    coveredStreak: 0,
    clearStreak,
    noFaceFrames: 0,
    prompt: start ? false : state.prompt,
    start,
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** One averaged color per landmark, from a 3×3 patch. */
export function sampleLandmarkColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: FrameLandmarks,
  indices: number[],
): Rgb[] {
  const colors: Rgb[] = []
  for (const idx of indices) {
    const p = landmarks[idx]
    if (!p) continue
    const x = clamp(Math.round(p.x * width), 0, width - 1)
    const y = clamp(Math.round(p.y * height), 0, height - 1)
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = clamp(x + dx, 0, width - 1)
        const yy = clamp(y + dy, 0, height - 1)
        const i = (yy * width + xx) * 4
        r += data[i] ?? 0
        g += data[i + 1] ?? 0
        b += data[i + 2] ?? 0
        n++
      }
    }
    colors.push({ r: r / n, g: g / n, b: b / n })
  }
  return colors
}

export function foreheadCoveredInFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: FrameLandmarks,
): boolean | null {
  return foreheadLooksCovered(
    sampleLandmarkColors(data, width, height, landmarks, HAT_FOREHEAD_INDICES),
    sampleLandmarkColors(data, width, height, landmarks, HAT_CHEEK_INDICES),
  )
}
