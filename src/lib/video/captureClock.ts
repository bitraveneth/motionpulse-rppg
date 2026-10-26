/** Webcam scans record a fixed window, then stop and show the result. */
export const WEBCAM_CAPTURE_MS = 10_000

export function captureRemainingMs(
  startedAt: number,
  now: number,
  total = WEBCAM_CAPTURE_MS,
): number {
  return Math.max(0, total - (now - startedAt))
}

export function captureShouldStop(
  startedAt: number,
  now: number,
  total = WEBCAM_CAPTURE_MS,
): boolean {
  return now - startedAt >= total
}

/** Whole seconds still on the clock, for the on-screen countdown. */
export function secondsLeft(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000))
}

/** First mime the browser can record. Null means "metrics only, no clip file". */
export function preferredRecorderMime(
  isSupported: (mime: string) => boolean,
): string | null {
  const types = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  return types.find((type) => isSupported(type)) ?? null
}
