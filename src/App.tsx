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
  const [status, setStatus] = useState('Ready — bundled synthetic sample loaded.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<LiveBuffer | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastTsRef = useRef(0)

  // Synthetic regenerates when artifact/BPM knobs change
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

  const risk = result
    ? conflictRiskLabel(result.conflict.combined)
    : null

  // Stop webcam when leaving mode
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
      setStatus('Ready — bundled synthetic sample loaded.')
      return
    }
    if (mode === 'webcam') {
      await startWebcam()
    } else {
      setLive(null)
      setStatus('Choose a short frontal face video to analyze.')
    }
  }

  async function startWebcam() {
    setBusy(true)
    setStatus('Requesting webcam + loading MediaPipe…')
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
      setStatus('Webcam live — collecting landmarks…')
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
                setStatus(`Webcam live — ${frames.length} frames buffered.`)
                return {
                  frames,
                  roiRgb: nextRgb,
                  sampleRateHz: 15,
                }
              })
            }
          } else {
            setStatus('No face detected — center your face in frame.')
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Webcam detect failed')
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setBusy(false)
      setError(
        e instanceof Error
          ? e.message
          : 'Could not start webcam. Check permissions.',
      )
      setStatus('Webcam unavailable.')
      setInputMode('synthetic')
    }
  }

  async function handleUpload(file: File) {
    setBusy(true)
    setError(null)
    setStatus(`Loading ${file.name}…`)
    stopWebcam()
    try {
      const url = URL.createObjectURL(file)
      const video = videoRef.current!
      video.srcObject = null
      video.src = url
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Could not load video'))
      })
      setStatus('Running MediaPipe Face Landmarker…')
      await getFaceLandmarker()
      const detected = await sampleVideoLandmarks(video, 12, (pct) => {
        setStatus(`Sampling landmarks… ${Math.round(pct * 100)}%`)
      })

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
        `Upload ready — ${frames.length} frames @ ~${fps.toFixed(1)} Hz.`,
      )
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload analysis failed')
      setStatus('Upload failed — falling back to synthetic.')
      setInputMode('synthetic')
      setLive(null)
    } finally {
      setBusy(false)
    }
  }

  const lastLandmarks =
    source?.frames[source.frames.length - 1] ?? null

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden />
      <header className="hero">
        <p className="eyebrow">Interactive thesis demo · §§3.1.2–3.1.4</p>
        <h1 className="brand">MotionPulse</h1>
        <p className="tagline">
          Motion-aware rPPG — see when facial motion syncs with a candidate
          pulse, soft-suppress suspicious energy, and reweight trustworthy ROIs.
          Conflict scores are <strong>graded risk</strong>, not causality.
        </p>
        <div className="hero-metrics">
          <MetricPill
            label="Est. BPM"
            value={
              result ? `${result.estimatedBpm.toFixed(0)}` : '—'
            }
            tone="teal"
            hint="Dominant frequency of candidate before gating"
          />
          <MetricPill
            label="Conflict C"
            value={
              result ? result.conflict.combined.toFixed(2) : '—'
            }
            tone={
              risk?.level === 'high' || risk?.level === 'elevated'
                ? 'warn'
                : 'amber'
            }
            hint="α·C_temp + β·C_spec — graded sync risk"
          />
          <MetricPill
            label="Gate gain"
            value={result ? result.suppression.gain.toFixed(2) : '—'}
            hint="Soft suppression with residual floor"
          />
          <MetricPill
            label="Top ROI"
            value={
              result ? ROI_LABELS[summaryTop(result)] : '—'
            }
            tone="teal"
          />
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="layout">
        <ControlsPanel
          controls={controls}
          onChange={setControls}
          inputMode={inputMode}
          onInputMode={handleInputMode}
          onUpload={handleUpload}
          status={status}
          busy={busy}
        />

        <section className="panel">
          <header className="panel-head">
            <h2>Motion · §3.1.2</h2>
            <p>
              Scale-normalized landmark displacement — global rigid head motion
              vs residual local (expression/talk).
            </p>
          </header>
          {!result ? (
            <EmptyState
              title="Waiting for landmarks"
              body="Need at least ~16 frames. Use the bundled sample or start webcam/upload."
            />
          ) : (
            <>
              <SignalChart
                series={[
                  {
                    values: result.motion.global,
                    color: '#0F4C4A',
                    label: 'Global M_g',
                  },
                  {
                    values: result.motion.local.forehead,
                    color: '#3D9B94',
                    label: 'Forehead local',
                  },
                  {
                    values: result.motion.residual.lowerFace,
                    color: '#C4784A',
                    label: 'Lower-face residual',
                  },
                ]}
              />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricPill
                  label="Global mean"
                  value={result.motion.globalMean.toFixed(4)}
                />
                <MetricPill
                  label="Forehead"
                  value={result.motion.localMean.forehead.toFixed(4)}
                />
                <MetricPill
                  label="Cheeks avg"
                  value={(
                    (result.motion.localMean.leftCheek +
                      result.motion.localMean.rightCheek) /
                    2
                  ).toFixed(4)}
                />
                <MetricPill
                  label="Lower residual"
                  value={result.motion.residualMean.lowerFace.toFixed(4)}
                />
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Conflict · §3.1.3</h2>
            <p>
              Temporal correlation and spectral overlap between motion and{' '}
              {controls.candidateMethod} candidate. High C means higher{' '}
              <em>sync risk</em> — it does not prove motion caused the error.
            </p>
          </header>
          {!result ? (
            <EmptyState title="No conflict scores yet" body="Load a sample first." />
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
                  label="C_temp"
                  value={result.conflict.cTemp.toFixed(3)}
                  tone="amber"
                />
                <MetricPill
                  label="C_spec"
                  value={result.conflict.cSpec.toFixed(3)}
                  tone="amber"
                />
                <MetricPill
                  label="C combined"
                  value={result.conflict.combined.toFixed(3)}
                  tone="warn"
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink/70">
                    Motion vs candidate overlay
                  </h3>
                  <SignalChart
                    series={[
                      {
                        values: result.motion.global.slice(
                          -result.candidate.length,
                        ),
                        color: '#C4784A',
                        label: 'Motion',
                      },
                      {
                        values: result.candidate,
                        color: '#0F4C4A',
                        label: 'Candidate rPPG',
                      },
                    ]}
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink/70">
                    Spectra (shared-band highlight)
                  </h3>
                  <SpectrumChart
                    freqs={result.spectra.candidate.freqs}
                    power={result.spectra.candidate.power}
                    bandHz={controls.physBandHz}
                    color="#0F4C4A"
                  />
                  <SpectrumChart
                    className="mt-2"
                    freqs={result.spectra.motion.freqs}
                    power={result.spectra.motion.power}
                    bandHz={controls.physBandHz}
                    color="#C4784A"
                    height={72}
                  />
                </div>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Soft suppression · residual path</h2>
            <p>
              Gain = (1−C)·(1−floor)+floor. Pulse energy is never fully wiped —
              the residual floor keeps a recoverable path.
            </p>
          </header>
          {!result ? (
            <EmptyState title="No gated waveform" body="Run analysis first." />
          ) : (
            <>
              <SignalChart
                series={[
                  {
                    values: result.candidate,
                    color: '#8AA6A3',
                    label: 'Before',
                  },
                  {
                    values: result.suppression.gated,
                    color: '#0F4C4A',
                    label: 'After gate',
                  },
                ]}
              />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricPill
                  label="Gain"
                  value={result.suppression.gain.toFixed(3)}
                  tone="teal"
                />
                <MetricPill
                  label="Floor"
                  value={result.suppression.residualFloor.toFixed(2)}
                />
                <MetricPill
                  label="BPM before"
                  value={result.estimatedBpm.toFixed(0)}
                />
                <MetricPill
                  label="BPM after"
                  value={result.gatedBpm.toFixed(0)}
                  tone="teal"
                />
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-ink/70">
                  Spectrum after gate
                </h3>
                <SpectrumChart
                  freqs={result.spectra.gated.freqs}
                  power={result.spectra.gated.power}
                  bandHz={controls.physBandHz}
                />
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Regional reliability · §3.1.4</h2>
            <p>
              R_i = σ(λ (Q_i − M_i)); soft weights sum to 1. Prefer stable,
              informative skin over high-motion lower face when talking.
            </p>
          </header>
          {!result ? (
            <EmptyState title="No ROI weights" body="Need ROI RGB traces." />
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <FaceOverlay
                landmarks={lastLandmarks}
                weights={result.reliability.weights}
              />
              <div>
                <SignalChart
                  height={100}
                  series={[
                    {
                      values: result.aggregated,
                      color: '#0F4C4A',
                      label: 'Reliability-weighted aggregate',
                    },
                  ]}
                />
                <div className="mt-4 space-y-2">
                  {ROI_IDS.map((id) => (
                    <div
                      key={id}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs"
                    >
                      <span className="font-medium text-ink/80">
                        {ROI_LABELS[id]}
                      </span>
                      <span className="tabular-nums text-ink/50">
                        Q {result.reliability.quality[id]!.toFixed(2)}
                      </span>
                      <span className="tabular-nums text-ink/50">
                        M {result.reliability.motion[id]!.toFixed(2)}
                      </span>
                      <span className="tabular-nums text-teal-ink">
                        R {result.reliability.reliability[id]!.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-ink/55">
                  Weight entropy:{' '}
                  <span className="tabular-nums text-ink/80">
                    {result.reliability.entropy.toFixed(2)} bits
                  </span>{' '}
                  (lower = more peaked on few ROIs).
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="site-foot">
        <p>
          Classical CHROM/POS candidate · MediaPipe Face Landmarker · thesis
          mechanisms visualized for learning. Not a medical device.
        </p>
      </footer>

      {/* Hidden media elements for upload/webcam sampling */}
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
    <div className="rounded-xl border border-dashed border-ink/20 bg-ink/[0.03] px-4 py-8 text-center">
      <p className="font-medium text-ink/70">{title}</p>
      <p className="mt-1 text-sm text-ink/45">{body}</p>
    </div>
  )
}
