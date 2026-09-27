// The coach: a 1:1 riff (kind 'coach', no nudges) with the AI coach. Started from a chat's coaching report (SPEC §7),
// it runs a short lesson on that report's focus, written from what fell flat in that chat. Otherwise it catches the
// player up on references they missed in past chats (chat_histories / user_profiles `misses`). Own data only.
import { supabaseAdmin } from "../supabase/admin";
import type { ChatHistorySummary, CoachingReport, Player, Riff, UserProfile } from "../types";
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

/**
 * New coach riff with the caller in seat A. Null if there's nothing to coach on. `from`: coach on one chat's summary
 * (its report's focus, else its misses), from /api/coach with a riffId or a demo (demo.ts), instead of the caller's
 * recent misses; it's kept on the coach riff.
 */
export async function startCoach(userId: string, name: string, interests: string[], from?: ChatHistorySummary | null): Promise<string | null> {
  if (!(from ? from.coaching?.coach || from.misses.length : (await coachTopics(userId)).length)) return null;
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("insert_riff", { p_kind: "coach" });
  if (error) throw error;
  const riff = data as Riff;
  if (from) {
    // ponytail: rides on demo_summary (a coach riff is never a demo); a coach_summary column would name it better.
    const kept = await db.from("riffs").update({ demo_summary: from }).eq("id", riff.id);
    if (kept.error) throw kept.error;
  }
  const seated = await db.from("players").insert({ riff_id: riff.id, user_id: userId, seat: "A", name, interests });
  if (seated.error) throw seated.error;
  await seatBot(riff.id, COACH);
  return riff.code;
}

/** The bot's system prompt in a coach riff (botTurn): a lesson on the report's focus, else a catch-up on misses. */
export async function coachSystem(bot: Player, human: Player): Promise<string> {
  const { data: riff } = await supabaseAdmin().from("riffs").select("demo_summary").eq("id", human.riff_id).single<Pick<Riff, "demo_summary">>();
  const report = riff?.demo_summary?.coaching;
  if (report?.coach) return lessonSystem(bot, human, report);
  const topics = riff?.demo_summary?.misses.slice(0, 5) ?? (await coachTopics(human.user_id));
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

/** A short practice chat on what fell flat in one chat. The content is the report's; only the lesson's shape is fixed. */
export function lessonSystem(bot: Pick<Player, "name">, human: Pick<Player, "name" | "interests">, report: CoachingReport): string {
  const focus = report.coach!;
  const moments = [
    report.flat.quote && `where it fell flat, in their words: "${report.flat.quote}" (${report.flat.point})`,
    report.improve.said && report.improve.try && `a line of theirs to rewrite: "${report.improve.said}" → "${report.improve.try}"`,
  ].filter(Boolean);
  return `You are ${bot.name}, Riff's coach: a friend who's great at texting and always up on pop culture, memes and slang, texting ${human.name} (into ${human.interests.join(", ")}) for one short practice chat.
From their last chat, what to work on: "${focus.title}". ${focus.why}
Cover these, one at a time: ${JSON.stringify(focus.learn)}.${moments.length ? `\nFrom that chat: ${moments.join("; ")}.` : ""}
Run it as a quick lesson, one thing at a time:
1. teach it in a sentence or two, with an example line they could actually send (a reference or slang: what it is, why people bring it up, how to reply when someone does)
2. then have them try: send a realistic message someone might text them, and ask how they'd reply
3. react to their reply: what worked, one tweak, and a better version if it was flat; keep it encouraging
4. then the next thing. After the last one: a quick recap in one message, and tell them to try it in their next chat (tap Match me to find someone)
- open with one kind line on what you noticed in their last chat and what you'll work on together, then start on the first thing
- text like a friend in a DM: casual, mostly lowercase, short messages, a little humor; never lecture or send paragraphs
- if they ask something off the plan, answer it, then steer back
- never mention or quote the other person from their chat
Return JSON: {"reply": "..."}`;
}
