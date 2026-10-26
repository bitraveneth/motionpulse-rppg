import { useEffect, useState } from 'react'
import { CONTENT_DEFAULTS } from './contentDefaults'

let cache: Record<string, string> | null = null
let pending: Promise<Record<string, string>> | null = null

/** Fetch the Content table once per page load; defaults cover any miss. */
export function loadContent(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = fetch('/api/content')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json() as Promise<{ content?: Record<string, string> }>
      })
      .then((json) => {
        cache = { ...CONTENT_DEFAULTS, ...(json.content ?? {}) }
        return cache
      })
      .catch(() => {
        cache = { ...CONTENT_DEFAULTS }
        return cache
      })
  }
  return pending
}

/**
 * Copy lookup with code fallback: `c('home.headline')` reads the Content
 * table when available, otherwise the sentence that ships in code.
 */
export function useContent(): (key: string, fallback?: string) => string {
  const [map, setMap] = useState<Record<string, string>>(
    () => cache ?? CONTENT_DEFAULTS,
  )
  useEffect(() => {
    let live = true
    void loadContent().then((m) => {
      if (live) setMap(m)
    })
    return () => {
      live = false
    }
  }, [])
  return (key, fallback) => map[key] ?? fallback ?? key
}

/** Test hook: drop the cache so a fresh fetch happens. */
export function resetContentCache(): void {
  cache = null
  pending = null
}
