/**
 * Tiny card media for feed / result story: face thumb + pulse sparkline.
 * Never stores video — JPEG/WebP data URLs only, capped ~80KB.
 */

import type { FrameLandmarks } from '../rppg/types'

export const THUMB_MAX_BYTES = 80_000
/** Longest edge of a saved face still. The crop itself is portrait, not square. */
export const THUMB_SIZE_PX = 320
export const SPARKLINE_W = 96
export const SPARKLINE_H = 28

/** Chin, lips, and forehead. Always included so a sampled subset cannot drop the mouth. */
const FACE_EDGE_INDICES = [10, 152, 0, 13, 14, 17, 61, 291, 33, 263]

/** Downsample a series and emit an SVG path (viewBox 0 0 SPARKLINE_W SPARKLINE_H). */
export function buildSparklinePath(
  series: number[],
  width = SPARKLINE_W,
  height = SPARKLINE_H,
  maxPoints = 48,
): string {
  if (!series.length) return ''
  const pts = downsample(series, maxPoints)
  let min = Infinity
  let max = -Infinity
  for (const v of pts) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = max - min || 1
  const padY = 2
  const usableH = height - padY * 2
  const step = pts.length <= 1 ? 0 : width / (pts.length - 1)

  let d = ''
  for (let i = 0; i < pts.length; i++) {
    const x = i * step
    const y = padY + usableH * (1 - (pts[i]! - min) / span)
    d += i === 0 ? `M${fmt(x)},${fmt(y)}` : `L${fmt(x)},${fmt(y)}`
  }
  return d
}

function downsample(series: number[], maxPoints: number): number[] {
  if (series.length <= maxPoints) return series.slice()
  const out: number[] = []
  const step = (series.length - 1) / (maxPoints - 1)
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step)
    out.push(series[idx]!)
  }
  return out
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

export type ThumbCaptureOpts = {
  /** Soft privacy blur in CSS px on the source canvas crop (0 = sharp). */
  blurPx?: number
  sizePx?: number
  /** JPEG quality 0–1 */
  quality?: number
}

/**
 * Crop a small face thumbnail from a canvas that already has the frame drawn.
 * Landmarks are normalized [0,1]. Returns a data URL or null.
 */
export function captureFaceThumbnail(
  source: HTMLCanvasElement,
  landmarks: FrameLandmarks | null | undefined,
  opts: ThumbCaptureOpts = {},
): string | null {
  if (!source.width || !source.height) return null

  const maxEdge = opts.sizePx ?? THUMB_SIZE_PX
  const blurPx = opts.blurPx ?? 0
  const quality = opts.quality ?? 0.82

  const box = faceThumbBounds(landmarks, source.width, source.height)
  const scale = maxEdge / Math.max(box.sw, box.sh)
  const out = document.createElement('canvas')
  out.width = Math.max(2, Math.round(box.sw * scale))
  out.height = Math.max(2, Math.round(box.sh * scale))
  const ctx = out.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#0c2233'
  ctx.fillRect(0, 0, out.width, out.height)

  if (blurPx > 0) {
    ctx.filter = `blur(${blurPx}px)`
  }
  ctx.drawImage(
    source,
    box.sx,
    box.sy,
    box.sw,
    box.sh,
    0,
    0,
    out.width,
    out.height,
  )
  ctx.filter = 'none'

  return compressDataUrl(out, quality)
}

/** Compress canvas to JPEG/WebP under THUMB_MAX_BYTES when possible. */
export function compressDataUrl(
  canvas: HTMLCanvasElement,
  quality = 0.72,
): string | null {
  const encode = (
    target: HTMLCanvasElement,
    type: string,
    q: number,
  ): string | null => {
    try {
      return target.toDataURL(type, q)
    } catch {
      return null
    }
  }

  const bestOf = (target: HTMLCanvasElement, q: number): string | null =>
    encode(target, 'image/webp', q) ?? encode(target, 'image/jpeg', q)

  let data = bestOf(canvas, quality)
  if (!data) return null

  let q = quality
  while (approxBytes(data) > THUMB_MAX_BYTES && q > 0.35) {
    q -= 0.12
    data = bestOf(canvas, q) ?? data
  }

  if (approxBytes(data) > THUMB_MAX_BYTES) {
    const small = document.createElement('canvas')
    const scaleDown = Math.min(1, 220 / Math.max(canvas.width, canvas.height))
    small.width = Math.max(2, Math.round(canvas.width * scaleDown))
    small.height = Math.max(2, Math.round(canvas.height * scaleDown))
    const sctx = small.getContext('2d')
    if (sctx) {
      sctx.drawImage(canvas, 0, 0, small.width, small.height)
      data = bestOf(small, 0.62) ?? data
    }
  }

  if (approxBytes(data) > THUMB_MAX_BYTES) return null
  return data
}

function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Math.ceil((b64.length * 3) / 4)
}

export type ThumbBox = { sx: number; sy: number; sw: number; sh: number }

/**
 * Portrait crop around the whole face. Extra room under the chin so the
 * lips are not the edge of the picture. If that crop cannot fit, the
 * full frame is used instead of slicing the jaw off to make a square.
 */
export function faceThumbBounds(
  landmarks: FrameLandmarks | null | undefined,
  width: number,
  height: number,
): ThumbBox {
  if (width < 2 || height < 2) return { sx: 0, sy: 0, sw: width, sh: height }
  if (!landmarks || landmarks.length < 8) return fullFrame(width, height)

  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  const consider = (p: { x: number; y: number } | undefined) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const step = Math.max(1, Math.floor(landmarks.length / 80))
  for (let i = 0; i < landmarks.length; i += step) consider(landmarks[i])
  for (const index of FACE_EDGE_INDICES) consider(landmarks[index])

  if (maxX <= minX || maxY <= minY) return fullFrame(width, height)

  const faceW = maxX - minX
  const faceH = maxY - minY
  let x0 = minX - faceW * 0.22
  let x1 = maxX + faceW * 0.22
  let y0 = minY - faceH * 0.32
  let y1 = maxY + faceH * 0.42

  let sx = x0 * width
  let sy = y0 * height
  let sw = (x1 - x0) * width
  let sh = (y1 - y0) * height

  // 3:4 portrait. Grow the short side; do not crop the mouth to force it.
  const portrait = 4 / 3
  if (sh / Math.max(sw, 1) < portrait) {
    const need = sw * portrait
    const extra = need - sh
    sy -= extra * 0.35
    sh = need
  } else {
    const need = sh / portrait
    const extra = need - sw
    sx -= extra / 2
    sw = need
  }

  if (sw > width || sh > height) return fullFrame(width, height)

  if (sx < 0) sx = 0
  if (sy < 0) sy = 0
  if (sx + sw > width) sx = width - sw
  if (sy + sh > height) sy = height - sh

  return { sx, sy, sw, sh }
}

function fullFrame(width: number, height: number): ThumbBox {
  return { sx: 0, sy: 0, sw: width, sh: height }
}

/** Prefer URL over inline data when both exist. */
export function resolveThumbnail(
  run: { thumbnail_url?: string | null; thumbnail_data?: string | null },
): string | null {
  const url = run.thumbnail_url?.trim()
  if (url) return url
  const data = run.thumbnail_data?.trim()
  return data || null
}
