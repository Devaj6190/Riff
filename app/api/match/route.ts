import { matchMe } from "@/lib/engine/match";
import { readProfile, requireUser } from "@/lib/supabase/auth";
import type { MatchResponse } from "@/lib/types";

/** Match me: join the queue / poll it. Returns the new riff's code once paired (lib/engine/match.ts). */
export async function POST(req: Request) {
  const profile = readProfile(await req.json().catch(() => null));
  if (!profile) return new Response("name (1-24 chars) and 1-3 interests required", { status: 400 });
  let userId: string;
  try {
    userId = await requireUser(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  return Response.json({ code: await matchMe(userId, profile.name, profile.interests) } satisfies MatchResponse);
}
