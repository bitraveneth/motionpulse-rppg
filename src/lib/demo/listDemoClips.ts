/**
 * Discover face videos under public/demo-clips/.
 * Dev: Vite middleware at /api/demo-clips. Prod: /demo-clips/manifest.json.
 */

export type DemoClipRef = {
  name: string
  url: string
}

export type DemoClipsResponse = {
  clips: DemoClipRef[]
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i
const MAX_CLIPS = 10

/** Keep only video filenames, sort, cap at 10. */
export function normalizeDemoClipNames(names: string[]): string[] {
  return [...new Set(names)]
    .filter((n) => VIDEO_EXT.test(n) && !n.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .slice(0, MAX_CLIPS)
}

export function clipRefsFromNames(names: string[]): DemoClipRef[] {
  return normalizeDemoClipNames(names).map((name) => ({
    name,
    url: `/demo-clips/${encodeURIComponent(name)}`,
  }))
}

export async function fetchDemoClipList(): Promise<DemoClipRef[]> {
  const fromApi = await tryJson('/api/demo-clips')
  if (fromApi) return clipRefsFromNames(fromApi.map((c) => c.name))

  const fromManifest = await tryJson('/demo-clips/manifest.json')
  if (fromManifest) return clipRefsFromNames(fromManifest.map((c) => c.name))

  return []
}

async function tryJson(path: string): Promise<DemoClipRef[] | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as DemoClipsResponse
    if (!Array.isArray(data.clips)) return null
    return data.clips.filter(
      (c) => c && typeof c.name === 'string' && typeof c.url === 'string',
    )
  } catch {
    return null
  }
}

/** Fetch each demo URL into a File for the existing upload queue. */
export async function fetchDemoClipsAsFiles(
  refs: DemoClipRef[],
): Promise<File[]> {
  const files: File[] = []
  for (const ref of refs.slice(0, MAX_CLIPS)) {
    const res = await fetch(ref.url, { cache: 'no-store' })
    if (!res.ok) continue
    const blob = await res.blob()
    const type =
      blob.type ||
      (ref.name.toLowerCase().endsWith('.webm')
        ? 'video/webm'
        : ref.name.toLowerCase().endsWith('.mov')
          ? 'video/quicktime'
          : 'video/mp4')
    files.push(new File([blob], ref.name, { type }))
  }
  return files
}

export { MAX_CLIPS as DEMO_CLIPS_MAX }
