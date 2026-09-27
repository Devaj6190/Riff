// Test mode: an AI sits in seat B so one person can play (dev, playtesting, demo). It's an ordinary player row, so
// nudges, pacing and scoring treat it like a human. /api/tick gives it a turn in the background after every tick.
import { isGame, playsStage, STATEMENT_MAX, type GameNudge } from "../games";
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, Player, PlayRequest, Seat } from "../types";
import { submitPlay } from "./games";
import { GUARDRAILS, llmJson } from "./llm";
import { seedFor } from "./personas";

// ponytail: one shared auth user for every bot seat; players is unique on (riff_id, user_id), not user_id.
export const BOT_USER_ID = "00000000-0000-4000-8000-00000000b075";

const PERSONAS = [
  { name: "Maya", interests: ["anime", "food", "travel"] },
  { name: "Jordan", interests: ["sports", "memes", "gaming"] },
  { name: "Priya", interests: ["books", "art", "music"] },
  { name: "Leo", interests: ["fitness", "outdoors", "food"] },
];

/** Seat the bot as player B (a random persona unless given) and start the chat (what join_riff does for a human). */
export async function seatBot(riffId: string, persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)]): Promise<void> {
  const db = supabaseAdmin();
  const created = await db.auth.admin.createUser({ id: BOT_USER_ID, email: "bot@riffapp.tech", email_confirm: true });
  if (created.error && !/already|exists/i.test(created.error.message)) throw created.error;
  const { error } = await db.from("players").insert({ riff_id: riffId, user_id: BOT_USER_ID, seat: "B", ...persona });
  if (error && error.code !== "23505") throw error; // 23505: seat already taken (reload, or a human joined)
  await db.from("riffs").update({ phase: "chatting" }).eq("id", riffId).eq("phase", "lobby");
}

/** When the bot plays a search seed: its public profile, so it stays consistent with what the human read. */
function seedProfile(bot: Player): string {
  const seed = seedFor(bot);
  if (!seed) return "";
  const lines = [seed.from && `from ${seed.from}`, ...seed.prompts.map((p) => `${p.prompt} ${p.answer}`), ...seed.favorites.map((f) => `favorite ${f.kind}: ${f.value}`)];
  return ` Your public profile, which they may have read (stay consistent with it): ${lines.filter(Boolean).join("; ")}.`;
}

/**
 * Reply if the human said something, or a nudge popped up, since the bot last spoke. `persona` swaps in another
 * system prompt (the coach, coach.ts); that bot also opens the chat and may ask questions.
 */
export async function botTurn(riffId: string, persona?: (bot: Player, human: Player) => Promise<string>): Promise<void> {
  // ponytail: per-instance, like the reader: ticks come every second, one reply in flight per riff is enough.
  if (replying.has(riffId)) return;
  replying.add(riffId);
  try {
    await turn(riffId, persona);
  } finally {
    replying.delete(riffId);
  }
}
const replying = new Set<string>();

async function turn(riffId: string, persona?: (bot: Player, human: Player) => Promise<string>): Promise<void> {
  const db = supabaseAdmin();
  const [players, messages, nudge] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId),
    db.from("messages").select("player_id, body, created_at").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(30),
    db.from("nudges").select("*").eq("riff_id", riffId).order("number", { ascending: false }).limit(1).maybeSingle<Nudge>(),
  ]);
  const all = (players.data ?? []) as Player[];
  const bot = all.find((p) => p.user_id === BOT_USER_ID);
  const human = all.find((p) => p.user_id !== BOT_USER_ID);
  if (!bot || !human) return;
  const chat = (messages.data ?? []).reverse();
  const at = (s?: string) => (s ? Date.parse(s) : 0);
  const botLast = at(chat.findLast((m) => m.player_id === bot.id)?.created_at);
  const humanLast = at(chat.findLast((m) => m.player_id !== bot.id)?.created_at);
  // Mini games are played with taps (botPlay), not answered in the chat.
  const liveNudge = nudge.data && !isGame(nudge.data) && Date.now() < at(nudge.data.ends_at) ? nudge.data : null;
  const trigger = Math.max(humanLast, at(liveNudge?.created_at), persona && !chat.length ? 1 : 0);
  if (trigger <= botLast) return;
  // Like a person: reads once they've stopped typing (people double-text), then takes a moment.
  if (Date.now() - trigger < 1500 + Math.random() * 2000) return;
  const botLastBody = chat.findLast((m) => m.player_id === bot.id)?.body ?? "";

  const system = persona ? await persona(bot, human) : `${GUARDRAILS} You are ${bot.name}, a college student into ${bot.interests.join(", ")}, texting ${human.name} (into ${human.interests.join(", ")}), someone you just met on Riff.${seedProfile(bot)} Text like a real person in a DM, not an assistant:
- casual, mostly lowercase, little punctuation; vary length: sometimes 2–4 words ("lmao no way", "wait same"), sometimes 1–2 sentences
- react, share your own opinions and small stories, tease a little, disagree sometimes; don't be over-eager or agreeable
- do NOT end every message with a question; most messages have none
- no emojis most of the time, don't use their name, only say hi once
- always respond to what they just said before anything else; never ignore their message or change the subject
- if there's a nudge you haven't answered, answer it in your own words like a person would
Return JSON: {"reply": "..."}`;
  // What to respond to: their messages since the bot last spoke, and the nudge if the bot hasn't answered it yet.
  const unread = chat.filter((m) => m.player_id !== bot.id && at(m.created_at) > botLast).map((m) => m.body);
  const openNudge = liveNudge && at(liveNudge.created_at) > botLast ? liveNudge : null;
  const user = [
    "Chat so far (oldest first):",
    ...chat.map((m) => `${m.player_id === bot.id ? bot.name : human.name}: ${m.body}`),
    "",
    unread.length && `${human.name} just said: ${unread.map((b) => `"${b}"`).join(" / ")}. Respond to that directly first: react to what they actually said, answer anything they asked.`,
    openNudge && `Nudge on screen for both of you that you haven't answered yet: "${openNudge.payload.prompt}". Answer it too.`,
  ]
    .filter(Boolean)
    .join("\n");
  const out = (await llmJson(system, user, 8000, { fast: true })) as { reply?: unknown };
  const reply = typeof out.reply === "string" ? out.reply.trim().slice(0, 500) : "";
  if (!reply) return;
  // Grok follows "don't always ask" loosely: after a message with a question, drop the question sentences.
  const noQuestions = reply.split(/(?<=[.!?])\s+/).filter((part) => !part.endsWith("?")).join(" ");
  const text = !persona && botLastBody.includes("?") && noQuestions ? noQuestions : reply;
  // Typing time at fast-thumbs speed (~16 chars/s), capped.
  await new Promise((r) => setTimeout(r, Math.min(5000, 600 + text.length * 60)));

  // ponytail: overlapping ticks can both get here while "typing"; whoever sends second sees the first and drops out.
  // Stale: they sent something new while the bot was typing, so the next tick replies to all of it instead.
  const { data: latest } = await db.from("messages").select("player_id, created_at").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latest && at(latest.created_at) > Math.max(botLast, humanLast)) return;
  await db.from("messages").insert({ riff_id: riffId, player_id: bot.id, body: text });
}

// ponytail: per-instance, like judged in score.ts: a stage the bot has played (or is playing) isn't played again.
// Never pruned: one short entry per stage. A skipped or failed play is forgotten so the next tick retries.
const playing = new Set<string>();

/**
 * Test mode: the bot's tap in a mini game (SPEC §4.1), a few seconds into each stage it plays, like a person.
 * Its pick and statements come from the model, in persona; guesses are its own call. Random if the model fails.
 */
export async function botPlay(riffId: string, nudge: GameNudge): Promise<void> {
  const p = nudge.payload;
  const key = `${nudge.id}:${p.stage}`;
  if (p.stage === "reveal" || playing.has(key) || Date.now() - Date.parse(p.stageAt) < 3000) return;
  const db = supabaseAdmin();
  const { data } = await db.from("players").select("*").eq("riff_id", riffId);
  const all = (data ?? []) as Player[];
  const bot = all.find((x) => x.user_id === BOT_USER_ID);
  const human = all.find((x) => x.user_id !== BOT_USER_ID);
  if (!bot || !human || p.locked.includes(bot.seat) || !playsStage(p, [bot.seat]).length) return;
  playing.add(key);
  try {
    const who = `You are ${bot.name}, a college student into ${bot.interests.join(", ")}, playing a mini game with ${human.name} (into ${human.interests.join(", ")}), someone you just met.${seedProfile(bot)}`;
    const base = { riffId, nudgeId: nudge.id };
    const random = (n: number) => Math.floor(Math.random() * n);
    let req: PlayRequest;
    if (p.stage === "play" && "options" in p) {
      const out = (await llmJson(
        `${who} Pick the option you'd really choose, and guess which one ${human.name} picks. JSON shape: {"pick": index, "guess": index} (0-based).`,
        JSON.stringify({ question: p.prompt, options: p.options }),
        6000,
        { fast: true },
      ).catch(() => ({}))) as { pick?: unknown; guess?: unknown };
      const ok = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < p.options.length;
      req = { ...base, stage: "play", pick: ok(out.pick) ? out.pick : random(p.options.length), guess: ok(out.guess) ? out.guess : random(p.options.length) };
    } else if (p.stage === "write") {
      const out = (await llmJson(
        `${who} Two truths and a lie: write 3 short first-person statements about yourself that fit you and the theme, two true to your persona and one believable lie, in random order, each under ${STATEMENT_MAX} characters, casual texting tone. JSON shape: {"statements": [s, s, s], "lie": index} (0-based).`,
        JSON.stringify({ theme: p.prompt }),
        8000,
        { fast: true },
      ).catch(() => ({}))) as { statements?: unknown; lie?: unknown };
      const statements = Array.isArray(out.statements) ? out.statements.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, STATEMENT_MAX)) : [];
      if (statements.length !== 3 || statements.some((x) => !x)) return void playing.delete(key); // retry, never write junk
      req = { ...base, stage: "write", statements, lie: Number.isInteger(out.lie) && (out.lie as number) >= 0 && (out.lie as number) < 3 ? (out.lie as number) : random(3) };
    } else {
      req = { ...base, stage: "guess", guess: random(3) };
    }
    await submitPlay(riffId, { id: bot.id, seat: bot.seat as Seat }, req).catch((e) => {
      if (!(e instanceof Response)) throw e; // stage moved on or already locked: nothing to do
    });
  } catch (e) {
    playing.delete(key);
    throw e;
  }
}
