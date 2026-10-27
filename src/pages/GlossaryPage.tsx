import { SiteNav } from '../components/SiteNav'
import { useContent } from '../lib/content'

const ENTRIES: { short: string; name: string; body: string }[] = [
  {
    short: 'bpm',
    name: 'Beats per minute',
    body: 'Heart beats counted in the usable seconds of the clip, then scaled to 60 seconds. Eight intervals in 6 seconds is 80 bpm.',
  },
  {
    short: 'BVP',
    name: 'Blood volume pulse',
    body: 'The tiny color change in the skin that rises and falls with each heartbeat.',
  },
  {
    short: 'rPPG',
    name: 'Remote photoplethysmography',
    body: 'Reading that pulse from a camera, instead of a clip on the finger.',
  },
  {
    short: 'RR',
    name: 'Respiratory rate',
    body: 'Breaths per minute. The same scaling as heart rate: gaps between breaths, times 60, divided by the seconds those gaps cover.',
  },
  {
    short: 'HRV',
    name: 'Heart rate variability',
    body: 'How much the gap between beats changes. A 10 second clip can only support a short reading, not a 5 minute clinical test.',
  },
  {
    short: 'RMSSD',
    name: 'Root mean square of successive differences',
    body: 'The HRV number on the scan, in milliseconds. It needs at least 8 beats whose spacing agrees with the pulse rate.',
  },
  {
    short: 'ROI',
    name: 'Region of interest',
    body: 'The face box the camera measures. Forehead and cheeks carry the pulse. The room around the face stays in view.',
  },
  {
    short: 'PTT',
    name: 'Pulse transit time',
    body: 'The delay between the pulse at two places on the body. Blood-pressure papers use it. This camera has one view, so it does not report blood pressure.',
  },
]

/** Plain-language list of the short forms used on the scan. */
export function GlossaryPage() {
  const c = useContent()
  return (
    <>
      <SiteNav primaryCta={{ label: c('cta.scan'), to: '/scan' }} />
      <main className="glossary-page">
        <header className="glossary-head">
          <p className="scan-kicker">Reference</p>
          <h1>Glossary</h1>
          <p>
            Short forms from the scan, in plain language. These readings are for
            learning. They are not a medical device.
          </p>
        </header>
        <dl className="glossary-list">
          {ENTRIES.map((entry) => (
            <div key={entry.short} className="glossary-item">
              <dt>
                <span>{entry.short}</span>
                {entry.name}
              </dt>
              <dd>{entry.body}</dd>
            </div>
          ))}
        </dl>
      </main>
    </>
  )
}
