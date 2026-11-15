import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgreementMetrics } from '../components/AgreementMetrics'
import { LabTabs } from '../components/LabTabs'
import { ResearchQuestions } from '../components/ResearchQuestions'
import { SiteNav } from '../components/SiteNav'
import { SubjectResultCard } from '../components/SubjectResultCard'
import type { DatasetScore, ResearchRow } from '../lib/research/answers'
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
  }))
}

function researchSets(tests: LabTestSummary[], detail: LabTestDetail): DatasetScore[] {
  const list: DatasetScore[] = []
  for (const test of tests) {
    if (list.some((item) => item.name === test.name)) continue
    list.push(
      test.id === detail.test.id
        ? { name: test.name, mae: detail.agreement.mae, count: detail.subjects.length }
        : { name: test.name, mae: test.mae, count: test.faceCount },
    )
  }
  if (!list.some((item) => item.name === detail.test.name)) {
    list.unshift({
      name: detail.test.name,
      mae: detail.agreement.mae,
      count: detail.subjects.length,
    })
  }
  return list
}

export function ResultsPage() {
  const { testId } = useParams()
  const [tests, setTests] = useState<LabTestSummary[]>([])
  const [listReady, setListReady] = useState(false)
  const [detail, setDetail] = useState<LabTestDetail | null>(null)
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
            on the feed. <Link to="/feed">Open the feed</Link>. The time is Asia/Shanghai. The
            videos stay on the machine that ran them.
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
          {detail ? (
            <>
              <p className="lab-status">
                RQ1 to RQ3 use {detail.test.name}. RQ4 compares every saved test.
              </p>
              <ResearchQuestions rows={researchRows(detail)} datasets={researchSets(tests, detail)} />
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
