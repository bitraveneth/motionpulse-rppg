import type { CandidateMethod } from '../lib/rppg/types'

type Props = {
  open: boolean
  selected: CandidateMethod
  onSelect: (method: CandidateMethod) => void
  onCancel: () => void
}

const OPTIONS: {
  method: CandidateMethod
  title: string
  blurb: string
}[] = [
  {
    method: 'CHROM',
    title: 'CHROM',
    blurb: 'Classic default. Works well in steady light.',
  },
  {
    method: 'POS',
    title: 'POS',
    blurb: 'Often steadier when light or motion shifts.',
  },
]

/** Short chooser before webcam starts — pick CHROM or POS. */
export function MethodChooser({ open, selected, onSelect, onCancel }: Props) {
  if (!open) return null

  return (
    <div className="share-modal" role="presentation" onClick={onCancel}>
      <div
        className="share-modal-card method-chooser-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="method-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="method-chooser-title">Choose pulse method</h2>
        <p className="share-modal-lead">
          Webcam will record for 10 seconds with the method you pick.
        </p>
        <div className="method-chooser-options" role="list">
          {OPTIONS.map((option) => {
            const active = selected === option.method
            return (
              <button
                key={option.method}
                type="button"
                role="listitem"
                className={`method-chooser-option${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onSelect(option.method)}
              >
                <span className="method-chooser-option-title">{option.title}</span>
                <span className="method-chooser-option-blurb">{option.blurb}</span>
              </button>
            )
          })}
        </div>
        <div className="share-modal-actions">
          <button type="button" className="cta cta-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
