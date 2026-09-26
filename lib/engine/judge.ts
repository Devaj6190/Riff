// Round judging (SPEC §4.3, §6 judge JSON). Runs in the background when a round leaves round_active.
// Speed is computed here; quality, connection and the witty reason come from a per-mechanic judge in
// `lib/engine/judges/<mechanic>.ts` (default export). Mechanics without their own judge are judged as
// open prompts on their answer text, so a new mechanic works before it has a bespoke judge.
import { supabaseAdmin } from "../supabase/admin";
import type { Answer, JudgeResult, Mechanic, Player, Round, Seat } from "../types";
import { phaseSeconds } from "./clock";

export const JUDGE_TIMEOUT_MS = 12_000;

export type JudgeContext = {
  round: Round;
  players: Player[]; // seat order
  answers: Partial<Record<Seat, Answer>>;
  chat: string[]; // "Name: message", oldest first
};

export type Judge = { judge(ctx: JudgeContext): Promise<unknown> }; // raw model output; normalized by normalizeJudge

/** SPEC §4.3: 0–5, linear over the round's full timer (early close doesn't shrink it). */
export function speedPoints(startsAt: string, submittedAt: string, timerSeconds: number): number {
  const elapsed = (Date.parse(submittedAt) - Date.parse(startsAt)) / 1000;
  const left = 1 - elapsed / timerSeconds;
  return Math.max(0, Math.min(5, Math.round(5 * left)));
}

const clampInt = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

/** Coerce model output into a JudgeResult: clamp scores, keep reasons to one short line, drop junk interests. */
export function normalizeJudge(raw: unknown): JudgeResult {
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

/** The text an answer carries, for judges that read text. */
export function answerText(answer: Answer | undefined): string | null {
  if (!answer) return null;
  const p = answer.payload as Record<string, unknown>;
  for (const key of ["text", "transcript", "reaction"]) if (typeof p[key] === "string" && p[key]) return p[key] as string;
  return null;
}

async function judgeFor(mechanic: Mechanic): Promise<Judge> {
  try {
    return (await import(`./judges/${mechanic}.ts`)).default as Judge;
  } catch {
    return (await import("./judges/open_prompt")).default as Judge;
  }
}

/** Score round `number` of `riffId` once. Never throws for model problems: falls back to neutral scores. */
export async function judgeRound(riffId: string, number: number): Promise<void> {
  const db = supabaseAdmin();
  const { data: round } = await db.from("rounds").select("*").eq("riff_id", riffId).eq("number", number).maybeSingle<Round>();
  if (!round) return;
  const [players, answers, messages] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db.from("answers").select("*").eq("round_id", round.id),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(30),
  ]);
  const seated = (players.data ?? []) as Player[];
  const bySeat = Object.fromEntries(
    seated.map((p) => [p.seat, ((answers.data ?? []) as Answer[]).find((a) => a.player_id === p.id)]),
  ) as Partial<Record<Seat, Answer>>;
  const name = new Map(seated.map((p) => [p.id, p.name]));
  const ctx: JudgeContext = {
    round,
    players: seated,
    answers: bySeat,
    chat: (messages.data ?? []).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
  };

  let result: JudgeResult;
  if (!bySeat.A && !bySeat.B) {
    result = normalizeJudge({});
  } else {
    try {
      result = normalizeJudge(await (await judgeFor(round.mechanic)).judge(ctx));
    } catch (e) {
      console.warn(`judge round ${number}: model failed, neutral scores`, e instanceof Error ? e.message : e);
      result = normalizeJudge({ A: { quality: 5, reason: "The judge blinked. Fair points all round." }, B: { quality: 5, reason: "The judge blinked. Fair points all round." } });
    }
  }

  const timer = phaseSeconds("round_active", round.mechanic);
  const rows = seated.map((p) => {
    const answer = bySeat[p.seat];
    const judged = result[p.seat];
    return {
      riff_id: riffId,
      round_id: round.id,
      player_id: p.id,
      kind: "round",
      speed: answer ? speedPoints(round.starts_at, answer.submitted_at, timer) : 0,
      quality: answer ? judged.quality : 0,
      connection: answer ? judged.connection : 0,
      multiplier: round.is_bonus && round.bonus_seat === p.seat ? 2 : 1,
      reason: answer ? judged.reason : "No answer this time.",
    };
  });
  const { error } = await db.from("scores").upsert(rows, { onConflict: "round_id,player_id,kind", ignoreDuplicates: true });
  if (error) throw error;

  await Promise.all(
    seated.map(async (p) => {
      const add = (result.new_interests[p.seat] ?? []).filter((i) => !p.interests.includes(i) && !p.extracted_interests.includes(i));
      if (!add.length) return;
      await db.from("players").update({ extracted_interests: [...p.extracted_interests, ...add].slice(-12) }).eq("id", p.id);
    }),
  );
}

