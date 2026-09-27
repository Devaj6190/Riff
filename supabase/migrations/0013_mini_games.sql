-- Mini games (SPEC §4.1): Guess their pick and Two truths and a lie are nudges with stages. Taps land in
-- nudge_plays, server-only (RLS on, no policies), so nobody sees the partner's pick or lie before the reveal.
-- Run once in the Supabase SQL editor after 0012.

alter type nudge_kind add value if not exists 'pick';
alter type nudge_kind add value if not exists 'truths';

create table nudge_plays (
  nudge_id uuid not null references nudges on delete cascade,
  player_id uuid not null references players on delete cascade,
  riff_id uuid not null references riffs on delete cascade,
  play jsonb not null, -- PickPlay or TruthsPlay (lib/types.ts)
  created_at timestamptz not null default now(), -- first tap: speed points
  updated_at timestamptz not null default now(),
  primary key (nudge_id, player_id)
);
alter table nudge_plays enable row level security;
