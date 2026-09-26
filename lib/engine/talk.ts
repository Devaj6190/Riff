// Talk window (SPEC §4.5): free chat after each result. The deadline is recomputed from the messages, so it's
// deterministic, can't be gamed by repeated calls, and needs no extra state. At close, the chat is scored for
// connection (SPEC §4.3) as `scores` rows of kind 'talk'.
import { supabaseAdmin } from "../supabase/admin";
import type { Player, Round, Seat } from "../types";
import { phaseSeconds, TALK } from "./clock";
import { JUDGE_TIMEOUT_MS, normalizeJudge } from "./judge";
import { llmJson } from "./llm";

type Posted = { seat: Seat; at: number }; // ms

/** Deadline (ms): min window + 8 s per message sent while both players posted within the last 10 s, capped. */
export function talkDeadline(windowStart: number, messages: Posted[]): number {
  const cap = windowStart + TALK.maxSeconds * 1000;
  let deadline = windowStart + TALK.minSeconds * 1000;
  const last: Partial<Record<Seat, number>> = {};
  for (const m of [...messages].sort((a, b) => a.at - b.at)) {
    if (m.at < windowStart) continue;
    if (m.at > deadline) break;
    last[m.seat] = m.at;
    const other = last[m.seat === "A" ? "B" : "A"];
    if (other !== undefined && m.at - other <= TALK.bothActiveWithinSeconds * 1000) {
      deadline = Math.min(cap, deadline + TALK.perMessageSeconds * 1000);
    }
  }
  return deadline;
}

type Window = { round: Round; players: Player[]; start: number; messages: (Posted & { playerId: string; body: string })[] };

/** The current round's talk window: it opens when round_result ends, i.e. the round's close + result time. */
export async function loadWindow(riffId: string, roundNumber: number): Promise<Window | null> {
  const db = supabaseAdmin();
  const { data: round } = await db.from("rounds").select("*").eq("riff_id", riffId).eq("number", roundNumber).maybeSingle<Round>();
  if (!round) return null;
  const start = Date.parse(round.ends_at) + phaseSeconds("round_result") * 1000;
  const [players, messages] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId),
    db.from("messages").select("player_id, body, created_at").eq("riff_id", riffId).gte("created_at", new Date(start).toISOString()).order("id"),
  ]);
  const seated = (players.data ?? []) as Player[];
  const seatOf = new Map(seated.map((p) => [p.id, p.seat]));
  return {
    round,
    players: seated,
    start,
    messages: (messages.data ?? []).map((m) => ({ seat: seatOf.get(m.player_id) ?? "A", at: Date.parse(m.created_at), playerId: m.player_id, body: m.body })),
  };
}

/** Score the window's chat for connection. Skips silent windows; never throws for model problems. */
export async function scoreTalk(riffId: string, roundNumber: number): Promise<void> {
  const w = await loadWindow(riffId, roundNumber);
  if (!w || !w.messages.length) return;
  const name = new Map(w.players.map((p) => [p.id, p.name]));
  let result;
  try {
    result = normalizeJudge(
      await llmJson(
        [
          "You score the free-chat window between rounds of a two-player conversation game, for connection only.",
          "connection 0-5 per player: asking follow-up questions, callbacks to earlier things the partner said, genuinely responding to them.",
          "Just talking a lot is not connection. A player who said nothing gets 0.",
          'Give a one-line playful reason per player. JSON shape: {"A": {"connection": n, "reason": s}, "B": {...}}',
        ].join(" "),
        JSON.stringify({
          players: w.players.map((p) => ({ seat: p.seat, name: p.name })),
          chat: w.messages.map((m) => `${name.get(m.playerId) ?? "?"} (${m.seat}): ${m.body}`),
        }),
        JUDGE_TIMEOUT_MS,
      ),
    );
  } catch (e) {
    console.warn(`talk round ${roundNumber}: model failed, skipping connection points`, e instanceof Error ? e.message : e);
    return;
  }
  const spoke = new Set(w.messages.map((m) => m.seat));
  const rows = w.players
    .filter((p) => spoke.has(p.seat) && result[p.seat].connection > 0)
    .map((p) => ({
      riff_id: riffId,
      round_id: w.round.id,
      player_id: p.id,
      kind: "talk",
      connection: result[p.seat].connection,
      reason: result[p.seat].reason,
    }));
  if (!rows.length) return;
  const { error } = await supabaseAdmin().from("scores").upsert(rows, { onConflict: "round_id,player_id,kind", ignoreDuplicates: true });
  if (error) throw error;
}
