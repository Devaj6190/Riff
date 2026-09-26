// Points (SPEC §4.3) come only from answering nudges. A player's answer is what they text while the nudge's timer
// runs. Scored once when the timer runs out: speed in code, quality + connection + a one-line reason from the model.
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, Player, ScoreResult, Seat } from "../types";
import { llmJson } from "./llm";

export const SCORE_TIMEOUT_MS = 12_000;

/** 0–5, linear from the nudge popping up to its timer running out. */
export function speedPoints(poppedAt: string, firstAnswerAt: string, endsAt: string): number {
  const left = 1 - (Date.parse(firstAnswerAt) - Date.parse(poppedAt)) / (Date.parse(endsAt) - Date.parse(poppedAt));
  return Math.max(0, Math.min(5, Math.round(5 * left)));
}

const clampInt = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

/** Coerce model output into a ScoreResult: clamp scores, keep reasons to one short line, drop junk interests. */
export function normalizeScore(raw: unknown): ScoreResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seat = (s: Seat) => {
    const r = (obj[s] && typeof obj[s] === "object" ? obj[s] : {}) as Record<string, unknown>;
    const reason = typeof r.reason === "string" ? r.reason.replace(/\s+/g, " ").trim().slice(0, 160) : "";
    return { quality: clampInt(r.quality, 10), connection: clampInt(r.connection, 5), reason: reason || "Solid answer." };
  };
  const ni = (obj.new_interests && typeof obj.new_interests === "object" ? obj.new_interests : {}) as Record<string, unknown>;
  const interests = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 3) : [];
  return { A: seat("A"), B: seat("B"), new_interests: { A: interests(ni.A), B: interests(ni.B) } };
}

/** Score each player's answer to `nudge`. Players who didn't answer get no row. Never throws for model problems. */
export async function scoreNudge(riffId: string, nudge: Nudge): Promise<void> {
  const db = supabaseAdmin();
  const [players, answered, before] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db
      .from("messages")
      .select("player_id, body, created_at")
      .eq("riff_id", riffId)
      .gte("created_at", nudge.created_at)
      .lte("created_at", nudge.ends_at)
      .order("id"),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).lt("created_at", nudge.created_at).order("id", { ascending: false }).limit(20),
  ]);
  const seated = (players.data ?? []) as Player[];
  const name = new Map(seated.map((p) => [p.id, p.name]));
  const answers = new Map(seated.map((p) => [p.id, (answered.data ?? []).filter((m) => m.player_id === p.id)]));
  const answering = seated.filter((p) => answers.get(p.id)!.length);
  if (!answering.length) return;

  let result: ScoreResult;
  try {
    result = normalizeScore(
      await llmJson(
        [
          "Two people are texting in a chat app. An AI dropped a nudge (a prompt) into their chat and each had a short timer to answer by texting.",
          "Score each player's answer. quality 0-10: specificity, effort, creativity, being real. Opinions are never right or wrong; a bold, specific take beats a safe one.",
          "connection 0-5: tying the answer to the partner or to earlier messages — a callback, a follow-up question, responding to what the partner just said.",
          "Give each player a one-line witty reason (max ~15 words) that clearly explains the score. Playful, never mean; a low score reads as friendly feedback.",
          "Also list up to 2 new interests per player revealed by their answer (short lowercase nouns), or none.",
          'JSON shape: {"A": {"quality": n, "connection": n, "reason": s}, "B": {...}, "new_interests": {"A": [s], "B": [s]}}',
          'If a player didn\'t answer, give them 0 and reason "No answer this time."',
        ].join(" "),
        JSON.stringify({
          nudge: nudge.payload.prompt,
          earlierChat: (before.data ?? []).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
          players: seated.map((p) => ({
            seat: p.seat,
            name: p.name,
            interests: [...p.interests, ...p.extracted_interests],
            answer: answers.get(p.id)!.map((m) => m.body),
          })),
          answersInOrder: (answered.data ?? []).map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
        }),
        SCORE_TIMEOUT_MS,
        { fast: true }, // Grok first: points should pop right after the timer
      ),
    );
  } catch (e) {
    console.warn(`score nudge ${nudge.number}: model failed, neutral scores`, e instanceof Error ? e.message : e);
    const blink = { quality: 5, connection: 0, reason: "The judge blinked. Fair points all round." };
    result = normalizeScore({ A: blink, B: blink });
  }

  const rows = answering.map((p) => ({
    riff_id: riffId,
    nudge_id: nudge.id,
    player_id: p.id,
    speed: speedPoints(nudge.created_at, answers.get(p.id)![0].created_at, nudge.ends_at),
    quality: result[p.seat].quality,
    connection: result[p.seat].connection,
    multiplier: nudge.for_seat === p.seat ? 2 : 1, // Bonus nudge: the trailing player's turf counts double
    reason: result[p.seat].reason,
  }));
  const { error } = await db.from("scores").upsert(rows, { onConflict: "nudge_id,player_id", ignoreDuplicates: true });
  if (error) throw error;

  await Promise.all(
    seated.map(async (p) => {
      const add = (result.new_interests[p.seat] ?? []).filter((i) => !p.interests.includes(i) && !p.extracted_interests.includes(i));
      if (!add.length) return;
      await db.from("players").update({ extracted_interests: [...p.extracted_interests, ...add].slice(-12) }).eq("id", p.id);
    }),
  );
}
