/**
 * Publish metric summaries from out/batch-results.json to Supabase `runs`.
 * Never uploads video. Requires SUPABASE_URL + SUPABASE_ANON_KEY
 * (or VITE_SUPABASE_*).
 *
 * Usage: npm run publish-results
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type BatchFile = {
  results: Array<{
    bpm: number
    conflict_score: number
    risk_level: string
    roi_weights: Record<string, number>
    path?: string
  }>
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

function loadEnvFile() {
  const path = resolve('.env')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]!
    let val = m[2]!
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

async function main() {
  loadEnvFile()

  const url = (
    env('SUPABASE_URL') ||
    env('VITE_SUPABASE_URL') ||
    ''
  ).replace(/\/$/, '')
  const key = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')

  const jsonPath = resolve('out/batch-results.json')
  if (!existsSync(jsonPath)) {
    console.error('Missing out/batch-results.json — run npm run batch first.')
    process.exit(1)
  }

  const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as BatchFile
  const rows = data.results ?? []
  if (rows.length === 0) {
    console.error('No results in batch file.')
    process.exit(1)
  }

  if (!url || !key) {
    console.log('Supabase credentials not set. Metrics were NOT uploaded.')
    console.log('')
    console.log('To publish metric summaries only:')
    console.log('  1. Create a Supabase project')
    console.log('  2. Run supabase/schema.sql in the SQL editor')
    console.log('  3. Copy Project URL + anon key into .env:')
    console.log('       VITE_SUPABASE_URL=https://xxxx.supabase.co')
    console.log('       VITE_SUPABASE_ANON_KEY=eyJ...')
    console.log('  4. Re-run: npm run publish-results')
    console.log('')
    console.log(`Would publish ${rows.length} row(s) from ${jsonPath}`)
    process.exit(0)
  }

  const payload = rows.map((r) => ({
    nickname: null,
    bpm: r.bpm,
    conflict_score: r.conflict_score,
    risk_level: r.risk_level,
    roi_weights: r.roi_weights,
    source: 'batch' as const,
    client_id: 'batch-cli',
  }))

  console.log(`Publishing ${payload.length} metric row(s) to ${url} …`)

  // Insert in chunks to avoid huge payloads
  const chunkSize = 50
  let inserted = 0
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize)
    const res = await fetch(`${url}/rest/v1/runs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`Insert failed (${res.status}): ${text}`)
      process.exit(1)
    }
    inserted += chunk.length
    console.log(`  … ${inserted}/${payload.length}`)
  }

  console.log(`Done. Published ${inserted} summaries (no video).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
