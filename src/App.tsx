import { useEffect, useMemo, useRef, useState } from 'react'
import { ControlsPanel, type InputMode } from './components/ControlsPanel'
import { FaceOverlay } from './components/FaceOverlay'
import { MetricPill } from './components/MetricPill'
import { SignalChart, SpectrumChart } from './components/SignalChart'
import {
  detectVideoFrame,
  getFaceLandmarker,
  sampleRoiRgbFromFrame,
  sampleVideoLandmarks,
} from './lib/mediapipe/faceLandmarker'
import { ROI_LANDMARK_INDICES } from './lib/rppg/motion'
import { runPipeline, type PipelineResult } from './lib/rppg/pipeline'
import { conflictRiskLabel } from './lib/rppg/conflict'
import { generateSyntheticSample } from './lib/rppg/synthetic'
import {
  DEFAULT_CONTROLS,
  ROI_IDS,
  ROI_LABELS,
  type DemoControls,
  type FrameLandmarks,
  type RoiRgbTrace,
} from './lib/rppg/types'

type LiveBuffer = {
  frames: FrameLandmarks[]
  roiRgb: RoiRgbTrace
  sampleRateHz: number
}

function emptyRoiRgb(): RoiRgbTrace {
  return {
    forehead: [],
    leftCheek: [],
    rightCheek: [],
    lowerFace: [],
  }
}

export default function App() {
  const [controls, setControls] = useState<DemoControls>(DEFAULT_CONTROLS)
  const [inputMode, setInputMode] = useState<InputMode>('synthetic')
  const [status, setStatus] = useState(
    'Sample ready — scroll down to see pulse, motion risk, and trusted face areas.',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<LiveBuffer | null>(null)
  const [uploadName, setUploadName] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastTsRef = useRef(0)

  const synthetic = useMemo(
    () =>
      generateSyntheticSample({
        durationSec: 12,
        sampleRateHz: 30,
        pulseBpm: controls.pulseBpm,
        motionArtifactAmp: controls.motionArtifactAmp,
        seed: 7,
      }),
    [controls.pulseBpm, controls.motionArtifactAmp],
  )

  const source: LiveBuffer | null =
    inputMode === 'synthetic'
      ? {
          frames: synthetic.frames,
          roiRgb: synthetic.roiRgb,
          sampleRateHz: synthetic.sampleRateHz,
        }
      : live

  const result: PipelineResult | null = useMemo(() => {
    if (!source || source.frames.length < 16) return null
    try {
      return runPipeline({
        frames: source.frames,
        roiRgb: source.roiRgb,
        sampleRateHz: source.sampleRateHz,
        controls,
      })
    } catch (e) {
      console.error(e)
      return null
    }
  }, [source, controls])

  const risk = result ? conflictRiskLabel(result.conflict.combined) : null

  useEffect(() => {
    if (inputMode !== 'webcam') {
      stopWebcam()
    }
    return () => stopWebcam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode])

  function stopWebcam() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop())
    webcamStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function handleInputMode(mode: InputMode) {
    setError(null)
    setInputMode(mode)
    if (mode === 'synthetic') {
      setLive(null)
      setUploadName(null)
      setStatus(
        'Sample ready — scroll down to see pulse, motion risk, and trusted face areas.',
      )
      return
    }
    if (mode === 'webcam') {
      setUploadName(null)
      await startWebcam()
    } else {
      setLive(null)
      setUploadName(null)
      setStatus('Choose a short face video to analyze.')
    }
  }

  function openUploadPicker() {
    setError(null)
    setInputMode('upload')
    setLive(null)
    setUploadName(null)
    setStatus('Choose a short face video to analyze.')
    // Defer so mode switch paints before the OS file dialog.
    requestAnimationFrame(() => fileInputRef.current?.click())
  }

  async function startWebcam() {
    setBusy(true)
    setStatus('Asking for camera access…')
    try {
      await getFaceLandmarker()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      })
      webcamStreamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element missing')
      video.srcObject = stream
      await video.play()

      setLive({
        frames: [],
        roiRgb: emptyRoiRgb(),
        sampleRateHz: 15,
      })
      setStatus('Camera on — keep your face centered. Results update as frames collect.')
      setBusy(false)

      const tick = async (ts: number) => {
        if (!webcamStreamRef.current) return
        if (ts - lastTsRef.current < 66) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        lastTsRef.current = ts
        const v = videoRef.current
        const canvas = canvasRef.current
        if (!v || !canvas || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        try {
          const landmarks = await detectVideoFrame(v, ts)
          if (landmarks) {
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(v, 0, 0)
              const roiRgb = emptyRoiRgb()
              for (const id of ROI_IDS) {
                const sample = sampleRoiRgbFromFrame(
                  ctx,
                  canvas.width,
                  canvas.height,
                  landmarks,
                  ROI_LANDMARK_INDICES[id],
                )
                roiRgb[id] = [sample]
              }
              setLive((prev) => {
                const frames = [...(prev?.frames ?? []), landmarks].slice(-180)
                const nextRgb = emptyRoiRgb()
                for (const id of ROI_IDS) {
                  nextRgb[id] = [
                    ...(prev?.roiRgb[id] ?? []),
                    ...roiRgb[id],
                  ].slice(-180)
                }
                setStatus(
                  frames.length < 16
                    ? `Camera on — collecting frames (${frames.length}/16)…`
                    : `Camera live — ${frames.length} frames. Results update below.`,
                )
                return {
                  frames,
                  roiRgb: nextRgb,
                  sampleRateHz: 15,
                }
              })
            }
          } else {
            setStatus('No face found — center your face in the camera view.')
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Camera analysis failed')
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setBusy(false)
      setError(
        e instanceof Error
          ? e.message
          : 'Could not start the camera. Check browser permissions.',
      )
      setStatus('Camera unavailable — try the sample or upload a video instead.')
      setInputMode('synthetic')
    }
  }

  async function handleUpload(file: File) {
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|avi)$/i.test(file.name)) {
      setError('Please choose a video file (MP4, WebM, or MOV work best).')
      setStatus('That file does not look like a video.')
      return
    }

    setBusy(true)
    setError(null)
    setInputMode('upload')
    setUploadName(file.name)
    setStatus(`Loading “${file.name}”…`)
    stopWebcam()
    try {
      const url = URL.createObjectURL(file)
      const video = videoRef.current!
      video.srcObject = null
      video.src = url
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Could not load that video'))
      })
      setStatus('Finding the face in your video…')
      await getFaceLandmarker()
      const detected = await sampleVideoLandmarks(video, 12, (pct) => {
        setStatus(`Reading face landmarks… ${Math.round(pct * 100)}%`)
      })

      if (detected.length < 16) {
        throw new Error(
          'Not enough face frames found. Try a clearer, well-lit clip of a face.',
        )
      }

      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      const roiRgb = emptyRoiRgb()
      const frames: FrameLandmarks[] = []

      for (const d of detected) {
        video.currentTime = d.timestampMs / 1000
        await new Promise<void>((r) => {
          video.onseeked = () => r()
        })
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        frames.push(d.landmarks)
        for (const id of ROI_IDS) {
          roiRgb[id].push(
            sampleRoiRgbFromFrame(
              ctx,
              canvas.width,
              canvas.height,
              d.landmarks,
              ROI_LANDMARK_INDICES[id],
            ),
          )
        }
      }

      const fps =
        detected.length > 1
          ? 1000 /
            ((detected[detected.length - 1]!.timestampMs -
              detected[0]!.timestampMs) /
              (detected.length - 1))
          : 12

      setLive({ frames, roiRgb, sampleRateHz: fps })
      setStatus(
        `Done — ${frames.length} frames from “${file.name}”. Results below updated automatically.`,
      )
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze that video')
      setStatus('Upload failed — try another clip, or load the sample.')
      setLive(null)
      setUploadName(null)
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const lastLandmarks = source?.frames[source.frames.length - 1] ?? null
  const hasResult = Boolean(result)

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden />

      <header className="hero">
        <svg
          className="hero-wave"
          viewBox="0 0 280 120"
          fill="none"
          aria-hidden
        >
          <path
            d="M0 72 C 28 40, 42 40, 70 72 S 112 104, 140 72 S 182 40, 210 72 S 252 104, 280 72"
            stroke="#2EC4B6"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M0 88 C 28 56, 42 56, 70 88 S 112 120, 140 88 S 182 56, 210 88 S 252 120, 280 88"
            stroke="#0E6B6A"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.45"
          />
        </svg>

        <h1 className="brand">
          Motion<span>Pulse</span>
        </h1>
        <p className="headline">See your pulse from a face video</p>
        <p className="tagline">
          Load a clip or use your camera — MotionPulse estimates heart rate and
          flags when face motion may muddy the signal.
        </p>

        <div className="cta-row" role="group" aria-label="Choose a video source">
          <button
            type="button"
            className={`cta cta-primary ${inputMode === 'upload' ? 'is-active' : ''}`}
            onClick={openUploadPicker}
            disabled={busy}
          >
            Upload face video
          </button>
          <button
            type="button"
            className={`cta cta-secondary ${inputMode === 'synthetic' ? 'is-active' : ''}`}
            onClick={() => handleInputMode('synthetic')}
            disabled={busy}
          >
            Try sample
          </button>
          <button
            type="button"
            className={`cta cta-secondary ${inputMode === 'webcam' ? 'is-active' : ''}`}
            onClick={() => handleInputMode('webcam')}
            disabled={busy}
          >
            Use webcam
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f)
          }}
        />

        <div className="hero-live" aria-live="polite">
          <div className="live-stat">
            <div className="live-stat-label">Est. BPM</div>
            <div className="live-stat-value">
              {result ? result.estimatedBpm.toFixed(0) : '—'}
            </div>
          </div>
          <div className="live-stat">
            <div className="live-stat-label">Motion risk</div>
            <div className="live-stat-value">
              {result ? result.conflict.combined.toFixed(2) : '—'}
            </div>
          </div>
          <div className="live-stat">
            <div className="live-stat-label">Most trusted</div>
            <div className="live-stat-value" style={{ fontSize: '1.15rem' }}>
              {result ? ROI_LABELS[summaryTop(result)] : '—'}
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div
        className={`status-bar ${busy ? 'is-busy' : ''}`}
        role="status"
      >
        <span className="status-dot" aria-hidden />
        <span>{status}</span>
      </div>

      {inputMode === 'upload' && (
        <section className="upload-panel" aria-label="Upload face video">
          <h2>Upload face video</h2>
          <p className="tip">
            Short clip of a face, good light. MP4, WebM, or MOV — about 5–20
            seconds works well.
          </p>
          <label className="upload-label">
            {busy ? 'Analyzing…' : uploadName ? 'Choose another video' : 'Choose video file'}
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleUpload(f)
                e.target.value = ''
              }}
            />
          </label>
          {uploadName && !busy && (
            <p className="upload-meta">Loaded: {uploadName}</p>
          )}
          <p className="help-line">
            For research datasets, use local folders later; this demo uses one
            video at a time.
          </p>
        </section>
      )}

      <div className="layout">
        <section className="panel">
          <header className="panel-head">
            <h2>How the face moved</h2>
            <p>
              Overall head motion versus smaller local movement (expressions,
              talking).
            </p>
          </header>
          {!hasResult ? (
            <EmptyState
              title="Waiting for enough frames"
              body="Need about a second of face tracking. Try the sample, upload a clip, or hold still on webcam."
            />
          ) : (
            <>
              <div className="chart-frame">
                <SignalChart
                  series={[
                    {
                      values: result!.motion.global,
                      color: '#0E6B6A',
                      label: 'Overall motion',
                    },
                    {
                      values: result!.motion.local.forehead,
                      color: '#2EC4B6',
                      label: 'Forehead',
                    },
                    {
                      values: result!.motion.residual.lowerFace,
                      color: '#C45C3E',
                      label: 'Lower face',
                    },
                  ]}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricPill
                  label="Overall"
                  value={result!.motion.globalMean.toFixed(4)}
                />
                <MetricPill
                  label="Forehead"
                  value={result!.motion.localMean.forehead.toFixed(4)}
                />
                <MetricPill
                  label="Cheeks"
                  value={(
                    (result!.motion.localMean.leftCheek +
                      result!.motion.localMean.rightCheek) /
                    2
                  ).toFixed(4)}
                />
                <MetricPill
                  label="Lower face"
                  value={result!.motion.residualMean.lowerFace.toFixed(4)}
                />
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Motion vs pulse risk</h2>
            <p>
              Risk score when face motion lines up with the pulse estimate —
              not proof that motion caused an error.
            </p>
          </header>
          {!hasResult ? (
            <EmptyState
              title="No risk score yet"
              body="Load a sample or video first."
            />
          ) : (
            <>
              <div
                className={`risk-banner risk-${risk?.level}`}
                role="status"
              >
                <strong>{risk?.label}</strong>
                <span>{risk?.blurb}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricPill
                  label="Time sync"
                  value={result!.conflict.cTemp.toFixed(3)}
                  tone="amber"
                  hint="How similarly motion and pulse move over time"
                />
                <MetricPill
                  label="Freq. overlap"
                  value={result!.conflict.cSpec.toFixed(3)}
                  tone="amber"
                  hint="Shared energy in the pulse frequency band"
                />
                <MetricPill
                  label="Combined risk"
                  value={result!.conflict.combined.toFixed(3)}
                  tone="warn"
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink-soft">
                    Motion vs pulse estimate
                  </h3>
                  <div className="chart-frame">
                    <SignalChart
                      series={[
                        {
                          values: result!.motion.global.slice(
                            -result!.candidate.length,
                          ),
                          color: '#C45C3E',
                          label: 'Motion',
                        },
                        {
                          values: result!.candidate,
                          color: '#0E6B6A',
                          label: 'Pulse estimate',
                        },
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink-soft">
                    Frequency view
                  </h3>
                  <div className="chart-frame">
                    <SpectrumChart
                      freqs={result!.spectra.candidate.freqs}
                      power={result!.spectra.candidate.power}
                      bandHz={controls.physBandHz}
                      color="#0E6B6A"
                    />
                    <SpectrumChart
                      className="mt-2"
                      freqs={result!.spectra.motion.freqs}
                      power={result!.spectra.motion.power}
                      bandHz={controls.physBandHz}
                      color="#C45C3E"
                      height={72}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Cleaned pulse estimate</h2>
            <p>
              When risk is high, the pulse waveform is gently dialed down — never
              wiped out completely.
            </p>
          </header>
          {!hasResult ? (
            <EmptyState
              title="No cleaned waveform yet"
              body="Run analysis with a sample, upload, or webcam."
            />
          ) : (
            <>
              <div className="chart-frame">
                <SignalChart
                  series={[
                    {
                      values: result!.candidate,
                      color: '#8AA6A3',
                      label: 'Before cleanup',
                    },
                    {
                      values: result!.suppression.gated,
                      color: '#0E6B6A',
                      label: 'After cleanup',
                    },
                  ]}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricPill
                  label="Cleanup strength"
                  value={result!.suppression.gain.toFixed(3)}
                  tone="teal"
                />
                <MetricPill
                  label="Floor kept"
                  value={result!.suppression.residualFloor.toFixed(2)}
                />
                <MetricPill
                  label="BPM before"
                  value={result!.estimatedBpm.toFixed(0)}
                />
                <MetricPill
                  label="BPM after"
                  value={result!.gatedBpm.toFixed(0)}
                  tone="teal"
                />
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-ink-soft">
                  Spectrum after cleanup
                </h3>
                <div className="chart-frame">
                  <SpectrumChart
                    freqs={result!.spectra.gated.freqs}
                    power={result!.spectra.gated.power}
                    bandHz={controls.physBandHz}
                  />
                </div>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Which face areas to trust</h2>
            <p>
              Stable, informative skin regions get more weight — talking mouths
              and shaky areas get less.
            </p>
          </header>
          {!hasResult ? (
            <EmptyState
              title="No trust map yet"
              body="Need face color samples from a video or the sample."
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <FaceOverlay
                landmarks={lastLandmarks}
                weights={result!.reliability.weights}
              />
              <div>
                <div className="chart-frame">
                  <SignalChart
                    height={100}
                    series={[
                      {
                        values: result!.aggregated,
                        color: '#0E6B6A',
                        label: 'Trust-weighted pulse',
                      },
                    ]}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  {ROI_IDS.map((id) => (
                    <div
                      key={id}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs"
                    >
                      <span className="font-medium text-ink/80">
                        {ROI_LABELS[id]}
                      </span>
                      <span className="tabular-nums text-ink-soft">
                        Quality {result!.reliability.quality[id]!.toFixed(2)}
                      </span>
                      <span className="tabular-nums text-ink-soft">
                        Motion {result!.reliability.motion[id]!.toFixed(2)}
                      </span>
                      <span className="tabular-nums text-sea-deep">
                        Trust {result!.reliability.reliability[id]!.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-ink-soft">
                  Focus score:{' '}
                  <span className="tabular-nums text-ink/80">
                    {result!.reliability.entropy.toFixed(2)}
                  </span>{' '}
                  (lower means trust is concentrated on fewer areas).
                </p>
              </div>
            </div>
          )}
        </section>

        <ControlsPanel
          controls={controls}
          onChange={setControls}
          inputMode={inputMode}
          onInputMode={handleInputMode}
          busy={busy}
        />
      </div>

      <footer className="site-foot">
        <p>
          Browser demo for learning — not a medical device. Camera and upload
          need a one-time model download.
        </p>
      </footer>

      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

function summaryTop(result: PipelineResult) {
  let top = ROI_IDS[0]!
  let w = -1
  for (const id of ROI_IDS) {
    if ((result.reliability.weights[id] ?? 0) > w) {
      w = result.reliability.weights[id]!
      top = id
    }
  }
  return top
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      <p>{body}</p>
    </div>
  )
}
