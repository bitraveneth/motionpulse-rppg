import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { captureFaceThumbnail } from '../lib/feed/cardMedia'
import {
  asRiskLevel,
  type BatchResultRow,
  type BatchResultsFile,
} from '../lib/lab/batchResults'
import { readingsFromBuffer } from '../lib/lab/clipReading'
import type { DatasetClip } from '../lib/lab/datasetFolder'
import { datasetLabel, type LabSubjectInput } from '../lib/lab/labSubject'
import {
  fetchLabTests,
  formatTestWhen,
  storeLabSubject,
  type LabSubjectRecord,
  type LabTestSummary,
} from '../lib/lab/labTestApi'
import { comparisonSummary, type ComparisonSummary } from '../lib/research/comparison'
import type { DatasetScore, ResearchRow } from '../lib/research/answers'
import { CANDIDATE_METHODS, type CandidateMethod } from '../lib/rppg/types'
import { streamAnalyzeImages, streamAnalyzeVideo, type AnalysisBuffer } from '../lib/video/streamAnalyze'
import { AgreementMetrics, Tip } from './AgreementMetrics'
import { ResearchQuestions } from './ResearchQuestions'
import { SignalChip } from './SignalChip'
import { SubjectResultCard } from './SubjectResultCard'

const REFERENCE_KEY = 'mp-lab-references'

function readStoredReferences(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REFERENCE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function shownReference(row: BatchResultRow, typed: Record<string, string>): string {
  if (Object.prototype.hasOwnProperty.call(typed, row.id)) return typed[row.id] ?? ''
  return row.referenceBpm != null ? String(row.referenceBpm) : ''
}

function referenceNumber(row: BatchResultRow, typed: Record<string, string>): number | null {
  const text = shownReference(row, typed).trim()
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function resultLine(
  folder: string,
  method: CandidateMethod,
  bpm: number,
  reference: number | null,
  windows: number,
  snr: number | null,
): string {
  const file = reference == null ? 'file —' : `file ${reference.toFixed(1)}`
  const snrText = snr == null ? '' : `  snr ${snr.toFixed(1)}`
  return `${folder}  ${method}  ${windows} x 8s  camera ${bpm.toFixed(1)}  ${file}${snrText}`
}

function chosenMethods(current: CandidateMethod[], method: CandidateMethod): CandidateMethod[] {
  const next = current.includes(method)
    ? current.filter((item) => item !== method)
    : [...current, method]
  return CANDIDATE_METHODS.filter((item) => next.includes(item))
}

function researchFromSubject(row: LabSubjectRecord): ResearchRow {
  return {
    cameraBpm: row.bpm,
    plainBpm: row.plainBpm,
    weightedBpm: row.weightedBpm,
    referenceBpm: row.referenceBpm,
    conflict: row.conflict,
    risk: row.risk,
  }
}

function termClass(line: string): string {
  if (line.startsWith('error') || line.startsWith('stop') || line.includes('  error')) return 'is-bad'
  if (line.startsWith('done')) return 'is-done'
  if (line.startsWith('methods')) return 'is-method'
  if (line.includes('  face ')) return 'is-live'
  if (line.startsWith('feed')) return 'is-feed'
  if (line.startsWith('ready') || line.startsWith('labels')) return 'is-ready'
  return ''
}

type ClipProgress = { done: number; total: number; current: string; face: number }

function loadPlayable(video: HTMLVideoElement, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup()
      resolve()
    }
    const bad = () => {
      cleanup()
      reject(new Error('The browser could not play that video'))
    }
    const cleanup = () => {
      video.removeEventListener('loadeddata', ok)
      video.removeEventListener('error', bad)
    }
    video.addEventListener('loadeddata', ok)
    video.addEventListener('error', bad)
    video.src = src
    video.load()
  })
}

/** Dataset folder, batch runs, and the four research checks. Videos stay on disk. */
export function LocalLab({ slot }: { slot: HTMLElement | null }) {
  const [path, setPath] = useState('')
  const [batch, setBatch] = useState<BatchResultsFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [references, setReferences] = useState<Record<string, string>>(readStoredReferences)
  const [liveCards, setLiveCards] = useState<LabSubjectRecord[]>([])
  const [savedTests, setSavedTests] = useState<LabTestSummary[]>([])
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [steps, setSteps] = useState<string[]>([])
  const [methods, setMethods] = useState<CandidateMethod[]>(['CHROM'])
  const [choosing, setChoosing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [clipProgress, setClipProgress] = useState<ClipProgress>({ done: 0, total: 0, current: '', face: 0 })
  const [awayResult, setAwayResult] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const termRef = useRef<HTMLOListElement>(null)
  const runRef = useRef(0)
  const clockRef = useRef(1)
  const testIdsRef = useRef<Partial<Record<CandidateMethod, string>>>({})
  const onLabRef = useRef(false)
  onLabRef.current = slot != null
  const agreement = useMemo(() => {
    const pairs = (batch?.results ?? []).flatMap((row) => {
      const reference = referenceNumber(row, references)
      return reference == null ? [] : [{ estimate: row.bpm, reference }]
    })
    const snrs = (batch?.results ?? []).flatMap((row) =>
      row.snr != null && Number.isFinite(row.snr) ? [row.snr] : [],
    )
    return comparisonSummary(pairs, snrs)
  }, [batch, references])

  useEffect(() => {
    localStorage.setItem(REFERENCE_KEY, JSON.stringify(references))
  }, [references])

  useEffect(() => {
    fetchLabTests()
      .then(setSavedTests)
      .catch(() => setSavedTests([]))
  }, [])

  useEffect(() => {
    if (slot) setAwayResult(false)
  }, [slot])

  useEffect(() => {
    const node = termRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [steps, slot])
  const researchGroups = useMemo((): { method: CandidateMethod | null; rows: ResearchRow[] }[] => {
    if (liveCards.length > 0) {
      const present = CANDIDATE_METHODS.filter((method) => liveCards.some((row) => row.method === method))
      const names = present.length > 0 ? present : (['CHROM'] as const)
      return names.map((method) => ({
        method,
        rows: liveCards.filter((row) => row.method === method).map(researchFromSubject),
      }))
    }
    return [
      {
        method: null,
        rows: (batch?.results ?? []).map((row) => ({
          cameraBpm: row.bpm,
          plainBpm: null,
          weightedBpm: null,
          referenceBpm: referenceNumber(row, references),
          conflict: row.conflict_score,
          risk: String(row.risk_level),
        })),
      },
    ]
  }, [liveCards, batch, references])
  const datasets = useMemo((): DatasetScore[] => {
    const byName = new Map<string, DatasetScore>()
    for (const test of savedTests) {
      if (!byName.has(test.name)) {
        byName.set(test.name, { name: test.name, mae: test.mae, count: test.faceCount })
      }
    }
    if (path && liveCards.length > 0) {
      for (const method of CANDIDATE_METHODS) {
        const subset = liveCards.filter((row) => row.method === method)
        if (subset.length === 0) continue
        const name = `${datasetLabel(path)} · ${method}`
        const gaps = subset.flatMap((row) =>
          row.referenceBpm == null ? [] : [Math.abs(row.bpm - row.referenceBpm)],
        )
        const mae = gaps.length === 0 ? null : gaps.reduce((sum, value) => sum + value, 0) / gaps.length
        byName.set(name, { name, mae, count: subset.length })
      }
    }
    return [...byName.values()]
  }, [savedTests, path, liveCards])
  const summaries = useMemo((): { method: CandidateMethod | null; summary: ComparisonSummary }[] => {
    const results = batch?.results ?? []
    const present = CANDIDATE_METHODS.filter((method) =>
      results.some((row) => (row.method ?? 'CHROM') === method),
    )
    if (present.length <= 1) return [{ method: present[0] ?? null, summary: agreement }]
    return present.map((method) => {
      const rows = results.filter((row) => (row.method ?? 'CHROM') === method)
      const pairs = rows.flatMap((row) => {
        const reference = referenceNumber(row, references)
        return reference == null ? [] : [{ estimate: row.bpm, reference }]
      })
      const snrs = rows.flatMap((row) => (row.snr != null && Number.isFinite(row.snr) ? [row.snr] : []))
      return { method, summary: comparisonSummary(pairs, snrs) }
    })
  }, [agreement, batch, references])
  async function chooseFolder() {
    setChoosing(true)
    setError(null)
    setSteps(['open  folder window'])
    try {
      const res = await fetch('/api/local-lab/choose-folder', { method: 'POST' })
      const json = (await res.json()) as { ok?: boolean; path?: string; reason?: string }
      if (!json.ok || !json.path) {
        setPath('')
        setSteps(['load  cancelled'])
        return
      }
      setPath(json.path)
      setSteps([`load  ${json.path}`, 'press Run'])
    } catch {
      setError('The folder window did not open. The local server has to be the one on this Mac.')
      setSteps(['The folder window did not open.'])
    } finally {
      setChoosing(false)
    }
  }

  function trace(line: string, live = false) {
    setSteps((prev) => {
      const last = prev[prev.length - 1]
      if (live && last?.includes('  face ')) return [...prev.slice(0, -1), line]
      return [...prev, line]
    })
  }

  async function captureClip(
    clip: DatasetClip,
    runId: number,
  ): Promise<{ buffer: AnalysisBuffer; thumb: string | null }> {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) throw new Error('The player is not ready')
    const label = clip.referenceBpm == null ? 'label —' : `label ${clip.referenceBpm.toFixed(1)} BPM`
    trace(`${clip.folder}  ${label}`)
    const offset = clockRef.current
    let lastPct = -1
    let thumb: string | null = null
    const onProgress = (pct: number) => {
      if (runRef.current !== runId) return
      const shown = Math.round(pct * 100)
        if (shown === lastPct) return
        lastPct = shown
        trace(`${clip.folder}  face ${shown}%`, true)
        setClipProgress((prev) => ({ ...prev, current: clip.folder, face: shown }))
    }
    const onFace = ({ landmarks }: { landmarks: Parameters<typeof captureFaceThumbnail>[1] }) => {
      if (thumb) return
      thumb = captureFaceThumbnail(canvas, landmarks)
    }
    if (clip.kind === 'frames') {
      trace(`${clip.folder}  frames  ${clip.sourceFps ?? 30} fps`)
      const listedRes = await fetch('/api/local-lab/frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: clip.file, fps: clip.sourceFps ?? 30 }),
      })
      const listed = (await listedRes.json()) as { ok?: boolean; files?: string[]; fps?: number; error?: string }
      if (runRef.current !== runId) throw new Error('stopped')
      if (!listed.ok || !listed.files?.length) {
        throw new Error(listed.error || 'Could not open that frame folder')
      }
      const sampleFps = listed.fps && listed.fps > 1 ? listed.fps : 15
      trace(`${clip.folder}  face 0%`, true)
      const buffer = await streamAnalyzeImages(
        listed.files.map((file) => `/api/local-lab/frame?file=${encodeURIComponent(file)}`),
        canvas,
        { sampleFps, timestampOffsetMs: offset, onProgress, onFace },
      )
      if (thumb) trace(`${clip.folder}  thumb  face`)
      clockRef.current = offset + Math.round((listed.files.length * 1000) / sampleFps) + 1000
      return { buffer, thumb }
    }
    trace(`${clip.folder}  prepare 15 fps`)
    const prep = await fetch('/api/local-lab/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: clip.file }),
    })
    const prepared = (await prep.json()) as { ok?: boolean; id?: string; error?: string }
    if (runRef.current !== runId) throw new Error('stopped')
    if (!prepared.ok || !prepared.id) {
      throw new Error(prepared.error || 'Could not open that video')
    }
    await loadPlayable(video, `/api/local-lab/media?id=${encodeURIComponent(prepared.id)}`)
    if (runRef.current !== runId) throw new Error('stopped')
    trace(`${clip.folder}  face 0%`, true)
    const buffer = await streamAnalyzeVideo(video, canvas, {
      targetFps: 15,
      timestampOffsetMs: offset,
      onProgress,
      onFace,
    })
    if (thumb) trace(`${clip.folder}  thumb  face`)
    clockRef.current = offset + Math.round((video.duration || 0) * 1000) + 1000
    return { buffer, thumb }
  }

  function scoreClip(
    clip: DatasetClip,
    buffer: AnalysisBuffer,
    thumb: string | null,
    method: CandidateMethod,
  ): { row: BatchResultRow; windows: number; subject: LabSubjectInput } {
    const reading = readingsFromBuffer(buffer, method)
    const subject: LabSubjectInput = {
      subject: datasetLabel(clip.folder),
      bpm: reading.bpm,
      plainBpm: reading.plainBpm,
      weightedBpm: reading.weightedBpm,
      referenceBpm: clip.referenceBpm,
      snr: reading.snr,
      durationSec: reading.durationSec,
      respiratoryRate: reading.respiratoryRate,
      breathsInClip: reading.breathsInClip,
      risk: reading.risk,
      conflict: reading.conflict,
      windows: reading.windows,
      frames: buffer.frames.length,
      method,
      thumb,
      detail: reading.detail,
    }
    return {
      windows: reading.windows,
      subject,
      row: {
        id: `${clip.path}:${method}`,
        path: clip.path,
        subject: clip.folder,
        source: 'batch',
        analysis: 'face',
        bpm: reading.bpm,
        conflict_score: reading.conflict,
        risk_level: reading.risk,
        roi_weights: reading.weights,
        sample_rate_hz: buffer.sampleRateHz,
        frames: buffer.frames.length,
        referenceBpm: clip.referenceBpm,
        snr: reading.snr,
        method,
      },
    }
  }

  async function startFolder() {
    if (!path || starting || methods.length === 0) return
    const runId = runRef.current + 1
    const chosen = methods
    runRef.current = runId
    testIdsRef.current = {}
    setLiveCards([])
    setSaveNote(null)
    setStarting(true)
    setError(null)
    setSteps([`load  ${path}`])
    try {
      const res = await fetch('/api/local-lab/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const json = (await res.json()) as {
        steps?: string[]
        report?: { ok?: boolean; clips?: DatasetClip[]; reason?: string }
      }
      if (runRef.current !== runId) return
      const inventory = json.steps?.length ? json.steps : ['The folder could not be read.']
      const clips = json.report?.clips ?? []
      const methodLine = `methods  ${chosen.join('  ')}  ${CANDIDATE_METHODS.length} available: ${CANDIDATE_METHODS.join(' ')}`
      setSteps([
        ...inventory,
        methodLine,
        'keep  this browser window  other pages leave the run going',
      ])
      setClipProgress({ done: 0, total: clips.length, current: '', face: 0 })
      if (!json.report?.ok || clips.length === 0) return
      setBatch(null)
      const rows: BatchResultRow[] = []
      let faces = 0
      let posted = 0
      let missed = 0
      let openFails = 0
      let stopped = false
      for (let index = 0; index < clips.length; index += 1) {
        const clip = clips[index]!
        if (runRef.current !== runId) return
        setClipProgress({ done: index, total: clips.length, current: clip.folder, face: 0 })
        try {
          const captured = await captureClip(clip, runId)
          if (runRef.current !== runId) return
          openFails = 0
          faces += 1
          for (const method of chosen) {
            if (runRef.current !== runId) return
            const { row, windows, subject } = scoreClip(clip, captured.buffer, captured.thumb, method)
            rows.push(row)
            try {
              const saved = await storeLabSubject({
                id: testIdsRef.current[method] ?? null,
                name: datasetLabel(path),
                subject,
              })
              if (runRef.current !== runId) return
              testIdsRef.current[method] = saved.id
              if (saved.posted) {
                posted += 1
                trace(`feed  ${clip.folder}  ${method}`)
              } else {
                setSaveNote('The card is saved. It did not reach the feed.')
                trace(`feed  failed  ${clip.folder}  ${method}`)
              }
              setLiveCards((prev) => [
                ...prev,
                { ...subject, id: saved.subjectId, createdAt: new Date().toISOString() },
              ])
            } catch {
              if (runRef.current !== runId) return
              setSaveNote('The heart rate was measured. The database did not keep the latest card.')
            }
            setBatch({
              root: path,
              count: rows.length,
              synthetic_proxy: 0,
              note: 'Face algorithm on this Mac. The source files stayed in the folder.',
              results: [...rows],
            })
            trace(resultLine(clip.folder, method, row.bpm, row.referenceBpm ?? null, windows, row.snr ?? null))
          }
        } catch (error) {
          if (runRef.current !== runId) return
          const message = error instanceof Error ? error.message : 'Could not read that clip'
          if (message === 'stopped') return
          const openFailed = /not a video|Could not open|could not play|frame folder|enough images/i.test(message)
          if (openFailed) openFails += 1
          else missed += 1
          trace(`${clip.folder}  error  ${message}`)
          if (openFails >= 2) {
            stopped = true
            setSteps((prev) => [
              ...prev,
              'stop  clips could not be opened  check the drive',
            ])
            break
          }
        } finally {
          if (runRef.current === runId) {
            setClipProgress((prev) => ({ ...prev, done: index + 1, current: clip.folder, face: 0 }))
          }
        }
      }
      if (runRef.current !== runId || stopped) return
      fetchLabTests()
        .then(setSavedTests)
        .catch(() => undefined)
      setSteps((prev) => [
        ...prev,
        `done  face ${faces}  ${chosen.join(' ')}  missed ${missed}  feed ${posted}`,
      ])
    } catch {
      if (runRef.current !== runId) return
      setError('Could not read that folder.')
      setSteps(['Could not read that folder.'])
    } finally {
      if (runRef.current === runId) {
        setStarting(false)
        if (!onLabRef.current) setAwayResult(true)
      }
    }
  }

  const sheet = (
    <div className="lab-sheet">
      <section className="lab-block" aria-labelledby="lab-path-title">
        <h2 id="lab-path-title">
          Dataset
          <Tip label="Manual" mark="M" text="docs/manual-dataset-lab.md" />
        </h2>
        <div className="lab-fields lab-fields-folder">
          <button type="button" className="cta cta-secondary" disabled={choosing || starting} onClick={() => void chooseFolder()}>
            {choosing ? 'Opening…' : 'Load dataset'}
          </button>
          <button
            type="button"
            className="cta cta-primary"
            disabled={!path || choosing || starting || methods.length === 0}
            onClick={() => void startFolder()}
          >
            {starting ? 'Running…' : 'Run'}
          </button>
        </div>
        <fieldset className="method-pick">
          <legend>Method</legend>
          {CANDIDATE_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              aria-pressed={methods.includes(method)}
              disabled={starting}
              onClick={() => setMethods((current) => chosenMethods(current, method))}
            >
              {method}
            </button>
          ))}
          <p className="method-pick-note">
            {CANDIDATE_METHODS.length} methods: {CANDIDATE_METHODS.join(', ')}. Choose one, or run them
            together. The face is read once. Opening the feed or the results does not stop a run.
            Leave the Scan page alone until it finishes. Closing this browser tab stops it.
          </p>
        </fieldset>
        <article className="lab-term" aria-live="polite" aria-label="Dataset run">
          <header className="lab-term-chrome">
            <span className="lab-term-lights" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="lab-term-title">motionpulse — dataset</span>
            <span className="lab-term-count">
              {clipProgress.total > 0 ? `${clipProgress.done} / ${clipProgress.total}` : 'idle'}
            </span>
          </header>
          <div className="lab-term-meter" aria-hidden>
            <span
              style={{
                width: `${
                  clipProgress.total === 0
                    ? 0
                    : Math.min(100, ((clipProgress.done + clipProgress.face / 100) / clipProgress.total) * 100)
                }%`,
              }}
            />
          </div>
          <ol ref={termRef}>
            {steps.map((step, index) => (
              <li key={index} className={termClass(step)}>
                {step}
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="lab-block" aria-labelledby="lab-runs-title">
        <h2 id="lab-runs-title">Validation</h2>
        <p className="lab-status">
          MAE, RMSE, Pearson r, SNR, and Bland–Altman. They score the camera heart rate against the file heart rate.
          {batch && batch.results.length > 0
            ? ' Pearson r and the Bland–Altman limits need two videos.'
            : ' Press Run.'}
        </p>
        {summaries.map((item) => (
          <div key={item.method ?? 'run'}>
            {summaries.length > 1 && item.method ? <h3 className="lab-method-title">{item.method}</h3> : null}
            <AgreementMetrics summary={item.summary} />
          </div>
        ))}
        {error ? (
          <p className="lab-error" role="alert">
            {error}
          </p>
        ) : null}

        {batch && batch.results.length > 0 ? (
          <div className="lab-table-wrap">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Method</th>
                  <th>Estimated</th>
                  <th>Reference</th>
                  <th>Error</th>
                  <th>SNR</th>
                  <th>Conflict</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {batch.results.slice(0, 100).map((row) => {
                  const level = asRiskLevel(String(row.risk_level))
                  const reference = referenceNumber(row, references)
                  const error = reference == null ? null : Math.abs(row.bpm - reference)
                  return (
                    <tr key={row.id}>
                      <td className="lab-path" title={row.path}>
                        {row.path || row.id}
                      </td>
                      <td>{row.method ?? 'CHROM'}</td>
                      <td>{row.bpm.toFixed(1)}</td>
                      <td>
                        <input
                          className="lab-ref"
                          type="number"
                          min={20}
                          max={260}
                          step={0.1}
                          aria-label={`Reference BPM for ${row.path || row.id}`}
                          value={shownReference(row, references)}
                          placeholder="BPM"
                          onChange={(event) =>
                            setReferences((prev) => ({ ...prev, [row.id]: event.target.value }))
                          }
                        />
                      </td>
                      <td>{error == null ? '—' : error.toFixed(1)}</td>
                      <td>{row.snr == null ? '—' : row.snr.toFixed(1)}</td>
                      <td>{row.conflict_score.toFixed(2)}</td>
                      <td>
                        <SignalChip level={level} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {batch.results.length > 100 ? (
              <p className="lab-status">Showing the first 100 of {batch.results.length} runs.</p>
            ) : null}
          </div>
        ) : null}
        {batch && (batch.root?.includes('mp-batch-demo') || batch.synthetic_proxy) ? (
          <p className="lab-practice">Practice clip{batch.root ? ` · ${batch.root}` : ''}</p>
        ) : null}
        {batch && batch.results.length === 0 ? (
          <p className="rq-wait">That summary has no clips.</p>
        ) : null}

      </section>

      <section className="lab-block" aria-labelledby="lab-history-title">
        <h2 id="lab-history-title">
          Test results
          <Tip
            label="Test results"
            text="Each subject card, with its face still, is stored and posted on the feed. The video stays in the folder."
          />
        </h2>
        {saveNote ? <p className="lab-status">{saveNote}</p> : null}
        {liveCards.length > 0 ? (
          <div className="result-grid">
            {liveCards.map((row) => (
              <SubjectResultCard key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <p className="lab-status">Cards appear here as each subject finishes, with the time they were measured.</p>
        )}
        {savedTests.length > 0 ? (
          <ul className="result-list">
            {savedTests.slice(0, 8).map((test) => (
              <li key={test.id}>
                <Link className="result-pick" to={`/results/${test.id}`}>
                  <time dateTime={test.createdAt}>{formatTestWhen(test.createdAt)}</time>
                  <span>
                    {test.name} · {test.faceCount} subject{test.faceCount === 1 ? '' : 's'}
                    {test.mae == null ? '' : ` · MAE ${test.mae.toFixed(1)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="lab-sources">
          <Link to="/results">Open the full test history</Link>
        </p>
      </section>

      <section aria-labelledby="lab-rq-title">
        <h2 id="lab-rq-title">Research questions</h2>
        {researchGroups.map((group) => (
          <div key={group.method ?? 'run'}>
            {researchGroups.length > 1 && group.method ? (
              <h3 className="lab-method-title">{group.method}</h3>
            ) : null}
            <ResearchQuestions
              rows={group.rows}
              datasets={
                group.method
                  ? datasets.filter((item) => {
                      if (item.name.endsWith(' · POS')) return group.method === 'POS'
                      if (item.name.endsWith(' · CHROM')) return group.method === 'CHROM'
                      return group.method === 'CHROM'
                    })
                  : datasets
              }
            />
          </div>
        ))}
      </section>
    </div>
  )
  const lastLine = steps.at(-1) ?? ''
  const dockTitle = path ? datasetLabel(path) : 'Dataset'
  return (
    <>
      <video ref={videoRef} className="lab-decode" muted playsInline preload="auto" />
      <canvas ref={canvasRef} className="lab-decode" />
      {slot ? createPortal(sheet, slot) : <div className="lab-parked" hidden>{sheet}</div>}
      {!slot && (starting || awayResult) ? (
        <aside className="lab-dock" aria-live="polite">
          <span className={starting ? 'lab-dock-dot is-on' : 'lab-dock-dot'} aria-hidden />
          <div className="lab-dock-copy">
            <p className="lab-dock-kicker">{starting ? 'Still measuring' : 'Run finished'}</p>
            <p className="lab-dock-title">
              {dockTitle}
              {methods.length > 0 ? ` · ${methods.join(' ')}` : ''}
              {clipProgress.total > 0 ? ` · ${clipProgress.done} of ${clipProgress.total}` : ''}
            </p>
            <p className="lab-dock-line">{lastLine}</p>
          </div>
          <Link className="lab-dock-open" to="/local-lab">
            Open the lab
          </Link>
        </aside>
      ) : null}
    </>
  )
}
