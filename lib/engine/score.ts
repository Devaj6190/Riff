// Hidden scoring (SPEC §4.3). When a nudge pops up, the stretch of chat since the previous one is scored for
// quality and connection. Runs in the background; nobody waits on it and the UI doesn't show it yet.
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, Player, ScoreResult, Seat } from "../types";
import { llmJson } from "./llm";

export const SCORE_TIMEOUT_MS = 12_000;

const clampInt = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

/** Coerce model output into a ScoreResult: clamp scores, keep reasons to one short line, drop junk interests. */
export function normalizeScore(raw: unknown): ScoreResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seat = (s: Seat) => {
    const r = (obj[s] && typeof obj[s] === "object" ? obj[s] : {}) as Record<string, unknown>;
    const reason = typeof r.reason === "string" ? r.reason.replace(/\s+/g, " ").trim().slice(0, 160) : "";
    return { quality: clampInt(r.quality, 10), connection: clampInt(r.connection, 5), reason: reason || "Solid chat." };
  };
  const ni = (obj.new_interests && typeof obj.new_interests === "object" ? obj.new_interests : {}) as Record<string, unknown>;
  const interests = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 3) : [];
  return { A: seat("A"), B: seat("B"), new_interests: { A: interests(ni.A), B: interests(ni.B) } };
}

/**
 * Score the chat from `nudge` popping up until `until` (the next nudge, or the end). Once per nudge (unique
 * nudge_id, player_id). A player who said nothing gets no row. Never throws for model problems.
 * ponytail: chat before the first nudge is never scored; it's a few "hey"s at most.
 */
export async function scoreStretch(riffId: string, nudge: Pick<Nudge, "id" | "number" | "created_at" | "payload" | "for_seat">, until: Date): Promise<void> {
  const db = supabaseAdmin();
  const [players, messages] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db
      .from("messages")
      .select("player_id, body")
      .eq("riff_id", riffId)
      .gte("created_at", nudge.created_at)
      .lt("created_at", until.toISOString())
      .order("id"),
  ]);
  const seated = (players.data ?? []) as Player[];
  const chat = messages.data ?? [];
  const spoke = new Set(chat.map((m) => m.player_id));
  if (!spoke.size) return;
  const name = new Map(seated.map((p) => [p.id, p.name]));
  const seatOf = new Map(seated.map((p) => [p.id, p.seat]));

  let result: ScoreResult;
  try {
    result = normalizeScore(
      await llmJson(
        [
          "Two people are texting in a chat app. An AI dropped a nudge (a prompt) into their chat; you score what they said after it.",
          "quality 0-10 per player: specificity, effort, creativity, being real. Opinions are never right or wrong; a bold, specific take beats a safe one.",
          "connection 0-5 per player: follow-up questions, callbacks to things the partner said earlier, genuinely responding to them. Talking a lot is not connection.",
          "They don't have to answer the nudge; a good conversation that went elsewhere scores well.",
          "Give each player a one-line playful reason (max ~15 words) that explains the score; never mean.",
          "Also list up to 2 new interests per player revealed by what they said (short lowercase nouns), or none.",
          'JSON shape: {"A": {"quality": n, "connection": n, "reason": s}, "B": {...}, "new_interests": {"A": [s], "B": [s]}}',
        ].join(" "),
        JSON.stringify({
          nudge: "prompt" in nudge.payload ? nudge.payload.prompt : null,
          players: seated.map((p) => ({ seat: p.seat, name: p.name, interests: [...p.interests, ...p.extracted_interests] })),
          chat: chat.map((m) => `${name.get(m.player_id) ?? "?"} (${seatOf.get(m.player_id) ?? "?"}): ${m.body}`),
        }),
        SCORE_TIMEOUT_MS,
        { fast: true }, // Grok first: the next nudge's end-of-game check waits on this
      ),
    );
  } catch (e) {
    console.warn(`score nudge ${nudge.number}: model failed, skipping`, e instanceof Error ? e.message : e);
    return;
  }

  const rows = seated
    .filter((p) => spoke.has(p.id))
    .map((p) => ({
      riff_id: riffId,
      nudge_id: nudge.id,
      player_id: p.id,
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
