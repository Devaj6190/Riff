-- What the engine learns from the chat. Engine-only: RLS on with no policies, so only the service role reads or
-- writes these; players never see them. Run once in the Supabase SQL editor after 0006.

-- Live: per-player notes + the current thread, rewritten as messages come in (reader.ts). read_through is the last
-- message id folded in (compare-and-set, so two ticks never fold the same messages twice).
create table riff_context (
  riff_id uuid primary key references riffs on delete cascade,
  context jsonb not null,
  read_through bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table riff_context enable row level security;

-- Post-chat: one summary per player per riff, written when the riff ends. For future pairing; never shown to users.
create table chat_histories (
  user_id uuid not null references auth.users on delete cascade,
  riff_id uuid not null references riffs on delete cascade,
  partner_user_id uuid references auth.users on delete set null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, riff_id)
);
alter table chat_histories enable row level security;
