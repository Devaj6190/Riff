import { matchMe, partnerIn } from "@/lib/engine/match";
import { inviteState, matchSeed } from "@/lib/engine/search";
import { readProfile, requireUser } from "@/lib/supabase/auth";
import type { MatchResponse } from "@/lib/types";

/** Match me / search: join the queue / poll it. Returns the new riff's code once paired (lib/engine/match.ts), and
 *  in browse mode the invite inbox (lib/engine/search.ts). Match me's settle poll takes a seed if nobody real is there. */
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
  let code = await matchMe(userId, profile.name, profile.interests, mode);
  if (!code && mode === "match" && body?.settle === true) code = await matchSeed(userId);
  const inbox = mode === "browse" && !code ? await inviteState(userId) : { invites: [], sent: {} };
  const partner = code ? await partnerIn(code, userId) : null;
  return Response.json({ code, ...inbox, partner } satisfies MatchResponse);
}
