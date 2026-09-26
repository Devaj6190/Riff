// The coach: a 1:1 riff (kind 'coach', no nudges) where the bot catches a player up on references and topics they
// missed in past chats (chat_histories / user_profiles `misses`). The player sees only their own misses.
import { supabaseAdmin } from "../supabase/admin";
import type { Player, Riff, UserProfile } from "../types";
import { seatBot } from "./bot";

const COACH = { name: "Coach", interests: ["pop culture"] };

/** What this player missed: their latest chat first, then the profile's patterns. Up to 5. */
export async function coachTopics(userId: string): Promise<string[]> {
  const db = supabaseAdmin();
  const [latest, profile] = await Promise.all([
    db.from("chat_histories").select("summary").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("user_profiles").select("profile").eq("user_id", userId).maybeSingle(),
  ]);
  const all = [...(latest.data?.summary?.misses ?? []), ...((profile.data?.profile as UserProfile | undefined)?.misses ?? [])] as string[];
  return all.filter((m, i) => all.findIndex((o) => o.toLowerCase() === m.toLowerCase()) === i).slice(0, 5);
}

/** New coach riff with the caller in seat A. Null if there's nothing to catch up on. */
export async function startCoach(userId: string, name: string, interests: string[]): Promise<string | null> {
  if (!(await coachTopics(userId)).length) return null;
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("insert_riff", { p_kind: "coach" });
  if (error) throw error;
  const riff = data as Riff;
  const seated = await db.from("players").insert({ riff_id: riff.id, user_id: userId, seat: "A", name, interests });
  if (seated.error) throw seated.error;
  await seatBot(riff.id, COACH);
  return riff.code;
}

/** The bot's system prompt in a coach riff (botTurn). */
export async function coachSystem(bot: Player, human: Player): Promise<string> {
  const topics = await coachTopics(human.user_id);
  return `You are ${bot.name}, Riff's coach: a friend who's always up on pop culture, memes and what people are talking about, texting ${human.name} (into ${human.interests.join(", ")}).
In their recent chats they didn't get these, or checked out of them: ${JSON.stringify(topics)}.
Catch them up, one at a time: what it is in a sentence or two, why people bring it up, and a line they could drop next time it comes up. Tie it to what they're into when you can.
- text like a friend in a DM: casual, mostly lowercase, short messages, a little humor; never lecture
- open by saying you noticed a couple of references slipped past them lately and you'll catch them up; then start on the first
- after each one, check they've got it or answer their questions before moving on
- never say who brought something up or quote anyone from their chats
- once you've covered them, tell them to bring one up in their next chat and tap Match me to find someone to try it on
Return JSON: {"reply": "..."}`;
}
