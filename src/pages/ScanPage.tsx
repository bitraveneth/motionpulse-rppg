import { useEffect, useMemo, useRef, useState } from 'react'
import { AnalysisProgress, type AnalysisStage } from '../components/AnalysisProgress'
import { ControlsPanel, type InputMode } from '../components/ControlsPanel'
import { FaceOverlay } from '../components/FaceOverlay'
import { MetricPill } from '../components/MetricPill'
import { MonitorStage } from '../components/MonitorStage'
import { SessionBrowser } from '../components/SessionBrowser'
import {
  SessionStrip,
  type SessionRun,
} from '../components/SessionStrip'
import { ShareToFeed } from '../components/ShareToFeed'
import { SignalChart, SpectrumChart } from '../components/SignalChart'
import { RegionTrustLines } from '../components/RegionTrustLines'
import { ScanVitalCards } from '../components/ScanVitalCards'
import { VitalsScanRow } from '../components/VitalsScanRow'
import { SiteNav } from '../components/SiteNav'
import { useSearchParams } from 'react-router-dom'
import {
  detectVideoFrame,
  getFaceLandmarker,
  sampleRoiRgbFromFrame,
} from '../lib/mediapipe/faceLandmarker'
import {
  buildSparklinePath,
  captureFaceThumbnail,
} from '../lib/feed/cardMedia'
import {
  fetchDemoClipList,
  fetchDemoClipsAsFiles,
} from '../lib/demo/listDemoClips'
import { ROI_LANDMARK_INDICES } from '../lib/rppg/motion'
import { runPipeline, type PipelineResult } from '../lib/rppg/pipeline'
import { conflictRiskLabel } from '../lib/rppg/conflict'
import { estimateRespiratoryRate } from '../lib/rppg/respiratory'
import { generateSyntheticSample } from '../lib/rppg/synthetic'
import { paintSyntheticPreview } from '../lib/rppg/syntheticPreview'
import {
  DEFAULT_CONTROLS,
  ROI_IDS,
  ROI_LABELS,
  type DemoControls,
  type FrameLandmarks,
  type RoiRgbTrace,
} from '../lib/rppg/types'
import { optimizeVideoFile } from '../lib/video/optimize'
import { streamAnalyzeVideo } from '../lib/video/streamAnalyze'
import type { RunSource } from '../lib/feed/types'

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

export function ScanPage() {
  const [searchParams] = useSearchParams()
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
  const [, setFeedTick] = useState(0)
  const [showStory, setShowStory] = useState(true)
  const [thumbnailData, setThumbnailData] = useState<string | null>(null)
  const [scrub, setScrub] = useState(1)
  const [durationSec, setDurationSec] = useState(12)
  const [hasVideo, setHasVideo] = useState(false)
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [queueLeft, setQueueLeft] = useState(0)
  const [demoLoading, setDemoLoading] = useState(false)
  /** True while upload analysis is still accumulating frames (live vitals). */
  const [liveEstimating, setLiveEstimating] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Hidden element used only while decoding/analyzing uploads (keeps preview free to browse). */
  const analysisVideoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastTsRef = useRef(0)
  const thumbCapturedRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)
  /** Pending upload files keyed by session clip id (queue order). */
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  const queueOrderRef = useRef<string[]>([])
  const processingQueueRef = useRef(false)
  /** Avoid re-applying the same clip when sessionRuns mutates in place. */
  const appliedSessionIdRef = useRef<string | null>(null)
  /** Object URLs owned by session clips — do not revoke until clear. */
  const ownedUrlsRef = useRef<Set<string>>(new Set())
  const sessionRunsRef = useRef<SessionRun[]>([])
  sessionRunsRef.current = sessionRuns
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId

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

  const regionWeights = useMemo(() => {
    if (!result) return null
    return Object.fromEntries(
      ROI_IDS.map((id) => [id, result.reliability.weights[id] ?? 0]),
    )
  }, [result])

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
    const idx = Math.min(
      synthetic.frames.length - 1,
      Math.max(0, Math.round(scrub * (synthetic.frames.length - 1))),
    )
    paintSyntheticPreview(ctx, 480, 600, lm, idx, synthetic.roiRgb)
  }, [inputMode, synthetic, scrubLandmarks, scrub])

  useEffect(() => {
    if (inputMode !== 'webcam') {
      stopWebcam()
    }
    return () => stopWebcam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode])

  // Seed the sample into the session once so multi-clip browse can include it.
  useEffect(() => {
    if (inputMode !== 'synthetic') return
    if (sessionRunsRef.current.some((r) => r.source === 'sample')) return
    ensureSampleInSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link from marketing home: /scan?action=sample|upload|webcam
  useEffect(() => {
    const action = searchParams.get('action')
    if (!action) return
    const id = window.setTimeout(() => {
      if (action === 'sample') void handleInputMode('synthetic')
      else if (action === 'upload') openUploadPicker()
      else if (action === 'webcam') void handleInputMode('webcam')
    }, 50)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function revokeObjectUrl() {
    // Drop transient preview URL only when it is not owned by a session clip.
    if (objectUrlRef.current) {
      if (!ownedUrlsRef.current.has(objectUrlRef.current)) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
      objectUrlRef.current = null
    }
  }

  function revokeAllSessionUrls(runs: SessionRun[]) {
    for (const run of runs) {
      if (run.objectUrl) {
        URL.revokeObjectURL(run.objectUrl)
        ownedUrlsRef.current.delete(run.objectUrl)
      }
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

  function shortClipName(name: string) {
    return name.length > 28 ? `${name.slice(0, 26)}…` : name
  }

  function patchSessionRun(id: string, patch: Partial<SessionRun>) {
    setSessionRuns((prev) =>
      prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
    )
  }

  function clearSession() {
    setSessionRuns((prev) => {
      revokeAllSessionUrls(prev)
      return []
    })
    setActiveSessionId(null)
    appliedSessionIdRef.current = null
    pendingFilesRef.current.clear()
    queueOrderRef.current = []
    setQueueLeft(0)
  }

  async function attachVideoUrl(url: string | null, seekFrac = 0.5) {
    const video = videoRef.current
    if (!video) return
    video.srcObject = null
    if (!url) {
      video.removeAttribute('src')
      video.load()
      setHasVideo(false)
      return
    }
    if (video.src !== url) {
      video.src = url
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Could not load that video'))
      }).catch(() => undefined)
    }
    setHasVideo(true)
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = seekFrac * video.duration
    }
  }

  async function selectSessionClip(
    id: string,
    opts?: { force?: boolean; clip?: SessionRun },
  ) {
    const force = opts?.force ?? false
    if (!force && appliedSessionIdRef.current === id && activeSessionId === id) {
      setActiveSessionId(id)
      return
    }
    const clip =
      opts?.clip ?? sessionRunsRef.current.find((r) => r.id === id)
    if (!clip) return

    const total = sessionRunsRef.current.length
    const index = sessionRunsRef.current.findIndex((r) => r.id === id)
    const indexLabel =
      index >= 0 ? `clip ${index + 1} of ${total}` : 'clip'

    setActiveSessionId(id)
    appliedSessionIdRef.current = id
    setError(null)
    stopWebcam()

    if (clip.status === 'queued') {
      setLive(null)
      setLiveEstimating(false)
      setShowStory(false)
      setStage('idle')
      setStageDetail(undefined)
      setThumbnailData(null)
      setUploadName(clip.name)
      setDurationSec(0)
      setScrub(0)
      setInputMode(clip.source === 'sample' ? 'synthetic' : 'upload')
      await attachVideoUrl(null)
      setStatus(`Queued — “${clip.name}” will analyze next in this session.`)
      return
    }

    if (clip.status === 'analyzing') {
      setShowStory(false)
      setStage('estimating_pulse')
      setStageDetail('Analyzing this clip…')
      setUploadName(clip.name)
      setInputMode('upload')
      setLiveEstimating(true)
      if (clip.buffer) {
        setLive(clip.buffer)
        setDurationSec(clip.durationSec || 0)
        setScrub(1)
      }
      if (clip.objectUrl) {
        objectUrlRef.current = clip.objectUrl
        await attachVideoUrl(clip.objectUrl, 0.5)
      }
      setStatus(`Analyzing “${clip.name}” — vitals update live…`)
      return
    }

    if (clip.status === 'error') {
      setLive(null)
      setShowStory(false)
      setStage('idle')
      setThumbnailData(null)
      setUploadName(clip.name)
      setDurationSec(0)
      setScrub(0)
      setInputMode('upload')
      await attachVideoUrl(clip.objectUrl)
      setError(clip.errorMessage ?? 'Could not analyze that clip')
      setStatus(`Error on “${clip.name}” — try another clip.`)
      return
    }

    // done
    setShowStory(true)
    setStage('done')
    setStageDetail(undefined)
    setUploadName(clip.name)
    setThumbnailData(clip.thumbnail)
    setDurationSec(clip.durationSec)
    setScrub(0.5)
    setBusy(false)
    setLiveEstimating(false)

    if (clip.source === 'sample') {
      setInputMode('synthetic')
      objectUrlRef.current = null
      await attachVideoUrl(null)
      if (clip.buffer) setLive(clip.buffer)
      else setLive(null)
      setStatus(
        `Sample ${indexLabel} — scrub the timeline or flip to another clip.`,
      )
      return
    }

    setInputMode(clip.source === 'webcam' ? 'webcam' : 'upload')
    objectUrlRef.current = clip.objectUrl
    if (clip.buffer) setLive(clip.buffer)
    else setLive(null)
    await attachVideoUrl(clip.objectUrl, 0.5)
    setStatus(
      `Viewing ${indexLabel} — “${clip.name}”. Use the session slider to browse.`,
    )
  }

  function ensureSampleInSession() {
    const buffer = {
      frames: synthetic.frames,
      roiRgb: synthetic.roiRgb,
      sampleRateHz: synthetic.sampleRateHz,
    }
    let pipeline: PipelineResult | null = null
    try {
      pipeline = runPipeline({
        frames: buffer.frames,
        roiRgb: buffer.roiRgb,
        sampleRateHz: buffer.sampleRateHz,
        controls,
      })
    } catch (e) {
      console.error(e)
    }
    const breath = pipeline
      ? estimateRespiratoryRate(
          pipeline.suppression.gated.length > 24
            ? pipeline.suppression.gated
            : pipeline.motion.global,
          buffer.sampleRateHz,
        )
      : null
    const risk = pipeline
      ? conflictRiskLabel(pipeline.conflict.combined)
      : null

    const existing = sessionRunsRef.current.find((r) => r.source === 'sample')
    const entry: SessionRun = {
      id: existing?.id ?? newId(),
      name: 'Sample',
      status: 'done',
      source: 'sample',
      bpm: pipeline?.gatedBpm ?? null,
      riskLevel: risk?.level ?? null,
      riskScore: pipeline?.conflict.combined ?? null,
      thumbnail: existing?.thumbnail ?? null,
      respiratoryBpm: breath ? breath.breathsPerMin : null,
      at: Date.now(),
      durationSec: buffer.frames.length / buffer.sampleRateHz,
      objectUrl: null,
      buffer,
    }
    setSessionRuns((prev) => {
      const without = prev.filter((r) => r.source !== 'sample')
      return [entry, ...without].slice(0, SESSION_MAX)
    })
    setActiveSessionId(entry.id)
    appliedSessionIdRef.current = entry.id
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
      setUploadName('Sample')
      setShowStory(true)
      setHasVideo(false)
      setLiveEstimating(false)
      setDurationSec(12)
      setLive({
        frames: synthetic.frames,
        roiRgb: synthetic.roiRgb,
        sampleRateHz: synthetic.sampleRateHz,
      })
      ensureSampleInSession()
      setStatus(
        'Sample ready — scrub the timeline, or upload several clips and browse with the session slider.',
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

  async function loadDemoSet() {
    setError(null)
    setDemoLoading(true)
    setStatus('Looking for clips in public/demo-clips…')
    try {
      const refs = await fetchDemoClipList()
      if (refs.length === 0) {
        setStatus(
          'No demo clips yet — drop 5–10 face mp4/webm/mov into public/demo-clips/, then click Load demo set again.',
        )
        return
      }
      setStatus(`Fetching ${refs.length} demo clip${refs.length === 1 ? '' : 's'}…`)
      const files = await fetchDemoClipsAsFiles(refs)
      if (files.length === 0) {
        setError('Could not download demo clips from /demo-clips/.')
        setStatus('Demo set failed — check that the files are readable.')
        return
      }
      await enqueueFiles(files)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load demo set')
      setStatus('Demo set failed — try Upload or Try sample instead.')
    } finally {
      setDemoLoading(false)
    }
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
      setLiveEstimating(true)
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
                  setStage('estimating_pulse')
                  setLiveEstimating(true)
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
    clipId: string,
  ): Promise<{
    pipeline: PipelineResult
    thumbnail: string | null
    fps: number
    buffer: LiveBuffer
    objectUrl: string
    durationSec: number
  } | null> {
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
    setActiveSessionId(clipId)
    appliedSessionIdRef.current = clipId
    patchSessionRun(clipId, { status: 'analyzing' })
    stopWebcam()
    let createdUrl: string | null = null
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
      createdUrl = url
      ownedUrlsRef.current.add(url)
      // Decode on a hidden video so the main preview can keep browsing other clips.
      let video = analysisVideoRef.current
      if (!video) {
        video = document.createElement('video')
        video.playsInline = true
        video.muted = true
        video.preload = 'auto'
        analysisVideoRef.current = video
      }
      video.src = url
      await new Promise<void>((resolve, reject) => {
        video!.onloadedmetadata = () => resolve()
        video!.onerror = () => reject(new Error('Could not load that video'))
      })
      const durationSec = video.duration || optimized.durationSec || 0
      // Mirror onto the visible stage when the user is still on this clip.
      if (activeSessionIdRef.current === clipId) {
        objectUrlRef.current = url
        await attachVideoUrl(url, 0.5)
        setDurationSec(durationSec)
      }
      setStatus('Finding the face in your video…')
      await getFaceLandmarker()
      setStage('estimating_pulse')
      setStageDetail('Streaming face + pulse windows…')
      setLiveEstimating(true)
      if (activeSessionIdRef.current === clipId) {
        setStatus('Analyzing — vitals update as frames accumulate…')
        setShowStory(false)
        setLive({
          frames: [],
          roiRgb: emptyRoiRgb(),
          sampleRateHz: 12,
        })
      }

      const canvas = canvasRef.current!
      const buffer = await streamAnalyzeVideo(video, canvas, {
        targetFps: 12,
        minFrames: 16,
        updateEvery: 4,
        onProgress: (pct) => {
          setStageDetail(`Reading clip… ${Math.round(pct * 100)}%`)
        },
        onPartial: (partial, meta) => {
          if (activeSessionIdRef.current !== clipId) return
          setLive(partial)
          setScrub(1)
          setDurationSec(durationSec)
          setStatus(
            `Live estimate — ${meta.frameCount} frames (${Math.round(meta.pct * 100)}%)…`,
          )
          // Light session patch so browsing mid-queue can peek at partials.
          patchSessionRun(clipId, {
            status: 'analyzing',
            buffer: partial,
            durationSec,
            objectUrl: url,
            bpm: (() => {
              try {
                return runPipeline({
                  frames: partial.frames,
                  roiRgb: partial.roiRgb,
                  sampleRateHz: partial.sampleRateHz,
                  controls,
                }).gatedBpm
              } catch {
                return null
              }
            })(),
          })
        },
      })

      const fps = buffer.sampleRateHz
      const midIdx = Math.floor(buffer.frames.length / 2)
      const midLm = buffer.frames[midIdx]!
      video.currentTime = (midIdx / Math.max(1, buffer.frames.length - 1)) * durationSec
      await new Promise<void>((r) => {
        video!.onseeked = () => r()
      })
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(video, 0, 0)
      maybeCaptureThumb(canvas, midLm)

      let pipeline: PipelineResult | null = null
      try {
        pipeline = runPipeline({
          frames: buffer.frames,
          roiRgb: buffer.roiRgb,
          sampleRateHz: fps,
          controls,
        })
      } catch (e) {
        console.error(e)
      }

      const thumb =
        canvas.width > 0
          ? captureFaceThumbnail(canvas, midLm, {
              blurPx: 0.9,
              sizePx: 160,
              quality: 0.7,
            })
          : null

      setLiveEstimating(false)
      if (activeSessionIdRef.current === clipId) {
        setLive(buffer)
        setScrub(0.5)
        setStage('done')
        setShowStory(true)
        setDurationSec(durationSec)
        if (thumb) {
          thumbCapturedRef.current = true
          setThumbnailData(thumb)
        }
        objectUrlRef.current = url
        await attachVideoUrl(url, 0.5)
        setStatus(
          `Done — ${buffer.frames.length} frames from “${file.name}”. Scrub or use the session slider.`,
        )
      }
      if (!pipeline) {
        if (createdUrl) {
          ownedUrlsRef.current.delete(createdUrl)
          URL.revokeObjectURL(createdUrl)
        }
        return null
      }
      return {
        pipeline,
        thumbnail: thumb,
        fps,
        buffer,
        objectUrl: url,
        durationSec,
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not analyze that video'
      setError(message)
      setStatus('Upload failed — try another clip, or load the sample.')
      setLive(null)
      setLiveEstimating(false)
      setStage('idle')
      setShowStory(false)
      setHasVideo(false)
      if (createdUrl) {
        ownedUrlsRef.current.delete(createdUrl)
        URL.revokeObjectURL(createdUrl)
        if (objectUrlRef.current === createdUrl) objectUrlRef.current = null
      } else {
        revokeObjectUrl()
      }
      patchSessionRun(clipId, {
        status: 'error',
        errorMessage: message,
      })
      return null
    } finally {
      setBusy(false)
      setLiveEstimating(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function enqueueFiles(files: FileList | File[]) {
    const room = Math.max(0, SESSION_MAX - sessionRunsRef.current.length)
    const list = Array.from(files)
      .filter(
        (f) =>
          f.type.startsWith('video/') ||
          /\.(mp4|webm|mov|m4v|avi)$/i.test(f.name),
      )
      .slice(0, room)
    if (list.length === 0) {
      if (sessionRunsRef.current.length >= SESSION_MAX) {
        setStatus(`Session is full (${SESSION_MAX} clips). Clear session to add more.`)
      }
      return
    }

    const entries: SessionRun[] = list.map((file) => {
      const id = newId()
      pendingFilesRef.current.set(id, file)
      queueOrderRef.current.push(id)
      return {
        id,
        name: shortClipName(file.name),
        status: 'queued' as const,
        source: 'upload' as const,
        bpm: null,
        riskLevel: null,
        riskScore: null,
        thumbnail: null,
        respiratoryBpm: null,
        at: Date.now(),
        durationSec: 0,
        objectUrl: null,
        buffer: null,
      }
    })

    setSessionRuns((prev) => [...prev, ...entries].slice(0, SESSION_MAX))
    setQueueLeft(queueOrderRef.current.length)
    const first = entries[0]!
    setActiveSessionId(first.id)
    setStatus(
      list.length > 1
        ? `Queued ${list.length} clips — analyzing one at a time. Use the slider to browse.`
        : `Analyzing “${list[0]!.name}”…`,
    )
    await drainUploadQueue()
  }

  async function drainUploadQueue() {
    if (processingQueueRef.current) return
    processingQueueRef.current = true
    try {
      while (queueOrderRef.current.length > 0) {
        setQueueLeft(queueOrderRef.current.length)
        const clipId = queueOrderRef.current.shift()!
        const file = pendingFilesRef.current.get(clipId)
        pendingFilesRef.current.delete(clipId)
        if (!file) continue

        const outcome = await handleUpload(file, clipId)
        if (outcome) {
          const { pipeline, thumbnail, fps, buffer, objectUrl, durationSec } =
            outcome
          const riskLabel = conflictRiskLabel(pipeline.conflict.combined)
          const series =
            pipeline.suppression.gated.length > 24
              ? pipeline.suppression.gated
              : pipeline.motion.global
          const breath = estimateRespiratoryRate(series, fps)
          const done: SessionRun = {
            id: clipId,
            name: shortClipName(file.name),
            status: 'done',
            source: 'upload',
            bpm: pipeline.gatedBpm,
            riskLevel: riskLabel.level,
            riskScore: pipeline.conflict.combined,
            thumbnail,
            respiratoryBpm: breath ? breath.breathsPerMin : null,
            at: Date.now(),
            durationSec,
            objectUrl,
            buffer,
          }
          patchSessionRun(clipId, done)
          // Keep the stage on the clip that just finished if user hasn't jumped away.
          if (
            appliedSessionIdRef.current === clipId ||
            activeSessionIdRef.current === clipId
          ) {
            await selectSessionClip(clipId, { force: true, clip: done })
          }
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
  const activeClip =
    sessionRuns.find((r) => r.id === activeSessionId) ?? null
  const vitalsEmptyHint =
    activeClip?.status === 'analyzing' && !result
      ? `Analyzing “${activeClip.name}” — first estimate in a moment…`
      : activeClip?.status === 'queued'
        ? `“${activeClip.name}” is queued — vitals appear when analysis starts.`
        : activeClip?.status === 'error'
          ? `Could not analyze “${activeClip.name}”.`
          : undefined

  return (
    <>
      <SiteNav primaryCta={{ label: 'Scan yourself', to: '/scan' }} />

      <main className="scan-page" id="monitor">
        <header className="scan-page-head">
          <h1>Scan session</h1>
          <p>
            Face video stays on your device. Vitals update live while frames
            accumulate.
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

        {error ? (
          <div className="scan-alerts error-banner" role="alert">{error}</div>
        ) : null}
        <AnalysisProgress stage={stage} detail={stageDetail} />
        {queueLeft > 0 ? (
          <p className="scan-alerts queue-banner" role="status">
            {queueLeft} clip{queueLeft === 1 ? '' : 's'} left in the session queue…
          </p>
        ) : null}

        <div className="scan-stage">
          {!result ? (
            <p className="vitals-scan-hint">{vitalsEmptyHint}</p>
          ) : null}

          <div className="scan-session-frame product-frame">
            <div className="scan-session-media-row">
              <div className="scan-session-monitor-wrap">
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
                  onLoadDemoSet={() => void loadDemoSet()}
                  demoLoading={demoLoading}
                  status={status}
                  showCtaBar
                />
              </div>

              {regionWeights ? (
                <RegionTrustLines
                  weights={regionWeights}
                  className="scan-session-aside"
                />
              ) : null}
            </div>

            <ScanVitalCards
              result={result}
              respiratory={respiratory}
              liveEstimating={
                liveEstimating ||
                (busy && stage === 'estimating_pulse' && Boolean(result))
              }
            />
          </div>

          <VitalsScanRow
            result={result}
            scrub={scrub}
            liveEstimating={
              liveEstimating ||
              (busy && stage === 'estimating_pulse' && Boolean(result))
            }
          />
        </div>

        <div className="session-block">
          <SessionBrowser
            clips={sessionRuns}
            activeId={activeSessionId}
            onSelect={(id) => void selectSessionClip(id, { force: true })}
          />
          <SessionStrip
            runs={sessionRuns}
            activeId={activeSessionId}
            onSelect={(id) => void selectSessionClip(id, { force: true })}
            onClear={clearSession}
            max={SESSION_MAX}
          />
        </div>

        <div className="scan-tools site-section-inner">
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
        </div>
      </main>

      <footer className="site-foot">
        {uploadName ? (
          <p className="help-line">
            Last clip: {uploadName}. Face video stays in your browser.
          </p>
        ) : null}
        <p className="site-foot-research">
          Educational scan demo — not a medical device.
        </p>
      </footer>
    </>
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
