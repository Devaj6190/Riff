-- Dev: scripted demo chats (lib/engine/demo.ts, /dev). Run once in the Supabase SQL editor after 0011.
-- demo_script: which script plays this riff (null = a normal riff). demo_step: the next line to play; /api/tick
-- claims it with a compare-and-set, so each line is sent once however many ticks race.
-- demo_summary: seat A's post-chat summary, kept here instead of chat_histories so a demo never touches anyone's
-- real history or hidden profile. A coach riff started from a demo copies it and coaches on its misses.
alter table riffs add column demo_script text, add column demo_step int not null default 0, add column demo_summary jsonb;
