-- Public profiles (SPEC §7 Profiles, /api/profile). Run once in the Supabase SQL editor after 0010.
-- Engine-only (RLS on, no policies): the route reads and writes it, and only ever sends other people the public
-- fields. last_name and age are private. Separate from the hidden user_profiles rollup.
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  last_name text not null default '',
  age int not null check (age between 15 and 120),
  hometown text not null default '',
  interests text[] not null,
  prompts jsonb not null default '[]', -- [{prompt, answer}], up to 3
  favorites jsonb not null default '[]', -- [{kind, value}], up to 3
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
