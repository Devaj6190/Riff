import { startCoach } from "@/lib/engine/coach";
import { readProfile, requireUser } from "@/lib/supabase/auth";
import type { CoachResponse } from "@/lib/types";

/** Start a coach riff: the AI catches the caller up on references they missed in past chats (lib/engine/coach.ts). */
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
  const code = await startCoach(userId, profile.name, profile.interests);
  if (!code) return new Response("Nothing to catch up on yet: finish a chat first", { status: 404 });
  return Response.json({ code } satisfies CoachResponse);
}
