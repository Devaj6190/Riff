// Ending (SPEC §3 step 5, §4.6): first to the target score, or a player taps End. Moment Spotlight at the end.
// The chat stays open after either; a new match restarts the nudges and scores. Each end also saves a private
// summary per player to chat_histories, for pairing people later, with that player's coaching report (coaching.ts).
import { after } from "next/server";
import { supabaseAdmin } from "../supabase/admin";
import type { ChatHistorySummary, CoachingReport, Moment, Player, Riff, RiffPhase, RiffSummary, Score, Seat, UserProfile } from "../types";
import { BOT_USER_ID } from "./bot";
import { writeCoaching } from "./coaching";
import { llmJson } from "./llm";
import { loadChatContext, strings } from "./reader";
import { MOMENTS_PROMPT, normalizeMoments } from "./moments";

/** Target score: RIFF_TARGET_SCORE (Expo mode = 50), else the riff's own. */
export function targetScore(fallback: number): number {
  const n = Number(process.env.RIFF_TARGET_SCORE);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function isGameOver(totals: number[], target: number): boolean {
  return totals.some((t) => t >= target);
}

/** End the riff if someone has reached the target. Returns whether it's over. */
export async function endIfWon(riffId: string): Promise<boolean> {
  const { data: riff } = await supabaseAdmin().from("riffs").select("*").eq("id", riffId).single<Riff>();
  if (!riff || riff.phase !== "chatting") return riff?.phase === "ended";
  if (!isGameOver([...(await totalsByPlayer(riffId)).values()], targetScore(riff.target_score))) return false;
  await endRiff(riff);
  return true;
}

/** Score so far per player id; a player with no scores yet is absent. */
export async function totalsByPlayer(riffId: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin().from("scores").select("player_id, total").eq("riff_id", riffId);
  const byPlayer = new Map<string, number>();
  for (const s of (data ?? []) as Pick<Score, "player_id" | "total">[]) byPlayer.set(s.player_id, (byPlayer.get(s.player_id) ?? 0) + s.total);
  return byPlayer;
}

/**
 * Write the Moment Spotlight into riffs.summary: up to 3 real moments from this match (messages since its first
 * nudge; a new match gets a fresh reel). Never throws, and always writes, so the client's loading state ends.
 */
export async function writeSummary(riff: Riff): Promise<void> {
  const db = supabaseAdmin();
  let moments: Moment[] = [];
  try {
    if (riff.kind === "coach") return;
    const [players, first, known] = await Promise.all([
      db.from("players").select("*").eq("riff_id", riff.id),
      db.from("nudges").select("created_at").eq("riff_id", riff.id).order("number").limit(1).maybeSingle(),
      loadChatContext(riff.id),
    ]);
    let q = db.from("messages").select("player_id, body").eq("riff_id", riff.id);
    if (first.data) q = q.gte("created_at", first.data.created_at);
    const { data: messages } = await q.order("id", { ascending: false }).limit(200);
    const seated = (players.data ?? []) as Player[];
    const seat = new Map(seated.map((p) => [p.id, p.seat]));
    const lines = (messages ?? []).reverse().flatMap((m) => (seat.has(m.player_id) ? [{ seat: seat.get(m.player_id)!, body: m.body }] : []));
    if (lines.length < 2) return;
    moments = normalizeMoments(
      await llmJson(
        MOMENTS_PROMPT,
        JSON.stringify({
          players: seated.map((p) => ({ seat: p.seat, name: p.name })),
          runningJokes: known.thread.callbacks,
          chat: lines.map((l, i) => `${i + 1} ${l.seat}: ${l.body}`),
        }),
        MOMENTS_TIMEOUT_MS,
      ),
      lines,
    );
  } catch (e) {
    console.warn("moments: model failed, empty reel", e instanceof Error ? e.message : e);
  } finally {
    // Only while still ended: a New match mid-generation must not get the old reel.
    await db.from("riffs").update({ summary: { moments } satisfies RiffSummary }).eq("id", riff.id).eq("phase", "ended");
  }
}

// ponytail: per provider, so Muse then Grok is 30 s worst case; tighten if /api/end's 60 s gets crowded.
const MOMENTS_TIMEOUT_MS = 15_000;

/** End the riff now (idempotent). Returns the phase it's in afterwards. */
export async function endRiff(riff: Riff): Promise<RiffPhase> {
  if (riff.phase === "ended") return "ended";
  const { data } = await supabaseAdmin()
    .from("riffs")
    .update({ phase: "ended", ended_at: new Date().toISOString() })
    .eq("id", riff.id)
    .neq("phase", "ended")
    .select("id");
  if (data?.length) {
    // ponytail: coach chats don't feed the profile, so a miss stays until a later real chat stops showing it.
    if (riff.kind !== "coach") after(() => saveHistory(riff.id, !!riff.demo_script).catch((e) => console.error("chat history failed", e)));
    await writeSummary(riff);
  }
  return "ended";
}

/**
 * New match in the same riff: clears nudges (scores cascade) and the queue; keeps the chat. The first nudge of the
 * new match pops up on the next tick. Stays in the lobby if the partner hasn't joined yet.
 */
export async function restartRiff(riff: Riff): Promise<RiffPhase> {
  const db = supabaseAdmin();
  await db.from("queued_nudges").delete().eq("riff_id", riff.id);
  await db.from("nudges").delete().eq("riff_id", riff.id);
  const phase: RiffPhase = riff.phase === "lobby" ? "lobby" : "chatting";
  await db.from("riffs").update({ phase, summary: null, ended_at: null }).eq("id", riff.id);
  return phase;
}

/** Coerce model output into one ChatHistorySummary per seat. */
export function normalizeHistory(raw: unknown): Record<Seat, ChatHistorySummary> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const recap = typeof o.recap === "string" ? o.recap.trim().slice(0, 600) : "";
  const side = (s: Seat): ChatHistorySummary => {
    const r = (o[s] && typeof o[s] === "object" ? o[s] : {}) as Record<string, unknown>;
    return { recap, learned: strings(r.learned, 20), clicked: strings(r.clicked, 8), died: strings(r.died, 8), misses: strings(r.misses, 8) };
  };
  return { A: side("A"), B: side("B") };
}

/**
 * Summarize the whole chat into chat_histories, one row per (real) player. Runs after the response (endRiff), on
 * every end: a new match in the same riff keeps the chat, so the latest end overwrites with the fuller summary.
 * Then rolls each player's histories into their hidden profile. A demo (demo.ts) keeps seat A's summary on the riff
 * instead, so it never touches anyone's real history or profile.
 */
export async function saveHistory(riffId: string, demo = false): Promise<void> {
  const db = supabaseAdmin();
  const [players, messages, known, nudges, scores] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("id", { ascending: false }).limit(400),
    loadChatContext(riffId),
    db.from("nudges").select("id, payload").eq("riff_id", riffId).order("number"),
    db.from("scores").select("nudge_id, player_id, quality").eq("riff_id", riffId),
  ]);
  const seated = (players.data ?? []) as Player[];
  const seat = new Map(seated.map((p) => [p.id, p.seat]));
  if (!messages.data?.length) return;
  const lines = [...messages.data].reverse().map((m) => ({ seat: (seat.get(m.player_id) ?? "A") as Seat, body: m.body as string }));
  const nudgeScores = (nudges.data ?? []).map((n) => ({
    prompt: n.payload?.prompt,
    quality: Object.fromEntries((scores.data ?? []).filter((s) => s.nudge_id === n.id).map((s) => [seat.get(s.player_id) ?? "?", s.quality])),
  }));
  // The coaching report (coaching.ts) is its own call, in parallel: the end isn't slower, and a failed report
  // doesn't cost the summary.
  const [raw, coaching] = await Promise.all([
    llmJson(
      [
        "Two people who just met finished a chat. Summarize it for a matchmaker who will pair them with new people later.",
        "recap: the chat in 2-3 sentences. Per player: learned: facts, opinions, tastes and stories they shared;",
        "clicked: topics that got long, excited back-and-forths; died: topics that went nowhere.",
        "nudges shows how well each answered each nudge (quality 0-10, missing = no answer): weigh it in clicked and died.",
        "misses: references or topics they didn't get, or checked out of (\"didn't know the Succession reference\").",
        "Short phrases, only what the chat shows. Leave out contact details, addresses and social handles.",
        'JSON shape: {"recap": s, "A": {"learned": [s], "clicked": [s], "died": [s], "misses": [s]}, "B": {...}}',
      ].join(" "),
      JSON.stringify({
        players: seated.map((p) => ({ seat: p.seat, name: p.name, interests: p.interests })),
        liveNotes: known,
        nudges: nudgeScores,
        chat: lines.map((l) => `${l.seat}: ${l.body}`),
      }),
      25_000, // then rollUpProfile, all inside the route's 60 s
    ),
    writeCoaching({ players: seated, lines, known, nudges: nudgeScores }).catch((e) => {
      console.warn("coaching report failed", e instanceof Error ? e.message : e);
      return {} as Partial<Record<Seat, CoachingReport>>;
    }),
  ]);
  const summary = normalizeHistory(raw);
  for (const s of ["A", "B"] as Seat[]) if (coaching[s]) summary[s].coaching = coaching[s];
  if (demo) {
    const { error } = await db.from("riffs").update({ demo_summary: summary.A }).eq("id", riffId);
    if (error) throw error;
    return;
  }
  const rows = seated
    .filter((p) => p.user_id !== BOT_USER_ID)
    .map((p) => ({
      user_id: p.user_id,
      riff_id: riffId,
      partner_user_id: seated.find((o) => o.id !== p.id)?.user_id ?? null,
      summary: summary[p.seat],
      created_at: new Date().toISOString(),
    }));
  const { error } = await db.from("chat_histories").upsert(rows, { onConflict: "user_id,riff_id" });
  if (error) throw error;
  await Promise.all(seated.filter((p) => p.user_id !== BOT_USER_ID).map((p) => rollUpProfile(p)));
}

/** Coerce model output into a UserProfile. */
export function normalizeProfile(raw: unknown, chats: number): UserProfile {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const about = typeof o.about === "string" ? o.about.trim().slice(0, 300) : "";
  return { about, enjoys: strings(o.enjoys, 10), flat: strings(o.flat, 10), misses: strings(o.misses, 10), chats };
}

/** Roll all of a user's chat_histories into their hidden user_profiles row. Grok: it runs after the history call. */
async function rollUpProfile(player: Player): Promise<void> {
  const db = supabaseAdmin();
  // ponytail: newest 20 is every chat at hackathon scale; roll the old profile in instead if people get past that.
  const { data: histories } = await db
    .from("chat_histories")
    .select("summary")
    .eq("user_id", player.user_id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!histories?.length) return;
  const profile = normalizeProfile(
    await llmJson(
      [
        "You keep a private profile of one person for a matchmaker, built from summaries of their past chats (newest first).",
        "about: who they are and how they chat, 1-2 sentences. enjoys: topics that reliably spark them.",
        "flat: topics that fell flat. misses: references or topics they tend not to get.",
        "Weigh patterns across chats over one-offs; newer chats win when they disagree. Short phrases.",
        "Leave out contact details, addresses and social handles.",
        'JSON shape: {"about": s, "enjoys": [s], "flat": [s], "misses": [s]}',
      ].join(" "),
      // Without the coaching reports: the profile needs what they talked about, and they'd double the input.
      JSON.stringify({ name: player.name, signupInterests: player.interests, chats: histories.map((h) => ({ ...h.summary, coaching: undefined })) }),
      15_000,
      { fast: true },
    ),
    histories.length,
  );
  const { error } = await db.from("user_profiles").upsert({ user_id: player.user_id, profile, updated_at: new Date().toISOString() });
  if (error) throw error;
}
