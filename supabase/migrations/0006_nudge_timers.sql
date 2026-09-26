-- Nudges get a timer, and points come from answering them (SPEC §4.3): speed + quality + connection, per player,
-- scored once when the timer runs out. Run once in the Supabase SQL editor after 0005.

alter table nudges
  add column ends_at timestamptz, -- the nudge's countdown; what a player texts before this is their answer
  add column scored_at timestamptz; -- set by the one /api/tick call that scores it (compare-and-set)
update nudges set ends_at = created_at, scored_at = created_at where ends_at is null;
alter table nudges alter column ends_at set not null;

alter table scores drop column total;
alter table scores
  add column speed int not null default 0 check (speed between 0 and 5),
  add column total int generated always as ((speed + quality + connection) * multiplier) stored;
