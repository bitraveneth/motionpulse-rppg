/** Summary numbers from the scan's motion, spectrum, and trust panels. */
export type FeedDetail = {
  motion: {
    overall: number
    forehead: number
    cheeks: number
    lowerFace: number
  }
  spectrum: {
    timeSync: number
    freqOverlap: number
    combined: number
  }
  trust: {
    forehead: number
    leftCheek: number
    rightCheek: number
    lowerFace: number
  }
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readGroup(
  value: unknown,
  keys: string[],
  clamp01: boolean,
): Record<string, number> | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const key of keys) {
    const n = finite(source[key])
    if (n == null) return null
    const rounded = Math.round(n * 10000) / 10000
    out[key] = clamp01 ? Math.min(1, Math.max(0, rounded)) : rounded
  }
  return out
}

/** Keep a well-formed detail object. Anything else is dropped, not an error. */
export function parseFeedDetail(value: unknown): FeedDetail | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  const motion = readGroup(
    body.motion,
    ['overall', 'forehead', 'cheeks', 'lowerFace'],
    false,
  )
  const spectrum = readGroup(
    body.spectrum,
    ['timeSync', 'freqOverlap', 'combined'],
    true,
  )
  const trust = readGroup(
    body.trust,
    ['forehead', 'leftCheek', 'rightCheek', 'lowerFace'],
    true,
  )
  if (!motion || !spectrum || !trust) return null
  return {
    motion: motion as FeedDetail['motion'],
    spectrum: spectrum as FeedDetail['spectrum'],
    trust: trust as FeedDetail['trust'],
  }
}
