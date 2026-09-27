import { submitPlay } from "@/lib/engine/games";
import { requirePlayer } from "@/lib/supabase/auth";
import type { PlayRequest, PlayResponse } from "@/lib/types";

/** A tap in a mini game (SPEC §4.1): lock in my pick, statements or guess for the stage on screen. */
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as PlayRequest;
  if (typeof body.riffId !== "string" || typeof body.nudgeId !== "string") return new Response("riffId and nudgeId required", { status: 400 });
  try {
    await submitPlay(body.riffId, await requirePlayer(req, body.riffId), body);
    return Response.json({ ok: true } satisfies PlayResponse);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
