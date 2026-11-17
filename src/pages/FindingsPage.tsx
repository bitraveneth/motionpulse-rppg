import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgreementPlots } from '../components/AgreementPlots'
import { LabTabs } from '../components/LabTabs'
import { SiteNav } from '../components/SiteNav'
import {
  researchReport,
  runIdentity,
  type MethodRun,
  type ResearchReport,
  type ResearchRow,
  type ResearchVerdict,
  type TrainedMiss,
} from '../lib/research/answers'
import { comparisonSummary } from '../lib/research/comparison'
import { fetchTrainRuns, type TrainRunSummary } from '../lib/lab/trainRunApi'
import {
  fetchLabTest,
  fetchLabTests,
  type LabTestDetail,
  type LabTestSummary,
} from '../lib/lab/labTestApi'

const VERDICT: Record<ResearchVerdict, string> = {
  yes: 'Yes',
  no: 'No',
  partial: 'Partly',
  wait: 'Not yet',
}

function bpm(value: number | null | undefined, digits = 1): string {
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
        misses.push({ trainedOn, testedOn: trainedOn, mae: run.heldMae, count: run.heldCount, kind: 'held out' })
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

function rq1Rows(lines: string[]): { name: string; r: string; videos: string }[] {
  return lines.flatMap((line) => {
    const match = line.match(/^(.*) · r = ([-\d.]+) on (\d+) videos$/)
    if (!match) return []
    return [{ name: match[1]!, r: match[2]!, videos: match[3]! }]
  })
}

type ClipLength = { dataset: string; seconds: number; windows: number; videos: number }

function clipLengths(details: LabTestDetail[]): ClipLength[] {
  const grouped = new Map<string, ClipLength>()
  for (const detail of details) {
    const dataset = runIdentity(detail.test.name).dataset
    if (grouped.has(dataset) || detail.subjects.length === 0) continue
    const seconds = detail.subjects.reduce((sum, row) => sum + row.durationSec, 0) / detail.subjects.length
    const windows = detail.subjects.reduce((sum, row) => sum + row.windows, 0) / detail.subjects.length
    grouped.set(dataset, { dataset, seconds, windows, videos: detail.subjects.length })
  }
  return [...grouped.values()].sort((a, b) => a.dataset.localeCompare(b.dataset))
}

function Formula({ label, lines }: { label: string; lines: string[] }) {
  return (
    <p className="findings-eq">
      <span className="findings-eq-label">{label}</span>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </p>
  )
}

function ratesMatch(report: ResearchReport): boolean {
  return (
    report.rq3.pairs.length > 0 &&
    report.rq3.pairs.every((pair) => Math.abs(pair.left - pair.right) < 0.05)
  )
}

export function FindingsPage() {
  const [runs, setRuns] = useState<MethodRun[]>([])
  const [lengths, setLengths] = useState<ClipLength[]>([])
  const [trained, setTrained] = useState<TrainedMiss[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetchLabTests()
      .then((tests) => Promise.all(fullestTests(tests).map((test) => fetchLabTest(test.id, { brief: true }))))
      .then((details) => {
        if (!cancel) {
          setRuns(details.map(detailRun))
          setLengths(clipLengths(details))
        }
      })
      .catch(() => {
        if (!cancel) setError('Could not load the saved runs.')
      })
      .finally(() => {
        if (!cancel) setReady(true)
      })
    return () => {
      cancel = true
    }
  }, [])

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

  const report = researchReport(runs, trained)
  const agreement = runs
    .map((run) => {
      const pairs = run.rows.flatMap((row) =>
        row.referenceBpm == null ? [] : [{ estimate: row.cameraBpm, reference: row.referenceBpm }],
      )
      return { name: `${run.dataset} ${run.method}`, summary: comparisonSummary(pairs) }
    })
    .filter((row) => row.summary.n > 0)
  const rq1 = rq1Rows(report.rq1.lines)
  const trainedLines = report.rq4.lines.filter((line) => line.startsWith('PhysNet'))
  const closest = agreement.reduce<(typeof agreement)[number] | null>((best, row) => {
    if (row.summary.mae == null) return best
    if (best == null || best.summary.mae == null || row.summary.mae < best.summary.mae) return row
    return best
  }, null)

  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="lab-page">
        <header className="lab-intro">
          <LabTabs />
          <h1>What the saved runs show</h1>
          <p>
            These paragraphs are the fullest saved run of each method. The charts are on{' '}
            <Link to="/results">Test results</Link>. The videos stay on the machine that ran them.
          </p>
        </header>

        {error ? (
          <p className="lab-error" role="alert">
            {error}
          </p>
        ) : null}

        <section className="result-summary findings-copy" aria-labelledby="findings-method">
          <h2 id="findings-method">How the heart rate was measured</h2>
          <p>
            Each video is read at 15 frames per second, from the first frame to the last. The face is split
            into the forehead, the left cheek, the right cheek, and the lower face. CHROM and POS each turn
            that color into a pulse. Inside the video, the pulse is read in windows of 8 seconds, and the
            window steps forward by 1 second until the video ends. Only frequencies from 0.7 Hz to 4.0 Hz
            are kept. The heart rate of one window is the strongest frequency in that band, times 60. The
            rate saved for a video is the average of those windows.
          </p>
          {lengths.length > 0 ? (
            <p>
              Eight seconds is the length of one window, not the length of the clip.{' '}
              {lengths
                .map(
                  (row) =>
                    `${row.dataset} averages ${row.seconds.toFixed(0)} seconds, about ${row.windows.toFixed(0)} windows, across ${row.videos} videos`,
                )
                .join('. ')}
              .
            </p>
          ) : null}
          <p>
            The equal mix gives the four regions the same weight. Trust weighting gives more weight to a
            region whose spectrum looks like a pulse and whose motion is small. The conflict score says how
            much the pulse trace resembles face motion, from 0 to 1. The stored score is the score of the
            last window. A video is hard when that score is 0.5 or higher.
          </p>
          <p>
            A soft gate scales the pulse trace down when conflict is high. The scale changes the height of
            the trace. It leaves the strongest frequency where it is, so the heart rate in beats per minute
            stays the same. The plain rate is the rate before that scale. The motion-aware rate is the rate
            after it.
          </p>
          <p>
            The miss is the average of |camera − file|, in BPM. The file rate comes from the UBFC-rPPG
            ground-truth file or the PURE pulse file. The public PURE release has 60 videos. This page
            reports the videos that were saved.
          </p>
        </section>

        <section className="result-summary findings-copy" aria-labelledby="findings-math">
          <h2 id="findings-math">Mathematics</h2>
          <p>These are the expressions behind the tables. The camera rate is ŷ and the file rate is y.</p>
          <Formula
            label="Heart rate of one window"
            lines={['BPM = 60 · f*', 'f* is the strongest frequency between 0.7 Hz and 4.0 Hz']}
          />
          <Formula label="Rate saved for a video" lines={['ŷ = mean of the window rates']} />
          <Formula
            label="Equal mix of the four regions"
            lines={['R̄(t) = (Rforehead + Rleft + Rright + Rlower) / 4', 'Green and blue use the same average.']}
          />
          <Formula
            label="CHROM"
            lines={[
              'X = 3R′ − 2G′',
              'Y = 1.5R′ + G′ − 1.5B′',
              'α = σ(X) / σ(Y)',
              'S(t) = X − αY',
            ]}
          />
          <Formula
            label="POS"
            lines={[
              'Cr = R′ − 1,  Cg = G′ − 1,  Cb = B′ − 1',
              'S1 = Cg − Cb',
              'S2 = −2Cr + Cg + Cb',
              'α = σ(S1) / σ(S2)',
              'S(t) = S1 + α S2',
            ]}
          />
          <Formula
            label="Conflict and the gate"
            lines={[
              'C = 0.5 Ctemp + 0.5 Cspec',
              'gain = (1 − C) · (1 − 0.15) + 0.15',
              'Sgated(t) = gain · S(t)',
            ]}
          />
          <p>
            Ctemp is the strongest correlation between face motion and the pulse, allowing a lead or lag of
            half a second. Cspec is how much their spectra overlap inside the pulse band. A hard video has
            C ≥ 0.5. The gain is one positive number for the whole window, so it changes the height of S and
            leaves f* where it is.
          </p>
          <Formula
            label="Trust weight of a region"
            lines={[
              'Ri = 1 / (1 + exp(−4 (Qi − Mi)))',
              'wi = Ri / (Rforehead + Rleft + Rright + Rlower)',
            ]}
          />
          <p>Qi is how pulse-like that region’s spectrum is. Mi is its motion compared with the busiest region.</p>
          <Formula
            label="Miss, RMSE, and correlation"
            lines={[
              'MAE = (1 / n) Σ |ŷᵢ − yᵢ|',
              'RMSE = √( (1 / n) Σ (ŷᵢ − yᵢ)² )',
              'r = Σ (ŷᵢ − mean ŷ)(yᵢ − mean y) / √( Σ (ŷᵢ − mean ŷ)² · Σ (yᵢ − mean y)² )',
            ]}
          />
        </section>

        {!ready ? (
          <p className="rq-wait">Opening the saved runs…</p>
        ) : runs.length === 0 ? (
          <p className="rq-wait">The written findings appear when a saved test is in the database.</p>
        ) : (
          <>
            <section className="result-summary findings-copy" aria-labelledby="findings-agreement">
              <h2 id="findings-agreement">Agreement on all saved videos</h2>
              <p>
                {closest
                  ? `${closest.name} is the closest run, with a miss of ${bpm(closest.summary.mae)} BPM.`
                  : 'The miss is the average gap between the camera rate and the file heart rate.'}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Videos</th>
                    <th>MAE</th>
                    <th>RMSE</th>
                    <th>Pearson r</th>
                    <th>Bias</th>
                  </tr>
                </thead>
                <tbody>
                  {agreement.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.summary.n}</td>
                      <td>{bpm(row.summary.mae)}</td>
                      <td>{bpm(row.summary.rmse)}</td>
                      <td>{bpm(row.summary.pearson, 2)}</td>
                      <td>{bpm(row.summary.bias)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="result-summary findings-copy" aria-labelledby="findings-plots">
              <h2 id="findings-plots">Agreement plots</h2>
              <p>
                Each run has the three plots used to judge a heart-rate estimate. The diagonal is where the
                camera rate equals the file rate. Bland–Altman draws the mean difference and the band
                mean ± 1.96 standard deviations. The bars count videos by the size of the miss.
              </p>
              {agreement.map((row) => (
                <AgreementPlots key={row.name} name={row.name} summary={row.summary} />
              ))}
            </section>

            <section className="result-summary findings-copy" aria-labelledby="findings-rq1">
              <header className="findings-head">
                <h2 id="findings-rq1">RQ1. Does the conflict score track the real error?</h2>
                <p className={`rq-answer rq-answer-${report.rq1.verdict}`}>{VERDICT[report.rq1.verdict]}</p>
              </header>
              <p>
                {report.rq1.sentence} The number is Pearson r between the stored conflict score and the
                absolute miss. A value near zero means the score does not tell you how large the miss will be.
              </p>
              {rq1.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Videos</th>
                      <th>r</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rq1.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{row.videos}</td>
                        <td>{row.r}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>

            <section className="result-summary findings-copy" aria-labelledby="findings-rq2">
              <header className="findings-head">
                <h2 id="findings-rq2">RQ2. Does trust weighting help?</h2>
                <p className={`rq-answer rq-answer-${report.rq2.verdict}`}>{VERDICT[report.rq2.verdict]}</p>
              </header>
              <p>{report.rq2.sentence} A lower number is a closer heart rate.</p>
              {report.rq2.pairs.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Videos</th>
                      <th>Equal mix</th>
                      <th>Trust weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rq2.pairs.map((pair) => (
                      <tr key={pair.name}>
                        <td>{pair.name}</td>
                        <td>{pair.detail.replace(' videos', '')}</td>
                        <td>{bpm(pair.left)}</td>
                        <td>{bpm(pair.right)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>

            <section className="result-summary findings-copy" aria-labelledby="findings-rq3">
              <header className="findings-head">
                <h2 id="findings-rq3">RQ3. Does the motion-aware rate win when motion is hard?</h2>
                <p className={`rq-answer rq-answer-${report.rq3.verdict}`}>{VERDICT[report.rq3.verdict]}</p>
              </header>
              <p>{report.rq3.sentence}</p>
              {ratesMatch(report) ? (
                <p>
                  The two columns match. The gate scales the pulse trace and leaves the strongest frequency
                  in place, so the heart rate in BPM does not move. The score still marks which videos are hard.
                </p>
              ) : null}
              {report.rq3.pairs.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Scope</th>
                      <th>{report.rq3.leftLabel}</th>
                      <th>{report.rq3.rightLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rq3.pairs.map((pair) => (
                      <tr key={`${pair.name}-${pair.detail}`}>
                        <td>{pair.name}</td>
                        <td>{pair.detail}</td>
                        <td>{bpm(pair.left)}</td>
                        <td>{bpm(pair.right)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>

            <section className="result-summary findings-copy" aria-labelledby="findings-rq4">
              <header className="findings-head">
                <h2 id="findings-rq4">RQ4. Does the same method hold on a second camera?</h2>
                <p className={`rq-answer rq-answer-${report.rq4.verdict}`}>{VERDICT[report.rq4.verdict]}</p>
              </header>
              <p>{report.rq4.sentence}</p>
              {report.rq4.sets.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Videos</th>
                      <th>MAE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rq4.sets.map((set) => (
                      <tr key={set.name}>
                        <td>{set.name}</td>
                        <td>{set.count}</td>
                        <td>{bpm(set.mae)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {trainedLines.length > 0 ? (
                <ul className="rq-lines">
                  {trainedLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          </>
        )}
      </main>
    </>
  )
}
