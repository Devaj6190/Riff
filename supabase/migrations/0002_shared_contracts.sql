-- Shared additions several lanes depend on. Run once in the Supabase SQL editor after 0001.

-- End screen superlatives (written by the engine) and Leave & report.
alter table riffs add column summary jsonb, add column reported_at timestamptz;

-- Leave & report: any member can end the riff and flag it. Called from the client via rpc('report_riff').
create function report_riff(p_riff uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_riff_member(p_riff) then raise exception 'not a member'; end if;
  update riffs set reported_at = now(), phase = 'ended', ended_at = coalesce(ended_at, now()) where id = p_riff;
end $$;
revoke execute on function report_riff from public, anon;
grant execute on function report_riff to authenticated;

-- Voice notes: private bucket, objects stored at <riff_id>/<round_id>/<player_id>.<ext>. Members only.
insert into storage.buckets (id, name, public) values ('voice', 'voice', false) on conflict (id) do nothing;
create policy "members upload voice" on storage.objects for insert to authenticated
  with check (bucket_id = 'voice' and public.is_riff_member(((storage.foldername(name))[1])::uuid));
create policy "members read voice" on storage.objects for select to authenticated
  using (bucket_id = 'voice' and public.is_riff_member(((storage.foldername(name))[1])::uuid));
