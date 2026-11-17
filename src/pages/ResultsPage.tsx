import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgreementMetrics } from '../components/AgreementMetrics'
import { LabTabs } from '../components/LabTabs'
import { ResearchQuestions } from '../components/ResearchQuestions'
import { SiteNav } from '../components/SiteNav'
import { SubjectResultCard } from '../components/SubjectResultCard'
import { runIdentity, type MethodRun, type ResearchRow, type TrainedMiss } from '../lib/research/answers'
import { fetchTrainRuns, type TrainRunSummary } from '../lib/lab/trainRunApi'
import {
  fetchLabTest,
  fetchLabTests,
  formatTestWhen,
  type LabTestDetail,
  type LabTestSummary,
} from '../lib/lab/labTestApi'

function oneLine(test: LabTestSummary): string {
  const mae = test.mae == null ? 'no file heart rate yet' : `MAE ${test.mae.toFixed(1)}`
  const count = `${test.faceCount} subject${test.faceCount === 1 ? '' : 's'}`
  return `${test.name} · ${count} · ${mae}`
}

function metric(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

function researchRows(detail: LabTestDetail): ResearchRow[] {
  return detail.subjects.map((row) => ({
    cameraBpm: row.bpm,
    plainBpm: row.plainBpm,
    weightedBpm: row.weightedBpm,
    referenceBpm: row.referenceBpm,
    conflict: row.conflict,
    risk: row.risk,
    cleanedBpm: row.cleanedBpm,
  }))
}

function fullestTests(tests: LabTestSummary[]): LabTestSummary[] {
  const ordered = [...tests].sort((a, b) => b.faceCount - a.faceCount || b.createdAt.localeCompare(a.createdAt))
  const best = new Map<string, LabTestSummary>()
  for (const test of ordered) {
    const identity = runIdentity(test.name)
    const key = `${identity.dataset} ${identity.method}`
    if (!best.has(key)) best.set(key, test)
  }
  return [...best.values()]
}

function detailRun(detail: LabTestDetail): MethodRun {
  const identity = runIdentity(detail.test.name)
  return {
    dataset: identity.dataset,
    method: identity.method,
    rows: researchRows(detail),
    mae: detail.agreement.mae,
    count: detail.subjects.length,
  }
}

function trainedMisses(runs: TrainRunSummary[]): TrainedMiss[] {
  const misses: TrainedMiss[] = []
  const seen = new Set<string>()
  for (const run of runs) {
    const trainedOn = runIdentity(run.name).dataset
    if (run.heldMae != null && run.heldCount > 0) {
      const key = `held ${trainedOn}`
      if (!seen.has(key)) {
        seen.add(key)
        misses.push({
          trainedOn,
          testedOn: trainedOn,
          mae: run.heldMae,
          count: run.heldCount,
          kind: 'held out',
        })
      }
    }
    if (run.crossMae != null && run.crossCount > 0 && run.crossName) {
      const key = `cross ${trainedOn} ${run.crossName}`
      if (!seen.has(key)) {
        seen.add(key)
        misses.push({
          trainedOn,
          testedOn: run.crossName,
          mae: run.crossMae,
          count: run.crossCount,
          kind: 'other camera',
        })
      }
    }
  }
  return misses
}

export function ResultsPage() {
  const { testId } = useParams()
  const [tests, setTests] = useState<LabTestSummary[]>([])
  const [listReady, setListReady] = useState(false)
  const [detail, setDetail] = useState<LabTestDetail | null>(null)
  const [runs, setRuns] = useState<MethodRun[]>([])
  const [trained, setTrained] = useState<TrainedMiss[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetchLabTests()
      .then((rows) => {
        if (!cancel) setTests(rows)
      })
      .catch(() => {
        if (!cancel) setError('Could not load test results.')
      })
      .finally(() => {
        if (!cancel) setListReady(true)
      })
    return () => {
      cancel = true
    }
  }, [])

  const fullestKey = fullestTests(tests)
    .map((test) => test.id)
    .join(',')

  useEffect(() => {
    const ids = fullestKey ? fullestKey.split(',') : []
    if (ids.length === 0) {
      setRuns([])
      return
    }
    let cancel = false
    Promise.all(ids.map((id) => fetchLabTest(id, { brief: true })))
      .then((details) => {
        if (!cancel) setRuns(details.map(detailRun))
      })
      .catch(() => {
        if (!cancel) setError('Could not load the full runs behind the research answers.')
      })
    return () => {
      cancel = true
    }
  }, [fullestKey])

  useEffect(() => {
    let cancel = false
    fetchTrainRuns()
      .then((rows) => {
        if (!cancel) setTrained(trainedMisses(rows))
      })
      .catch(() => {
        if (!cancel) setTrained([])
      })
    return () => {
      cancel = true
    }
  }, [])

  const selected = testId || tests[0]?.id || ''

  useEffect(() => {
    if (!selected) return
    let cancel = false
    setDetail(null)
    fetchLabTest(selected)
      .then((row) => {
        if (!cancel) setDetail(row)
      })
      .catch(() => {
        if (!cancel) setError('That test is not in the database.')
      })
    return () => {
      cancel = true
    }
  }, [selected])

  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="lab-page">
        <header className="lab-intro">
          <LabTabs />
          <h1>Saved dataset runs</h1>
          <p className="lab-status">
            These rows are already in the database. Each card is one subject, and the same card is
            on the feed. The length on a card is the full video, about one minute. Eight seconds is
            one analysis window inside that video, not a shorter clip. <Link to="/feed">Open the feed</Link>.
            The time is Asia/Shanghai. The videos stay on the machine that ran them.
          </p>
        </header>
        {!listReady ? (
          <p className="rq-wait">Opening saved tests…</p>
        ) : tests.length > 0 ? (
          <section className="result-summary" aria-label="Summary of saved tests">
            <h2>Summary</h2>
            <p className="lab-status">
              {tests.length} saved test{tests.length === 1 ? '' : 's'}
              {' · '}
              {tests.reduce((sum, test) => sum + test.faceCount, 0)} subjects
              {' · '}
              {tests.reduce((sum, test) => sum + test.paired, 0)} with a file heart rate
            </p>
            <table>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Subjects</th>
                  <th>MAE</th>
                  <th>RMSE</th>
                  <th>Pearson r</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => (
                  <tr key={test.id}>
                    <td>
                      <Link to={`/results/${test.id}`}>{test.name}</Link>
                    </td>
                    <td>{test.faceCount}</td>
                    <td>{metric(test.mae)}</td>
                    <td>{metric(test.rmse)}</td>
                    <td>{metric(test.pearson, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        <section className="result-questions" aria-label="Research questions">
          <h2>Research questions</h2>
          {runs.length > 0 ? (
            <>
              <p className="lab-status">
                RQ1 to RQ3 use the fullest saved run of each method. The cards below are the test you opened.
                The written version is on <Link to="/findings">Findings</Link>.
              </p>
              <ResearchQuestions runs={runs} trained={trained} />
            </>
          ) : !listReady || selected ? (
            <p className="rq-wait">Opening the research answers…</p>
          ) : (
            <p className="rq-wait">The four answers appear when a saved test is in the database.</p>
          )}
        </section>
        {error ? (
          <p className="lab-error" role="alert">
            {error}
          </p>
        ) : null}
        {listReady && tests.length === 0 && !error ? (
          <p className="rq-wait">No saved test yet. Run a dataset in the local lab and the cards appear here.</p>
        ) : (
          <div className="result-layout">
            <ul className="result-list">
              {tests.map((test) => (
                <li key={test.id}>
                  <Link className={test.id === selected ? 'result-pick is-on' : 'result-pick'} to={`/results/${test.id}`}>
                    <time dateTime={test.createdAt}>{formatTestWhen(test.createdAt)}</time>
                    <span>{oneLine(test)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {detail ? (
              <section>
                <h2>
                  {detail.test.name}
                  <span className="result-when"> {formatTestWhen(detail.test.createdAt)}</span>
                </h2>
                <AgreementMetrics summary={detail.agreement} />
                <div className="result-grid">
                  {detail.subjects.map((row) => (
                    <SubjectResultCard key={row.id} row={row} />
                  ))}
                </div>
              </section>
            ) : selected ? (
              <p className="rq-wait">Opening that test…</p>
            ) : null}
          </div>
        )}
      </main>
    </>
  )
}
