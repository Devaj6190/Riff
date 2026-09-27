import { coachingFor } from "@/lib/engine/coaching";
import { requirePlayer } from "@/lib/supabase/auth";
import type { CoachingRequest, CoachingResponse } from "@/lib/types";

/** The caller's own coaching report for a chat they were in (SPEC §7). Poll while `ready` is false. */
export async function POST(req: Request) {
  const { riffId } = ((await req.json().catch(() => null)) ?? {}) as Partial<CoachingRequest>;
  if (typeof riffId !== "string") return new Response("riffId required", { status: 400 });
  try {
    return Response.json((await coachingFor(riffId, await requirePlayer(req, riffId))) satisfies CoachingResponse);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
