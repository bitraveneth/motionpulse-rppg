import { useEffect, useRef, useState } from 'react'
import { faceBoxFromLandmarks } from '../lib/rppg/faceBox'
import { FACE_MESH_EDGES, FACE_MESH_NODES } from '../lib/rppg/faceMesh'
import {
  landmarkCentroid,
  spotHeat,
  type SpotGlow,
} from '../lib/rppg/faceSpots'
import { ROI_LANDMARK_INDICES } from '../lib/rppg/motion'
import { ROI_IDS, type FrameLandmarks, type RoiId } from '../lib/rppg/types'
import type { InputMode } from './ControlsPanel'

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  landmarks: FrameLandmarks | null
  inputMode: InputMode
  busy: boolean
  /** True when a real camera/upload stream or file is attached */
  hasVideo: boolean
  scrub: number
  onScrub: (t: number) => void
  durationSec: number
  onUploadClick: () => void
  onWebcam: () => void
  onSample: () => void
  onLoadDemoSet?: () => void
  /** True while demo-clip discovery / fetch is in flight */
  demoLoading?: boolean
  status: string
  /** Hide overlay source buttons when hero / nav already provides CTAs */
  showCtaBar?: boolean
  /** Seconds left in a 10 second webcam capture. Hidden when null. */
  captureLeft?: number | null
  /** Camera is open and a cap is covering the forehead, or no face is visible. */
  hatPrompt?: boolean
  hatReason?: 'hat' | 'face' | null
  onHatClear?: () => void
  onHatSkip?: () => void
  /** Per-area pulse quality. Null draws white spots until a pulse is caught. */
  spots?: Record<RoiId, SpotGlow> | null
  /** 0–1 bar along the bottom of the camera. Hidden when null. */
  progress?: number | null
  /** Stop a webcam capture early. Hidden when null. */
  onStop?: (() => void) | null
}

/** Large monitoring surface: face video + detection box + timeline slider. */
export function MonitorStage({
  videoRef,
  canvasRef,
  landmarks,
  inputMode,
  busy,
  hasVideo,
  scrub,
  onScrub,
  durationSec,
  onUploadClick,
  onWebcam,
  onSample,
  onLoadDemoSet,
  demoLoading = false,
  status,
  showCtaBar = true,
  captureLeft = null,
  hatPrompt = false,
  hatReason = null,
  onHatClear,
  onHatSkip,
  spots = null,
  progress = null,
  onStop = null,
}: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [glowTick, setGlowTick] = useState(0)
  const box = faceBoxFromLandmarks(landmarks)
  const showLiveVideo =
    hasVideo && (inputMode === 'webcam' || inputMode === 'upload')

  useEffect(() => {
    if (!landmarks) return
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      if (now - last > 90) {
        last = now
        setGlowTick(now)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [landmarks])

  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const w = parent.clientWidth
    const h = parent.clientHeight
    if (w < 2 || h < 2) return
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)

    const src = canvasRef.current

    // Real webcam/upload: video element shows the frame — overlay only draws the box.
    // Sample mode: composite the analysis canvas (synthetic landmark preview).
    if (!showLiveVideo && src && src.width > 0) {
      const vw = src.width
      const vh = src.height
      const scale = Math.min(w / vw, h / vh)
      const dw = vw * scale
      const dh = vh * scale
      const dx = (w - dw) / 2
      const dy = (h - dh) / 2
      ctx.drawImage(src, dx, dy, dw, dh)
    }

    const video = videoRef.current
    const srcW = showLiveVideo ? video?.videoWidth ?? 0 : src?.width ?? 0
    const srcH = showLiveVideo ? video?.videoHeight ?? 0 : src?.height ?? 0
    const fitted = fittedFrame(w, h, srcW, srcH)
    const { ox, oy, ow, oh } = fitted

    if (!box && !landmarks) return

    if (!box) {
      drawFaceMarks(ctx, {
        landmarks,
        ox,
        oy,
        ow,
        oh,
        spots,
        now: glowTick || performance.now(),
      })
      return
    }

    drawFaceMarks(ctx, {
      landmarks,
      ox,
      oy,
      ow,
      oh,
      spots,
      now: glowTick || performance.now(),
    })
  }, [box, landmarks, canvasRef, showLiveVideo, scrub, busy, spots, videoRef, glowTick])

  const timeLabel =
    durationSec > 0
      ? `${formatTime(scrub * durationSec)} / ${formatTime(durationSec)}`
      : '—'

  return (
    <section className="monitor-stage" aria-label="Face monitoring">
      <div className="monitor-frame">
        <video
          ref={videoRef}
          className={`monitor-video ${showLiveVideo ? 'is-visible' : ''}`}
          playsInline
          muted
          controls={false}
        />
        {!showLiveVideo && (
          <div className="monitor-placeholder" aria-hidden={Boolean(landmarks)}>
            {!landmarks && (
              <>
                <div className="monitor-placeholder-pulse" />
                <p>Upload a face clip, try the sample, or open your webcam</p>
              </>
            )}
          </div>
        )}
        {captureLeft != null ? (
          <div
            className="monitor-countdown"
            aria-live="polite"
            aria-label={`${captureLeft} seconds left`}
          >
            <span className="monitor-countdown-num">{captureLeft}</span>
          </div>
        ) : null}
        <canvas ref={overlayRef} className="monitor-overlay" aria-hidden />
        {onStop ? (
          <button type="button" className="monitor-stop" onClick={onStop}>
            Stop
          </button>
        ) : null}
        {progress != null ? (
          <div className="monitor-progress" aria-hidden>
            <span style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
          </div>
        ) : null}
        {hatPrompt ? (
          <div className="hat-prompt hat-banner" role="status">
            <h2 id="hat-prompt-title">
              {hatReason === 'face' ? 'Look at the camera' : 'Take off your hat'}
            </h2>
            <p>
              {hatReason === 'face'
                ? 'Your face is not in view. Take off a hat, look straight ahead, and try again. Glasses can stay on.'
                : 'The forehead is covered. Take off your hat and try again. The 10 second scan starts when the forehead is clear. Glasses can stay on.'}
            </p>
            <div className="hat-prompt-actions">
              <button type="button" className="cta cta-primary" onClick={onHatClear}>
                Hat is off
              </button>
              <button type="button" className="cta cta-secondary" onClick={onHatSkip}>
                No hat — start
              </button>
            </div>
          </div>
        ) : null}
        <canvas ref={canvasRef} className="sr-only" aria-hidden />
      </div>

      <div className="monitor-quality">
        <span>Signal quality</span>
        <div className="monitor-quality-track">
          <div
            className="monitor-quality-needle"
            style={{
              left: `${box ? (busy ? 52 : 74) : 16}%`,
            }}
          />
        </div>
      </div>

      <div className="monitor-timeline">
        <label className="monitor-slider-label" htmlFor="monitor-scrub">
          Timeline
        </label>
        <input
          id="monitor-scrub"
          className="monitor-slider"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(scrub * 1000)}
          disabled={durationSec <= 0 || (busy && inputMode !== 'synthetic')}
          onChange={(e) => onScrub(Number(e.target.value) / 1000)}
          aria-valuetext={timeLabel}
        />
        <span className="monitor-time tabular-nums">{timeLabel}</span>
      </div>

      <p className="monitor-status" role="status">
        {status}
      </p>

      {showCtaBar ? (
        <div className="monitor-actions" role="group" aria-label="Choose a video source">
          <button
            type="button"
            className={`cta cta-primary ${inputMode === 'upload' ? 'is-active' : ''}`}
            onClick={onUploadClick}
            disabled={busy}
          >
            Upload face video
          </button>
          <button
            type="button"
            className={`cta cta-secondary ${inputMode === 'webcam' ? 'is-active' : ''}`}
            onClick={onWebcam}
            disabled={busy}
          >
            Webcam
          </button>
          <button
            type="button"
            className={`cta cta-secondary ${inputMode === 'synthetic' ? 'is-active' : ''}`}
            onClick={onSample}
            disabled={busy || demoLoading}
          >
            Try sample
          </button>
          {onLoadDemoSet && (
            <button
              type="button"
              className="cta cta-secondary"
              onClick={onLoadDemoSet}
              disabled={busy || demoLoading}
              title="Load all mp4/webm/mov from public/demo-clips (up to 10)"
            >
              {demoLoading ? 'Loading demos…' : 'Load demo set'}
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}

function fittedFrame(
  frameW: number,
  frameH: number,
  srcW: number,
  srcH: number,
): { ox: number; oy: number; ow: number; oh: number } {
  if (srcW < 2 || srcH < 2) {
    return { ox: 0, oy: 0, ow: frameW, oh: frameH }
  }
  const scale = Math.min(frameW / srcW, frameH / srcH)
  const ow = srcW * scale
  const oh = srcH * scale
  return { ox: (frameW - ow) / 2, oy: (frameH - oh) / 2, ow, oh }
}

function meshPoint(
  landmarks: FrameLandmarks,
  index: number,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
): { x: number; y: number } | null {
  const point = landmarks[index]
  if (!point) return null
  return { x: ox + point.x * ow, y: oy + point.y * oh }
}

function drawFaceMarks(
  ctx: CanvasRenderingContext2D,
  input: {
    landmarks: FrameLandmarks | null
    ox: number
    oy: number
    ow: number
    oh: number
    spots: Record<RoiId, SpotGlow> | null
    now: number
  },
) {
  const { landmarks, ox, oy, ow, oh, spots, now } = input
  if (!landmarks || landmarks.length === 0) return

  const breath = 0.55 + 0.45 * Math.sin(now / 420)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = `rgba(186, 230, 253, ${0.42 + breath * 0.18})`
  ctx.lineWidth = 1.15
  ctx.beginPath()
  for (const [a, b] of FACE_MESH_EDGES) {
    const p0 = meshPoint(landmarks, a, ox, oy, ow, oh)
    const p1 = meshPoint(landmarks, b, ox, oy, ow, oh)
    if (!p0 || !p1) continue
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
  }
  ctx.stroke()

  for (const index of FACE_MESH_NODES) {
    const point = meshPoint(landmarks, index, ox, oy, ow, oh)
    if (!point) continue
    ctx.beginPath()
    ctx.arc(point.x, point.y, 1.7, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(236, 249, 255, ${0.72 + breath * 0.2})`
    ctx.fill()
  }

  // Soft ROI accents only — no large red/white blobs.
  for (const id of ROI_IDS) {
    const center = landmarkCentroid(landmarks, ROI_LANDMARK_INDICES[id])
    if (!center) continue
    const heat = spots ? spotHeat(spots[id]) : 0
    if (heat < 0.12) continue
    const cx = ox + center.x * ow
    const cy = oy + center.y * oh
    ctx.beginPath()
    ctx.arc(cx, cy, 3.2 + heat * 1.4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(125, 211, 252, ${0.35 + heat * 0.4})`
    ctx.fill()
  }
  ctx.restore()
}

function formatTime(sec: number) {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}
