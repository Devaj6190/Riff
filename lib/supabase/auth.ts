import type { Player } from "@/lib/types";
import { supabaseAdmin } from "./admin";

/**
 * API-route guard: the caller must send a valid Supabase access token and be a player in `riffId`.
 * Throws a Response (401/403); routes do `catch (e) { if (e instanceof Response) return e; throw e; }`.
 */
export async function requirePlayer(req: Request, riffId: string): Promise<Player> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Missing access token", { status: 401 });
  const db = supabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Response("Invalid access token", { status: 401 });
  const { data: player } = await db.from("players").select("*").eq("riff_id", riffId).eq("user_id", data.user.id).maybeSingle<Player>();
  if (!player) throw new Response("Not a player in this riff", { status: 403 });
  return player;
}
