/**
 * One-pass video analysis: landmarks + ROI RGB with progressive partial windows.
 */

import {
  detectVideoFrame,
  sampleRoiRgbFromFrame,
} from '../mediapipe/faceLandmarker'
import { ROI_LANDMARK_INDICES } from '../rppg/motion'
import { ROI_IDS, type FrameLandmarks, type RoiRgbTrace } from '../rppg/types'

export type AnalysisBuffer = {
  frames: FrameLandmarks[]
  /** Video time of each landmark sample, in milliseconds. */
  timestampsMs: number[]
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
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video seek failed'))
    }
    const cleanup = () => {
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
    timestampsMs: timestampsMs.slice(),
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
    video.currentTime = t
    await waitSeeked(video)
    const ts = Math.round(t * 1000)
    const landmarks = await detectVideoFrame(video, ts)
    const pct = Math.min(1, t / duration)
    options.onProgress?.(pct)

    if (!landmarks) continue

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    frames.push(landmarks)
    timestampsMs.push(ts)
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
