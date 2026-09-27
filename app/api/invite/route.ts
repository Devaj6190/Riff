import { answerInvite, sendInvite } from "@/lib/engine/search";
import { requireUser } from "@/lib/supabase/auth";
import type { InviteRequest, InviteResponse } from "@/lib/types";

/** Tap a person in search (send) or swipe on an invite (answer). `code` once paired (lib/engine/search.ts). */
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Partial<InviteRequest> & Record<string, unknown>;
  try {
    const userId = await requireUser(req);
    let code: string | null;
    if (body.action === "send" && typeof body.to === "string") code = await sendInvite(userId, body.to);
    else if (body.action === "answer" && Number.isInteger(body.id) && typeof body.accept === "boolean") code = await answerInvite(userId, body.id as number, body.accept);
    else return new Response("send {to} or answer {id, accept}", { status: 400 });
    return Response.json({ code } satisfies InviteResponse);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
