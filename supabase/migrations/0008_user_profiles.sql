-- Hidden profile per user: a roll-up of all their chat_histories, rewritten after each chat ends (ending.ts).
-- Nudge writers use it to steer topics in later chats; never shown to users. Engine-only: RLS on, no policies.
-- Run once in the Supabase SQL editor after 0007.
create table user_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);
alter table user_profiles enable row level security;
