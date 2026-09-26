import { seatBot } from "@/lib/engine/bot";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePlayer } from "@/lib/supabase/auth";
import type { BotRequest } from "@/lib/types";

/** Test mode: the riff's creator seats the AI as player B (lib/engine/bot.ts). */
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as Partial<BotRequest>;
  if (typeof code !== "string") return new Response("code required", { status: 400 });
  const { data: riff } = await supabaseAdmin().from("riffs").select("id").eq("code", code.toUpperCase()).maybeSingle();
  if (!riff) return new Response("riff not found", { status: 404 });
  try {
    const player = await requirePlayer(req, riff.id);
    if (player.seat !== "A") return new Response("only the creator can add the bot", { status: 403 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  await seatBot(riff.id);
  return Response.json({ ok: true });
}
