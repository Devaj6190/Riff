// Discovery (SPEC §7): search the live queue plus the seeded personas, ranked by Jev; invite or pair with a tap.
// The queue and presence are match.ts's: browse-mode players poll /api/match like Match me players do.
import { overlap } from "../interests";
import { supabaseAdmin } from "../supabase/admin";
import type { Invite, MatchResponse, PublicProfile, QueueMode, Riff, SearchPerson, SearchResponse, UserProfile } from "../types";
import { BOT_USER_ID, seatBot } from "./bot";
import { jev } from "./jev";
import { FRESH_MS } from "./match";
import { PERSONAS } from "./personas";
import { publicProfiles } from "./profiles";

export const INVITE_MS = 60_000;
const JEV_TIMEOUT_MS = 3_000;
const NO_MATCH_BELOW = 0.5; // nobody's more likely a yes than a no
const RECENT_CHATS = 5; // Match me skips seeds from my last 5 chats, so pressing it again meets someone new
const MIX_FROM_TOP = 30; // the mix only reorders Jev's best 30: a mixed but poor fit shouldn't beat a great one

type QueueRow = { user_id: string; name: string; interests: string[]; mode: QueueMode; profile?: PublicProfile };

const SEEDS: SearchPerson[] = PERSONAS.map((p) => ({ ...p, mode: "browse", seed: true }));
const fresh = (ms: number) => new Date(Date.now() - ms).toISOString();
const person = ({ user_id, name, interests, mode, profile }: QueueRow): SearchPerson => ({
  id: user_id,
  name,
  interests,
  mode,
  seed: false,
  ...(profile && { from: profile.from, prompts: profile.prompts, favorites: profile.favorites }),
});

/** Everyone waiting in the queue but me, still polling and not yet paired, with their public profile if saved. */
async function liveQueue(userId: string): Promise<QueueRow[]> {
  const { data } = await supabaseAdmin()
    .from("match_queue")
    .select("user_id, name, interests, mode")
    .is("riff_code", null)
    .neq("user_id", userId)
    .gt("seen_at", fresh(FRESH_MS))
    .limit(150); // ponytail: 150 + 300 seeds is 450 nouls (~0.7 s); shortlist before Jev if the queue outgrows it
  const rows = (data ?? []) as QueueRow[];
  const profiles = await publicProfiles(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, profile: profiles.get(r.user_id) }));
}

async function myRow(userId: string): Promise<QueueRow | null> {
  const { data } = await supabaseAdmin()
    .from("match_queue")
    .select("user_id, name, interests, mode")
    .eq("user_id", userId)
    .is("riff_code", null)
    .gt("seen_at", fresh(FRESH_MS))
    .maybeSingle();
  return data as QueueRow | null;
}

const describe = (p: SearchPerson) =>
  [
    p.name,
    p.school,
    p.from && `from ${p.from}`,
    p.interests.join(", "),
    p.bio,
    ...(p.prompts ?? []).map((x) => `${x.prompt} ${x.answer}`),
    ...(p.favorites ?? []).map((f) => `favorite ${f.kind}: ${f.value}`),
  ]
    .filter(Boolean)
    .join(" · ");

/** Rank the queue for me: by fit when the query is empty (real people first), else by relevance to the query. */
export async function search(userId: string, query: string): Promise<SearchResponse> {
  const { people, noMatch } = await ranked(userId, query);
  return { people, noMatch };
}

/** search(), plus what it knew about me: my queue row, hidden profile (past chats) and all my public interests. */
async function ranked(userId: string, query: string) {
  const [me, queue, prof, pub] = await Promise.all([
    myRow(userId),
    liveQueue(userId),
    supabaseAdmin().from("user_profiles").select("profile").eq("user_id", userId).maybeSingle(),
    publicProfiles([userId]),
  ]);
  const people = [...queue.map(person), ...SEEDS];
  const q = query.trim().slice(0, 200);
  const profile = (prof.data?.profile ?? null) as UserProfile | null;
  const mine = pub.get(userId);
  const interests = mine?.interests ?? me?.interests ?? [];
  let relevance: Record<string, number>;
  let noMatch = false;
  try {
    // One noul per person, all in one call: independent scores rank the whole list (a Choice only sharpens #1).
    // ponytail: ~23k input tokens at 300 people, ~0.5 s; shortlist by word overlap first if cost or the queue grows.
    const question = q
      ? "Would the searcher enjoy chatting with this person about what they typed? It's a vibe search, not a keyword search: a specific title (a game, show, band, team, book) matches people into that kind of thing."
      : "Would `me` enjoy a first chat with this person? Shared or complementary interests count most.";
    const answers = await jev(
      q
        ? { searching_for: q }
        : { me: { name: me?.name, from: mine?.from, interests, prompts: mine?.prompts, favorites: mine?.favorites, enjoys: profile?.enjoys, about: profile?.about } },
      Object.fromEntries(people.map((p) => [p.id, { type: "noul" as const, instructions: { question, person: describe(p) } }])),
      JEV_TIMEOUT_MS,
    );
    relevance = Object.fromEntries(Object.entries(answers).flatMap(([id, a]) => (a.type === "noul" ? [[id, a.noul]] : [])));
    if (!Object.keys(relevance).length) throw new Error("Jev: no ranking");
    noMatch = !!q && Math.max(...Object.values(relevance)) < NO_MATCH_BELOW;
  } catch (e) {
    console.warn("search: Jev failed, ranking by word overlap", e instanceof Error ? e.message : e);
    const score = overlap(q ? [q] : [...interests, ...(profile?.enjoys ?? [])]);
    relevance = Object.fromEntries(people.map((p) => [p.id, score([...p.interests, p.bio ?? "", p.school ?? "", p.name, ...(p.favorites ?? []).map((f) => f.value), ...(p.prompts ?? []).map((x) => x.answer)])]));
    noMatch = !!q && Object.values(relevance).every((r) => r === 0);
  }
  return { people: rankPeople(people, relevance, !q), noMatch, me, profile, interests };
}

/**
 * Match me with nobody real to pair with: a seed, played by the bot. Jev's fit ranking, then the mix: they share at
 * least one of my interests and bring at least one I'm not into yet. Skips seeds from my last few chats and anyone
 * into a topic that fell flat for me; a random one of the best 3, so each press can meet someone new.
 */
export async function matchSeed(userId: string): Promise<string | null> {
  const [{ people, me, profile, interests }, recent] = await Promise.all([ranked(userId, ""), recentSeeds(userId)]);
  if (!me) return null; // out of the queue, or paired meanwhile: the next poll finds that code
  const best = seedShortlist(people.filter((p) => p.seed), [...interests, ...(profile?.enjoys ?? [])], profile?.flat ?? [], recent).slice(0, 3);
  return withSeed(userId, me, best[Math.floor(Math.random() * best.length)]);
}

/** Seeds (already ranked by fit) in Match me's order: the mix first, then the rest of the best. */
export function seedShortlist(seeds: SearchPerson[], mine: string[], flat: string[], recent: Set<string>): SearchPerson[] {
  const known = overlap(mine);
  const fellFlat = overlap(flat);
  const newFaces = seeds.filter((p) => !recent.has(p.name) && !fellFlat(p.interests));
  const top = (newFaces.length ? newFaces : seeds).slice(0, MIX_FROM_TOP);
  const mixed = top.filter((p) => known(p.interests) > 0 && p.interests.some((i) => !known([i])));
  return [...mixed, ...top.filter((p) => !mixed.includes(p))];
}

/** Names the bot played in my last few chats. */
async function recentSeeds(userId: string): Promise<Set<string>> {
  const db = supabaseAdmin();
  const { data: mine } = await db.from("players").select("riff_id").eq("user_id", userId).order("joined_at", { ascending: false }).limit(RECENT_CHATS);
  if (!mine?.length) return new Set();
  const { data } = await db.from("players").select("name").in("riff_id", mine.map((p) => p.riff_id)).eq("user_id", BOT_USER_ID);
  return new Set((data ?? []).map((p) => p.name as string));
}

/**
 * A new riff: me in seat A, the bot playing `seed`. Takes me out of the queue first, so a real pairing landing at the
 * same moment wins (null: the next /api/match poll finds its code).
 */
async function withSeed(userId: string, me: QueueRow, seed: Pick<SearchPerson, "name" | "interests">): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: left, error: leaving } = await db.from("match_queue").delete().eq("user_id", userId).is("riff_code", null).select("user_id");
  if (leaving) throw leaving;
  if (!left.length) return null;
  const { data, error } = await db.rpc("insert_riff", { p_kind: "game" });
  if (error) throw error;
  const riff = data as Riff;
  const seated = await db.from("players").insert({ riff_id: riff.id, user_id: userId, seat: "A", name: me.name, interests: me.interests });
  if (seated.error) throw seated.error;
  // ponytail: the bot plays the persona's name and interests; its bio is search-only.
  await seatBot(riff.id, { name: seed.name, interests: seed.interests });
  await db.from("invites").delete().or(`from_user.eq.${userId},to_user.eq.${userId}`);
  return riff.code;
}

/** Most relevant first; `realFirst` puts real people above seeds (stable, so ties keep queue order). */
export function rankPeople(people: SearchPerson[], relevance: Record<string, number>, realFirst: boolean): SearchPerson[] {
  return people
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (realFirst ? +a.p.seed - +b.p.seed : 0) || (relevance[b.p.id] ?? 0) - (relevance[a.p.id] ?? 0) || a.i - b.i)
    .map(({ p }) => p);
}

/** Pair two queued players (pair_up) and take me out of the queue; the other finds the code on their next poll. */
async function pair(me: string, them: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: code, error } = await db.rpc("pair_up", { p_a: me, p_b: them });
  if (error) throw error;
  if (code) await db.from("match_queue").delete().eq("user_id", me);
  return (code as string | null) ?? null;
}

/**
 * Tap a person in search. A seed: a new riff with the bot as them. Match mode, or they already invited me: pair now.
 * Else: invite them (again, if they passed). Returns the riff code when paired. Throws a 409 Response if I'm not in
 * the queue, 404 if they've left.
 */
export async function sendInvite(userId: string, to: string): Promise<string | null> {
  const db = supabaseAdmin();
  const me = await myRow(userId);
  if (!me) throw new Response("join the queue first (poll /api/match)", { status: 409 });
  const seed = PERSONAS.find((p) => p.id === to);
  if (seed) return withSeed(userId, me, seed);
  const them = (await liveQueue(userId)).find((r) => r.user_id === to);
  if (!them) throw new Response("they're not in the queue anymore", { status: 404 });
  const { data: theirs } = await db.from("invites").select("id").eq("from_user", to).eq("to_user", userId).eq("passed", false).gt("created_at", fresh(INVITE_MS)).maybeSingle();
  if (them.mode === "match" || theirs) return pair(userId, to);
  const { error } = await db.from("invites").upsert({ from_user: userId, to_user: to, passed: false, created_at: new Date().toISOString() }, { onConflict: "from_user,to_user" });
  if (error) throw error;
  return null;
}

/** Swipe on an invite I got. Right: pair with the sender (null if they've left or were paired first). Left: passed. */
export async function answerInvite(userId: string, id: number, accept: boolean): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: invite } = await db.from("invites").select("from_user").eq("id", id).eq("to_user", userId).gt("created_at", fresh(INVITE_MS)).maybeSingle();
  if (!invite) return null;
  if (!accept) {
    await db.from("invites").update({ passed: true }).eq("id", id);
    return null;
  }
  return pair(userId, invite.from_user);
}

/** My invite inbox for /api/match's browse-mode poll: live invites to me from people still queued, and mine sent. */
export async function inviteState(userId: string): Promise<Pick<MatchResponse, "invites" | "sent">> {
  const db = supabaseAdmin();
  const [incoming, outgoing, queue] = await Promise.all([
    db.from("invites").select("id, from_user").eq("to_user", userId).eq("passed", false).gt("created_at", fresh(INVITE_MS)).order("created_at"),
    db.from("invites").select("to_user, passed").eq("from_user", userId).gt("created_at", fresh(INVITE_MS)),
    liveQueue(userId),
  ]);
  const queued = new Map(queue.map((r) => [r.user_id, r]));
  const invites: Invite[] = (incoming.data ?? []).flatMap((i) => (queued.has(i.from_user) ? [{ id: i.id, from: person(queued.get(i.from_user)!) }] : []));
  const sent = Object.fromEntries((outgoing.data ?? []).map((i) => [i.to_user, i.passed ? "passed" : "pending"] as const));
  return { invites, sent };
}
