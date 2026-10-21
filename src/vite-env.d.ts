/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Show Local lab nav on production builds when set to "true". Always on in DEV. */
  readonly VITE_ENABLE_LOCAL_LAB?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
