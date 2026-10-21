-- MotionPulse public results feed (metrics only — no video blobs).
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
  client_id text null
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
  );

-- No update/delete for anon — keep the feed append-only from the client.
