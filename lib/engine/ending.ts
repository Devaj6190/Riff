// Ending (SPEC §3 step 6, §4.6): first to the target score, hidden cap after round 12, superlatives at the end.
import { supabaseAdmin } from "../supabase/admin";
import type { GamePhase, Player, Riff, RiffSummary, Score, Seat } from "../types";
import { answerText, JUDGE_TIMEOUT_MS } from "./judge";
import { llmJson } from "./llm";

export const ROUND_CAP = 12;

/** Target score for new games: RIFF_TARGET_SCORE (Expo mode = 50), else the riff's own. */
export function targetScore(fallback: number): number {
  const n = Number(process.env.RIFF_TARGET_SCORE);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function isGameOver(totals: number[], target: number, roundNumber: number): boolean {
  return totals.some((t) => t >= target) || roundNumber >= ROUND_CAP;
}

export async function totals(riffId: string): Promise<number[]> {
  const { data } = await supabaseAdmin().from("scores").select("player_id, total").eq("riff_id", riffId);
  const byPlayer = new Map<string, number>();
  for (const s of (data ?? []) as Pick<Score, "player_id" | "total">[]) byPlayer.set(s.player_id, (byPlayer.get(s.player_id) ?? 0) + s.total);
  return [...byPlayer.values()];
}

/** Write one playful superlative per player into riffs.summary. Never throws. */
export async function writeSummary(riffId: string): Promise<void> {
  const db = supabaseAdmin();
  const [players, answers, messages] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId),
    db.from("answers").select("player_id, payload").eq("riff_id", riffId),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(30),
  ]);
  const seated = (players.data ?? []) as Player[];
  const name = new Map(seated.map((p) => [p.id, p.name]));
  let superlatives: Record<Seat, string> = { A: "Most likely to riff again", B: "Most likely to riff again" };
  try {
    const out = (await llmJson(
      [
        "A two-player conversation game just ended. Give each player one playful superlative based on what they actually said,",
        'like "Most likely to defend Sharknado 3 in court". Kind, specific, under 10 words, starting with "Most likely to".',
        'JSON shape: {"A": string, "B": string}',
      ].join(" "),
      JSON.stringify({
        players: seated.map((p) => ({
          seat: p.seat,
          name: p.name,
          interests: [...p.interests, ...p.extracted_interests],
          answers: (answers.data ?? []).filter((a) => a.player_id === p.id).map((a) => answerText(a as never)).filter(Boolean),
        })),
        chat: (messages.data ?? []).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
      }),
      JUDGE_TIMEOUT_MS,
    )) as Partial<Record<Seat, unknown>>;
    const pick = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : d);
    superlatives = { A: pick(out.A, superlatives.A), B: pick(out.B, superlatives.B) };
  } catch (e) {
    console.warn("superlatives: model failed, using defaults", e instanceof Error ? e.message : e);
  }
  await db.from("riffs").update({ summary: { superlatives } satisfies RiffSummary }).eq("id", riffId);
}

/** End the riff now (idempotent). Returns the phase it's in afterwards. */
export async function endRiff(riff: Riff): Promise<GamePhase> {
  if (riff.phase === "ended") return "ended";
  const { data } = await supabaseAdmin()
    .from("riffs")
    .update({ phase: "ended", phase_ends_at: null, ended_at: new Date().toISOString() })
    .eq("id", riff.id)
    .neq("phase", "ended")
    .select("id");
  if (data?.length) await writeSummary(riff.id);
  return "ended";
}

/** Fresh game in the same riff: clears rounds (answers and scores cascade) and the queue; keeps the chat. */
export async function restartRiff(riffId: string): Promise<GamePhase> {
  const db = supabaseAdmin();
  await db.from("queued_rounds").delete().eq("riff_id", riffId);
  await db.from("rounds").delete().eq("riff_id", riffId);
  await db.from("riffs").update({ phase: "lobby", phase_ends_at: null, round_number: 0, summary: null, ended_at: null }).eq("id", riffId);
  return "lobby";
}
