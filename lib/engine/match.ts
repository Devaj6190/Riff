// Match me: players wait in match_queue, polling /api/match. Whoever polls pairs themselves with the waiting player
// they're most likely to click with (hidden profiles from ending.ts), and pair_up (0009) seats both in a new riff.
import { supabaseAdmin } from "../supabase/admin";
import type { UserProfile } from "../types";
import { llmJson } from "./llm";

export const FRESH_MS = 8_000; // polled within this = still waiting (clients poll every 2 s)

type Waiting = { user_id: string; name: string; interests: string[] };

/** Queue the caller (or refresh their spot) and try to pair them. Returns the new riff's code once matched. */
export async function matchMe(userId: string, name: string, interests: string[]): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: mine } = await db.from("match_queue").select("riff_code, seen_at").eq("user_id", userId).maybeSingle();
  if (mine?.riff_code) {
    await db.from("match_queue").delete().eq("user_id", userId);
    // A match they walked away from doesn't count: queue them again.
    if (Date.parse(mine.seen_at) > Date.now() - FRESH_MS) return mine.riff_code;
  }
  // No riff_code here: a concurrent pair_up may have just set it.
  const { error } = await db.from("match_queue").upsert({ user_id: userId, name, interests, seen_at: new Date().toISOString() });
  if (error) throw error;

  const { data: waiting } = await db
    .from("match_queue")
    .select("user_id, name, interests")
    .is("riff_code", null)
    .neq("user_id", userId)
    .gt("seen_at", new Date(Date.now() - FRESH_MS).toISOString())
    .limit(20);
  if (!waiting?.length) return null;
  const partner = waiting.length === 1 ? waiting[0] : await bestFit({ user_id: userId, name, interests }, waiting);

  const { data: code, error: pairError } = await db.rpc("pair_up", { p_a: userId, p_b: partner.user_id });
  if (pairError) throw pairError;
  if (!code) return null; // someone else paired one of us first; the next poll picks it up
  await db.from("match_queue").delete().eq("user_id", userId); // the partner's row keeps the code for their next poll
  return code as string;
}

/** The waiting player the model thinks `me` will click with best; shared interests if the model fails. */
async function bestFit(me: Waiting, waiting: Waiting[]): Promise<Waiting> {
  const { data } = await supabaseAdmin().from("user_profiles").select("user_id, profile").in("user_id", [me.user_id, ...waiting.map((w) => w.user_id)]);
  const profile = new Map((data ?? []).map((r) => [r.user_id, r.profile as UserProfile]));
  const about = (w: Waiting) => ({ name: w.name, interests: w.interests, pastChats: profile.get(w.user_id) ?? null });
  try {
    const out = (await llmJson(
      [
        "You're a matchmaker for Riff, a chat game for two people who just met. Pick the waiting person `me` is most likely to have a great first chat with.",
        "Weigh shared or complementary interests, what each enjoys in chats, and avoid pairing someone with topics that fall flat or they don't get.",
        "pastChats is null for new players: go by interests.",
        'JSON shape: {"pick": index into waiting}',
      ].join(" "),
      JSON.stringify({ me: about(me), waiting: waiting.map(about) }),
      4_000,
      { fast: true },
    )) as { pick?: unknown };
    if (typeof out.pick === "number" && waiting[out.pick]) return waiting[out.pick];
  } catch (e) {
    console.warn("matchmaker: model failed, using shared interests", e instanceof Error ? e.message : e);
  }
  return byOverlap(me.interests.concat(profile.get(me.user_id)?.enjoys ?? []), waiting.map((w) => w.interests.concat(profile.get(w.user_id)?.enjoys ?? [])), waiting);
}

/** The candidate whose terms share the most words with `mine` (first wins ties). */
export function byOverlap<T>(mine: string[], theirs: string[][], candidates: T[]): T {
  const words = (terms: string[]) => new Set(terms.flatMap((t) => t.toLowerCase().split(/\W+/)).filter((w) => w.length > 2));
  const me = words(mine);
  const score = (terms: string[]) => [...words(terms)].filter((w) => me.has(w)).length;
  let best = 0;
  theirs.forEach((t, i) => {
    if (score(t) > score(theirs[best])) best = i;
  });
  return candidates[best];
}
