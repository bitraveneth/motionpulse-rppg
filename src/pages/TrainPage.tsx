import { useEffect, useState } from 'react'
import { LabTabs } from '../components/LabTabs'
import { SiteNav } from '../components/SiteNav'
import { isLocalLabEnabled } from '../lib/lab/enabled'

type TrainStatus = {
  state: 'idle' | 'running' | 'done' | 'error' | 'stopped'
  log: string[]
  exitCode: number | null
  path: string
  epochs: number
  subjects: number
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
  { label: '1 person', value: 1 },
  { label: '2 people', value: 2 },
  { label: '5 people', value: 5 },
  { label: 'Every person', value: 0 },
] as const

const EMPTY: TrainStatus = {
  state: 'idle',
  log: [],
  exitCode: null,
  path: '',
  epochs: 0,
  subjects: 0,
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
  const enabled = isLocalLabEnabled()
  const [status, setStatus] = useState<TrainStatus>(EMPTY)
  const [path, setPath] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [note, setNote] = useState('')
  const [epochs, setEpochs] = useState<number>(2)
  const [subjects, setSubjects] = useState<number>(2)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stop = false
    async function tick() {
      try {
        const res = await fetch('/api/local-lab/train')
        if (!res.ok || stop) return
        const body = (await res.json()) as TrainStatus
        if (!stop) setStatus(body)
      } catch {
        /* the dev server will answer on the next tick */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 1000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

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
        setNote('No video or image folder in there has a pulse curve. A heart-rate number alone is not enough.')
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
        body: JSON.stringify({ path, epochs, subjects }),
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

  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="lab-page">
        <header className="lab-intro">
          <LabTabs />
          <h1>Train PhysNet on your folders</h1>
          <p className="lab-status">
            PhysNet learns the pulse curve from the face video and the contact recording in the file.
            CHROM and POS stay on Local lab. They do not need this step.
          </p>
        </header>
        {enabled ? (
          <div className="lab-sheet">
            <section className="lab-block" aria-labelledby="train-title">
              <h2 id="train-title">Dataset</h2>
              <div className="train-actions">
                <button type="button" className="cta cta-secondary" disabled={choosing || running} onClick={() => void chooseFolder()}>
                  {choosing ? 'Opening…' : 'Choose dataset'}
                </button>
                <button
                  type="button"
                  className="cta cta-primary"
                  disabled={!path || choosing || running || busy || summary?.clips === 0}
                  onClick={() => void start()}
                >
                  {running ? 'Training…' : 'Train'}
                </button>
                {running ? (
                  <button type="button" className="cta cta-secondary" onClick={() => void stop()}>
                    Stop
                  </button>
                ) : null}
              </div>
              {folderLabel ? <p className="train-path">{folderLabel}</p> : null}
              {summary ? (
                <p className="lab-status">
                  {summary.clips} clip{summary.clips === 1 ? '' : 's'} with a pulse curve
                  {summary.subjects.length > 0 ? ` · ${summary.subjects.slice(0, 8).join(', ')}` : ''}
                  {summary.subjects.length > 8 ? '…' : ''}.
                  {subjects === 0
                    ? ' The last people stay out of training so the score is honest.'
                    : subjects === 1
                      ? ' One person is learned. Nobody is held out.'
                      : ' The next person after this slice is held out.'}
                </p>
              ) : (
                <p className="lab-status">Choose the unzipped UBFC or PURE folder, then press Train.</p>
              )}
              {summary?.notes?.length ? <p className="lab-status">{summary.notes[0]}</p> : null}
              {note ? <p className="lab-status">{note}</p> : null}

              <fieldset className="method-pick train-choices">
                <legend>Passes</legend>
                {PASSES.map((value) => (
                  <button key={value} type="button" aria-pressed={epochs === value} disabled={running} onClick={() => setEpochs(value)}>
                    {value}
                  </button>
                ))}
              </fieldset>
              <fieldset className="method-pick train-choices">
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
              <p className="method-pick-note">
                Each clip uses its first 30 seconds, resized from the whole frame. The learned file is
                research/out/physnet_local.pt on this Mac. Leaving this page does not stop the run.
              </p>

              <article className="lab-term" aria-live="polite" aria-label="Training">
                <header className="lab-term-chrome">
                  <span className="lab-term-lights" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="lab-term-title">motionpulse — train</span>
                  <span className="lab-term-count">{running ? 'training' : status.state}</span>
                </header>
                <ol>
                  {(status.log.length > 0 ? status.log : ['idle  choose a folder, then press Train']).map((line, index) => (
                    <li key={`${index}-${line}`} className={lineClass(line)}>
                      {line}
                    </li>
                  ))}
                </ol>
              </article>
            </section>

            <section className="lab-block" aria-labelledby="model-title">
              <h2 id="model-title">Which model can run a dataset</h2>
              <ul className="train-models">
                <li>
                  <strong>CHROM and POS</strong>
                  <span>Local lab, press Run. Color formulas. No training. These are the two methods that score a video today.</span>
                </li>
                <li>
                  <strong>PhysNet</strong>
                  <span>This page, press Train. A 3D network that learns the pulse curve. It does not replace the Run button until a later step.</span>
                </li>
                <li>
                  <strong>DeeprPPG</strong>
                  <span>Liu and Yuen, 2020. A different deep network. It is not in this build, so it cannot run your dataset the way CHROM and POS do.</span>
                </li>
                <li>
                  <strong>ETA-rPPGNet</strong>
                  <span>Hu et al., 2021. A time-attention network. No code and no weights here, so there is no Run button for it.</span>
                </li>
                <li>
                  <strong>AND-rPPG</strong>
                  <span>Lokendra and Puneet, 2022. A denoising network. It is not a color formula, and it is not wired up.</span>
                </li>
              </ul>
            </section>
          </div>
        ) : (
          <p className="rq-wait">This lab is off in this build. Set VITE_ENABLE_LOCAL_LAB to train on a local folder.</p>
        )}
      </main>
    </>
  )
}
