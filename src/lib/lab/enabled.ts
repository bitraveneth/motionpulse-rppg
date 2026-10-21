/**
 * Local lab is for developers with datasets on disk.
 * Hidden from casual Vercel visitors unless explicitly enabled.
 */
export function isLocalLabEnabled(): boolean {
  if (import.meta.env.DEV) return true
  return import.meta.env.VITE_ENABLE_LOCAL_LAB === 'true'
}
