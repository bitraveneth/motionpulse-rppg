/**
 * One-pass video analysis: landmarks + ROI RGB with progressive partial windows.
 */

import {
  landmarksForVideo,
  sampleRoiRgbFromFrame,
} from '../mediapipe/faceLandmarker'
import { ROI_LANDMARK_INDICES } from '../rppg/motion'
import { ROI_IDS, type FrameLandmarks, type RoiRgbTrace } from '../rppg/types'

export type AnalysisBuffer = {
  frames: FrameLandmarks[]
  roiRgb: RoiRgbTrace
  sampleRateHz: number
}

export type StreamAnalyzeOptions = {
  targetFps?: number
  /** Minimum frames before the first progressive callback. */
  minFrames?: number
  /** Emit a partial update every N new frames after the first. */
  updateEvery?: number
  onProgress?: (pct: number) => void
  onPartial?: (buffer: AnalysisBuffer, meta: { frameCount: number; pct: number }) => void
  /** Fired after a face frame is drawn, so the caller can keep a still. */
  onFace?: (frame: { landmarks: FrameLandmarks; pct: number }) => void
  /** Keeps MediaPipe timestamps increasing across several videos. */
  timestampOffsetMs?: number
}

function emptyRoiRgb(): RoiRgbTrace {
  return {
    forehead: [],
    leftCheek: [],
    rightCheek: [],
    lowerFace: [],
  }
}

function waitSeeked(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Video seek failed'))
    }, 8000)
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video seek failed'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
  })
}

function estimateFps(
  timestampsMs: number[],
  fallback: number,
): number {
  if (timestampsMs.length < 2) return fallback
  const first = timestampsMs[0]!
  const last = timestampsMs[timestampsMs.length - 1]!
  const spanSec = (last - first) / 1000
  if (spanSec <= 0) return fallback
  const fps = (timestampsMs.length - 1) / spanSec
  return Number.isFinite(fps) && fps > 1 ? fps : fallback
}

/**
 * Scrub the video once: detect face, sample skin RGB, and stream partial buffers
 * so the UI can show rolling HR / waveform before the clip finishes.
 */
export async function streamAnalyzeVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  options: StreamAnalyzeOptions = {},
): Promise<AnalysisBuffer> {
  const targetFps = options.targetFps ?? 12
  const minFrames = options.minFrames ?? 16
  const updateEvery = options.updateEvery ?? 4
  const timestampOffsetMs = options.timestampOffsetMs ?? 0
  const duration = video.duration
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Video duration unavailable. Try another file.')
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const frames: FrameLandmarks[] = []
  const timestampsMs: number[] = []
  const roiRgb = emptyRoiRgb()
  const step = 1 / targetFps
  let lastEmitted = 0

  const snapshot = (): AnalysisBuffer => ({
    frames: frames.slice(),
    roiRgb: {
      forehead: roiRgb.forehead.slice(),
      leftCheek: roiRgb.leftCheek.slice(),
      rightCheek: roiRgb.rightCheek.slice(),
      lowerFace: roiRgb.lowerFace.slice(),
    },
    sampleRateHz: estimateFps(timestampsMs, targetFps),
  })

  const emitPartial = (pct: number) => {
    if (frames.length < minFrames) return
    if (frames.length - lastEmitted < updateEvery) return
    lastEmitted = frames.length
    options.onPartial?.(snapshot(), { frameCount: frames.length, pct })
  }

  for (let t = 0; t < duration; t += step) {
    if (Math.abs(video.currentTime - t) > 0.0005 || video.readyState < 2) {
      video.currentTime = t
      await waitSeeked(video)
    }
    const ts = Math.round(timestampOffsetMs + t * 1000)
    const landmarks = await landmarksForVideo(video, ts)
    const pct = Math.min(1, t / duration)
    options.onProgress?.(pct)

    if (!landmarks) continue

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    frames.push(landmarks)
    timestampsMs.push(ts)
    options.onFace?.({ landmarks, pct })
    for (const id of ROI_IDS) {
      roiRgb[id].push(
        sampleRoiRgbFromFrame(
          ctx,
          canvas.width,
          canvas.height,
          landmarks,
          ROI_LANDMARK_INDICES[id],
        ),
      )
    }
    emitPartial(pct)
  }

  options.onProgress?.(1)

  if (frames.length < minFrames) {
    throw new Error(
      'Not enough face landmarks detected. Use a clearer frontal face clip.',
    )
  }

  const finalBuffer = snapshot()
  options.onPartial?.(finalBuffer, { frameCount: frames.length, pct: 1 })
  return finalBuffer
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not open that frame'))
    image.src = url
  })
}

/** Face and skin color from a PURE-style image sequence. One still is drawn, then read. */
export async function streamAnalyzeImages(
  frameUrls: string[],
  canvas: HTMLCanvasElement,
  options: StreamAnalyzeOptions & { sampleFps?: number } = {},
): Promise<AnalysisBuffer> {
  const sampleFps = options.sampleFps ?? 15
  const minFrames = options.minFrames ?? 16
  const updateEvery = options.updateEvery ?? 4
  const timestampOffsetMs = options.timestampOffsetMs ?? 0
  if (frameUrls.length < minFrames) {
    throw new Error('That frame folder does not have enough images.')
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const frames: FrameLandmarks[] = []
  const timestampsMs: number[] = []
  const roiRgb = emptyRoiRgb()
  const stepMs = 1000 / sampleFps
  let lastEmitted = 0

  const snapshot = (): AnalysisBuffer => ({
    frames: frames.slice(),
    roiRgb: {
      forehead: roiRgb.forehead.slice(),
      leftCheek: roiRgb.leftCheek.slice(),
      rightCheek: roiRgb.rightCheek.slice(),
      lowerFace: roiRgb.lowerFace.slice(),
    },
    sampleRateHz: estimateFps(timestampsMs, sampleFps),
  })

  for (let index = 0; index < frameUrls.length; index += 1) {
    const pct = frameUrls.length <= 1 ? 1 : index / (frameUrls.length - 1)
    options.onProgress?.(pct)
    let image: HTMLImageElement
    try {
      image = await loadHtmlImage(frameUrls[index]!)
    } catch {
      continue
    }
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (width < 2 || height < 2) continue
    canvas.width = width
    canvas.height = height
    ctx.drawImage(image, 0, 0)
    const ts = Math.round(timestampOffsetMs + index * stepMs)
    const landmarks = await landmarksForVideo(canvas, ts)
    if (!landmarks) continue
    frames.push(landmarks)
    timestampsMs.push(ts)
    options.onFace?.({ landmarks, pct })
    for (const id of ROI_IDS) {
      roiRgb[id].push(sampleRoiRgbFromFrame(ctx, canvas.width, canvas.height, landmarks, ROI_LANDMARK_INDICES[id]))
    }
    if (frames.length >= minFrames && frames.length - lastEmitted >= updateEvery) {
      lastEmitted = frames.length
      options.onPartial?.(snapshot(), { frameCount: frames.length, pct })
    }
  }

  options.onProgress?.(1)
  if (frames.length < minFrames) {
    throw new Error('Not enough face landmarks detected. Use a clearer frontal face clip.')
  }
  const finalBuffer = snapshot()
  options.onPartial?.(finalBuffer, { frameCount: frames.length, pct: 1 })
  return finalBuffer
}
