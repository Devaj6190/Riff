import { after } from "next/server";
import { BOT_USER_ID, botTurn } from "@/lib/engine/bot";
import { endIfWon } from "@/lib/engine/ending";
import { nudgeFor, prefetchNudges, refreshTurf } from "@/lib/engine/nudges";
import { readChat } from "@/lib/engine/reader";
import { mayClose, shouldNudge, timerSeconds, type PaceState } from "@/lib/engine/pacing";
import { closeIfAnswered, scoreNudge } from "@/lib/engine/score";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePlayer } from "@/lib/supabase/auth";
import type { Nudge, Player, Riff, RiffPhase, TickRequest, TickResponse } from "@/lib/types";

// ponytail: 60 s is the Hobby ceiling without Fluid compute; the after() work (scoring, image prefetch) needs it.
export const maxDuration = 60;

/**
 * Both clients call this every second while chatting. It reads new messages into the chat context (reader.ts), and
 * does three things, each exactly once however many calls race: closes the timer early once both have answered
 * (closeIfAnswered), scores the last nudge when its timer runs out (compare-and-set on scored_at), and pops up the
 * next nudge when it's due (pacing.ts; unique riff_id + number).
 * The first nudge pops up as soon as the chat starts.
 */
export async function POST(req: Request) {
  const { riffId, typing } = (await req.json().catch(() => ({}))) as Partial<TickRequest>;
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
    db.from("players").select("id, seat, joined_at, user_id").eq("riff_id", riffId).order("joined_at", { ascending: false }),
    db.from("nudges").select("*").eq("riff_id", riffId).order("number", { ascending: false }).limit(1).maybeSingle<Nudge>(),
  ]);
  if (riff.error) throw riff.error;
  if (riff.data.phase !== "chatting") return reply(riff.data.phase, false);
  const lastNudge = last.data;
  const now = Date.now();

  // Timer ran out: score the answers, then end the game if someone reached the target, else switch bonus mode
  // (nudges lean toward the trailing player) if the scores call for it.
  if (lastNudge && !lastNudge.scored_at && now >= Date.parse(lastNudge.ends_at)) {
    const { data: claimed } = await db
      .from("nudges")
      .update({ scored_at: new Date(now).toISOString() })
      .eq("id", lastNudge.id)
      .is("scored_at", null)
      .select("id");
    if (claimed?.length) {
      after(async () => {
        try {
          await scoreNudge(riffId, lastNudge);
          if (!(await endIfWon(riffId))) await refreshTurf(riffId, lastNudge.number);
        } catch (e) {
          console.error("score/bonus failed", e);
        }
      });
    }
  }

  const seated = (players.data ?? []) as Pick<Player, "id" | "seat" | "joined_at" | "user_id">[];
  // Test mode: the AI in seat B takes its turn in the background (it replies only if there's something new).
  if (seated.some((p) => p.user_id === BOT_USER_ID)) after(() => botTurn(riffId).catch((e) => console.error("bot failed", e)));
  const poppedAt = lastNudge?.created_at ?? seated[0]?.joined_at ?? riff.data.created_at; // chat starts when B joins
  // ponytail: the most recent 200 are plenty to judge the flow.
  const { data: recent } = await db
    .from("messages")
    .select("player_id, created_at")
    .eq("riff_id", riffId)
    .gt("created_at", poppedAt)
    .order("created_at", { ascending: false })
    .limit(200);
  const seatOf = new Map(seated.map((p) => [p.id, p.seat]));
  const pace: PaceState = {
    shown: lastNudge?.number ?? 0,
    endsAt: Date.parse(lastNudge?.ends_at ?? poppedAt),
    messages: (recent ?? []).reverse().map((m) => ({ seat: seatOf.get(m.player_id) ?? "A", at: Date.parse(m.created_at) })),
    typing: typing === true,
  };
  const lastAt = pace.messages.at(-1)?.at;
  if (lastAt) after(() => readChat(riffId, lastAt).catch((e) => console.error("chat reader failed", e)));
  if (lastNudge && lastAt && mayClose(pace, now)) {
    after(() => closeIfAnswered(riffId, lastNudge, lastAt).catch((e) => console.error("answer judge failed", e)));
  }
  if (!shouldNudge(pace, now)) return reply("chatting", false);

  // Promoted from the prefetch queue, or filled locally: never waits on a model.
  const number = (lastNudge?.number ?? 0) + 1;
  const planned = await nudgeFor(riffId, number);
  const endsAt = new Date(now + timerSeconds(planned.kind, number) * 1000).toISOString();
  const { error } = await db.from("nudges").insert({ riff_id: riffId, number, ...planned, ends_at: endsAt });
  if (error?.code === "23505") return reply("chatting", false); // another tick showed it first
  if (error) throw error;
  await db.from("queued_nudges").delete().eq("riff_id", riffId).eq("for_number", number);
  after(() => prefetchNudges(riffId, number).catch((e) => console.error("prefetch failed", e)));
  return reply("chatting", true);
}
