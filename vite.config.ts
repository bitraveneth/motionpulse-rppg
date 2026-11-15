/// <reference types="vitest/config" />
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { handleLocalTrain } from './server/localTrain'
import { videoByteResponse } from './server/videoRange'
import {
  datasetActivity,
  framesForDirectory,
  inspectDatasetFolder,
  resolveDatasetVideo,
} from './src/lib/lab/datasetFolder'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { app as apiApp } from './server/app'

const DEMO_CLIPS_DIR = resolve(process.cwd(), 'public/demo-clips')
const DEMO_VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i

function listDemoClipFiles(): { name: string; url: string }[] {
  if (!existsSync(DEMO_CLIPS_DIR)) return []
  return readdirSync(DEMO_CLIPS_DIR)
    .filter((name) => DEMO_VIDEO_RE.test(name) && !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .slice(0, 10)
    .map((name) => ({
      name,
      url: `/demo-clips/${encodeURIComponent(name)}`,
    }))
}

function writeDemoManifest(outDir = DEMO_CLIPS_DIR) {
  mkdirSync(outDir, { recursive: true })
  const body = JSON.stringify({ clips: listDemoClipFiles() }, null, 2) + '\n'
  writeFileSync(resolve(outDir, 'manifest.json'), body, 'utf8')
}

/** Dev API + build-time manifest for public/demo-clips videos. */
function demoClipsPlugin(): Plugin {
  return {
    name: 'demo-clips-list',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/api/demo-clips') {
          next()
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ clips: listDemoClipFiles() }))
      })
    },
    buildStart() {
      writeDemoManifest(DEMO_CLIPS_DIR)
    },
    closeBundle() {
      const distDemo = resolve(process.cwd(), 'dist/demo-clips')
      writeDemoManifest(distDemo)
    },
  }
}

function chooseDatasetFolder(): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  return new Promise((resolveChoice) => {
    execFile(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "Choose the unzipped dataset folder")'],
      { timeout: 120000 },
      (error, stdout) => {
        if (error) {
          const message = String(error.message ?? '')
          const cancelled = message.includes('User canceled') || message.includes('-128')
          resolveChoice({ ok: false, reason: cancelled ? 'cancelled' : 'dialog_failed' })
          return
        }
        const path = stdout.trim().replace(/\/$/, '')
        resolveChoice(path ? { ok: true, path } : { ok: false, reason: 'cancelled' })
      },
    )
  })
}

const preparedVideos = new Map<string, string>()
let preparedBytes: { id: string; bytes: Uint8Array } | null = null

function ffmpegBin(): string {
  if (existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg'
  if (existsSync('/usr/local/bin/ffmpeg')) return '/usr/local/bin/ffmpeg'
  return 'ffmpeg'
}

function preparePlayableVideo(file: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const resolved = resolveDatasetVideo(file)
  if (!resolved) return Promise.resolve({ ok: false, error: 'That is not a video file on this Mac.' })
  const info = statSync(resolved)
  const id = createHash('sha1')
    .update(`${resolved}\0${info.mtimeMs}\0${info.size}`)
    .digest('hex')
    .slice(0, 20)
  const dir = join(tmpdir(), 'motionpulse-lab')
  const out = join(dir, `${id}.mp4`)
  if (existsSync(out) && statSync(out).size > 0) {
    preparedVideos.set(id, out)
    return Promise.resolve({ ok: true, id })
  }
  mkdirSync(dir, { recursive: true })
  return new Promise((resolvePrepare) => {
    execFile(
      ffmpegBin(),
      ['-y', '-i', resolved, '-an', '-vf', 'fps=15', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
      { timeout: 180000 },
      (error) => {
        if (error || !existsSync(out) || statSync(out).size === 0) {
          resolvePrepare({ ok: false, error: 'Could not open that video. ffmpeg did not produce a playable file.' })
          return
        }
        preparedVideos.set(id, out)
        resolvePrepare({ ok: true, id })
      },
    )
  })
}

function imageType(file: string): string | null {
  const ext = extname(file).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return null
}

function resolveFrameFile(input: string): { file: string; type: string } | null {
  const type = imageType(input)
  if (!type) return null
  const file = resolve(input.trim())
  const home = process.env.HOME
  if (file === '/' || file === '/Users' || file === '/tmp' || (home && file === home)) return null
  try {
    const info = statSync(file)
    if (!info.isFile() || info.size <= 0 || info.size > 20_000_000) return null
  } catch {
    return null
  }
  return { file, type }
}

function sendJson(res: ServerResponse, body: unknown) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Dev-only: serve out/batch-results.json for the Local lab panel. */
function localLabBatchPlugin(): Plugin {
  return {
    name: 'local-lab-batch-results',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (handleLocalTrain(req, res, url)) return
        if (url === '/api/local-lab/choose-folder' && req.method === 'POST') {
          void chooseDatasetFolder().then((choice) => {
            if (!choice.ok) {
              sendJson(res, choice)
              return
            }
            sendJson(res, { ...choice, report: inspectDatasetFolder(choice.path) })
          })
          return
        }
        if (url === '/api/local-lab/scan' && req.method === 'POST') {
          void readRequestBody(req).then((raw) => {
            let folderPath = ''
            try {
              const body = JSON.parse(raw.toString('utf8')) as { path?: unknown }
              if (typeof body.path === 'string') folderPath = body.path
            } catch {
              folderPath = ''
            }
            const report = inspectDatasetFolder(folderPath)
            sendJson(res, { report, steps: datasetActivity(report) })
          })
          return
        }
        if (url === '/api/local-lab/prepare' && req.method === 'POST') {
          void readRequestBody(req).then(async (raw) => {
            let file = ''
            try {
              const body = JSON.parse(raw.toString('utf8')) as { file?: unknown }
              if (typeof body.file === 'string') file = body.file
            } catch {
              file = ''
            }
            sendJson(res, await preparePlayableVideo(file))
          })
          return
        }
        if (url === '/api/local-lab/frames' && req.method === 'POST') {
          void readRequestBody(req).then((raw) => {
            let dir = ''
            let fps = 30
            try {
              const body = JSON.parse(raw.toString('utf8')) as { dir?: unknown; fps?: unknown }
              if (typeof body.dir === 'string') dir = body.dir
              if (typeof body.fps === 'number' && Number.isFinite(body.fps)) fps = body.fps
            } catch {
              dir = ''
            }
            const listed = framesForDirectory(dir, fps)
            if (!listed) {
              sendJson(res, { ok: false, error: 'That frame folder does not have enough images.' })
              return
            }
            sendJson(res, { ok: true, files: listed.files, fps: listed.fps })
          })
          return
        }
        if (url === '/api/local-lab/frame') {
          const query = new URL(req.url ?? '', 'http://127.0.0.1').searchParams
          const found = resolveFrameFile(query.get('file') ?? '')
          if (!found) {
            res.statusCode = 404
            res.end()
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Type', found.type)
          res.setHeader('Cache-Control', 'private, max-age=3600')
          res.end(readFileSync(found.file))
          return
        }
        if (url === '/api/local-lab/media') {
          const id = new URL(req.url ?? '', 'http://127.0.0.1').searchParams.get('id') ?? ''
          const file = preparedVideos.get(id)
          if (!file || !existsSync(file)) {
            res.statusCode = 404
            res.end()
            return
          }
          if (preparedBytes?.id !== id) {
            preparedBytes = { id, bytes: new Uint8Array(readFileSync(file)) }
          }
          const ranged = videoByteResponse(preparedBytes.bytes, 'video/mp4', req.headers.range)
          res.statusCode = ranged.status
          for (const [key, value] of Object.entries(ranged.headers)) res.setHeader(key, value)
          res.end(ranged.body)
          return
        }
        if (url === '/api/local-lab/folder') {
          const query = new URL(req.url ?? '', 'http://127.0.0.1').searchParams
          sendJson(res, inspectDatasetFolder(query.get('path') ?? ''))
          return
        }
        if (url !== '/api/local-lab/batch-results') {
          next()
          return
        }
        const file = resolve(process.cwd(), 'out/batch-results.json')
        if (!existsSync(file)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'missing', path: 'out/batch-results.json' }))
          return
        }
        try {
          const body = readFileSync(file, 'utf8')
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : 'read failed',
            }),
          )
        }
      })
    },
  }
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Dev: mount the same Hono app Vercel runs for /api/* (registered last). */
function motionPulseApiPlugin(): Plugin {
  return {
    name: 'motionpulse-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (!path.startsWith('/api/')) {
          next()
          return
        }
        handleApiRequest(req, res).catch((e) => {
          console.error('[api]', e)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
          }
          res.end(JSON.stringify({ error: 'api_error' }))
        })
      })
    },
  }
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const origin = `http://${req.headers.host ?? '127.0.0.1'}`
  const url = new URL(req.url ?? '/', origin)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }
  const method = req.method ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(req)
  const request = new Request(url, { method, headers, body })
  const response = await apiApp.fetch(request)
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value)
  })
  const setCookies = response.headers.getSetCookie()
  if (setCookies.length > 0) res.setHeader('set-cookie', setCookies)
  const payload = Buffer.from(await response.arrayBuffer())
  res.setHeader('content-length', payload.length)
  res.end(payload)
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localLabBatchPlugin(),
    demoClipsPlugin(),
    motionPulseApiPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
