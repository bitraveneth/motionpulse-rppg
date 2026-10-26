export type VideoByteResult = {
  status: 200 | 206 | 416
  body: Uint8Array
  headers: Record<string, string>
}

function unsatisfiable(
  total: number,
  common: Record<string, string>,
): VideoByteResult {
  return {
    status: 416,
    body: new Uint8Array(),
    headers: {
      ...common,
      'Content-Range': `bytes */${total}`,
      'Content-Length': '0',
    },
  }
}

/**
 * Full file, or the single byte range a phone player asks for.
 * iPhone Safari will not start playback without a 206 response.
 */
export function videoByteResponse(
  bytes: Uint8Array,
  mime: string,
  rangeHeader: string | null | undefined,
): VideoByteResult {
  const total = bytes.byteLength
  const common = {
    'Content-Type': mime || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  }
  const header = rangeHeader?.split(',')[0]?.trim() ?? ''
  if (!header) {
    return {
      status: 200,
      body: bytes,
      headers: { ...common, 'Content-Length': String(total) },
    }
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header)
  if (!match || (match[1] === '' && match[2] === '')) {
    return unsatisfiable(total, common)
  }

  let start: number
  let end: number
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (!Number.isFinite(suffix) || suffix <= 0) return unsatisfiable(total, common)
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? total - 1 : Number(match[2])
  }
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= total ||
    end < start
  ) {
    return unsatisfiable(total, common)
  }
  end = Math.min(end, total - 1)
  const body = bytes.slice(start, end + 1)
  return {
    status: 206,
    body,
    headers: {
      ...common,
      'Content-Length': String(body.byteLength),
      'Content-Range': `bytes ${start}-${end}/${total}`,
    },
  }
}
