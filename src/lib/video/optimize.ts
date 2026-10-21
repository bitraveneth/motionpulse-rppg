/**
 * Client-side video prep: cap resolution (~720p) and duration (~15s)
 * via canvas + MediaRecorder. Keeps deps at zero.
 */

export type OptimizeOptions = {
  maxWidth?: number
  maxHeight?: number
  maxDurationSec?: number
  /** Target encode fps for the re-muxed clip. */
  fps?: number
  onProgress?: (pct: number) => void
}

export type OptimizeResult = {
  file: File
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  durationSec: number
  truncated: boolean
  downscaled: boolean
}

const DEFAULTS = {
  maxWidth: 1280,
  maxHeight: 720,
  maxDurationSec: 15,
  fps: 15,
} as const

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return t
    }
  }
  return 'video/webm'
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () => reject(new Error('Could not load video for optimize'))
  })
}

function fitSize(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { width: number; height: number; downscaled: boolean } {
  if (w <= maxW && h <= maxH) {
    return { width: w, height: h, downscaled: false }
  }
  const scale = Math.min(maxW / w, maxH / h)
  return {
    width: Math.max(2, Math.round(w * scale / 2) * 2),
    height: Math.max(2, Math.round(h * scale / 2) * 2),
    downscaled: true,
  }
}

/**
 * Re-encode the first N seconds at capped resolution.
 * Falls back to the original file when MediaRecorder is unavailable
 * or the clip already fits limits (still may truncate via seek window
 * only when re-encoding).
 */
export async function optimizeVideoFile(
  file: File,
  options: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const maxWidth = options.maxWidth ?? DEFAULTS.maxWidth
  const maxHeight = options.maxHeight ?? DEFAULTS.maxHeight
  const maxDurationSec = options.maxDurationSec ?? DEFAULTS.maxDurationSec
  const fps = options.fps ?? DEFAULTS.fps
  const onProgress = options.onProgress

  const url = URL.createObjectURL(file)
  try {
    const video = await loadVideo(url)
    const originalWidth = video.videoWidth || 640
    const originalHeight = video.videoHeight || 480
    const fullDuration = Number.isFinite(video.duration) ? video.duration : maxDurationSec
    const durationSec = Math.min(fullDuration, maxDurationSec)
    const truncated = fullDuration > maxDurationSec + 0.05
    const fitted = fitSize(originalWidth, originalHeight, maxWidth, maxHeight)

    const needsWork = truncated || fitted.downscaled
    if (!needsWork || typeof MediaRecorder === 'undefined') {
      onProgress?.(1)
      return {
        file,
        originalWidth,
        originalHeight,
        width: originalWidth,
        height: originalHeight,
        durationSec: Math.min(fullDuration, maxDurationSec),
        truncated,
        downscaled: false,
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = fitted.width
    canvas.height = fitted.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas unavailable for video optimize')
    }

    const stream = canvas.captureStream(fps)
    const mime = pickMime()
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 1_200_000,
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mime.split(';')[0] ?? 'video/webm' }))
      }
      recorder.onerror = () => reject(new Error('MediaRecorder failed during optimize'))
    })

    recorder.start(200)

    const frameInterval = 1 / fps
    const totalFrames = Math.max(1, Math.floor(durationSec * fps))
    for (let i = 0; i < totalFrames; i++) {
      const t = Math.min(durationSec - 0.001, i * frameInterval)
      video.currentTime = t
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
        video.onerror = () => reject(new Error('Seek failed during optimize'))
      })
      ctx.drawImage(video, 0, 0, fitted.width, fitted.height)
      onProgress?.(i / totalFrames)
      // Yield so the captureStream can emit frames
      await new Promise((r) => setTimeout(r, Math.max(8, 1000 / fps - 4)))
    }

    recorder.stop()
    stream.getTracks().forEach((t) => t.stop())
    const blob = await done
    onProgress?.(1)

    const base = file.name.replace(/\.[^.]+$/, '') || 'clip'
    const out = new File([blob], `${base}-opt.webm`, {
      type: blob.type || 'video/webm',
      lastModified: Date.now(),
    })

    return {
      file: out,
      originalWidth,
      originalHeight,
      width: fitted.width,
      height: fitted.height,
      durationSec,
      truncated,
      downscaled: fitted.downscaled,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Pure helpers exported for unit tests. */
export function computeFitSize(
  w: number,
  h: number,
  maxW = DEFAULTS.maxWidth,
  maxH = DEFAULTS.maxHeight,
) {
  return fitSize(w, h, maxW, maxH)
}

export function computeClipDuration(
  fullDuration: number,
  maxDurationSec = DEFAULTS.maxDurationSec,
) {
  const durationSec = Math.min(fullDuration, maxDurationSec)
  return {
    durationSec,
    truncated: fullDuration > maxDurationSec + 0.05,
  }
}
