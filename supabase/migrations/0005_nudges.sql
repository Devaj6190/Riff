-- Nudges replace rounds (SPEC §3–§6). A riff is now one continuous two-person chat. The AI drops nudges into it
-- (a text prompt, an image or an audio clip) and scores each stretch of chat between nudges in the background.
-- Run once in the Supabase SQL editor after 0004. DESTRUCTIVE: drops rounds, answers, scores and queued_rounds.

drop table if exists queued_rounds, scores, answers, rounds cascade;
drop type if exists mechanic;

-- lobby → chatting → ended. No clock, so round_number and phase_ends_at go.
alter table riffs alter column phase drop default;
alter table riffs alter column phase type text using phase::text;
drop type game_phase;
create type riff_phase as enum ('lobby', 'chatting', 'ended');
alter table riffs alter column phase type riff_phase
  using (case when phase in ('lobby', 'ended') then phase else 'chatting' end)::riff_phase;
alter table riffs alter column phase set default 'lobby';
alter table riffs drop column phase_ends_at, drop column round_number;

create type nudge_kind as enum ('text', 'image', 'audio');

create table nudges (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade,
  number int not null, -- 1, 2, 3… in the order shown
  kind nudge_kind not null,
  depth int not null check (depth between 1 and 3),
  payload jsonb not null, -- kind-specific: prompt text, image URL, clip
  is_bonus boolean not null default false,
  for_seat text check (for_seat in ('A', 'B')), -- Bonus nudge: whose turf. Null = both players.
  created_at timestamptz not null default now(), -- when it popped up
  unique (riff_id, number) -- concurrent /api/tick calls can't show the same nudge twice
);

-- Written ahead so a nudge never waits on a model. Server-only: RLS on with no policies, so nobody peeks.
create table queued_nudges (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade,
  for_number int not null,
  kind nudge_kind not null,
  depth int not null check (depth between 1 and 3),
  payload jsonb not null,
  is_bonus boolean not null default false,
  for_seat text check (for_seat in ('A', 'B')),
  created_at timestamptz not null default now(),
  unique (riff_id, for_number)
);

-- Hidden score for the stretch of chat after a nudge, up to the next one. Not shown in the UI yet.
create table scores (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade, -- denormalised for Realtime filters
  nudge_id uuid not null references nudges on delete cascade,
  player_id uuid not null references players on delete cascade,
  quality int not null default 0 check (quality between 0 and 10),
  connection int not null default 0 check (connection between 0 and 5),
  multiplier int not null default 1 check (multiplier in (1, 2)), -- 2 for the Bonus nudge's player
  total int generated always as ((quality + connection) * multiplier) stored,
  reason text,
  created_at timestamptz not null default now(),
  unique (nudge_id, player_id)
);

alter table nudges enable row level security;
alter table queued_nudges enable row level security;
alter table scores enable row level security;
create policy "members read nudges" on nudges for select to authenticated using (is_riff_member(riff_id));
create policy "members read scores" on scores for select to authenticated using (is_riff_member(riff_id));

-- Same as 0001, plus: the chat starts when the second player sits down.
create or replace function join_riff(p_code text, p_name text, p_interests text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_riff uuid;
  v_player uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_riff from riffs where code = upper(p_code);
  if v_riff is null then raise exception 'riff not found'; end if;
  select id into v_player from players where riff_id = v_riff and user_id = auth.uid();
  if v_player is not null then return v_player; end if;
  begin
    insert into players (riff_id, user_id, seat, name, interests)
    values (v_riff, auth.uid(), 'B', trim(p_name), p_interests)
    returning id into v_player;
  exception when unique_violation then
    raise exception 'riff is full';
  end;
  update riffs set phase = 'chatting' where id = v_riff and phase = 'lobby';
  return v_player;
end $$;

alter publication supabase_realtime add table nudges, scores;
