// Points (SPEC §4.3) come only from answering nudges. A player's answer is what they text while the nudge's timer
// runs. Scored once when the timer runs out: speed in code, quality + connection from the model. The timer closes
// early once the model judges both have answered (closeIfAnswered).
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, Player, ScoreResult, Seat } from "../types";
import { llmJson } from "./llm";
import { PACING, timerSeconds } from "./pacing";
import { loadChatContext } from "./reader";

export const SCORE_TIMEOUT_MS = 12_000;

/** 0–5, linear from the nudge popping up to its timer running out. */
export function speedPoints(poppedAt: string, firstAnswerAt: string, endsAt: string): number {
  const left = 1 - (Date.parse(firstAnswerAt) - Date.parse(poppedAt)) / (Date.parse(endsAt) - Date.parse(poppedAt));
  return Math.max(0, Math.min(5, Math.round(5 * left)));
}

const clampInt = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

/** Coerce model output into a ScoreResult: clamp scores, drop junk interests. */
export function normalizeScore(raw: unknown): ScoreResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seat = (s: Seat) => {
    const r = (obj[s] && typeof obj[s] === "object" ? obj[s] : {}) as Record<string, unknown>;
    return { quality: clampInt(r.quality, 10), connection: clampInt(r.connection, 5) };
  };
  const ni = (obj.new_interests && typeof obj.new_interests === "object" ? obj.new_interests : {}) as Record<string, unknown>;
  const interests = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 3) : [];
  return { A: seat("A"), B: seat("B"), new_interests: { A: interests(ni.A), B: interests(ni.B) } };
}

/** Score each player's answer to `nudge`. Players who didn't answer get no row. Never throws for model problems. */
export async function scoreNudge(riffId: string, nudge: Nudge): Promise<void> {
  const db = supabaseAdmin();
  const [players, answered, before, known] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db
      .from("messages")
      .select("player_id, body, created_at")
      .eq("riff_id", riffId)
      .gte("created_at", nudge.created_at)
      .lte("created_at", nudge.ends_at)
      .order("id"),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).lt("created_at", nudge.created_at).order("id", { ascending: false }).limit(20),
    loadChatContext(riffId),
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
          "notes has what each player has shared in the whole chat so far (it may already include these answers) and the current thread:",
          "use it to spot callbacks to things said long ago, and answers that only repeat what they've said before.",
          "Also list up to 2 new interests per player revealed by their answer (short lowercase nouns), or none.",
          'JSON shape: {"A": {"quality": n, "connection": n}, "B": {...}, "new_interests": {"A": [s], "B": [s]}}',
          "If a player didn't answer, give them 0.",
        ].join(" "),
        JSON.stringify({
          nudge: nudge.payload.prompt,
          earlierChat: (before.data ?? []).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
          players: seated.map((p) => ({
            seat: p.seat,
            name: p.name,
            interests: [...p.interests, ...p.extracted_interests],
            notes: known.notes[p.seat],
            answer: answers.get(p.id)!.map((m) => m.body),
          })),
          thread: known.thread,
          answersInOrder: (answered.data ?? []).map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
        }),
        SCORE_TIMEOUT_MS,
        { fast: true }, // Grok first: points should pop right after the timer
      ),
    );
  } catch (e) {
    console.warn(`score nudge ${nudge.number}: model failed, neutral scores`, e instanceof Error ? e.message : e);
    const blink = { quality: 5, connection: 0 };
    result = normalizeScore({ A: blink, B: blink });
  }

  const rows = answering.map((p) => ({
    riff_id: riffId,
    nudge_id: nudge.id,
    player_id: p.id,
    speed: speedPoints(nudge.created_at, answers.get(p.id)![0].created_at, fullTimerEnd(nudge)), // not the closed-early end
    quality: result[p.seat].quality,
    connection: result[p.seat].connection,
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

const fullTimerEnd = (n: Nudge) => new Date(Date.parse(n.created_at) + timerSeconds(n.kind, n.number) * 1000).toISOString();

// ponytail: per-instance memory, so two clients ticking every second don't ask twice about the same chat. Another
// serverless instance may ask again; the close is idempotent. Never pruned: one short entry per nudge.
const judged = new Map<string, number>();

/**
 * Both players answered `nudge`? Then drop its timer to PACING.closeSeconds. Called from /api/tick in the background
 * whenever there's a new message (lastMessageAt) since it last asked. Grok first (~1 s); on any failure, the timer
 * just runs out as usual.
 */
export async function closeIfAnswered(riffId: string, nudge: Nudge, lastMessageAt: number): Promise<void> {
  if ((judged.get(nudge.id) ?? 0) >= lastMessageAt) return;
  judged.set(nudge.id, lastMessageAt);
  const db = supabaseAdmin();
  const [players, said] = await Promise.all([
    db.from("players").select("id, seat, name").eq("riff_id", riffId),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).gte("created_at", nudge.created_at).order("id").limit(40),
  ]);
  const seat = new Map((players.data ?? []).map((p) => [p.id, p.seat as Seat]));
  const out = (await llmJson(
    [
      "Two people are texting in a chat app. An AI dropped a nudge (a prompt) into their chat.",
      "For each player, has what they've texted since answered the nudge? Any real, on-topic answer counts, however short or casual",
      '("inception lol" answers "favorite movie?"). Small talk, "idk", or only asking the other person does not.',
      'JSON shape: {"A": true|false, "B": true|false}',
    ].join(" "),
    JSON.stringify({ nudge: nudge.payload.prompt, chat: (said.data ?? []).map((m) => `${seat.get(m.player_id) ?? "?"}: ${m.body}`) }),
    4000,
    { fast: true },
  )) as { A?: unknown; B?: unknown };
  if (out.A !== true || out.B !== true) return;
  const endsAt = new Date(Date.now() + PACING.closeSeconds * 1000).toISOString();
  await db.from("nudges").update({ ends_at: endsAt }).eq("id", nudge.id).gt("ends_at", endsAt).is("scored_at", null);
}
