// Test mode: an AI sits in seat B so one person can play (dev, playtesting, demo). It's an ordinary player row, so
// nudges, pacing and scoring treat it like a human. /api/tick gives it a turn in the background after every tick.
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, Player } from "../types";
import { GUARDRAILS, llmJson } from "./llm";

// ponytail: one shared auth user for every bot seat; players is unique on (riff_id, user_id), not user_id.
export const BOT_USER_ID = "00000000-0000-4000-8000-00000000b075";

const PERSONAS = [
  { name: "Maya", interests: ["anime", "food", "travel"] },
  { name: "Jordan", interests: ["sports", "memes", "gaming"] },
  { name: "Priya", interests: ["books", "art", "music"] },
  { name: "Leo", interests: ["fitness", "outdoors", "food"] },
];

/** Seat the bot as player B and start the chat (what join_riff does for a human). */
export async function seatBot(riffId: string): Promise<void> {
  const db = supabaseAdmin();
  const created = await db.auth.admin.createUser({ id: BOT_USER_ID, email: "bot@riffapp.tech", email_confirm: true });
  if (created.error && !/already|exists/i.test(created.error.message)) throw created.error;
  const p = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
  const { error } = await db.from("players").insert({ riff_id: riffId, user_id: BOT_USER_ID, seat: "B", ...p });
  if (error && error.code !== "23505") throw error; // 23505: seat already taken (reload, or a human joined)
  await db.from("riffs").update({ phase: "chatting" }).eq("id", riffId).eq("phase", "lobby");
}

/** Reply if the human said something, or a nudge popped up, since the bot last spoke. */
export async function botTurn(riffId: string): Promise<void> {
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
  const liveNudge = nudge.data && Date.now() < at(nudge.data.ends_at) ? nudge.data : null;
  if (Math.max(humanLast, at(liveNudge?.created_at)) <= botLast) return;

  const system = `${GUARDRAILS} You are ${bot.name}, a college student into ${bot.interests.join(", ")}, texting ${human.name} (into ${human.interests.join(", ")}), someone you just met on Riff. Text like a real person in a DM: casual, mostly lowercase, 1–2 short sentences, sometimes a question back. Be curious about them and give specific answers, not generic ones. Only say hi once; after that just keep talking. If there's a nudge, answer it naturally. Return JSON: {"reply": "..."}`;
  const user = [
    liveNudge && `Nudge on screen for both of you: "${liveNudge.payload.prompt}"`,
    "Chat so far (oldest first):",
    ...chat.map((m) => `${m.player_id === bot.id ? bot.name : human.name}: ${m.body}`),
  ]
    .filter(Boolean)
    .join("\n");
  const out = (await llmJson(system, user, 8000, { fast: true })) as { reply?: unknown };
  const reply = typeof out.reply === "string" ? out.reply.trim().slice(0, 500) : "";
  if (!reply) return;

  // ponytail: overlapping ticks could both get here; re-check the bot hasn't spoken meanwhile. Rare double is fine.
  const { data: latest } = await db.from("messages").select("created_at").eq("player_id", bot.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (at(latest?.created_at) > botLast) return;
  await db.from("messages").insert({ riff_id: riffId, player_id: bot.id, body: reply });
}
