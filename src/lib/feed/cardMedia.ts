/**
 * Tiny card media for feed / result story: face thumb + pulse sparkline.
 * Never stores video — JPEG/WebP data URLs only, capped ~80KB.
 */

import type { FrameLandmarks } from '../rppg/types'

export const THUMB_MAX_BYTES = 80_000
export const THUMB_SIZE_PX = 160
export const SPARKLINE_W = 96
export const SPARKLINE_H = 28

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

  const sizePx = opts.sizePx ?? THUMB_SIZE_PX
  const blurPx = opts.blurPx ?? 0.8
  const quality = opts.quality ?? 0.72

  const box = faceBounds(landmarks, source.width, source.height)
  const out = document.createElement('canvas')
  out.width = sizePx
  out.height = sizePx
  const ctx = out.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#d9e8f0'
  ctx.fillRect(0, 0, sizePx, sizePx)

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
    sizePx,
    sizePx,
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
    small.width = 128
    small.height = 128
    const sctx = small.getContext('2d')
    if (sctx) {
      sctx.drawImage(canvas, 0, 0, 128, 128)
      data = bestOf(small, 0.55) ?? data
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

function faceBounds(
  landmarks: FrameLandmarks | null | undefined,
  width: number,
  height: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!landmarks || landmarks.length < 8) {
    // Center square crop as fallback
    const side = Math.min(width, height) * 0.55
    return {
      sx: (width - side) / 2,
      sy: (height - side) / 2,
      sw: side,
      sh: side,
    }
  }

  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  // Sample a subset for speed / stability (oval of the face)
  const step = Math.max(1, Math.floor(landmarks.length / 80))
  for (let i = 0; i < landmarks.length; i += step) {
    const p = landmarks[i]!
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }

  const pad = 0.12
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  let half = Math.max(maxX - minX, maxY - minY) / 2
  half *= 1 + pad
  half = Math.max(half, 0.12)

  let sx = (cx - half) * width
  let sy = (cy - half) * height
  let sw = half * 2 * width
  let sh = half * 2 * height

  // Clamp to canvas
  if (sx < 0) sx = 0
  if (sy < 0) sy = 0
  if (sx + sw > width) sw = width - sx
  if (sy + sh > height) sh = height - sy
  const side = Math.min(sw, sh)
  return { sx, sy, sw: side, sh: side }
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
