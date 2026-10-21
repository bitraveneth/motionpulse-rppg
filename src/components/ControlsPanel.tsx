import type { CandidateMethod, DemoControls } from '../lib/rppg/types'

export type InputMode = 'synthetic' | 'upload' | 'webcam'

type Props = {
  controls: DemoControls
  onChange: (next: DemoControls) => void
  inputMode: InputMode
  onInputMode: (mode: InputMode) => void
  onUpload: (file: File) => void
  status: string
  busy: boolean
}

export function ControlsPanel({
  controls,
  onChange,
  inputMode,
  onInputMode,
  onUpload,
  status,
  busy,
}: Props) {
  const set = <K extends keyof DemoControls>(key: K, value: DemoControls[K]) =>
    onChange({ ...controls, [key]: value })

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Input &amp; tunables</h2>
        <p>Bundled synthetic works offline. Upload or webcam use MediaPipe landmarks.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['synthetic', 'Bundled sample'],
            ['upload', 'Upload video'],
            ['webcam', 'Webcam'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`mode-btn ${inputMode === mode ? 'mode-btn-active' : ''}`}
            onClick={() => onInputMode(mode)}
            disabled={busy && mode !== inputMode}
          >
            {label}
          </button>
        ))}
      </div>

      {inputMode === 'upload' && (
        <label className="mt-3 block">
          <span className="sr-only">Choose video file</span>
          <input
            type="file"
            accept="video/*"
            className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-teal file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
            }}
          />
        </label>
      )}

      <p
        className={`mt-3 text-sm ${busy ? 'text-amber-ink' : 'text-ink/55'}`}
        role="status"
      >
        {status}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Slider
          label="Window length"
          unit={`${controls.windowLengthSec.toFixed(0)} s`}
          min={4}
          max={12}
          step={1}
          value={controls.windowLengthSec}
          onChange={(v) => set('windowLengthSec', v)}
        />
        <Slider
          label="Phys band low"
          unit={`${controls.physBandHz[0].toFixed(1)} Hz`}
          min={0.5}
          max={2}
          step={0.1}
          value={controls.physBandHz[0]}
          onChange={(v) =>
            set('physBandHz', [v, Math.max(v + 0.5, controls.physBandHz[1])])
          }
        />
        <Slider
          label="Phys band high"
          unit={`${controls.physBandHz[1].toFixed(1)} Hz`}
          min={2}
          max={5}
          step={0.1}
          value={controls.physBandHz[1]}
          onChange={(v) =>
            set('physBandHz', [Math.min(v - 0.5, controls.physBandHz[0]), v])
          }
        />
        <Slider
          label="α (temporal mix)"
          unit={controls.alpha.toFixed(2)}
          min={0}
          max={1}
          step={0.05}
          value={controls.alpha}
          onChange={(v) => set('alpha', v)}
        />
        <Slider
          label="β (spectral mix)"
          unit={controls.beta.toFixed(2)}
          min={0}
          max={1}
          step={0.05}
          value={controls.beta}
          onChange={(v) => set('beta', v)}
        />
        <Slider
          label="Suppression floor"
          unit={controls.suppressionFloor.toFixed(2)}
          min={0.05}
          max={0.5}
          step={0.05}
          value={controls.suppressionFloor}
          onChange={(v) => set('suppressionFloor', v)}
        />
        <Slider
          label="Motion artifact (synthetic)"
          unit={controls.motionArtifactAmp.toFixed(2)}
          min={0}
          max={1}
          step={0.05}
          value={controls.motionArtifactAmp}
          onChange={(v) => set('motionArtifactAmp', v)}
          disabled={inputMode !== 'synthetic'}
        />
        <Slider
          label="Pulse BPM (synthetic)"
          unit={`${controls.pulseBpm}`}
          min={50}
          max={120}
          step={1}
          value={controls.pulseBpm}
          onChange={(v) => set('pulseBpm', v)}
          disabled={inputMode !== 'synthetic'}
        />
        <Slider
          label="Reliability λ"
          unit={controls.reliabilityLambda.toFixed(1)}
          min={1}
          max={10}
          step={0.5}
          value={controls.reliabilityLambda}
          onChange={(v) => set('reliabilityLambda', v)}
        />
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Candidate method</span>
          <select
            className="w-full rounded-lg border border-ink/15 bg-white/80 px-3 py-2"
            value={controls.candidateMethod}
            onChange={(e) =>
              set('candidateMethod', e.target.value as CandidateMethod)
            }
          >
            <option value="CHROM">CHROM</option>
            <option value="POS">POS</option>
          </select>
        </label>
      </div>
    </section>
  )
}

function Slider({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  disabled,
}: {
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <label className={`block text-sm ${disabled ? 'opacity-45' : ''}`}>
      <span className="mb-1 flex justify-between text-ink/60">
        <span>{label}</span>
        <span className="tabular-nums text-ink/80">{unit}</span>
      </span>
      <input
        type="range"
        className="w-full accent-teal"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
