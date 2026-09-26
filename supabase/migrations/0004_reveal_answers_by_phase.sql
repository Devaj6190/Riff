-- Reveal a partner's answer once the riff has moved past that round, not only once rounds.ends_at has passed.
-- ends_at is stamped by the app server's clock; if it runs ahead of the DB's, answers stayed hidden for a moment
-- after the round closed, and the client's refresh landed inside that moment. The phase changes first and is
-- what triggers the refresh, so it's the reliable signal.
drop policy "read answers" on answers;
create policy "read answers" on answers for select to authenticated using (
  player_id in (select id from players where user_id = auth.uid())
  or (
    is_riff_member(riff_id)
    and exists (
      select 1 from rounds r join riffs f on f.id = r.riff_id
      where r.id = answers.round_id
        and (r.ends_at <= now() or f.round_number > r.number or f.phase <> 'round_active')
    )
  )
);
