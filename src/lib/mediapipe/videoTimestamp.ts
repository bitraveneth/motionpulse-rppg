/**
 * MediaPipe's VIDEO graph rejects any timestamp that is not strictly later
 * than the previous one. A second clip starts again at 0 ms, which is what
 * produces "norm_rect" timestamp mismatch after the first video.
 */

export type VideoTimestampClock = {
  next: (frameMs: number) => number
  reset: () => void
}

export function createVideoTimestampClock(): VideoTimestampClock {
  let lastInputMs = Number.NEGATIVE_INFINITY
  let lastOutputMs = -1
  let originOffset = 0

  return {
    next(frameMs: number) {
      const frame = Number.isFinite(frameMs) ? frameMs : 0
      if (lastOutputMs < 0) {
        lastInputMs = frame
        lastOutputMs = frame
        return frame
      }
      // A new clip, or a seek backwards, restarts the frame clock at 0.
      if (frame <= lastInputMs) {
        originOffset = lastOutputMs + 1 - frame
      }
      let out = frame + originOffset
      if (out <= lastOutputMs) out = lastOutputMs + 1
      lastInputMs = frame
      lastOutputMs = out
      return out
    },
    reset() {
      lastInputMs = Number.NEGATIVE_INFINITY
      lastOutputMs = -1
      originOffset = 0
    },
  }
}

export const videoTimestampClock = createVideoTimestampClock()
