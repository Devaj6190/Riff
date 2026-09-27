import { startCoach } from "@/lib/engine/coach";
import { startDemo } from "@/lib/engine/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import type { DemoRequest, DemoResults, DemoStartResponse, Player, Riff } from "@/lib/types";

/** Dev (/dev): start a scripted demo chat (lib/engine/demo.ts), read the latest one's summary, or coach on it. */
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Partial<DemoRequest> & Record<string, unknown>;
  let userId: string;
  try {
    userId = await requireUser(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  if (body.action === "start" && typeof body.script === "string") {
    const code = await startDemo(userId, body.script);
    if (!code) return new Response("no such script", { status: 404 });
    return Response.json({ code } satisfies DemoStartResponse);
  }
  if (body.action !== "results" && body.action !== "coach") return new Response("start {script}, results or coach", { status: 400 });

  // The caller's latest demo: its summary lives on the riff, never in their chat history.
  const { data } = await supabaseAdmin()
    .from("players")
    .select("name, interests, riffs!inner(code, demo_summary)")
    .eq("user_id", userId)
    .not("riffs.demo_script", "is", null)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const riff = (Array.isArray(data?.riffs) ? data.riffs[0] : data?.riffs) as Pick<Riff, "code" | "demo_summary"> | undefined;
  if (body.action === "results") return Response.json({ code: riff?.code ?? null, summary: riff?.demo_summary ?? null } satisfies DemoResults);

  const me = data as Pick<Player, "name" | "interests"> | null;
  const code = me && riff?.demo_summary ? await startCoach(userId, me.name, me.interests, riff.demo_summary) : null;
  if (!code) return new Response("Nothing to coach yet: the latest demo has no misses (or its summary isn't written yet)", { status: 404 });
  return Response.json({ code } satisfies DemoStartResponse);
}
