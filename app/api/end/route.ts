import { endRiff, restartRiff } from "@/lib/engine/ending";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePlayer } from "@/lib/supabase/auth";
import type { EndRequest, EndResponse, Riff } from "@/lib/types";

export const maxDuration = 60; // superlatives are a Muse call; see advance/route.ts

/** End the riff now, or start a fresh game in it (chat is kept). */
export async function POST(req: Request) {
  const { riffId, action } = (await req.json().catch(() => ({}))) as Partial<EndRequest>;
  if (typeof riffId !== "string" || (action !== "end" && action !== "restart")) {
    return new Response("riffId and action ('end' | 'restart') required", { status: 400 });
  }
  try {
    await requirePlayer(req, riffId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  const { data: riff, error } = await supabaseAdmin().from("riffs").select("*").eq("id", riffId).single<Riff>();
  if (error) throw error;
  const phase = action === "end" ? await endRiff(riff) : await restartRiff(riffId);
  return Response.json({ phase } satisfies EndResponse);
}
