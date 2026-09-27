// Coaching report (SPEC §7): per player, private, from their own messages only. Written at the end next to the
// chat summary (saveHistory in ending.ts, a parallel call) and kept with it: chat_histories, or the riff for a demo.
// Its coach focus is what a coach chat (coach.ts) then teaches. Served to that player only by /api/coaching.
import { supabaseAdmin } from "../supabase/admin";
import type { ChatContext, ChatHistorySummary, CoachingReport, CoachingResponse, Player, Riff, Seat } from "../types";
import { llmJson } from "./llm";

export const COACHING_TIMEOUT_MS = 25_000; // in parallel with the summary call, inside /api/end's after() budget

type Line = { seat: Seat; body: string };

/** Both players' reports in one call. Seats the model got wrong come back undefined. */
export async function writeCoaching(input: {
  players: Pick<Player, "seat" | "name" | "interests">[];
  lines: Line[];
  known: ChatContext;
  nudges: { prompt: unknown; quality: Record<string, number> }[];
}): Promise<Partial<Record<Seat, CoachingReport>>> {
  const raw = await llmJson(
    [
      "Two people who just met finished a chat in a texting game. Write each player a private coaching report, from their own messages,",
      "to help them get better at talking to new people. Talk to them as \"you\": kind and honest, like a friend who's great at this.",
      "Keep it short: it's shown on small cards. Each point and the tip at most 12 words, specific to this chat. Per player:",
      "good: one specific thing they did well (point) and quote: one of their own messages that shows it, copied exactly.",
      "flat: where they fell flat, one specific moment: a reference or slang they didn't get, a joke they left hanging, a question they",
      "dead-ended, a one-word answer that killed a thread, or checking out of a topic; point, and quote: their message there, copied exactly.",
      "improve: one concrete tip (tip), and a rewrite: said = one of their own messages copied exactly, try = a better version they could have sent, in their voice.",
      "coach: what an AI coach could teach them in one short practice chat, based on what fell flat. Not generic: title (2-4 words),",
      "why (at most 14 words, naming the actual references, moments or habits from this chat), learn: 3-5 concrete things to cover",
      "(the actual references and slang to explain, or the moves to practice, like following up on a story or riffing on a joke).",
      "coach is null only if nothing really fell flat.",
      "nudges shows how well each answered each prompt the game dropped (quality 0-10, missing = no answer). notes: what each shared.",
      "Only a player's own messages count as their quotes. Never quote, judge or describe the other person.",
      'JSON shape: {"A": {"good": {"point": s, "quote": s}, "flat": {"point": s, "quote": s}, "improve": {"tip": s, "said": s, "try": s},',
      '"coach": {"title": s, "why": s, "learn": [s]} | null}, "B": {...}}',
    ].join(" "),
    JSON.stringify({
      players: input.players.map((p) => ({ seat: p.seat, name: p.name, interests: p.interests })),
      notes: input.known.notes,
      nudges: input.nudges,
      chat: input.lines.map((l) => `${l.seat}: ${l.body}`),
    }),
    COACHING_TIMEOUT_MS,
    { fast: true },
  );
  return normalizeCoaching(raw, input.lines);
}

const obj = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Coerce model output into a report per seat. A quote (or `said`) must be one of that seat's own messages, or a
 * piece of one, else it's dropped: the report never shows the partner's words, or words nobody wrote.
 */
export function normalizeCoaching(raw: unknown, lines: Line[]): Partial<Record<Seat, CoachingReport>> {
  const out: Partial<Record<Seat, CoachingReport>> = {};
  for (const seat of ["A", "B"] as Seat[]) {
    const r = obj(obj(raw)[seat]);
    const own = lines.filter((l) => l.seat === seat).map((l) => l.body.toLowerCase());
    const theirs = (v: unknown) => {
      const q = text(v, 300).replace(/^["“]|["”]$/g, "");
      return q && own.some((m) => m.includes(q.toLowerCase())) ? q : undefined;
    };
    const good = obj(r.good);
    const flat = obj(r.flat);
    const improve = obj(r.improve);
    const said = theirs(improve.said);
    const tryLine = text(improve.try, 200);
    const coach = obj(r.coach);
    const learn = Array.isArray(coach.learn) ? coach.learn.map((l) => text(l, 120)).filter(Boolean).slice(0, 5) : [];
    const report: CoachingReport = {
      good: { point: text(good.point, 160), quote: theirs(good.quote) },
      flat: { point: text(flat.point, 160), quote: theirs(flat.quote) },
      improve: { tip: text(improve.tip, 200), ...(said && tryLine ? { said, try: tryLine } : {}) },
      coach: text(coach.title, 60) && learn.length ? { title: text(coach.title, 60), why: text(coach.why, 200), learn } : null,
    };
    if (report.good.point && report.flat.point && report.improve.tip) out[seat] = report;
  }
  return out;
}

/** The chat summary (with its report) of this player's side of a riff: the riff's own for a demo, else chat_histories. */
export async function summaryFor(riffId: string, player: Pick<Player, "user_id">): Promise<{ ready: boolean; summary: ChatHistorySummary | null }> {
  const db = supabaseAdmin();
  const { data: riff } = await db.from("riffs").select("demo_script, demo_summary").eq("id", riffId).single<Pick<Riff, "demo_script" | "demo_summary">>();
  if (riff?.demo_script) return { ready: !!riff.demo_summary, summary: riff.demo_summary };
  const { data: row } = await db.from("chat_histories").select("summary").eq("riff_id", riffId).eq("user_id", player.user_id).maybeSingle();
  return { ready: !!row, summary: (row?.summary as ChatHistorySummary | undefined) ?? null };
}

/** /api/coaching: the caller's own report for this chat. */
export async function coachingFor(riffId: string, player: Pick<Player, "user_id">): Promise<CoachingResponse> {
  const { ready, summary } = await summaryFor(riffId, player);
  return { ready, report: summary?.coaching ?? null };
}
