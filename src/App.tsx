import { useEffect, useMemo, useRef, useState } from 'react'
import { AnalysisProgress, type AnalysisStage } from './components/AnalysisProgress'
import { ControlsPanel, type InputMode } from './components/ControlsPanel'
import { EducationSection } from './components/EducationSection'
import { FaceOverlay } from './components/FaceOverlay'
import { LocalLab } from './components/LocalLab'
import { MetricPill } from './components/MetricPill'
import { MonitorStage } from './components/MonitorStage'
import { RecentRuns } from './components/RecentRuns'
import { SessionStrip, type SessionRun } from './components/SessionStrip'
import { ShareToFeed } from './components/ShareToFeed'
import { SignalChart, SpectrumChart } from './components/SignalChart'
import { VitalsPanel } from './components/VitalsPanel'
import { isLocalLabEnabled } from './lib/lab/enabled'
import {
  detectVideoFrame,
  getFaceLandmarker,
  sampleRoiRgbFromFrame,
  sampleVideoLandmarks,
} from './lib/mediapipe/faceLandmarker'
import {
  buildSparklinePath,
  captureFaceThumbnail,
} from './lib/feed/cardMedia'
import { ROI_LANDMARK_INDICES } from './lib/rppg/motion'
import { runPipeline, type PipelineResult } from './lib/rppg/pipeline'
import { conflictRiskLabel } from './lib/rppg/conflict'
import { estimateRespiratoryRate } from './lib/rppg/respiratory'
import { generateSyntheticSample } from './lib/rppg/synthetic'
import {
  DEFAULT_CONTROLS,
  ROI_IDS,
  ROI_LABELS,
  type DemoControls,
  type FrameLandmarks,
  type RoiRgbTrace,
} from './lib/rppg/types'
import { optimizeVideoFile } from './lib/video/optimize'
import type { RunSource } from './lib/feed/types'

type LiveBuffer = {
  frames: FrameLandmarks[]
  roiRgb: RoiRgbTrace
  sampleRateHz: number
}

const SESSION_MAX = 10

function emptyRoiRgb(): RoiRgbTrace {
  return {
    forehead: [],
    leftCheek: [],
    rightCheek: [],
    lowerFace: [],
  }
}

function modeToSource(mode: InputMode): RunSource {
  if (mode === 'webcam') return 'webcam'
  if (mode === 'upload') return 'upload'
  return 'sample'
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export default function App() {
  const [controls, setControls] = useState<DemoControls>(DEFAULT_CONTROLS)
  const [inputMode, setInputMode] = useState<InputMode>('synthetic')
  const [status, setStatus] = useState(
    'Sample ready — face preview below. Scrub the timeline, or upload several clips.',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<LiveBuffer | null>(null)
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [stage, setStage] = useState<AnalysisStage>('idle')
  const [stageDetail, setStageDetail] = useState<string | undefined>()
  const [feedTick, setFeedTick] = useState(0)
  const [showStory, setShowStory] = useState(true)
  const [thumbnailData, setThumbnailData] = useState<string | null>(null)
  const [view, setView] = useState<'demo' | 'lab'>('demo')
  const [scrub, setScrub] = useState(1)
  const [durationSec, setDurationSec] = useState(12)
  const [hasVideo, setHasVideo] = useState(false)
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [queueLeft, setQueueLeft] = useState(0)
  const labEnabled = isLocalLabEnabled()

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastTsRef = useRef(0)
  const thumbCapturedRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)
  const uploadQueueRef = useRef<File[]>([])
  const processingQueueRef = useRef(false)

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
    }
    return null
  }, [source, controls])

  const sparkline = useMemo(() => {
    if (!result) return null
    const series =
      result.suppression.gated.length > 8
        ? result.suppression.gated
        : result.candidate
    const path = buildSparklinePath(series)
    return path || null
  }, [result])

  const respiratory = useMemo(() => {
    if (!result || !source) return null
    const series =
      result.suppression.gated.length > 24
        ? result.suppression.gated
        : result.motion.global
    return estimateRespiratoryRate(series, source.sampleRateHz)
  }, [result, source])

  const risk = result ? conflictRiskLabel(result.conflict.combined) : null

  const scrubLandmarks = useMemo(() => {
    if (!source?.frames.length) return null
    const idx = Math.min(
      source.frames.length - 1,
      Math.max(0, Math.round(scrub * (source.frames.length - 1))),
    )
    return source.frames[idx] ?? null
  }, [source, scrub])

  // Keep synthetic duration in sync; paint a soft preview frame for the overlay.
  useEffect(() => {
    if (inputMode !== 'synthetic') return
    setDurationSec(synthetic.frames.length / synthetic.sampleRateHz)
    setHasVideo(false)
    const canvas = canvasRef.current
    const lm = scrubLandmarks
    if (!canvas || !lm) return
    canvas.width = 480
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = ctx.createLinearGradient(0, 0, 0, 600)
    g.addColorStop(0, '#d5e6ef')
    g.addColorStop(1, '#e8f0f2')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 480, 600)
    ctx.fillStyle = 'rgba(14,107,106,0.12)'
    for (const p of lm.slice(0, 120)) {
      ctx.beginPath()
      ctx.arc(p.x * 480, p.y * 600, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [inputMode, synthetic, scrubLandmarks])

  useEffect(() => {
    if (inputMode !== 'webcam') {
      stopWebcam()
    }
    return () => stopWebcam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode])

  function revokeObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  function stopWebcam() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop())
    webcamStreamRef.current = null
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null
    }
  }

  function pushSessionRun(run: Omit<SessionRun, 'id' | 'at'> & { id?: string }) {
    const entry: SessionRun = {
      id: run.id ?? newId(),
      name: run.name,
      bpm: run.bpm,
      riskLevel: run.riskLevel,
      riskScore: run.riskScore,
      thumbnail: run.thumbnail,
      respiratoryBpm: run.respiratoryBpm,
      at: Date.now(),
    }
    setSessionRuns((prev) => [entry, ...prev].slice(0, SESSION_MAX))
    setActiveSessionId(entry.id)
  }

  async function handleInputMode(mode: InputMode) {
    setError(null)
    setInputMode(mode)
    setStage('idle')
    setStageDetail(undefined)
    setThumbnailData(null)
    thumbCapturedRef.current = false
    setScrub(1)
    if (mode === 'synthetic') {
      stopWebcam()
      revokeObjectUrl()
      setLive(null)
      setUploadName(null)
      setShowStory(true)
      setHasVideo(false)
      setDurationSec(12)
      setStatus(
        'Sample ready — scrub the timeline or upload a batch of face clips.',
      )
      return
    }
    if (mode === 'webcam') {
      revokeObjectUrl()
      setUploadName(null)
      setShowStory(false)
      await startWebcam()
    } else {
      stopWebcam()
      setLive(null)
      setUploadName(null)
      setShowStory(false)
      setHasVideo(false)
      setStatus('Choose one or more short face videos (up to 10 in a session).')
    }
  }

  function openUploadPicker() {
    setError(null)
    setInputMode('upload')
    setShowStory(false)
    setStage('idle')
    setStatus('Choose one or more short face videos to analyze.')
    requestAnimationFrame(() => fileInputRef.current?.click())
  }

  function maybeCaptureThumb(
    canvas: HTMLCanvasElement,
    landmarks: FrameLandmarks | null,
  ) {
    if (thumbCapturedRef.current) return
    if (!canvas.width || !landmarks) return
    const data = captureFaceThumbnail(canvas, landmarks, {
      blurPx: 0.9,
      sizePx: 160,
      quality: 0.7,
    })
    if (data) {
      thumbCapturedRef.current = true
      setThumbnailData(data)
    }
  }

  async function startWebcam() {
    setBusy(true)
    setStage('finding_face')
    setStageDetail('Asking for camera access…')
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
      setHasVideo(true)
      setDurationSec(0)

      setLive({
        frames: [],
        roiRgb: emptyRoiRgb(),
        sampleRateHz: 15,
      })
      setStage('estimating_pulse')
      setStageDetail('Keep your face centered')
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
                if (frames.length >= 16) {
                  setStage('done')
                  setShowStory(true)
                  maybeCaptureThumb(canvas, landmarks)
                  setDurationSec(frames.length / 15)
                  setScrub(1)
                  setStatus(
                    `Camera live — ${frames.length} frames. Vitals update on the right.`,
                  )
                } else {
                  setStatus(
                    `Camera on — collecting frames (${frames.length}/16)…`,
                  )
                }
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
      setStage('idle')
      setHasVideo(false)
      setError(
        e instanceof Error
          ? e.message
          : 'Could not start the camera. Check browser permissions.',
      )
      setStatus('Camera unavailable — try the sample or upload a video instead.')
      setInputMode('synthetic')
    }
  }

  async function handleUpload(
    file: File,
  ): Promise<{ pipeline: PipelineResult; thumbnail: string | null; fps: number } | null> {
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|avi)$/i.test(file.name)) {
      setError('Please choose a video file (MP4, WebM, or MOV work best).')
      setStatus('That file does not look like a video.')
      return null
    }

    setBusy(true)
    setError(null)
    setInputMode('upload')
    setUploadName(file.name)
    setShowStory(false)
    setThumbnailData(null)
    thumbCapturedRef.current = false
    setStage('optimizing')
    setStageDetail('Capping resolution (~720p) and length (~15s)…')
    setStatus(`Optimizing “${file.name}”…`)
    stopWebcam()
    try {
      const optimized = await optimizeVideoFile(file, {
        onProgress: (pct) => {
          setStageDetail(`Optimizing… ${Math.round(pct * 100)}%`)
        },
      })
      const workFile = optimized.file
      const noteParts: string[] = []
      if (optimized.downscaled) {
        noteParts.push(
          `${optimized.originalWidth}×${optimized.originalHeight} → ${optimized.width}×${optimized.height}`,
        )
      }
      if (optimized.truncated) noteParts.push(`first ${optimized.durationSec.toFixed(0)}s`)
      if (noteParts.length) {
        setStatus(`Optimized (${noteParts.join(', ')}). Finding face…`)
      }

      setStage('finding_face')
      setStageDetail('Loading clip…')
      revokeObjectUrl()
      const url = URL.createObjectURL(workFile)
      objectUrlRef.current = url
      const video = videoRef.current!
      video.srcObject = null
      video.src = url
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Could not load that video'))
      })
      setHasVideo(true)
      setDurationSec(video.duration || optimized.durationSec || 0)
      setStatus('Finding the face in your video…')
      await getFaceLandmarker()
      const detected = await sampleVideoLandmarks(video, 12, (pct) => {
        setStageDetail(`Reading landmarks… ${Math.round(pct * 100)}%`)
        setStatus(`Reading face landmarks… ${Math.round(pct * 100)}%`)
      })

      if (detected.length < 16) {
        throw new Error(
          'Not enough face frames found. Try a clearer, well-lit clip of a face.',
        )
      }

      setStage('estimating_pulse')
      setStageDetail('Sampling skin color and motion…')
      setStatus('Estimating pulse from trusted face regions…')

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

      const mid = detected[Math.floor(detected.length / 2)]!
      video.currentTime = mid.timestampMs / 1000
      await new Promise<void>((r) => {
        video.onseeked = () => r()
      })
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      maybeCaptureThumb(canvas, mid.landmarks)

      const buffer: LiveBuffer = { frames, roiRgb, sampleRateHz: fps }
      setLive(buffer)
      setScrub(0.5)
      setStage('done')
      setShowStory(true)

      let pipeline: PipelineResult | null = null
      try {
        pipeline = runPipeline({
          frames,
          roiRgb,
          sampleRateHz: fps,
          controls,
        })
      } catch (e) {
        console.error(e)
      }

      const thumb =
        canvas.width > 0
          ? captureFaceThumbnail(canvas, mid.landmarks, {
              blurPx: 0.9,
              sizePx: 160,
              quality: 0.7,
            })
          : null
      if (thumb) {
        thumbCapturedRef.current = true
        setThumbnailData(thumb)
      }

      setStatus(
        `Done — ${frames.length} frames from “${file.name}”. Scrub the timeline to review.`,
      )
      if (!pipeline) return null
      return { pipeline, thumbnail: thumb, fps }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze that video')
      setStatus('Upload failed — try another clip, or load the sample.')
      setLive(null)
      setUploadName(null)
      setStage('idle')
      setShowStory(false)
      setHasVideo(false)
      revokeObjectUrl()
      return null
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function enqueueFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, SESSION_MAX)
    if (list.length === 0) return
    uploadQueueRef.current.push(...list)
    setQueueLeft(uploadQueueRef.current.length)
    setStatus(
      list.length > 1
        ? `Queued ${list.length} clips — analyzing one at a time (privacy: local only).`
        : `Analyzing “${list[0]!.name}”…`,
    )
    await drainUploadQueue()
  }

  async function drainUploadQueue() {
    if (processingQueueRef.current) return
    processingQueueRef.current = true
    try {
      while (uploadQueueRef.current.length > 0) {
        setQueueLeft(uploadQueueRef.current.length)
        const file = uploadQueueRef.current.shift()!
        const outcome = await handleUpload(file)
        if (outcome) {
          const { pipeline, thumbnail, fps } = outcome
          const riskLabel = conflictRiskLabel(pipeline.conflict.combined)
          const series =
            pipeline.suppression.gated.length > 24
              ? pipeline.suppression.gated
              : pipeline.motion.global
          const breath = estimateRespiratoryRate(series, fps)
          pushSessionRun({
            name:
              file.name.length > 28 ? `${file.name.slice(0, 26)}…` : file.name,
            bpm: pipeline.gatedBpm,
            riskLevel: riskLabel.level,
            riskScore: pipeline.conflict.combined,
            thumbnail,
            respiratoryBpm: breath ? breath.breathsPerMin : null,
          })
        }
      }
    } finally {
      processingQueueRef.current = false
      setQueueLeft(0)
    }
  }

  function handleScrub(t: number) {
    setScrub(t)
    const video = videoRef.current
    if (
      video &&
      hasVideo &&
      inputMode !== 'synthetic' &&
      Number.isFinite(video.duration) &&
      video.duration > 0
    ) {
      const target = t * video.duration
      if (Math.abs(video.currentTime - target) > 0.04) {
        video.currentTime = target
      }
    }
  }

  const lastLandmarks = scrubLandmarks ?? source?.frames[source.frames.length - 1] ?? null
  const hasResult = Boolean(result)
  const runSource = modeToSource(inputMode)

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden />

      {labEnabled && (
        <nav className="app-nav" aria-label="Primary">
          <button
            type="button"
            className={`app-nav-link ${view === 'demo' ? 'is-active' : ''}`}
            onClick={() => setView('demo')}
          >
            Demo
          </button>
          <button
            type="button"
            className={`app-nav-link ${view === 'lab' ? 'is-active' : ''}`}
            onClick={() => setView('lab')}
          >
            Local lab
          </button>
        </nav>
      )}

      {view === 'lab' && labEnabled ? (
        <>
          <header className="hero hero-compact">
            <h1 className="brand">
              Motion<span>Pulse</span>
            </h1>
            <p className="headline">Local lab</p>
            <p className="tagline">
              Batch datasets on this machine. Metrics can go online — videos
              stay local.
            </p>
          </header>
          <LocalLab onPublished={() => setFeedTick((t) => t + 1)} />
          <RecentRuns refreshToken={feedTick} />
          <footer className="site-foot">
            <p>
              Local lab — educational demo, not a medical device. Never publish
              raw face video.
            </p>
          </footer>
        </>
      ) : (
        <>
          <header className="hero hero-monitor">
            <h1 className="brand">
              Motion<span>Pulse</span>
            </h1>
            <p className="headline">Face video → pulse you can see</p>
            <p className="tagline">
              Large preview with live face detection, a big timeline slider, and
              honest vitals — heart rate from rPPG, breathing only when the clip
              is long enough, never fake blood pressure.
            </p>
          </header>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            className="sr-only"
            tabIndex={-1}
            multiple
            onChange={(e) => {
              const files = e.target.files
              if (files?.length) void enqueueFiles(files)
            }}
          />

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}

          <AnalysisProgress stage={stage} detail={stageDetail} />

          {queueLeft > 0 && (
            <p className="queue-banner" role="status">
              {queueLeft} clip{queueLeft === 1 ? '' : 's'} left in the session
              queue…
            </p>
          )}

          <div className="monitor-layout">
            <MonitorStage
              videoRef={videoRef}
              canvasRef={canvasRef}
              landmarks={lastLandmarks}
              inputMode={inputMode}
              busy={busy}
              hasVideo={hasVideo}
              scrub={scrub}
              onScrub={handleScrub}
              durationSec={durationSec}
              onUploadClick={openUploadPicker}
              onWebcam={() => void handleInputMode('webcam')}
              onSample={() => void handleInputMode('synthetic')}
              status={status}
            />

            <VitalsPanel
              result={result}
              respiratory={respiratory}
              sparkline={sparkline}
              scrub={scrub}
            />
          </div>

          <SessionStrip
            runs={sessionRuns}
            activeId={activeSessionId}
            onSelect={setActiveSessionId}
            onClear={() => {
              setSessionRuns([])
              setActiveSessionId(null)
            }}
            max={SESSION_MAX}
          />

          <EducationSection variant="tips" />

          {hasResult && result && risk && showStory && (
            <ShareToFeed
              bpm={result.gatedBpm}
              conflictScore={result.conflict.combined}
              riskLevel={risk.level}
              roiWeights={Object.fromEntries(
                ROI_IDS.map((id) => [
                  id,
                  Number((result.reliability.weights[id] ?? 0).toFixed(4)),
                ]),
              )}
              source={runSource}
              thumbnailData={thumbnailData}
              sparkline={sparkline}
              onShared={() => setFeedTick((t) => t + 1)}
            />
          )}

          <details className="advanced monitor-details">
            <summary>Motion, spectrum &amp; trust detail</summary>
            <div className="advanced-body layout">
              <section className="panel">
                <header className="panel-head">
                  <h2>How the face moved</h2>
                  <p>
                    Overall head motion versus smaller local movement
                    (expressions, talking).
                  </p>
                </header>
                {!hasResult ? (
                  <EmptyState
                    title="Waiting for enough frames"
                    body="Need about a second of face tracking."
                  />
                ) : (
                  <>
                    <div className="chart-frame">
                      <SignalChart
                        cursorFraction={scrub}
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
                    Risk when face motion lines up with the pulse estimate —
                    not proof that motion caused an error.
                  </p>
                </header>
                {!hasResult ? (
                  <EmptyState title="No risk score yet" body="Load a sample or video first." />
                ) : (
                  <>
                    <div className={`risk-banner risk-${risk?.level}`} role="status">
                      <strong>{risk?.label}</strong>
                      <span>{risk?.blurb}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <MetricPill
                        label="Time sync"
                        value={result!.conflict.cTemp.toFixed(3)}
                        tone="amber"
                      />
                      <MetricPill
                        label="Freq. overlap"
                        value={result!.conflict.cSpec.toFixed(3)}
                        tone="amber"
                      />
                      <MetricPill
                        label="Combined risk"
                        value={result!.conflict.combined.toFixed(3)}
                        tone="warn"
                      />
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="chart-frame">
                        <SignalChart
                          cursorFraction={scrub}
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
                      <div className="chart-frame">
                        <SpectrumChart
                          freqs={result!.spectra.candidate.freqs}
                          power={result!.spectra.candidate.power}
                          bandHz={controls.physBandHz}
                          color="#0E6B6A"
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
                    Stable skin regions get more weight — talking mouths and
                    shaky areas get less.
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
                          cursorFraction={scrub}
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
                              Trust{' '}
                              {result!.reliability.reliability[id]!.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
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
          </details>

          {uploadName && (
            <p className="help-line">
              Last clip: {uploadName}. Face video stays in your browser — only
              optional metric summaries can go to the feed.
            </p>
          )}

          <RecentRuns refreshToken={feedTick} />

          {showStory && <EducationSection variant="guide" />}

          <footer className="site-foot">
            <p>
              Browser demo for learning — not a medical device. Shared feed
              stores metric summaries and optional tiny thumbs only — never raw
              face video. Blood pressure is not estimated from rPPG alone.
            </p>
          </footer>
        </>
      )}
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      <p>{body}</p>
    </div>
  )
}
