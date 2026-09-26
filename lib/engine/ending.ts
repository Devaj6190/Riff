// Ending (SPEC §3 step 5, §4.6): first to the target score, or a player taps End. Superlatives at the end.
// The chat stays open after either; a new match restarts the nudges and scores.
import { supabaseAdmin } from "../supabase/admin";
import type { Player, Riff, RiffPhase, RiffSummary, Score, Seat } from "../types";
import { llmJson } from "./llm";
import { SCORE_TIMEOUT_MS } from "./score";

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

/** Write one playful superlative per player into riffs.summary. Never throws. */
export async function writeSummary(riffId: string): Promise<void> {
  const db = supabaseAdmin();
  const [players, messages] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(60),
  ]);
  const seated = (players.data ?? []) as Player[];
  const name = new Map(seated.map((p) => [p.id, p.name]));
  let superlatives: Record<Seat, string> = { A: "Most likely to riff again", B: "Most likely to riff again" };
  try {
    const out = (await llmJson(
      [
        "Two people just finished a chat. Give each player one playful superlative based on what they actually said,",
        'like "Most likely to defend Sharknado 3 in court". Kind, specific, under 10 words, starting with "Most likely to".',
        'JSON shape: {"A": string, "B": string}',
      ].join(" "),
      JSON.stringify({
        players: seated.map((p) => ({
          seat: p.seat,
          name: p.name,
          interests: [...p.interests, ...p.extracted_interests],
        })),
        chat: (messages.data ?? []).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
      }),
      SCORE_TIMEOUT_MS,
    )) as Partial<Record<Seat, unknown>>;
    const pick = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : d);
    superlatives = { A: pick(out.A, superlatives.A), B: pick(out.B, superlatives.B) };
  } catch (e) {
    console.warn("superlatives: model failed, using defaults", e instanceof Error ? e.message : e);
  }
  await db.from("riffs").update({ summary: { superlatives } satisfies RiffSummary }).eq("id", riffId);
}

/** End the riff now (idempotent). Returns the phase it's in afterwards. */
export async function endRiff(riff: Riff): Promise<RiffPhase> {
  if (riff.phase === "ended") return "ended";
  const { data } = await supabaseAdmin()
    .from("riffs")
    .update({ phase: "ended", ended_at: new Date().toISOString() })
    .eq("id", riff.id)
    .neq("phase", "ended")
    .select("id");
  if (data?.length) await writeSummary(riff.id);
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
