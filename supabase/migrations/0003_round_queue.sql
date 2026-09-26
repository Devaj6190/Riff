-- Rounds written ahead of time so each round starts instantly (text 1 ahead, image 2 ahead).
-- Server-only: RLS on with no policies, so players can't peek at upcoming prompts.
create table queued_rounds (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade,
  for_number int not null, -- the round number this was written for
  mechanic mechanic not null,
  depth int not null check (depth between 1 and 3),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (riff_id, for_number) -- concurrent prefetches can't fill the same slot twice
);
alter table queued_rounds enable row level security;
