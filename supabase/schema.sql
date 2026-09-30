-- DevOps Pipeline Puzzle: Supabase schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: every statement uses IF NOT EXISTS.

create extension if not exists pgcrypto; -- provides gen_random_uuid()

create table if not exists public.games (
  id                      uuid primary key default gen_random_uuid(),
  game_code               text        not null,                      -- display code, e.g. GAME-7F42A1
  player_name             text        not null check (char_length(player_name) between 1 and 40),

  -- Pipeline puzzle
  pipeline_initial_order  text[]      not null,                      -- shuffled order the player received
  pipeline_attempts       integer     not null default 0  check (pipeline_attempts >= 0),
  pipeline_correct        boolean     not null default false,
  pipeline_score          integer     not null default 0  check (pipeline_score between 0 and 20),

  -- Quiz
  quiz_question_ids       text[]      not null,                      -- the 6 questions chosen for this game
  quiz_option_orders      jsonb       not null default '{}'::jsonb,  -- per-question shuffled option order
  quiz_answers            jsonb       not null default '{}'::jsonb,  -- answers submitted, keyed by question id
  current_question_index  integer     not null default 0  check (current_question_index between 0 and 6),
  quiz_score              integer     not null default 0  check (quiz_score between 0 and 60),
  quiz_correct_count      integer     not null default 0  check (quiz_correct_count between 0 and 6),

  -- Result
  total_score             integer     not null default 0  check (total_score between 0 and 80),
  percentage              numeric(5,2) not null default 0 check (percentage between 0 and 100),
  current_stage           text        not null default 'pipeline'
                                      check (current_stage in ('pipeline', 'quiz', 'finished')),
  completed               boolean     not null default false,

  -- Timestamps (timestamptz is stored in UTC)
  started_at              timestamptz not null default now(),
  completed_at            timestamptz,
  updated_at              timestamptz not null default now()
);

-- Leaderboard: completed games sorted by score, earliest finisher first on ties.
create index if not exists games_leaderboard_idx
  on public.games (total_score desc, completed_at asc)
  where completed = true;

create index if not exists games_started_at_idx on public.games (started_at desc);

-- Lock the table down. The Express server uses the service-role key, which
-- bypasses RLS. With RLS on and no policies, the public "anon" key cannot
-- read or write anything, even if someone finds it.
alter table public.games enable row level security;

-- Handy query for organisers (run in the SQL editor any time):
-- select player_name, total_score, percentage, completed_at
-- from public.games where completed order by total_score desc, completed_at;
