import { matchMe } from "@/lib/engine/match";
import { inviteState } from "@/lib/engine/search";
import { readProfile, requireUser } from "@/lib/supabase/auth";
import type { MatchResponse } from "@/lib/types";

/** Match me / search: join the queue / poll it. Returns the new riff's code once paired (lib/engine/match.ts), and
 *  in browse mode the invite inbox (lib/engine/search.ts). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const profile = readProfile(body);
  if (!profile) return new Response("name (1-24 chars) and 1-3 interests required", { status: 400 });
  const mode = body?.mode === "browse" ? "browse" : "match";
  let userId: string;
  try {
    userId = await requireUser(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  const code = await matchMe(userId, profile.name, profile.interests, mode);
  const inbox = mode === "browse" && !code ? await inviteState(userId) : { invites: [], sent: {} };
  return Response.json({ code, ...inbox } satisfies MatchResponse);
}
