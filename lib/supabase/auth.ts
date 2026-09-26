import type { Player } from "@/lib/types";
import { supabaseAdmin } from "./admin";

/**
 * API-route guard: the caller must send a valid Supabase access token. Returns their user id.
 * Throws a Response (401); routes do `catch (e) { if (e instanceof Response) return e; throw e; }`.
 */
export async function requireUser(req: Request): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Missing access token", { status: 401 });
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new Response("Invalid access token", { status: 401 });
  return data.user.id;
}

/** requireUser, and the caller must be a player in `riffId` (else a 403 Response is thrown). */
export async function requirePlayer(req: Request, riffId: string): Promise<Player> {
  const userId = await requireUser(req);
  const { data: player } = await supabaseAdmin().from("players").select("*").eq("riff_id", riffId).eq("user_id", userId).maybeSingle<Player>();
  if (!player) throw new Response("Not a player in this riff", { status: 403 });
  return player;
}

/** A profile from a request body (MatchRequest, CoachRequest), checked like the DB checks players. Null if bad. */
export function readProfile(body: unknown): { name: string; interests: string[] } | null {
  const { name, interests } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const n = typeof name === "string" ? name.trim() : "";
  const ok = Array.isArray(interests) && interests.length >= 1 && interests.length <= 3 && interests.every((i) => typeof i === "string" && i.trim());
  return n && n.length <= 24 && ok ? { name: n, interests: (interests as string[]).map((i) => i.trim()) } : null;
}
