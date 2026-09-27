-- Discovery (SPEC §7, lib/engine/search.ts). Run once in the Supabase SQL editor after 0009.

-- match: Match me, auto-paired. browse: in search, only ever paired by an invite (or by a match-mode player tapping them).
alter table match_queue add column mode text not null default 'match' check (mode in ('match', 'browse'));

-- Search invites between two people in the queue. Engine-only (RLS on, no policies). Live for 60 s (search.ts);
-- deleted once either is paired.
create table invites (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  passed boolean not null default false, -- the recipient swiped left
  created_at timestamptz not null default now(),
  unique (from_user, to_user)
);
create index on invites (to_user);
alter table invites enable row level security;

-- pair_up also clears both players' invites, so the first yes cancels the rest.
create or replace function pair_up(p_a uuid, p_b uuid) returns text
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
  delete from invites where from_user in (p_a, p_b) or to_user in (p_a, p_b);
  return v.code;
end $$;

revoke execute on function pair_up from public, anon, authenticated;
