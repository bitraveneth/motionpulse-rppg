import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LabTabs } from '../components/LabTabs'
import { SiteNav } from '../components/SiteNav'
import { TrainHistory } from '../components/TrainHistory'

type TrainStatus = {
  state: 'idle' | 'running' | 'done' | 'error' | 'stopped'
  log: string[]
  exitCode: number | null
  path: string
  epochs: number
  subjects: number
  savedId: string | null
}

type Summary = {
  path: string
  subjects: string[]
  clips: number
  videos: number
  frameFolders: number
  notes: string[]
}

const PASSES = [1, 2, 5, 30] as const
const PEOPLE = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '5', value: 5 },
  { label: 'All', value: 0 },
] as const

const EMPTY: TrainStatus = {
  state: 'idle',
  log: [],
  exitCode: null,
  path: '',
  epochs: 0,
  subjects: 0,
  savedId: null,
}

function lineClass(line: string): string {
  if (line.startsWith('stop') || line.startsWith('error') || line.includes('Error') || line.includes('Traceback')) {
    return 'is-bad'
  }
  if (line.startsWith('done') || line.startsWith('saved')) return 'is-done'
  if (line.startsWith('epoch') || line.startsWith('windows') || line.startsWith('read')) return 'is-live'
  return ''
}

export function TrainPage() {
  const [status, setStatus] = useState<TrainStatus>(EMPTY)
  const [path, setPath] = useState('')
  const [crossPath, setCrossPath] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [note, setNote] = useState('')
  const [epochs, setEpochs] = useState<number>(2)
  const [subjects, setSubjects] = useState<number>(2)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const logRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    let stop = false
    async function tick() {
      try {
        const res = await fetch('/api/local-lab/train')
        if (!res.ok || stop) return
        const body = (await res.json()) as TrainStatus
        if (!stop) setStatus(body)
      } catch {
        /* the dev server answers on the next tick */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 1000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (status.savedId) setHistoryKey((value) => value + 1)
  }, [status.savedId])

  useEffect(() => {
    const node = logRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [status.log])

  async function chooseCross() {
    setChoosing(true)
    setNote('')
    try {
      const res = await fetch('/api/local-lab/choose-folder', { method: 'POST' })
      const body = (await res.json()) as { ok?: boolean; path?: string; reason?: string }
      if (!body.ok || !body.path) {
        setNote(body.reason === 'cancelled' ? 'Folder window closed.' : 'The folder window did not open.')
        return
      }
      if (body.path === path) {
        setNote('Pick a different folder from the one being trained.')
        return
      }
      setCrossPath(body.path)
    } catch {
      setNote('Could not open the folder window.')
    } finally {
      setChoosing(false)
    }
  }

  async function chooseFolder() {
    setChoosing(true)
    setNote('')
    setSummary(null)
    try {
      const res = await fetch('/api/local-lab/choose-folder', { method: 'POST' })
      const body = (await res.json()) as { ok?: boolean; path?: string; reason?: string }
      if (!body.ok || !body.path) {
        setNote(body.reason === 'cancelled' ? 'Folder window closed.' : 'The folder window did not open.')
        return
      }
      setPath(body.path)
      const preview = await fetch('/api/local-lab/train/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: body.path }),
      })
      const looked = (await preview.json()) as { ok?: boolean; summary?: Summary; error?: string }
      if (!looked.ok || !looked.summary) {
        setNote(looked.error || 'That folder has no pulse curve to learn from.')
        return
      }
      setSummary(looked.summary)
      if (looked.summary.clips === 0) {
        setNote('No clip in that folder has a pulse curve.')
      }
    } catch {
      setNote('Could not open the folder window.')
    } finally {
      setChoosing(false)
    }
  }

  async function start() {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/local-lab/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, epochs, subjects, crossPath: crossPath || undefined }),
      })
      const body = (await res.json()) as TrainStatus & { ok?: boolean; error?: string }
      if (body.error) setNote(body.error)
      if (body.log) setStatus(body)
    } catch {
      setNote('Training did not start.')
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    await fetch('/api/local-lab/train/stop', { method: 'POST' })
  }

  const running = status.state === 'running'
  const folderLabel = path ? path.split('/').filter(Boolean).slice(-1)[0] : ''
  const crossLabel = crossPath ? crossPath.split('/').filter(Boolean).slice(-1)[0] : ''
  const shownLog = (status.log.length > 0 ? status.log : ['Waiting for a dataset.']).filter(
    (line) => !line.startsWith('record '),
  ).slice(-8)

  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="lab-page">
        <header className="lab-intro">
          <LabTabs />
          <h1>Train PhysNet</h1>
          <p className="lab-status">A folder on this Mac. The numbers are saved. The videos stay here.</p>
        </header>

        <section className="train-composer" aria-labelledby="train-title">
          <div className="train-head">
            <h2 id="train-title">Dataset</h2>
            <p>UBFC or PURE, already unzipped.</p>
          </div>
          <div className="train-pick">
            <div className="train-field">
              <strong>{folderLabel || 'No folder yet'}</strong>
              <span>
                {summary
                  ? `${summary.clips} clip${summary.clips === 1 ? '' : 's'}${
                      summary.subjects.length > 0
                        ? ` · ${summary.subjects.slice(0, 4).join(', ')}${summary.subjects.length > 4 ? '…' : ''}`
                        : ''
                    }`
                  : 'The pulse curve has to be in the folder, not only a heart-rate number.'}
              </span>
            </div>
            <button type="button" className="cta cta-secondary" disabled={choosing || running} onClick={() => void chooseFolder()}>
              {choosing ? 'Opening…' : folderLabel ? 'Change' : 'Choose folder'}
            </button>
          </div>
          {note ? <p className="train-alert">{note}</p> : null}

          <div className="train-controls">
            <fieldset className="method-pick">
              <legend>Passes</legend>
              {PASSES.map((value) => (
                <button key={value} type="button" aria-pressed={epochs === value} disabled={running} onClick={() => setEpochs(value)}>
                  {value}
                </button>
              ))}
            </fieldset>
            <fieldset className="method-pick">
              <legend>People</legend>
              {PEOPLE.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={subjects === item.value}
                  disabled={running}
                  onClick={() => setSubjects(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="train-pick">
            <div className="train-field">
              <strong>{crossLabel || 'No second folder'}</strong>
              <span>Optional. Train here, then score every person in that other folder.</span>
            </div>
            <button
              type="button"
              className="cta cta-secondary"
              disabled={choosing || running}
              onClick={() => void chooseCross()}
            >
              {crossLabel ? 'Change test' : 'Test on another folder'}
            </button>
          </div>
          <p className="train-hint">
            First 30 seconds of each clip.{' '}
            {subjects === 0
              ? 'About one in five people are held out, and that miss is saved in BPM.'
              : 'The next person after this slice is held out, and that miss is saved in BPM.'}
          </p>

          <div className="train-footer">
            <button
              type="button"
              className="cta cta-primary train-go"
              disabled={!path || choosing || running || busy || summary?.clips === 0}
              onClick={() => void start()}
            >
              {running ? 'Training…' : 'Train PhysNet'}
            </button>
            <p>
              {epochs} pass{epochs === 1 ? '' : 'es'}
              {' · '}
              {subjects === 0 ? 'every person' : `${subjects} ${subjects === 1 ? 'person' : 'people'}`}
            </p>
            {running ? (
              <button type="button" className="cta cta-secondary" onClick={() => void stop()}>
                Stop
              </button>
            ) : null}
            {status.savedId ? <Link to={`/train-results/${status.savedId}`}>Open this run</Link> : null}
          </div>
          {status.log.length > 0 ? (
            <ol className="train-log" ref={logRef} aria-live="polite" aria-label="Training">
              {shownLog.map((line, index) => (
                <li key={`${index}-${line}`} className={lineClass(line)}>
                  {line}
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        <section className="train-history" aria-labelledby="history-title">
          <div className="train-history-head">
            <h2 id="history-title">Saved runs</h2>
            <Link to="/train-results">Full history</Link>
          </div>
          <TrainHistory key={historyKey} detail={false} />
        </section>

        <p className="train-aside">
          CHROM and POS stay on Local lab. DeeprPPG, ETA-rPPGNet, and AND-rPPG are not in this build.
        </p>
      </main>
    </>
  )
}
