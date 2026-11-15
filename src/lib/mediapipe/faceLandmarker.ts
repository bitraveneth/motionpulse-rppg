/**
 * MediaPipe Face Landmarker wrapper for webcam / uploaded video.
 * Bundled synthetic path does not require this module.
 */

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { FrameLandmarks, Landmark } from '../rppg/types'

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let landmarkerPromise: Promise<FaceLandmarker> | null = null
let preferCpu = false

function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  return (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate,
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
  })()
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker(preferCpu ? 'CPU' : 'GPU').catch(async () => {
      preferCpu = true
      const lm = await createLandmarker('CPU')
      landmarkerPromise = Promise.resolve(lm)
      return lm
    })
  }
  return landmarkerPromise
}

/** One frame. If the GPU delegate dies on the first detect, the rest of the clip uses CPU. */
export async function landmarksForVideo(
  video: HTMLVideoElement | HTMLCanvasElement,
  timestampMs: number,
): Promise<FrameLandmarks | null> {
  const lm = await getFaceLandmarker()
  try {
    return resultToLandmarks(lm.detectForVideo(video, timestampMs))
  } catch (error) {
    if (preferCpu) throw error
    preferCpu = true
    landmarkerPromise = createLandmarker('CPU')
    const cpu = await landmarkerPromise
    return resultToLandmarks(cpu.detectForVideo(video, timestampMs))
  }
}

export function resultToLandmarks(
  result: FaceLandmarkerResult,
): FrameLandmarks | null {
  const face = result.faceLandmarks?.[0]
  if (!face || face.length === 0) return null
  return face.map((p) => ({ x: p.x, y: p.y }) satisfies Landmark)
}

export type DetectedFrame = {
  landmarks: FrameLandmarks
  timestampMs: number
}

/**
 * Detect landmarks for a video element at currentTime.
 * Caller advances the video; this samples one frame.
 */
export async function detectVideoFrame(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<FrameLandmarks | null> {
  return landmarksForVideo(video, timestampMs)
}

/** Sample landmarks across a video at ~targetFps (offline-ish scrub). */
export async function sampleVideoLandmarks(
  video: HTMLVideoElement,
  targetFps = 15,
  onProgress?: (pct: number) => void,
): Promise<DetectedFrame[]> {
  const duration = video.duration
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Video duration unavailable. Try another file.')
  }
  const step = 1 / targetFps
  const frames: DetectedFrame[] = []

  for (let t = 0; t < duration; t += step) {
    video.currentTime = t
    await waitSeeked(video)
    const ts = Math.round(t * 1000)
    const landmarks = await landmarksForVideo(video, ts)
    if (landmarks) {
      frames.push({ landmarks, timestampMs: ts })
    }
    onProgress?.(Math.min(1, t / duration))
  }
  onProgress?.(1)
  if (frames.length < 16) {
    throw new Error(
      'Not enough face landmarks detected. Use a clearer frontal face clip.',
    )
  }
  return frames
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

/**
 * Rough ROI mean RGB from video frame + landmarks (canvas sample).
 * Used for upload/webcam paths when we do not have precomputed traces.
 */
export function sampleRoiRgbFromFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: FrameLandmarks,
  indices: number[],
): { r: number; g: number; b: number } {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const data = ctx.getImageData(0, 0, width, height).data
  for (const idx of indices) {
    const p = landmarks[idx]
    if (!p) continue
    const x = Math.min(width - 1, Math.max(0, Math.round(p.x * width)))
    const y = Math.min(height - 1, Math.max(0, Math.round(p.y * height)))
    // 3×3 neighborhood
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx))
        const yy = Math.min(height - 1, Math.max(0, y + dy))
        const i = (yy * width + xx) * 4
        r += data[i]! / 255
        g += data[i + 1]! / 255
        b += data[i + 2]! / 255
        n++
      }
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0 }
  return { r: r / n, g: g / n, b: b / n }
}
