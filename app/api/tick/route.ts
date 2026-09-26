import { after } from "next/server";
import { maybeBonus } from "@/lib/engine/bonus";
import { endIfWon } from "@/lib/engine/ending";
import { nudgeFor, prefetchNudges } from "@/lib/engine/nudges";
import { shouldNudge } from "@/lib/engine/pacing";
import { scoreStretch } from "@/lib/engine/score";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePlayer } from "@/lib/supabase/auth";
import type { Nudge, Player, Riff, RiffPhase, TickRequest, TickResponse } from "@/lib/types";

// ponytail: 60 s is the Hobby ceiling without Fluid compute; the after() work (scoring, image prefetch) needs it.
export const maxDuration = 60;

/**
 * Both clients call this every few seconds while chatting. If it's time (pacing.ts), the next nudge pops up;
 * the first one pops up as soon as the chat starts.
 * The unique (riff_id, number) on nudges makes every concurrent call but one a no-op.
 */
export async function POST(req: Request) {
  const { riffId } = (await req.json().catch(() => ({}))) as Partial<TickRequest>;
  if (typeof riffId !== "string") return new Response("riffId required", { status: 400 });
  try {
    await requirePlayer(req, riffId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  const reply = (phase: RiffPhase, nudged: boolean) => Response.json({ phase, nudged } satisfies TickResponse);

  const db = supabaseAdmin();
  const [riff, players, last] = await Promise.all([
    db.from("riffs").select("*").eq("id", riffId).single<Riff>(),
    db.from("players").select("id, seat, joined_at").eq("riff_id", riffId).order("joined_at", { ascending: false }),
    db.from("nudges").select("*").eq("riff_id", riffId).order("number", { ascending: false }).limit(1).maybeSingle<Nudge>(),
  ]);
  if (riff.error) throw riff.error;
  if (riff.data.phase !== "chatting") return reply(riff.data.phase, false);

  const lastNudge = last.data;
  const seated = (players.data ?? []) as Pick<Player, "id" | "seat" | "joined_at">[];
  const since = lastNudge?.created_at ?? seated[0]?.joined_at ?? riff.data.created_at; // chat starts when B joins
  // ponytail: the most recent 200 are plenty to judge the flow; older ones only matter to maxGapSeconds.
  const { data: recent } = await db
    .from("messages")
    .select("player_id, created_at")
    .eq("riff_id", riffId)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  const seatOf = new Map(seated.map((p) => [p.id, p.seat]));
  const now = Date.now();
  const due = shouldNudge(
    {
      shown: lastNudge?.number ?? 0,
      since: Date.parse(since),
      messages: (recent ?? []).reverse().map((m) => ({ seat: seatOf.get(m.player_id) ?? "A", at: Date.parse(m.created_at) })),
    },
    now,
  );
  if (!due) return reply("chatting", false);

  // Promoted from the prefetch queue, or filled locally: never waits on a model.
  const number = (lastNudge?.number ?? 0) + 1;
  const planned = await nudgeFor(riffId, number);
  const { data: shown, error } = await db.from("nudges").insert({ riff_id: riffId, number, ...planned }).select("created_at").single();
  if (error?.code === "23505") return reply("chatting", false); // another tick showed it first
  if (error) throw error;
  await db.from("queued_nudges").delete().eq("riff_id", riffId).eq("for_number", number);

  // Score the chat since the previous nudge, end the game if someone reached the target, else maybe write a Bonus
  // nudge for the trailing player. Prefetch runs alongside; a Bonus nudge overwrites whatever it queues.
  if (lastNudge) {
    after(async () => {
      try {
        await scoreStretch(riffId, lastNudge, new Date(shown.created_at)); // DB clock, so stretches tile exactly
        if (!(await endIfWon(riffId))) await maybeBonus(riffId, number);
      } catch (e) {
        console.error("score/bonus failed", e);
      }
    });
  }
  after(() => prefetchNudges(riffId, number).catch((e) => console.error("prefetch failed", e)));
  return reply("chatting", true);
}
