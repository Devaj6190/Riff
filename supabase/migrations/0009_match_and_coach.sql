-- Match me (lib/engine/match.ts) and the coach (lib/engine/coach.ts). Run once in the Supabase SQL editor after 0008.

-- game: the nudge game. coach: a 1:1 with the AI coach catching a player up on references they missed; no nudges.
alter table riffs add column kind text not null default 'game' check (kind in ('game', 'coach'));

-- Players waiting for a match. Engine-only (RLS on, no policies): /api/match reads and writes it for the caller.
create table match_queue (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  interests text[] not null check (cardinality(interests) between 1 and 3),
  seen_at timestamptz not null default now(), -- last poll; a row that stops polling is never matched
  riff_code text -- set once matched
);
alter table match_queue enable row level security;

-- A new riff with a fresh code, already chatting: both seats are filled right after. Service role only.
create function insert_riff(p_kind text) returns riffs
language plpgsql security definer set search_path = public as $$
declare
  v riffs;
begin
  loop
    begin
      insert into riffs (code, kind, phase)
      values ((select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 4)), p_kind, 'chatting')
      returning * into v;
      return v;
    exception when unique_violation then
      -- code taken, try another
    end;
  end loop;
end $$;

-- Seat two waiting players in a new riff, atomically. Null if either was already matched (another poll won).
create function pair_up(p_a uuid, p_b uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v riffs;
begin
  perform 1 from match_queue where user_id in (p_a, p_b) order by user_id for update; -- fixed order: no deadlocks
  if p_a = p_b or (select count(*) from match_queue where user_id in (p_a, p_b) and riff_code is null) < 2 then
    return null;
  end if;
  v := insert_riff('game');
  insert into players (riff_id, user_id, seat, name, interests)
  select v.id, user_id, case when user_id = p_a then 'A' else 'B' end, name, interests
  from match_queue where user_id in (p_a, p_b);
  update match_queue set riff_code = v.code where user_id in (p_a, p_b);
  return v.code;
end $$;

revoke execute on function insert_riff, pair_up from public, anon, authenticated;
