/// <reference types="vitest/config" />
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

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

/** Dev-only: serve out/batch-results.json for the Local lab panel. */
function localLabBatchPlugin(): Plugin {
  return {
    name: 'local-lab-batch-results',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
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

export default defineConfig({
  plugins: [react(), tailwindcss(), localLabBatchPlugin(), demoClipsPlugin()],
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
