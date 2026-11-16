import { spawn, type ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { saveFinishedTrain } from './trainRuns'

const BROAD = new Set(['/', '/Users', '/private', '/tmp', '/opt', '/System', '/Volumes'])

type TrainState = 'idle' | 'running' | 'done' | 'error' | 'stopped'

let child: ChildProcess | null = null
let state: TrainState = 'idle'
let log: string[] = []
let exitCode: number | null = null
let folder = ''
let epochs = 0
let subjects = 0
let startedAt: Date | null = null
let savedId: string | null = null

function push(line: string) {
  const clean = line.replace(/\r/g, '').trimEnd()
  if (!clean) return
  log = [...log, clean].slice(-200)
}

function snapshot() {
  return { state, log, exitCode, path: folder, epochs, subjects, savedId }
}

function safeDir(input: string): { ok: true; path: string } | { ok: false; error: string } {
  const path = resolve(input.trim())
  const home = process.env.HOME
  if (!path || BROAD.has(path) || (home && path === home)) {
    return { ok: false, error: 'That folder is too wide. Choose the dataset folder itself.' }
  }
  try {
    if (!statSync(path).isDirectory()) return { ok: false, error: 'That path is a file.' }
  } catch {
    return { ok: false, error: 'That folder is not on this Mac.' }
  }
  return { ok: true, path }
}

function send(res: ServerResponse, body: unknown) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function pythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONPATH: process.cwd(),
    PYTHONUNBUFFERED: '1',
    TQDM_DISABLE: '1',
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function stopChild() {
  if (!child?.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

/** Dev-only PhysNet training for a folder on this machine. */
export function handleLocalTrain(req: IncomingMessage, res: ServerResponse, url: string): boolean {
  if (url === '/api/local-lab/train' && req.method === 'GET') {
    send(res, snapshot())
    return true
  }

  if (url === '/api/local-lab/train/preview' && req.method === 'POST') {
    void readBody(req).then((raw) => {
      let path = ''
      try {
        const body = JSON.parse(raw.toString('utf8')) as { path?: unknown }
        if (typeof body.path === 'string') path = body.path
      } catch {
        path = ''
      }
      const safe = safeDir(path)
      if (!safe.ok) {
        send(res, safe)
        return
      }
      const proc = spawn('python3', ['-m', 'research.data.facevideo', safe.path], {
        cwd: process.cwd(),
        env: pythonEnv(),
      })
      let out = ''
      let err = ''
      proc.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8')
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        err += chunk.toString('utf8')
      })
      const timer = setTimeout(() => {
        proc.kill('SIGTERM')
      }, 60_000)
      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          send(res, { ok: false, error: err.trim().slice(-400) || 'Could not read that folder.' })
          return
        }
        try {
          send(res, { ok: true, summary: JSON.parse(out) as unknown })
        } catch {
          send(res, { ok: false, error: 'The folder summary was not readable.' })
        }
      })
    })
    return true
  }

  if (url === '/api/local-lab/train' && req.method === 'POST') {
    void readBody(req).then((raw) => {
      if (child) {
        send(res, { ok: false, error: 'A training run is already going.' })
        return
      }
      let body: { path?: unknown; epochs?: unknown; subjects?: unknown; crossPath?: unknown } = {}
      try {
        body = JSON.parse(raw.toString('utf8')) as typeof body
      } catch {
        body = {}
      }
      const safe = safeDir(typeof body.path === 'string' ? body.path : '')
      if (!safe.ok) {
        send(res, safe)
        return
      }
      const epochCount = clamp(body.epochs, 1, 30, 2)
      const subjectCount = clamp(body.subjects, 0, 80, 2)
      const windowCount = subjectCount === 0 ? 48 : Math.min(80, Math.max(4, subjectCount * (epochCount >= 30 ? 4 : 2)))
      const crossInput = typeof body.crossPath === 'string' ? body.crossPath.trim() : ''
      const cross = crossInput ? safeDir(crossInput) : null
      folder = safe.path
      epochs = epochCount
      subjects = subjectCount
      exitCode = null
      startedAt = new Date()
      savedId = null
      state = 'running'
      log = [
        `train  ${safe.path}`,
        `passes  ${epochCount}`,
        subjectCount === 0 ? 'people  every person in the folder' : `people  ${subjectCount}`,
        'note  each clip uses the first 30 seconds',
        cross?.ok && cross.path !== safe.path ? `test  ${cross.path}` : 'test  people held out of this folder',
      ]
      const args = [
        '-m',
        'research.train',
        '--config',
        'research/configs/folder.yaml',
        '--data-root',
        safe.path,
        '--dataset',
        'folder',
        '--epochs',
        String(epochCount),
        '--max-windows',
        String(windowCount),
        '--max-subjects',
        String(subjectCount),
      ]
      if (cross?.ok && cross.path !== safe.path) args.push('--cross-root', cross.path)
      const proc = spawn('python3', args, {
        cwd: process.cwd(),
        env: pythonEnv(),
        detached: true,
      })
      child = proc
      const onData = (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) push(line)
      }
      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)
      proc.on('close', (code, signal) => {
        exitCode = code
        const status = signal ? 'stopped' : code === 0 ? 'done' : 'error'
        state = status
        push(status === 'done' ? 'done  checkpoint research/out/physnet_local.pt' : `stop  ${signal ?? code ?? 'error'}`)
        if (child === proc) child = null
        const finished = {
          startedAt: startedAt ?? new Date(),
          folder,
          epochs,
          people: subjects,
          status,
          log: [...log],
        } satisfies Parameters<typeof saveFinishedTrain>[0]
        void saveFinishedTrain(finished)
          .then((id) => {
            savedId = id
            push('saved  this run is in Train results')
          })
          .catch(() => {
            push('saved  the database did not keep this run')
          })
      })
      send(res, { ok: true, ...snapshot() })
    })
    return true
  }

  if (url === '/api/local-lab/train/stop' && req.method === 'POST') {
    stopChild()
    send(res, { ok: true, ...snapshot() })
    return true
  }

  return false
}
