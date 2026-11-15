/**
 * Signal reliability remarks — NOT health grades.
 * Maps motion–pulse conflict / risk to Stable / Mixed / Unreliable.
 */

import type { RiskLevel } from './types'

export type ReliabilityKind = 'stable' | 'mixed' | 'unreliable'

export type ReliabilityRemark = {
  kind: ReliabilityKind
  /** Short badge label */
  badge: 'Stable' | 'Mixed' | 'Unreliable'
  /** One-line copy for cards / story — never heart health language */
  headline: string
  /** Slightly longer explanation */
  detail: string
}

/** From stored risk_level (preferred for feed cards). */
export function reliabilityFromRisk(level: RiskLevel): ReliabilityRemark {
  if (level === 'low') {
    return {
      kind: 'stable',
      badge: 'Stable',
      headline: 'Results look stable',
      detail:
        'Low motion–pulse overlap. The estimate is more trustworthy for this clip — still an educational reading, not a health grade.',
    }
  }
  if (level === 'moderate') {
    return {
      kind: 'mixed',
      badge: 'Mixed',
      headline: 'Motion may have affected this',
      detail:
        'Some overlap between face motion and the pulse estimate. Treat BPM with extra caution.',
    }
  }
  return {
    kind: 'unreliable',
    badge: 'Unreliable',
    headline: 'Motion may have strongly affected this',
    detail:
      'High motion–pulse risk. High risk ≠ a health problem — motion may simply have muddied the estimate.',
  }
}

export type SignalFace = {
  level: RiskLevel | 'unknown'
  kind: ReliabilityKind
  badge: string
  hint: string
}

/** One signal chip. The raw word "high" is not shown beside the badge. */
export function signalFace(level: string): SignalFace {
  if (level === 'low') {
    return { level, kind: 'stable', badge: 'Stable', hint: 'Clear pulse' }
  }
  if (level === 'moderate') {
    return { level, kind: 'mixed', badge: 'Mixed', hint: 'Some motion' }
  }
  if (level === 'elevated') {
    return { level, kind: 'unreliable', badge: 'Unreliable', hint: 'Motion in the band' }
  }
  if (level === 'high') {
    return { level, kind: 'unreliable', badge: 'Unreliable', hint: 'Motion covers the pulse' }
  }
  return { level: 'unknown', kind: 'mixed', badge: 'Unknown', hint: 'No signal label' }
}

/** From continuous conflict score (same bands as conflictRiskLabel). */
export function reliabilityFromConflict(c: number): ReliabilityRemark {
  if (c < 0.25) return reliabilityFromRisk('low')
  if (c < 0.5) return reliabilityFromRisk('moderate')
  if (c < 0.75) return reliabilityFromRisk('elevated')
  return reliabilityFromRisk('high')
}
