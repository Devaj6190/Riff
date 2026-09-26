import { nextPhase, phaseSeconds } from "@/lib/engine/clock";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePlayer } from "@/lib/supabase/auth";
import type { AdvanceRequest, AdvanceResponse, GamePhase, Mechanic, Riff } from "@/lib/types";

// ponytail: fixed placeholder round until AI round writing lands (#2).
const PLACEHOLDER = { mechanic: "open_prompt" as Mechanic, depth: 1, payload: { prompt: "What's the best thing you ate this week?" } };

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

  const next = nextPhase(
    {
      phase: riff.phase,
      phaseEndsAt: riff.phase_ends_at ? new Date(riff.phase_ends_at) : null,
      seats: riff.phase === "lobby" ? await count(db.from("players").select("*", { count: "exact", head: true }).eq("riff_id", riffId)) : 0,
      answers: riff.phase === "round_active" ? await countAnswers(riffId, riff.round_number) : 0,
    },
    new Date(),
  );
  if (!next) return reply(riff.phase, false);

  const startsRound = next === "round_active";
  const roundNumber = riff.round_number + (startsRound ? 1 : 0);
  const endsAt = new Date(Date.now() + phaseSeconds(next, PLACEHOLDER.mechanic) * 1000).toISOString();

  // Compare-and-set: only the call that still sees the phase it read gets to move it.
  const { data: won, error: updateError } = await db
    .from("riffs")
    .update({ phase: next, phase_ends_at: endsAt, round_number: roundNumber })
    .eq("id", riffId)
    .eq("phase", riff.phase)
    .eq("round_number", riff.round_number)
    .select("id");
  if (updateError) throw updateError;
  if (!won?.length) return reply(riff.phase, false);

  // If this insert fails the riff sits in round_active without a round; its deadline still passes, so it recovers.
  if (startsRound) {
    const { error: roundError } = await db
      .from("rounds")
      .insert({ riff_id: riffId, number: roundNumber, ...PLACEHOLDER, ends_at: endsAt });
    if (roundError) throw roundError;
  }
  return reply(next, true);
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
