import { clampClipIndex, nextClipIndex } from '../lib/session/clipNav'
import type { SessionRun } from './SessionStrip'

type Props = {
  clips: SessionRun[]
  activeId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

/**
 * One-at-a-time clip navigator under the main preview:
 * prev/next, index slider, dots, and a tiny filmstrip.
 * Hidden when there is only one (or zero) clip.
 */
export function SessionBrowser({
  clips,
  activeId,
  onSelect,
  disabled = false,
}: Props) {
  if (clips.length <= 1) return null

  const found = clips.findIndex((c) => c.id === activeId)
  const index = clampClipIndex(found < 0 ? 0 : found, clips.length)
  const current = clips[index]!
  const atStart = index <= 0
  const atEnd = index >= clips.length - 1

  function go(delta: number) {
    const next = nextClipIndex(index, clips.length, delta)
    const clip = clips[next]
    if (clip) onSelect(clip.id)
  }

  return (
    <section
      className={`session-browser ${disabled ? 'is-disabled' : ''}`}
      aria-label="Browse session clips"
    >
      <div className="session-browser-head">
        <p className="session-browser-label">
          Session clips · one at a time
        </p>
        <p className="session-browser-count tabular-nums">
          Clip {index + 1} of {clips.length}
          <span className="session-browser-name"> · {current.name}</span>
        </p>
      </div>

      <div className="session-browser-nav">
        <button
          type="button"
          className="session-nav-btn"
          onClick={() => go(-1)}
          disabled={disabled || atStart}
          aria-label="Previous clip"
        >
          ‹ Prev
        </button>

        <div className="session-browser-slider-wrap">
          <label className="sr-only" htmlFor="session-clip-slider">
            Session clip
          </label>
          <input
            id="session-clip-slider"
            className="session-clip-slider"
            type="range"
            min={0}
            max={clips.length - 1}
            step={1}
            value={index}
            disabled={disabled}
            onChange={(e) => {
              const clip = clips[Number(e.target.value)]
              if (clip) onSelect(clip.id)
            }}
            aria-valuetext={`Clip ${index + 1} of ${clips.length}: ${current.name}`}
          />
          <div className="session-dots" role="tablist" aria-label="Clips">
            {clips.map((clip, i) => (
              <button
                key={clip.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`session-dot status-${clip.status} ${i === index ? 'is-active' : ''}`}
                disabled={disabled}
                onClick={() => onSelect(clip.id)}
                title={dotTitle(clip, i)}
                aria-label={dotTitle(clip, i)}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          className="session-nav-btn"
          onClick={() => go(1)}
          disabled={disabled || atEnd}
          aria-label="Next clip"
        >
          Next ›
        </button>
      </div>

      <ul className="session-filmstrip" aria-label="Clip filmstrip">
        {clips.map((clip, i) => (
          <li key={clip.id}>
            <button
              type="button"
              className={`session-film ${i === index ? 'is-active' : ''} status-${clip.status}`}
              disabled={disabled}
              onClick={() => onSelect(clip.id)}
              aria-current={i === index ? 'true' : undefined}
              title={dotTitle(clip, i)}
            >
              {clip.thumbnail ? (
                <img src={clip.thumbnail} alt="" width={48} height={48} />
              ) : (
                <span className="session-film-ph" aria-hidden>
                  {statusGlyph(clip.status)}
                </span>
              )}
              <span className="session-film-idx tabular-nums">{i + 1}</span>
            </button>
          </li>
        ))}
      </ul>

      {(current.status === 'queued' ||
        current.status === 'analyzing' ||
        current.status === 'error') && (
        <p className="session-browser-pending" role="status">
          {pendingCopy(current)}
        </p>
      )}
    </section>
  )
}

function statusGlyph(status: SessionRun['status']) {
  if (status === 'analyzing') return '…'
  if (status === 'queued') return '○'
  if (status === 'error') return '!'
  return '·'
}

function dotTitle(clip: SessionRun, index: number) {
  const state =
    clip.status === 'done'
      ? clip.bpm != null
        ? `${clip.bpm.toFixed(0)} BPM`
        : 'done'
      : clip.status
  return `Clip ${index + 1}: ${clip.name} (${state})`
}

function pendingCopy(clip: SessionRun) {
  if (clip.status === 'analyzing') {
    return `Analyzing “${clip.name}”… vitals appear when this clip finishes.`
  }
  if (clip.status === 'queued') {
    return `“${clip.name}” is queued — switch back after it finishes, or wait here.`
  }
  return clip.errorMessage
    ? `Could not analyze “${clip.name}”: ${clip.errorMessage}`
    : `“${clip.name}” failed — try another clip.`
}
