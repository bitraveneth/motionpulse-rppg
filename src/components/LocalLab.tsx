import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  asRiskLevel,
  batchCliCommands,
  parseBatchResultsJson,
  type BatchResultsFile,
} from '../lib/lab/batchResults'
import { reliabilityFromRisk } from '../lib/feed/reliability'
import { isSupabaseConfigured, shareRun } from '../lib/feed/store'
import { ReliabilityBadge } from './ReliabilityBadge'

type Props = {
  onPublished?: () => void
}

async function fetchDevBatchResults(): Promise<BatchResultsFile | null> {
  try {
    const res = await fetch('/api/local-lab/batch-results', {
      cache: 'no-store',
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Load failed (${res.status})`)
    const json = (await res.json()) as unknown
    return parseBatchResultsJson(json)
  } catch {
    return null
  }
}

/** Dev / opt-in Local lab — datasets stay on this machine. */
export function LocalLab({ onPublished }: Props) {
  const [path, setPath] = useState('./data/UBFC')
  const [batch, setBatch] = useState<BatchResultsFile | null>(null)
  const [source, setSource] = useState<'api' | 'file' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)

  const cmds = useMemo(() => batchCliCommands(path), [path])

  const loadFromApi = useCallback(async () => {
    setError(null)
    setStatus('Looking for out/batch-results.json…')
    const file = await fetchDevBatchResults()
    if (file) {
      setBatch(file)
      setSource('api')
      setStatus(
        `Loaded ${file.results.length} row(s) from out/batch-results.json` +
          (file.generated_at ? ` · ${file.generated_at}` : ''),
      )
    } else {
      setStatus(
        'No out/batch-results.json yet (or not running Vite dev). Run the batch CLI, then Reload — or load the JSON file below.',
      )
    }
  }, [])

  useEffect(() => {
    void loadFromApi()
    const id = window.setInterval(() => {
      void loadFromApi()
    }, 12_000)
    return () => window.clearInterval(id)
  }, [loadFromApi])

  async function onPickJson(file: File | null) {
    if (!file) return
    setError(null)
    setPublishMsg(null)
    try {
      const text = await file.text()
      const parsed = parseBatchResultsJson(JSON.parse(text) as unknown)
      setBatch(parsed)
      setSource('file')
      setStatus(`Loaded ${parsed.results.length} row(s) from ${file.name}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse JSON')
    }
  }

  async function publishOnline() {
    if (!batch?.results.length) {
      setError('Nothing to publish — load batch results first.')
      return
    }
    setBusy(true)
    setError(null)
    setPublishMsg(null)
    try {
      if (!isSupabaseConfigured()) {
        // Still allow mock-feed publish so Local lab works without Supabase
        let n = 0
        for (const row of batch.results) {
          await shareRun({
            nickname: null,
            bpm: row.bpm,
            conflict_score: row.conflict_score,
            risk_level: asRiskLevel(String(row.risk_level)),
            roi_weights: row.roi_weights,
            source: 'batch',
            client_id: 'local-lab',
            sparkline: row.sparkline ?? null,
            thumbnail_data: row.thumbnail_data ?? null,
            thumbnail_url: row.thumbnail_url ?? null,
          })
          n++
        }
        setPublishMsg(
          `Saved ${n} summar${n === 1 ? 'y' : 'ies'} to the local demo feed (Supabase not configured). Set VITE_SUPABASE_* to publish live — or run: npm run publish-results`,
        )
        onPublished?.()
        return
      }

      let n = 0
      for (const row of batch.results) {
        await shareRun({
          nickname: null,
          bpm: row.bpm,
          conflict_score: row.conflict_score,
          risk_level: asRiskLevel(String(row.risk_level)),
          roi_weights: row.roi_weights,
          source: 'batch',
          client_id: 'local-lab',
          sparkline: row.sparkline ?? null,
          thumbnail_data: row.thumbnail_data ?? null,
          thumbnail_url: row.thumbnail_url ?? null,
        })
        n++
      }
      setPublishMsg(
        `Published ${n} metric summar${n === 1 ? 'y' : 'ies'} online (no video).`,
      )
      onPublished?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setBusy(false)
    }
  }

  function copyText(text: string) {
    void navigator.clipboard?.writeText(text).then(
      () => setStatus('Copied to clipboard.'),
      () => setStatus(text),
    )
  }

  return (
    <section className="local-lab" aria-label="Local lab">
      <header className="local-lab-head">
        <p className="result-story-kicker">Local lab</p>
        <h2>Batch datasets on this machine</h2>
        <p>
          Datasets (UBFC / PURE / MMPD, …) stay on your disk. The browser never
          uploads those videos. Only metric summaries — and optional tiny
          thumbs — can be published online.
        </p>
        <p className="edu-disclaimer">
          This panel is shown in development, or when{' '}
          <code>VITE_ENABLE_LOCAL_LAB=true</code>. Do not enable it on a public
          deploy if you do not want visitors pointed at multi‑GB downloads.
        </p>
      </header>

      <div className="local-lab-grid">
        <article className="local-lab-card">
          <h3>1. Download datasets</h3>
          <p>Register / agree on the official pages, then keep files under <code>./data</code> (gitignored).</p>
          <ul className="local-lab-links">
            <li>
              <a
                href="https://sites.google.com/view/ybenezeth/ubfcrppg"
                target="_blank"
                rel="noreferrer"
              >
                UBFC-rPPG
              </a>
            </li>
            <li>
              <a
                href="https://www.tu-ilmenau.de/en/university/departments/department-of-computer-science-and-automation/profile/institutes-and-groups/institute-of-computer-and-systems-engineering/group-for-neuroinformatics-and-cognitive-robotics/data-sets-code/pulse-rate-detection-dataset-pure"
                target="_blank"
                rel="noreferrer"
              >
                PURE
              </a>
            </li>
            <li>
              <a
                href="https://github.com/McJackTang/MMPD_rPPG_dataset/blob/main/MMPD_Release_Agreement.pdf"
                target="_blank"
                rel="noreferrer"
              >
                MMPD release agreement
              </a>
            </li>
          </ul>
        </article>

        <article className="local-lab-card">
          <h3>2. Run batch via CLI</h3>
          <p>
            Browsers cannot scan multi‑GB folders. Use the path field to build
            exact commands, then run them in a terminal at the repo root.
          </p>
          <label className="share-field">
            <span>Dataset folder path</span>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="./data/UBFC"
              spellCheck={false}
            />
          </label>
          <div className="local-lab-cmds">
            <pre className="local-lab-pre">{cmds.batch}</pre>
            <button
              type="button"
              className="mode-btn"
              onClick={() => copyText(cmds.batch)}
            >
              Copy batch
            </button>
            <pre className="local-lab-pre">{cmds.publish}</pre>
            <button
              type="button"
              className="mode-btn"
              onClick={() => copyText(cmds.publish)}
            >
              Copy publish
            </button>
          </div>
        </article>

        <article className="local-lab-card local-lab-card-wide">
          <h3>3. Last batch results</h3>
          <p>
            Vite dev serves <code>out/batch-results.json</code> at{' '}
            <code>/api/local-lab/batch-results</code>. Or load the file manually.
          </p>
          <div className="feed-toolbar">
            <button
              type="button"
              className="mode-btn"
              onClick={() => void loadFromApi()}
            >
              Reload
            </button>
            <label className="mode-btn local-lab-file-btn">
              Load JSON…
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  void onPickJson(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
            </label>
            {source && (
              <span className="feed-mode-pill">
                {source === 'api' ? 'from out/' : 'from file'}
              </span>
            )}
          </div>
          {status && <p className="help-line">{status}</p>}
          {error && (
            <p className="share-err" role="alert">
              {error}
            </p>
          )}

          {batch && batch.results.length > 0 ? (
            <div className="local-lab-table-wrap">
              <table className="local-lab-table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>BPM</th>
                    <th>Risk</th>
                    <th>Reliability</th>
                    <th>Analysis</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.results.slice(0, 100).map((row) => {
                    const level = asRiskLevel(String(row.risk_level))
                    const remark = reliabilityFromRisk(level)
                    return (
                      <tr key={row.id}>
                        <td className="local-lab-path" title={row.path}>
                          {row.path || row.id}
                        </td>
                        <td className="tabular-nums">{row.bpm.toFixed(1)}</td>
                        <td className="tabular-nums">
                          {level} · {row.conflict_score.toFixed(2)}
                        </td>
                        <td>
                          <ReliabilityBadge remark={remark} />
                        </td>
                        <td>{row.analysis ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {batch.results.length > 100 && (
                <p className="help-line">
                  Showing first 100 of {batch.results.length} rows.
                </p>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <p>No batch results loaded</p>
              <p>Run the CLI, then Reload — or pick out/batch-results.json.</p>
            </div>
          )}
        </article>

        <article className="local-lab-card local-lab-card-wide">
          <h3>4. Publish summaries online</h3>
          <p>
            Posts BPM, risk, ROI weights, and optional thumb/sparkline fields
            only — never videos. Works with the local demo feed when Supabase
            keys are missing (same as Share to feed).
          </p>
          <p className="help-line">
            Feed mode:{' '}
            {isSupabaseConfigured()
              ? 'Supabase (live)'
              : 'localStorage mock — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY for live publish, or use npm run publish-results'}
          </p>
          <button
            type="button"
            className="cta cta-primary"
            disabled={busy || !batch?.results.length}
            onClick={() => void publishOnline()}
          >
            {busy ? 'Publishing…' : 'Publish summaries online'}
          </button>
          {publishMsg && <p className="share-ok">{publishMsg}</p>}
        </article>
      </div>
    </section>
  )
}
