import { useEffect, useRef } from 'react'
import type { FrameLandmarks } from '../lib/rppg/types'
import { faceBoxFromLandmarks } from '../lib/rppg/faceBox'
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
  /** Camera is open and a cap is covering the forehead. */
  hatPrompt?: boolean
  onHatClear?: () => void
  onHatSkip?: () => void
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
  onHatClear,
  onHatSkip,
}: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const box = faceBoxFromLandmarks(landmarks)
  const showLiveVideo =
    hasVideo && (inputMode === 'webcam' || inputMode === 'upload')

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

    if (!box) return

    // Map box into the drawn content rect when compositing from analysis canvas
    let ox = 0
    let oy = 0
    let ow = w
    let oh = h
    if (!showLiveVideo && src && src.width > 0) {
      const scale = Math.min(w / src.width, h / src.height)
      ow = src.width * scale
      oh = src.height * scale
      ox = (w - ow) / 2
      oy = (h - oh) / 2
    }

    const x = ox + box.x * ow
    const y = oy + box.y * oh
    const bw = box.w * ow
    const bh = box.h * oh
    const corner = Math.min(22, bw * 0.12, bh * 0.12)

    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.lineWidth = 2.5
    ctx.strokeRect(x, y, bw, bh)

    ctx.strokeStyle = '#2EC4B6'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(x, y + corner)
    ctx.lineTo(x, y)
    ctx.lineTo(x + corner, y)
    ctx.moveTo(x + bw - corner, y)
    ctx.lineTo(x + bw, y)
    ctx.lineTo(x + bw, y + corner)
    ctx.moveTo(x, y + bh - corner)
    ctx.lineTo(x, y + bh)
    ctx.lineTo(x + corner, y + bh)
    ctx.moveTo(x + bw - corner, y + bh)
    ctx.lineTo(x + bw, y + bh)
    ctx.lineTo(x + bw, y + bh - corner)
    ctx.stroke()

    ctx.fillStyle = 'rgba(14, 107, 106, 0.88)'
    ctx.font = '600 12px "Instrument Sans", sans-serif'
    const labelY = Math.max(oy + 4, y - 22)
    ctx.fillRect(x, labelY, 78, 20)
    ctx.fillStyle = '#fff'
    ctx.fillText('Face ROI', x + 8, labelY + 14)
  }, [box, landmarks, canvasRef, showLiveVideo, scrub, busy])

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
        {hatPrompt ? (
          <div className="hat-prompt hat-banner" role="status">
            <h2 id="hat-prompt-title">Take off your cap</h2>
            <p>
              The forehead is covered. Take the hat off and the 10 second scan
              starts on its own. Glasses can stay on.
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

function formatTime(sec: number) {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}
