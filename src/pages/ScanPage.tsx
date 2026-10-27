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
import { DesktopPulseRail } from '../components/DesktopPulseRail'
import { PhoneVitals } from '../components/PhoneVitals'
import { SavedScanBar } from '../components/SavedScanBar'
import { VitalsScanRow } from '../components/VitalsScanRow'
import { SiteNav } from '../components/SiteNav'
import { useContent } from '../lib/content'
import { resetScanSave, saveSettledClip } from '../lib/saveScan'
import { useSearchParams } from 'react-router-dom'
import {
  detectVideoFrame,
  getFaceLandmarker,
  sampleRoiRgbFromFrame,
} from '../lib/mediapipe/faceLandmarker'
import { captureFaceThumbnail } from '../lib/feed/cardMedia'
import {
  feedVideoUrl,
  listPublicFeed,
  type PublicFeedPost,
} from '../lib/feed/publicFeed'
import type { SpotGlow } from '../lib/rppg/faceSpots'
import {
  fetchDemoClipList,
  fetchDemoClipsAsFiles,
} from '../lib/demo/listDemoClips'
import { ROI_LANDMARK_INDICES } from '../lib/rppg/motion'
import { runPipeline, type PipelineResult } from '../lib/rppg/pipeline'
import { conflictRiskLabel } from '../lib/rppg/conflict'
import { estimateShownBreath, faceGreenSeries } from '../lib/rppg/respiratory'
import {
  heartRateFromPeaks,
  hrvFromBeats,
  shownHeartRate,
} from '../lib/rppg/beatIntervals'
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
import {
  captureRemainingMs,
  captureShouldStop,
  preferredRecorderMime,
  secondsLeft,
} from '../lib/video/captureClock'
import {
  HAT_COVERED_FRAMES,
  foreheadCoveredInFrame,
  nextHatGate,
  type HatBlockReason,
} from '../lib/video/hatDetect'
import { optimizeVideoFile } from '../lib/video/optimize'
import { streamAnalyzeVideo } from '../lib/video/streamAnalyze'
import type { RunSource } from '../lib/feed/types'

type LiveBuffer = {
  frames: FrameLandmarks[]
  timestampsMs?: number[]
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
  const c = useContent()
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
  const [showStory, setShowStory] = useState(true)
  const [thumbnailData, setThumbnailData] = useState<string | null>(null)
  const [scrub, setScrub] = useState(1)
  const [durationSec, setDurationSec] = useState(12)
  const [hasVideo, setHasVideo] = useState(false)
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  /** Clip id that should open the post dialog. Cleared when they dismiss it. */
  const [sharePromptId, setSharePromptId] = useState<string | null>(null)
  const [queueLeft, setQueueLeft] = useState(0)
  const [demoLoading, setDemoLoading] = useState(false)
  /** True while upload analysis is still accumulating frames (live vitals). */
  const [liveEstimating, setLiveEstimating] = useState(false)
  /** Seconds left on a webcam capture. Null when the camera is not recording. */
  const [captureLeft, setCaptureLeft] = useState<number | null>(null)
  const [capturing, setCapturing] = useState(false)
  /** Session clip id that should offer a second 10 second take. */
  const [anotherForId, setAnotherForId] = useState<string | null>(null)
  /** Shown only after the open camera sees a cap over the forehead. */
  const [hatPrompt, setHatPrompt] = useState(false)
  const [hatReason, setHatReason] = useState<HatBlockReason | null>(null)
  const [savedPosts, setSavedPosts] = useState<PublicFeedPost[]>([])
  const [replayId, setReplayId] = useState<string | null>(null)
  const [analyzePct, setAnalyzePct] = useState<number | null>(null)
  const hatPromptRef = useRef(false)
  const hatReasonRef = useRef<HatBlockReason | null>(null)
  const hatSkipRef = useRef(false)
  const hatStreakResetRef = useRef(false)
  const clockArmedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Hidden element used only while decoding/analyzing uploads (keeps preview free to browse). */
  const analysisVideoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const captureStartedAtRef = useRef(0)
  const captureGenRef = useRef(0)
  const webcamTakesRef = useRef(0)
  const webcamBlobsRef = useRef<Map<string, Blob>>(new Map())
  const liveRef = useRef<LiveBuffer | null>(null)
  const thumbRef = useRef<string | null>(null)
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
  const controlsRef = useRef(controls)
  controlsRef.current = controls
  const inputModeRef = useRef(inputMode)
  inputModeRef.current = inputMode
  const replaySavedRef = useRef<(post: PublicFeedPost) => Promise<void>>(
    async () => undefined,
  )
  const autoReplayRef = useRef(false)

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

  const respiratory = useMemo(() => {
    if (!result || !source) return null
    const series =
      result.suppression.gated.length > 24
        ? result.suppression.gated
        : result.motion.global
    return estimateShownBreath(
      series,
      source.sampleRateHz,
      result.motion.global,
      faceGreenSeries(source.roiRgb),
      source.roiRgb,
    )
  }, [result, source])

  const beats = useMemo(() => {
    if (!result || !source) return null
    const series =
      result.suppression.gated.length > 24
        ? result.suppression.gated
        : result.candidate
    return heartRateFromPeaks(series, source.sampleRateHz)
  }, [result, source])

  const heartBpm = shownHeartRate(result?.gatedBpm, beats)
  const hrv = useMemo(
    () => (beats ? hrvFromBeats(beats, result?.gatedBpm) : null),
    [beats, result],
  )

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

  // Leaving the scan page ends the server-side scan session too.
  useEffect(() => () => resetScanSave(), [])

  // A desktop without a camera can replay a feed clip that still has video.
  useEffect(() => {
    const action = searchParams.get('action')
    let live = true
    listPublicFeed()
      .then((posts) => {
        if (!live) return
        const clips = posts.filter((post) => post.hasVideo)
        setSavedPosts(clips)
        if (action || autoReplayRef.current) return
        const first = clips[0]
        if (!first) return
        autoReplayRef.current = true
        void replaySavedRef.current(first)
      })
      .catch(() => {
        if (live) setSavedPosts([])
      })
    return () => {
      live = false
    }
  }, [searchParams])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => {
      if (capturing || liveEstimating) return
      if (!Number.isFinite(video.duration) || video.duration <= 0) return
      setScrub(video.currentTime / video.duration)
    }
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [capturing, liveEstimating])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !hasVideo || stage !== 'done' || capturing || liveEstimating) {
      return
    }
    video.loop = true
    void video.play().catch(() => undefined)
  }, [hasVideo, stage, capturing, liveEstimating, activeSessionId])

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
    captureGenRef.current += 1
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    }
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop())
    webcamStreamRef.current = null
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null
    }
    setCapturing(false)
    setCaptureLeft(null)
    hatPromptRef.current = false
    hatReasonRef.current = null
    setHatPrompt(false)
    setHatReason(null)
    hatSkipRef.current = false
    clockArmedRef.current = false
  }

  function stopRecorder(rec: MediaRecorder | null, chunks: Blob[]): Promise<Blob | null> {
    if (!rec) return Promise.resolve(null)
    const mime = rec.mimeType || 'video/webm'
    if (rec.state === 'inactive') {
      return Promise.resolve(chunks.length ? new Blob(chunks, { type: mime }) : null)
    }
    return new Promise((resolve) => {
      rec.addEventListener(
        'stop',
        () => {
          resolve(chunks.length ? new Blob(chunks, { type: mime }) : null)
        },
        { once: true },
      )
      try {
        rec.stop()
      } catch {
        resolve(chunks.length ? new Blob(chunks, { type: mime }) : null)
      }
    })
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
    webcamTakesRef.current = 0
    webcamBlobsRef.current.clear()
    setAnotherForId(null)
    resetScanSave()
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
      ? estimateShownBreath(
          pipeline.suppression.gated.length > 24
            ? pipeline.suppression.gated
            : pipeline.motion.global,
          buffer.sampleRateHz,
          pipeline.motion.global,
          faceGreenSeries(buffer.roiRgb),
          buffer.roiRgb,
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
    saveSettledClip({
      source: 'sample',
      pipeline,
      settledBpm: pipeline?.gatedBpm ?? null,
      respiratoryBpm: breath ? breath.breathsPerMin : null,
      riskLevel: risk?.level ?? null,
      signalLabel: risk?.label ?? null,
      durationSec: buffer.frames.length / buffer.sampleRateHz,
      fps: buffer.sampleRateHz,
      width: null,
      height: null,
      thumbnail: entry.thumbnail,
    })
  }

  function showHatPrompt(on: boolean, reason: HatBlockReason | null = null) {
    const nextReason = on ? reason : null
    hatPromptRef.current = on
    hatReasonRef.current = nextReason
    setHatPrompt(on)
    setHatReason(nextReason)
  }

  function requestWebcam() {
    if (capturing || busy) return
    setError(null)
    showHatPrompt(false)
    hatSkipRef.current = false
    void handleInputMode('webcam')
  }

  function recheckHat() {
    hatStreakResetRef.current = true
    showHatPrompt(false)
    setStatus('Checking the forehead again…')
  }

  function skipHatCheck() {
    hatSkipRef.current = true
    showHatPrompt(false)
  }

  async function handleInputMode(mode: InputMode) {
    showHatPrompt(false)
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
      blurPx: 0,
      sizePx: 320,
      quality: 0.82,
    })
    if (data) {
      thumbCapturedRef.current = true
      thumbRef.current = data
      setThumbnailData(data)
    }
  }

  async function finishWebcamCapture(gen: number) {
    if (gen !== captureGenRef.current) return
    captureGenRef.current += 1
    const token = captureGenRef.current
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0

    const rec = recorderRef.current
    recorderRef.current = null
    const chunks = recordChunksRef.current
    const blob = await stopRecorder(rec, chunks)
    if (token !== captureGenRef.current) return

    const video = videoRef.current
    const width = video?.videoWidth || null
    const height = video?.videoHeight || null
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop())
    webcamStreamRef.current = null
    if (video?.srcObject) video.srcObject = null

    setCapturing(false)
    setCaptureLeft(null)
    setLiveEstimating(false)
    setBusy(false)

    const buffer = liveRef.current
    if (!buffer || buffer.frames.length < 16) {
      liveRef.current = null
      setLive(null)
      setDurationSec(0)
      setStage('idle')
      setShowStory(false)
      setHasVideo(false)
      setError(
        'Not enough of your face in those 10 seconds. Stay centered and try once more.',
      )
      setStatus('10 second capture ended before a pulse could be estimated.')
      setAnotherForId('retry')
      return
    }

    let pipeline: PipelineResult | null = null
    try {
      pipeline = runPipeline({
        frames: buffer.frames,
        roiRgb: buffer.roiRgb,
        sampleRateHz: buffer.sampleRateHz,
        controls: controlsRef.current,
      })
    } catch (e) {
      console.error(e)
    }
    const riskLabel = pipeline
      ? conflictRiskLabel(pipeline.conflict.combined)
      : null
    const series = pipeline
      ? pipeline.suppression.gated.length > 24
        ? pipeline.suppression.gated
        : pipeline.motion.global
      : []
    const breath = pipeline
      ? estimateShownBreath(
          series,
          buffer.sampleRateHz,
          pipeline.motion.global,
          faceGreenSeries(buffer.roiRgb),
          buffer.roiRgb,
        )
      : null
    const durationSec = buffer.frames.length / buffer.sampleRateHz
    const take = webcamTakesRef.current + 1
    webcamTakesRef.current = take
    const id = newId()

    let objectUrl: string | null = null
    if (blob && blob.size > 0) {
      objectUrl = URL.createObjectURL(blob)
      ownedUrlsRef.current.add(objectUrl)
      webcamBlobsRef.current.set(id, blob)
    }

    if (video && objectUrl) {
      video.src = objectUrl
      video.muted = true
      setHasVideo(true)
      void video.play().catch(() => undefined)
    }

    setLive(buffer)
    setDurationSec(durationSec)
    setScrub(1)
    setShowStory(true)
    setStage('done')
    setStageDetail(undefined)
    setThumbnailData(thumbRef.current)
    setError(null)
    setAnotherForId(take === 1 ? id : null)
    const bpm = pipeline?.gatedBpm
    setStatus(
      bpm != null
        ? `10 second capture saved — ${bpm.toFixed(0)} BPM${
            breath ? `, ${breath.breathsPerMin.toFixed(0)} breaths/min` : ''
          }${take === 1 ? '. Try one more?' : '.'}`
        : '10 second capture saved.',
    )

    const entry: SessionRun = {
      id,
      name: `Webcam ${take}`,
      status: 'done',
      source: 'webcam',
      bpm: bpm ?? null,
      riskLevel: riskLabel?.level ?? null,
      riskScore: pipeline?.conflict.combined ?? null,
      thumbnail: thumbRef.current,
      respiratoryBpm: breath ? breath.breathsPerMin : null,
      at: Date.now(),
      durationSec,
      objectUrl,
      buffer,
    }
    setSessionRuns((prev) => [...prev, entry].slice(-SESSION_MAX))
    setActiveSessionId(id)
    appliedSessionIdRef.current = id
    if (bpm != null) setSharePromptId(id)

    saveSettledClip({
      source: 'webcam',
      pipeline,
      settledBpm: bpm ?? null,
      respiratoryBpm: breath ? breath.breathsPerMin : null,
      riskLevel: riskLabel?.level ?? null,
      signalLabel: riskLabel?.label ?? null,
      durationSec,
      fps: buffer.sampleRateHz,
      width,
      height,
      thumbnail: thumbRef.current,
    })
  }

  function requestStopCapture() {
    if (!capturing || captureLeft == null) return
    void finishWebcamCapture(captureGenRef.current)
  }

  async function startWebcam() {
    stopWebcam()
    setCapturing(true)
    setAnotherForId(null)
    setBusy(true)
    setError(null)
    setShowStory(false)
    setStage('finding_face')
    setStageDetail('Asking for camera access…')
    setStatus('Asking for camera access…')
    thumbCapturedRef.current = false
    thumbRef.current = null
    setThumbnailData(null)
    try {
      await getFaceLandmarker()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      })
      if (inputModeRef.current !== 'webcam') {
        stream.getTracks().forEach((t) => t.stop())
        setCapturing(false)
        setBusy(false)
        return
      }
      // Let the mode-change effect stop any previous camera before we keep this one.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (inputModeRef.current !== 'webcam') {
        stream.getTracks().forEach((t) => t.stop())
        setCapturing(false)
        setBusy(false)
        return
      }
      const gen = ++captureGenRef.current
      webcamStreamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element missing')
      video.removeAttribute('src')
      video.srcObject = stream
      await video.play()
      if (gen !== captureGenRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      setHasVideo(true)
      setDurationSec(0)
      setCapturing(true)

      const empty = {
        frames: [] as LiveBuffer['frames'],
        roiRgb: emptyRoiRgb(),
        sampleRateHz: 15,
      }
      liveRef.current = empty
      setLive(empty)
      setStage('estimating_pulse')
      setStageDetail('Keep your face centered for 10 seconds')
      setLiveEstimating(true)
      setBusy(false)
      captureStartedAtRef.current = 0
      clockArmedRef.current = false
      hatSkipRef.current = false
      setCaptureLeft(null)
      showHatPrompt(false)
      recordChunksRef.current = []
      setStatus('Camera is on. Hold still.')

      const armClock = () => {
        if (clockArmedRef.current || gen !== captureGenRef.current) return
        clockArmedRef.current = true
        showHatPrompt(false)
        captureStartedAtRef.current = performance.now()
        setCaptureLeft(10)
        liveRef.current = empty
        setLive(empty)
        setDurationSec(0)
        const mime =
          typeof MediaRecorder !== 'undefined'
            ? preferredRecorderMime((type) => MediaRecorder.isTypeSupported(type))
            : null
        if (mime) {
          try {
            const rec = new MediaRecorder(stream, {
              mimeType: mime,
              videoBitsPerSecond: 450_000,
            })
            rec.ondataavailable = (event) => {
              if (event.data.size > 0) recordChunksRef.current.push(event.data)
            }
            rec.start(200)
            recorderRef.current = rec
          } catch (e) {
            console.error(e)
          }
        }
      }

      let coveredStreak = 0
      let clearStreak = 0
      let noFaceFrames = 0
      let hatWhileRecording = 0

      const tick = async (ts: number) => {
        if (gen !== captureGenRef.current || !webcamStreamRef.current) return
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
        if (!clockArmedRef.current) {
          if (hatStreakResetRef.current) {
            coveredStreak = 0
            clearStreak = 0
            noFaceFrames = 0
            hatStreakResetRef.current = false
          }
          try {
            const landmarks = await detectVideoFrame(v, ts)
            if (gen !== captureGenRef.current) return
            let covered: boolean | null = null
            if (landmarks) {
              canvas.width = v.videoWidth
              canvas.height = v.videoHeight
              const ctx = canvas.getContext('2d', { willReadFrequently: true })
              if (ctx) {
                ctx.drawImage(v, 0, 0)
                covered = foreheadCoveredInFrame(
                  ctx.getImageData(0, 0, canvas.width, canvas.height).data,
                  canvas.width,
                  canvas.height,
                  landmarks,
                )
              }
              setLive({
                frames: [landmarks],
                roiRgb: emptyRoiRgb(),
                sampleRateHz: 15,
              })
            }
            const gate = nextHatGate({
              covered,
              coveredStreak,
              clearStreak,
              noFaceFrames,
              prompt: hatPromptRef.current,
              reason: hatReasonRef.current,
              skip: hatSkipRef.current,
            })
            coveredStreak = gate.coveredStreak
            clearStreak = gate.clearStreak
            noFaceFrames = gate.noFaceFrames
            if (
              gate.prompt !== hatPromptRef.current ||
              gate.reason !== hatReasonRef.current
            ) {
              showHatPrompt(gate.prompt, gate.reason)
            }
            if (gate.start) {
              armClock()
            } else if (gate.reason === 'hat') {
              setStatus('Take off your hat and try again. The scan waits for a clear forehead.')
            } else if (gate.reason === 'face') {
              setStatus('The camera cannot see your face. Take off a hat and look straight ahead.')
            } else {
              setStatus('Camera is on. Hold still.')
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Camera analysis failed')
          }
          if (!clockArmedRef.current && gen === captureGenRef.current) {
            rafRef.current = requestAnimationFrame(tick)
          } else if (clockArmedRef.current && gen === captureGenRef.current) {
            rafRef.current = requestAnimationFrame(tick)
          }
          return
        }
        const now = performance.now()
        const left = secondsLeft(
          captureRemainingMs(captureStartedAtRef.current, now),
        )
        setCaptureLeft((prev) => (prev === left ? prev : left))
        if (captureShouldStop(captureStartedAtRef.current, now)) {
          void finishWebcamCapture(gen)
          return
        }
        try {
          const landmarks = await detectVideoFrame(v, ts)
          if (gen !== captureGenRef.current) return
          if (landmarks) {
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (ctx) {
              ctx.drawImage(v, 0, 0)
              const coveredNow = foreheadCoveredInFrame(
                ctx.getImageData(0, 0, canvas.width, canvas.height).data,
                canvas.width,
                canvas.height,
                landmarks,
              )
              hatWhileRecording = coveredNow ? hatWhileRecording + 1 : 0
              if (hatWhileRecording >= HAT_COVERED_FRAMES) {
                clockArmedRef.current = false
                captureStartedAtRef.current = 0
                setCaptureLeft(null)
                const rec = recorderRef.current
                recorderRef.current = null
                if (rec && rec.state !== 'inactive') {
                  try {
                    rec.stop()
                  } catch {
                    /* already stopped */
                  }
                }
                recordChunksRef.current = []
                liveRef.current = empty
                setLive(empty)
                hatWhileRecording = 0
                coveredStreak = HAT_COVERED_FRAMES
                clearStreak = 0
                showHatPrompt(true, 'hat')
                setStatus('Take off your hat and try again. The scan waits for a clear forehead.')
                rafRef.current = requestAnimationFrame(tick)
                return
              }
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
              const prev = liveRef.current
              const frames = [...(prev?.frames ?? []), landmarks].slice(-200)
              const nextRgb = emptyRoiRgb()
              for (const id of ROI_IDS) {
                nextRgb[id] = [...(prev?.roiRgb[id] ?? []), ...roiRgb[id]].slice(
                  -200,
                )
              }
              const next: LiveBuffer = {
                frames,
                roiRgb: nextRgb,
                sampleRateHz: 15,
              }
              liveRef.current = next
              setLive(next)
              maybeCaptureThumb(canvas, landmarks)
              setDurationSec(frames.length / 15)
              setScrub(1)
              setStatus(
                frames.length >= 16
                  ? `Recording — ${left}s left. Keep your face centered.`
                  : `Recording — ${left}s left. Looking for your face…`,
              )
            }
          } else {
            setStatus(`No face yet — ${left}s left. Center your face.`)
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Camera analysis failed')
        }
        if (gen === captureGenRef.current) {
          rafRef.current = requestAnimationFrame(tick)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setBusy(false)
      setCapturing(false)
      setCaptureLeft(null)
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
    width: number
    height: number
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
    setAnalyzePct(0)
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
          setAnalyzePct(pct)
          setStageDetail(`Reading clip… ${Math.round(pct * 100)}%`)
        },
        onPartial: (partial, meta) => {
          if (activeSessionIdRef.current !== clipId) return
          setLive(partial)
          const lastMs = partial.timestampsMs[partial.timestampsMs.length - 1] ?? 0
          const frac =
            durationSec > 0 ? Math.min(1, Math.max(0, lastMs / 1000 / durationSec)) : 1
          setScrub(frac)
          const preview = videoRef.current
          if (preview && Number.isFinite(preview.duration) && preview.duration > 0) {
            const target = Math.min(preview.duration, Math.max(0, lastMs / 1000))
            if (Math.abs(preview.currentTime - target) > 0.08) preview.currentTime = target
          }
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
              blurPx: 0,
              sizePx: 320,
              quality: 0.82,
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
        width: optimized.width,
        height: optimized.height,
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not analyze that video'
      setError(message)
      setStatus('Upload failed — try another clip, or load the sample.')
      setLive(null)
      setLiveEstimating(false)
      setAnalyzePct(null)
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
      setAnalyzePct(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function enqueueFiles(
    files: FileList | File[],
    opts?: { persist?: boolean },
  ) {
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
    await drainUploadQueue(opts?.persist !== false)
  }

  async function replaySaved(post: PublicFeedPost) {
    setReplayId(post.id)
    setError(null)
    setStatus(`Loading ${post.nickname?.trim() || 'a saved scan'}…`)
    try {
      const res = await fetch(feedVideoUrl(post.id))
      if (!res.ok) throw new Error('Could not load that saved video.')
      const blob = await res.blob()
      const file = new File(
        [blob],
        `${post.nickname?.trim() || 'saved'}.mp4`,
        { type: blob.type || post.videoMime || 'video/mp4' },
      )
      await enqueueFiles([file], { persist: false })
    } catch (e) {
      setReplayId(null)
      setError(
        e instanceof Error ? e.message : 'Could not play that saved scan.',
      )
    }
  }
  replaySavedRef.current = replaySaved

  async function drainUploadQueue(persist = true) {
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
          const {
            pipeline,
            thumbnail,
            fps,
            buffer,
            objectUrl,
            durationSec,
            width,
            height,
          } = outcome
          const riskLabel = conflictRiskLabel(pipeline.conflict.combined)
          const series =
            pipeline.suppression.gated.length > 24
              ? pipeline.suppression.gated
              : pipeline.motion.global
          const breath = estimateShownBreath(
            series,
            fps,
            pipeline.motion.global,
            faceGreenSeries(buffer.roiRgb),
            buffer.roiRgb,
          )
          if (persist) {
            saveSettledClip({
              source: 'upload',
              pipeline,
              settledBpm: pipeline.gatedBpm,
              respiratoryBpm: breath ? breath.breathsPerMin : null,
              riskLevel: riskLabel.level,
              signalLabel: riskLabel.label,
              durationSec,
              fps,
              width,
              height,
              thumbnail,
            })
          }
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
          if (persist) setSharePromptId(clipId)
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
  const faceSpots: Record<(typeof ROI_IDS)[number], SpotGlow> | null = result
    ? {
        forehead: {
          quality: result.reliability.quality.forehead ?? 0,
          motion: result.reliability.motion.forehead ?? 0,
          weight: result.reliability.weights.forehead ?? 0,
        },
        leftCheek: {
          quality: result.reliability.quality.leftCheek ?? 0,
          motion: result.reliability.motion.leftCheek ?? 0,
          weight: result.reliability.weights.leftCheek ?? 0,
        },
        rightCheek: {
          quality: result.reliability.quality.rightCheek ?? 0,
          motion: result.reliability.motion.rightCheek ?? 0,
          weight: result.reliability.weights.rightCheek ?? 0,
        },
        lowerFace: {
          quality: result.reliability.quality.lowerFace ?? 0,
          motion: result.reliability.motion.lowerFace ?? 0,
          weight: result.reliability.weights.lowerFace ?? 0,
        },
      }
    : null
  const scanProgress =
    capturing && captureLeft != null
      ? (10 - captureLeft) / 10
      : liveEstimating
        ? (analyzePct ?? 0)
        : source
          ? scrub
          : null
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
      <SiteNav primaryCta={{ label: c('cta.scan'), to: '/scan' }} />

      <main className="scan-page" id="monitor">
        <section className="scan-studio">
          <header className="scan-studio-head">
            <p className="scan-kicker">Face video</p>
            <h1>Scan</h1>
            <p className="scan-lede">
              Ten seconds of a face, scaled to a one minute rate.
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
        <AnalysisProgress
          stage={stage}
          detail={stageDetail}
          fraction={
            stage === 'estimating_pulse'
              ? analyzePct
              : stage === 'finding_face'
                ? 0.4
                : stage === 'optimizing'
                  ? 0.16
                  : null
          }
        />
        {queueLeft > 0 ? (
          <p className="scan-alerts queue-banner" role="status">
            {queueLeft} clip{queueLeft === 1 ? '' : 's'} left in the session queue…
          </p>
        ) : null}

        <div className="scan-stage">
          {vitalsEmptyHint && (stage === 'idle' || stage === 'done') ? (
            <p className="vitals-scan-hint">{vitalsEmptyHint}</p>
          ) : null}

          <SavedScanBar
            posts={savedPosts}
            activeId={replayId}
            busy={busy || capturing}
            onPlay={(post) => void replaySaved(post)}
          />

          <div className="scan-session-frame product-frame">
            <div className="scan-desktop-board">
              <DesktopPulseRail
                heartBpm={heartBpm}
                beats={beats}
                hrv={hrv}
                respiratory={respiratory}
                liveEstimating={
                  liveEstimating ||
                  (busy && stage === 'estimating_pulse' && Boolean(result))
                }
              />
              <div className="phone-scan">
                <div className="scan-session-monitor-wrap">
                  <MonitorStage
                    videoRef={videoRef}
                    canvasRef={canvasRef}
                    landmarks={lastLandmarks}
                    inputMode={inputMode}
                    busy={busy || capturing}
                    hasVideo={hasVideo}
                    scrub={scrub}
                    onScrub={handleScrub}
                    durationSec={durationSec}
                    onUploadClick={openUploadPicker}
                    onWebcam={requestWebcam}
                    onSample={() => void handleInputMode('synthetic')}
                    onLoadDemoSet={() => void loadDemoSet()}
                    demoLoading={demoLoading}
                    status={status}
                    showCtaBar={false}
                    captureLeft={captureLeft}
                    hatPrompt={hatPrompt}
                    hatReason={hatReason}
                    onHatClear={recheckHat}
                    onHatSkip={skipHatCheck}
                    spots={faceSpots}
                    landmarkTrack={
                      source?.timestampsMs &&
                      source.timestampsMs.length === source.frames.length
                        ? { frames: source.frames, timesMs: source.timestampsMs }
                        : null
                    }
                    progress={scanProgress}
                    onStop={capturing && captureLeft != null ? requestStopCapture : null}
                  />
                </div>
                <PhoneVitals
                  heartBpm={heartBpm}
                  hrv={hrv}
                  respiratory={respiratory}
                  liveEstimating={
                    liveEstimating ||
                    (busy && stage === 'estimating_pulse' && Boolean(result))
                  }
                />
                <div className="phone-scan-actions" role="group" aria-label="Choose a video source">
                  <button
                    type="button"
                    className="cta cta-secondary"
                    onClick={openUploadPicker}
                    disabled={busy || capturing}
                  >
                    Upload
                  </button>
                  <button
                    type="button"
                    className="cta cta-secondary"
                    onClick={requestWebcam}
                    disabled={busy || capturing}
                  >
                    Webcam
                  </button>
                  <button
                    type="button"
                    className="cta cta-secondary"
                    onClick={() => void handleInputMode('synthetic')}
                    disabled={busy || capturing}
                  >
                    Sample
                  </button>
                </div>
              </div>
            </div>

            {regionWeights ? (
              <RegionTrustLines
                weights={regionWeights}
                className="scan-desktop-extra"
              />
            ) : null}

            <div className="scan-session-strip-wrap">
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
                variant="scan"
              />
            </div>
          </div>

          <div className="scan-desktop-extra">
            <VitalsScanRow
              result={result}
              scrub={scrub}
              liveEstimating={
                liveEstimating ||
                (busy && stage === 'estimating_pulse' && Boolean(result))
              }
            />
          </div>
        </div>

        <div className="scan-tools site-section-inner">
          {anotherForId && !capturing ? (
            <section className="try-again-panel">
              <h2>{anotherForId === 'retry' ? 'Try that again' : 'Try one more'}</h2>
              <p>
                {anotherForId === 'retry'
                  ? 'The camera stopped after 10 seconds, but your face was not in frame long enough to estimate a pulse.'
                  : 'That reading is saved, with the time. One more 10 second take gives you a second result.'}
              </p>
              <button
                type="button"
                className="cta cta-primary"
                onClick={requestWebcam}
              >
                Try one more
              </button>
            </section>
          ) : null}

          {hasResult && result && risk && showStory && !capturing && (
            <ShareToFeed
              key={activeSessionId ?? 'current-scan'}
              promptForId={sharePromptId}
              scanId={activeSessionId}
              onPromptDone={() => setSharePromptId(null)}
              bpm={result.gatedBpm}
              conflictScore={result.conflict.combined}
              riskLevel={risk.level}
              source={runSource}
              thumbnailData={thumbnailData}
              durationSec={durationSec}
              respiratoryRate={respiratory ? respiratory.breathsPerMin : null}
              detail={{
                motion: {
                  overall: result.motion.globalMean,
                  forehead: result.motion.localMean.forehead,
                  cheeks:
                    (result.motion.localMean.leftCheek +
                      result.motion.localMean.rightCheek) /
                    2,
                  lowerFace: result.motion.residualMean.lowerFace,
                },
                spectrum: {
                  timeSync: result.conflict.cTemp,
                  freqOverlap: result.conflict.cSpec,
                  combined: result.conflict.combined,
                },
                trust: {
                  forehead: result.reliability.weights.forehead ?? 0,
                  leftCheek: result.reliability.weights.leftCheek ?? 0,
                  rightCheek: result.reliability.weights.rightCheek ?? 0,
                  lowerFace: result.reliability.weights.lowerFace ?? 0,
                },
              }}
              videoBlob={
                activeSessionId
                  ? (webcamBlobsRef.current.get(activeSessionId) ?? null)
                  : null
              }
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
        </section>
      </main>

      <footer className="site-foot">
        {uploadName ? (
          <p className="help-line">
            Last clip: {uploadName}. Face video stays in your browser.
          </p>
        ) : null}
        <p className="site-foot-research">{c('scan.disclaimer')}</p>
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
