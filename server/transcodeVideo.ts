import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_FEED_VIDEO_BYTES } from '../src/lib/feed/limits'

function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

/**
 * Re-encode a webcam clip as H.264 MP4 with the index at the front.
 * iPhone Safari plays this. It does not play the WebM files Chrome records.
 * Returns null when ffmpeg is missing or the result is empty or too large.
 */
export async function toPhoneMp4(input: Uint8Array): Promise<Uint8Array | null> {
  const dir = await mkdtemp(join(tmpdir(), 'mp-vid-'))
  const src = join(dir, 'in.bin')
  const out = join(dir, 'out.mp4')
  try {
    await writeFile(src, input)
    const ok = await runFfmpeg([
      '-y',
      '-i',
      src,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'baseline',
      '-level',
      '3.1',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-movflags',
      '+faststart',
      '-an',
      out,
    ])
    if (!ok) return null
    const bytes = new Uint8Array(await readFile(out))
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FEED_VIDEO_BYTES) return null
    return bytes
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
