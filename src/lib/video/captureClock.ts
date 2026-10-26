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

/**
 * First mime the browser can record. MP4 comes first so a phone that can
 * record H.264 does that instead of WebM, which iPhone Safari cannot play.
 * Null means "metrics only, no clip file".
 */
export function preferredRecorderMime(
  isSupported: (mime: string) => boolean,
): string | null {
  const types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return types.find((type) => isSupported(type)) ?? null
}
