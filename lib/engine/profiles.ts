// Public profiles (SPEC §7 Profiles): the `profiles` table, the Jev checks on save, and what other people get to see.
// Not the hidden user_profiles rollup (ending.ts).
import { supabaseAdmin } from "../supabase/admin";
import type { MyProfile, Player, PublicProfile } from "../types";
import { jev, type JevQuestion } from "./jev";
import { seedFor } from "./personas";
import { PLACE_BELOW, PLACE_QUESTION } from "./place";

type Row = { user_id: string; name: string; last_name: string; age: number; hometown: string; interests: string[]; prompts: MyProfile["prompts"]; favorites: MyProfile["favorites"] };

const mine = (r: Row): MyProfile => ({ name: r.name, lastName: r.last_name, age: r.age, from: r.hometown, interests: r.interests, prompts: r.prompts, favorites: r.favorites });
/** Only the public fields: what other people and Jev may see. */
export const publicOf = ({ name, from, interests, prompts, favorites }: PublicProfile): PublicProfile => ({ name, from, interests, prompts, favorites });

export async function loadMyProfile(userId: string): Promise<MyProfile | null> {
  const { data } = await supabaseAdmin().from("profiles").select("*").eq("user_id", userId).maybeSingle<Row>();
  return data ? mine(data) : null;
}

/** Public profiles by user id, for search and nudges. People without a saved profile are missing. */
export async function publicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
  if (!userIds.length) return new Map();
  const { data } = await supabaseAdmin().from("profiles").select("*").in("user_id", userIds);
  return new Map(((data ?? []) as Row[]).map((r) => [r.user_id, publicOf(mine(r))]));
}

/** A player's public profile: a bot playing a seed gets the seed's; a human without one saved gets name + interests. */
export function profileOfPlayer(player: Player, saved: Map<string, PublicProfile>): PublicProfile {
  const seed = seedFor(player);
  if (seed) return publicOf(seed);
  return saved.get(player.user_id) ?? { name: player.name, from: "", interests: player.interests, prompts: [], favorites: [] };
}

/** The other player in `riffId`, public fields only. Throws a 403 Response if I'm not in it. */
export async function partnerProfile(userId: string, riffId: string): Promise<PublicProfile | null> {
  const { data } = await supabaseAdmin().from("players").select("*").eq("riff_id", riffId);
  const players = (data ?? []) as Player[];
  if (!players.some((p) => p.user_id === userId)) throw new Response("Not a player in this riff", { status: 403 });
  const them = players.find((p) => p.user_id !== userId);
  return them ? profileOfPlayer(them, await publicProfiles([them.user_id])) : null;
}

const APPROPRIATE =
  "Is this answer to a profile prompt fine to show strangers on a chat app for meeting people (jokes, opinions and mild swearing are fine)? No: slurs, sexual content, harassment, threats, or contact info like phone numbers, emails, social handles or links.";
const REAL = (kind: string) => `Is value a real ${kind} that exists (any spelling or casing, abbreviations fine) and fine to show strangers? Made-up, gibberish, jokes and non-${kind}s are not.`;

/**
 * Jev's yes/no per public field that's new since `prev` (unchanged ones passed before; re-asking could flip them).
 * Returns an error message per failed field, keyed "from", "prompts.<i>", "favorites.<i>". Fails open.
 */
export async function checkProfile(next: MyProfile, prev: MyProfile | null): Promise<Record<string, string>> {
  const same = (a: object, list: object[] = []) => list.some((b) => JSON.stringify(b) === JSON.stringify(a));
  const questions: Record<string, JevQuestion> = {};
  const errors: Record<string, string> = {};
  if (next.from && next.from !== prev?.from) {
    questions.from = { type: "noul", instructions: { question: PLACE_QUESTION, hometown: next.from } };
    errors.from = "We couldn't find that place";
  }
  next.prompts.forEach((p, i) => {
    if (same(p, prev?.prompts)) return;
    questions[`prompts.${i}`] = { type: "noul", instructions: { question: APPROPRIATE, prompt: p.prompt, answer: p.answer } };
    errors[`prompts.${i}`] = "Try another answer";
  });
  next.favorites.forEach((f, i) => {
    if (same(f, prev?.favorites)) return;
    questions[`favorites.${i}`] = { type: "noul", instructions: { question: REAL(f.kind), value: f.value } };
    errors[`favorites.${i}`] = `That doesn't look like a real ${f.kind}`;
  });
  if (!Object.keys(questions).length) return {};
  try {
    const answers = await jev("Fields someone typed into their public profile on Riff, a chat app for meeting new people.", questions, 3000);
    // ponytail: one lenient bar for every field (hometown's); split it if prompts need to be stricter.
    return Object.fromEntries(Object.entries(errors).filter(([k]) => answers[k]?.type === "noul" && answers[k].noul < PLACE_BELOW));
  } catch (e) {
    console.error("profile check failed", e);
    return {};
  }
}

export async function saveMyProfile(userId: string, p: MyProfile): Promise<void> {
  const { error } = await supabaseAdmin().from("profiles").upsert({
    user_id: userId,
    name: p.name,
    last_name: p.lastName,
    age: p.age,
    hometown: p.from,
    interests: p.interests,
    prompts: p.prompts,
    favorites: p.favorites,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
