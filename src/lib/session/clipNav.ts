/** Keep a clip index inside `[0, count)`. */
export function clampClipIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, index))
}

/** Move one step without wrapping past the ends. */
export function nextClipIndex(
  index: number,
  count: number,
  delta: number,
): number {
  return clampClipIndex(index + delta, count)
}
