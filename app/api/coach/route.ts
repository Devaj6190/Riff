import { startCoach } from "@/lib/engine/coach";
import { summaryFor } from "@/lib/engine/coaching";
import { readProfile, requirePlayer, requireUser } from "@/lib/supabase/auth";
import type { CoachRequest, CoachResponse } from "@/lib/types";

/**
 * Start a coach riff (lib/engine/coach.ts). With `riffId`: a lesson on the focus of the caller's coaching report for
 * that chat. Without: catch up on references they missed in past chats.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<CoachRequest> | null;
  const profile = readProfile(body);
  if (!profile) return new Response("name (1-24 chars) and 1-3 interests required", { status: 400 });
  try {
    const riffId = typeof body?.riffId === "string" ? body.riffId : null;
    const player = riffId ? await requirePlayer(req, riffId) : null;
    const userId = player?.user_id ?? (await requireUser(req));
    const from = riffId && player ? (await summaryFor(riffId, player)).summary : undefined;
    if (from === null) return new Response("Your coaching report isn't ready yet", { status: 404 });
    const code = await startCoach(userId, profile.name, profile.interests, from);
    if (!code) return new Response("Nothing to coach on yet: finish a chat first", { status: 404 });
    return Response.json({ code } satisfies CoachResponse);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
