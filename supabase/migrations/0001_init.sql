-- Riff schema. Run once in the Supabase SQL editor.
-- Clients read through RLS + Realtime and write only chat messages, answers and riff creation/joining.
-- Game-state writes (riffs.phase, rounds, scores) go through API routes using the service role, which bypasses RLS.

create type game_phase as enum ('lobby', 'round_active', 'round_result', 'talk_window', 'countdown', 'ended');
create type mechanic as enum ('open_prompt', 'two_truths', 'image', 'pick', 'voice', 'meme_audio');

create table riffs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  phase game_phase not null default 'lobby',
  phase_ends_at timestamptz, -- deadline for the current phase; clients render countdowns from it
  round_number int not null default 0,
  target_score int not null default 100, -- Expo mode = 50
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table players (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  seat text not null check (seat in ('A', 'B')),
  name text not null check (char_length(name) between 1 and 24),
  interests text[] not null check (cardinality(interests) between 1 and 3),
  extracted_interests text[] not null default '{}',
  joined_at timestamptz not null default now(),
  unique (riff_id, seat), -- two seats = max two players, enforced by the DB
  unique (riff_id, user_id)
);

create table messages (
  id bigint generated always as identity primary key,
  riff_id uuid not null references riffs on delete cascade,
  player_id uuid not null references players on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on messages (riff_id, created_at);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade,
  number int not null,
  mechanic mechanic not null,
  depth int not null check (depth between 1 and 3),
  is_bonus boolean not null default false,
  bonus_seat text check (bonus_seat in ('A', 'B')), -- whose turf, when is_bonus
  payload jsonb not null, -- mechanic-specific content (prompt text, options, image URLs, ...)
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  unique (riff_id, number)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade, -- denormalised for Realtime filters
  round_id uuid not null references rounds on delete cascade,
  player_id uuid not null references players on delete cascade,
  payload jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  riff_id uuid not null references riffs on delete cascade, -- denormalised for Realtime filters
  round_id uuid not null references rounds on delete cascade,
  player_id uuid not null references players on delete cascade,
  kind text not null default 'round' check (kind in ('round', 'talk')), -- 'talk' = connection points from the talk window after this round
  speed int not null default 0 check (speed between 0 and 5),
  quality int not null default 0 check (quality between 0 and 10),
  connection int not null default 0 check (connection between 0 and 5),
  multiplier int not null default 1 check (multiplier in (1, 2)), -- 2 on the trailing player's Bonus Round
  total int generated always as ((speed + quality + connection) * multiplier) stored,
  reason text,
  created_at timestamptz not null default now(),
  unique (round_id, player_id, kind)
);

-- RLS ------------------------------------------------------------------------

create function is_riff_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where riff_id = r and user_id = auth.uid());
$$;

alter table riffs enable row level security;
alter table players enable row level security;
alter table messages enable row level security;
alter table rounds enable row level security;
alter table answers enable row level security;
alter table scores enable row level security;

-- Riffs hold no private data; anyone signed in can look one up by code to join it.
create policy "read riffs" on riffs for select to authenticated using (true);
create policy "members read players" on players for select to authenticated using (is_riff_member(riff_id));
create policy "members read messages" on messages for select to authenticated using (is_riff_member(riff_id));
create policy "members send messages" on messages for insert to authenticated
  with check (player_id in (select id from players where user_id = auth.uid() and riff_id = messages.riff_id));
create policy "members read rounds" on rounds for select to authenticated using (is_riff_member(riff_id));
-- Your own answers always; your partner's only once the round is over, so nobody copies.
create policy "read answers" on answers for select to authenticated using (
  player_id in (select id from players where user_id = auth.uid())
  or (is_riff_member(riff_id) and exists (select 1 from rounds where id = answers.round_id and ends_at <= now()))
);
create policy "submit own answer" on answers for insert to authenticated with check (
  player_id in (select id from players where user_id = auth.uid() and riff_id = answers.riff_id)
  and exists (select 1 from rounds where id = answers.round_id and riff_id = answers.riff_id and now() < ends_at)
);
create policy "members read scores" on scores for select to authenticated using (is_riff_member(riff_id));

-- Riff create / join ---------------------------------------------------------

create function create_riff(p_name text, p_interests text[]) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_riff uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    v_code := (select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 4));
    begin
      insert into riffs (code) values (v_code) returning id into v_riff;
      exit;
    exception when unique_violation then
      -- code taken, try another
    end;
  end loop;
  insert into players (riff_id, user_id, seat, name, interests)
  values (v_riff, auth.uid(), 'A', trim(p_name), p_interests);
  return v_code;
end $$;

-- Returns the caller's player id. Rejoining the same riff (e.g. after a reload) returns the existing seat.
create function join_riff(p_code text, p_name text, p_interests text[]) returns uuid
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
  return v_player;
end $$;

revoke execute on function create_riff, join_riff, is_riff_member from public, anon;
grant execute on function create_riff, join_riff, is_riff_member to authenticated;

-- Realtime -------------------------------------------------------------------

alter publication supabase_realtime add table riffs, players, messages, rounds, answers, scores;
