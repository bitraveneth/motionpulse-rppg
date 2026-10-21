-- MotionPulse public results feed (metrics + optional tiny thumb/sparkline — no video blobs).
-- Run in the Supabase SQL editor after creating a project.

create extension if not exists "pgcrypto";

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nickname text null,
  bpm double precision not null,
  conflict_score double precision not null,
  risk_level text not null check (
    risk_level in ('low', 'moderate', 'elevated', 'high')
  ),
  roi_weights jsonb not null default '{}'::jsonb,
  source text not null check (
    source in ('upload', 'webcam', 'sample', 'batch')
  ),
  client_id text null,
  -- Optional face crop URL (e.g. Storage bucket `thumbs`, public read) or inline data
  thumbnail_url text null,
  thumbnail_data text null,
  -- SVG path `d` for a tiny pulse sparkline (preferred) or small image data URL
  sparkline text null
);

create index if not exists runs_created_at_idx on public.runs (created_at desc);

alter table public.runs enable row level security;

-- Public read of metric rows
drop policy if exists "Public read runs" on public.runs;
create policy "Public read runs"
  on public.runs
  for select
  to anon, authenticated
  using (true);

-- Public insert of metric-only rows (no video column exists)
drop policy if exists "Public insert runs" on public.runs;
create policy "Public insert runs"
  on public.runs
  for insert
  to anon, authenticated
  with check (
    bpm >= 30 and bpm <= 220
    and conflict_score >= 0 and conflict_score <= 1
    and (nickname is null or char_length(nickname) <= 40)
    and (thumbnail_url is null or char_length(thumbnail_url) <= 2048)
    and (thumbnail_data is null or char_length(thumbnail_data) <= 120000)
    and (sparkline is null or char_length(sparkline) <= 8000)
  );

-- No update/delete for anon — keep the feed append-only from the client.

-- ---------------------------------------------------------------------------
-- Migration for existing projects (run once if `runs` already exists):
--
--   alter table public.runs add column if not exists thumbnail_url text null;
--   alter table public.runs add column if not exists thumbnail_data text null;
--   alter table public.runs add column if not exists sparkline text null;
--
-- Optional: create a public-read Storage bucket named `thumbs` for ~128–192px
-- JPEG/WebP (~40–80KB). Prefer storing thumbnail_url when using Storage;
-- otherwise thumbnail_data (text) is fine under the size check above.
-- Never store video blobs or face GIFs in this table.
-- ---------------------------------------------------------------------------
