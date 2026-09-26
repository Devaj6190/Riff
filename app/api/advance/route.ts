import { after } from "next/server";
import { nextPhase, phaseSeconds } from "@/lib/engine/clock";
import { isGameOver, targetScore, totals, writeSummary } from "@/lib/engine/ending";
import { judgeRound } from "@/lib/engine/judge";
import { loadWindow, scoreTalk, talkDeadline } from "@/lib/engine/talk";
import { prefetchRounds, roundFor } from "@/lib/engine/rounds";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePlayer } from "@/lib/supabase/auth";
import type { AdvanceRequest, AdvanceResponse, GamePhase, Riff } from "@/lib/types";

/**
 * Start the game from the lobby, or move past an expired/complete phase. Both clients call this when a
 * deadline passes; the conditional update on (phase, round_number) makes every call but the first a no-op.
 */
export async function POST(req: Request) {
  const { riffId } = (await req.json().catch(() => ({}))) as Partial<AdvanceRequest>;
  if (typeof riffId !== "string") return new Response("riffId required", { status: 400 });
  try {
    await requirePlayer(req, riffId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const db = supabaseAdmin();
  const { data: riff, error } = await db.from("riffs").select("*").eq("id", riffId).single<Riff>();
  if (error) throw error;
  const reply = (phase: GamePhase, advanced: boolean) => Response.json({ phase, advanced } satisfies AdvanceResponse);

  // Talk window: the real deadline comes from the messages (talk.ts). It never shrinks; extensions are
  // published so clients reschedule, and the phase only moves on once it has passed.
  let phaseEndsAt = riff.phase_ends_at ? new Date(riff.phase_ends_at) : null;
  if (riff.phase === "talk_window") {
    const w = await loadWindow(riffId, riff.round_number);
    const computed = w ? talkDeadline(w.start, w.messages) : 0;
    if (phaseEndsAt && computed > phaseEndsAt.getTime() && computed > Date.now()) {
      phaseEndsAt = new Date(computed);
      await db
        .from("riffs")
        .update({ phase_ends_at: phaseEndsAt.toISOString() })
        .eq("id", riffId)
        .eq("phase", "talk_window")
        .eq("round_number", riff.round_number);
    }
  }

  const next = nextPhase(
    {
      phase: riff.phase,
      phaseEndsAt,
      seats: riff.phase === "lobby" ? await count(db.from("players").select("*", { count: "exact", head: true }).eq("riff_id", riffId)) : 0,
      answers: riff.phase === "round_active" ? await countAnswers(riffId, riff.round_number) : 0,
    },
    new Date(),
  );
  if (!next) return reply(riff.phase, false);

  // Game over is checked as the result leaves the screen, so both players see the final round's scores first.
  const to: GamePhase = next === "talk_window" && isGameOver(await totals(riffId), riff.target_score, riff.round_number) ? "ended" : next;

  const startsRound = to === "round_active";
  const roundNumber = riff.round_number + (startsRound ? 1 : 0);
  // Promoted from the prefetch queue, or filled locally: never waits on a model.
  const round = startsRound ? await roundFor(riffId, roundNumber) : null;
  const endsAt = to === "ended" ? null : new Date(Date.now() + phaseSeconds(to, round?.mechanic) * 1000).toISOString();

  // Compare-and-set: only the call that still sees the phase it read gets to move it.
  const { data: won, error: updateError } = await db
    .from("riffs")
    .update({
      phase: to,
      phase_ends_at: endsAt,
      round_number: roundNumber,
      ...(riff.phase === "lobby" && { target_score: targetScore(riff.target_score) }), // Expo mode applies per game
      ...(to === "ended" && { ended_at: new Date().toISOString() }),
    })
    .eq("id", riffId)
    .eq("phase", riff.phase)
    .eq("round_number", riff.round_number)
    .select("id");
  if (updateError) throw updateError;
  if (!won?.length) return reply(riff.phase, false);

  // A round that ended early must close now: partners' answers become readable (RLS) once rounds.ends_at passes.
  if (riff.phase === "round_active") {
    const { error: closeError } = await db
      .from("rounds")
      .update({ ends_at: new Date().toISOString() })
      .eq("riff_id", riffId)
      .eq("number", riff.round_number)
      .gt("ends_at", new Date().toISOString());
    if (closeError) throw closeError;
    // Scores land during round_result; the compare-and-set above guarantees one judge per round.
    after(() => judgeRound(riffId, riff.round_number).catch((e) => console.error("judge failed", e)));
  }

  if (to === "ended") after(() => writeSummary(riffId).catch((e) => console.error("summary failed", e)));
  if (to === "talk_window") after(() => prefetchRounds(riffId, riff.round_number).catch((e) => console.error("prefetch top-up failed", e)));
  if (riff.phase === "talk_window") after(() => scoreTalk(riffId, riff.round_number).catch((e) => console.error("talk scoring failed", e)));

  // If this insert fails the riff sits in round_active without a round; its deadline still passes, so it recovers.
  if (round) {
    const { error: roundError } = await db.from("rounds").insert({ riff_id: riffId, number: roundNumber, ...round, ends_at: endsAt });
    if (roundError) throw roundError;
    await db.from("queued_rounds").delete().eq("riff_id", riffId).eq("for_number", roundNumber);
    after(() => prefetchRounds(riffId, roundNumber).catch((e) => console.error("prefetch failed", e)));
  }
  return reply(to, true);
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function countAnswers(riffId: string, roundNumber: number): Promise<number> {
  const db = supabaseAdmin();
  const { data: round } = await db.from("rounds").select("id").eq("riff_id", riffId).eq("number", roundNumber).maybeSingle();
  if (!round) return 0;
  return count(db.from("answers").select("*", { count: "exact", head: true }).eq("round_id", round.id));
}
