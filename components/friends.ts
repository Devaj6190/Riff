import { PERSONAS } from "@/lib/engine/personas";
import { supabase } from "@/lib/supabase/client";

/**
 * A friend: you both added each other at the end of a chat (friend_requests, one row each way). Only friends keep each
 * other: invites that reach you anywhere, profile, and old chats together. Anyone you don't add is gone once the chat ends.
 * The AI's personas accept straight away.
 */
export type Friend = { userId: string; name: string; interests: string[] };
export type FriendState = "none" | "sent" | "received" | "friends";
/** A new chat a friend opened for you, over Realtime (FriendInvites). */
export type FriendInvite = { from: string; name: string; code: string };

export const BOT_USER_ID = "00000000-0000-4000-8000-00000000b075"; // lib/engine/bot.ts, which is server-only
export const personaOf = (f: { userId: string; name: string }) => (f.userId === BOT_USER_ID ? PERSONAS.find((p) => p.name === f.name) : undefined);

// ponytail: persona friends live on this device. Every persona is the same bot user, and friend_requests keys on the user.
const PERSONAS_KEY = "riff-friends";

function localPersonas(): Friend[] {
  try {
    const f = JSON.parse(localStorage.getItem(PERSONAS_KEY) ?? "[]");
    return Array.isArray(f) ? f.filter((p) => p.userId === BOT_USER_ID) : [];
  } catch {
    return [];
  }
}

function saveLocal(friends: Friend[]) {
  try {
    localStorage.setItem(PERSONAS_KEY, JSON.stringify(friends));
  } catch {
    // private mode: the persona just isn't kept
  }
}

async function myId() {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

const between = (a: string, b: string) => `and(from_user.eq.${a},to_user.eq.${b}),and(from_user.eq.${b},to_user.eq.${a})`;

/** Name and interests for each user, from the newest chat you had together (players rows are members-only). */
async function people(uid: string, ids: string[]) {
  const db = supabase();
  const { data: mine } = await db.from("players").select("riff_id").eq("user_id", uid);
  const { data } = await db
    .from("players")
    .select("user_id, name, interests")
    .in("riff_id", (mine ?? []).map((p) => p.riff_id))
    .in("user_id", ids)
    .order("joined_at", { ascending: false });
  const byUser = new Map<string, Friend>();
  for (const p of data ?? []) if (!byUser.has(p.user_id)) byUser.set(p.user_id, { userId: p.user_id, name: p.name, interests: p.interests });
  return byUser;
}

/** Your friends (newest first, then personas) and the people waiting for you to add them back. */
export async function loadFriends(): Promise<{ friends: Friend[]; requests: Friend[] }> {
  const uid = await myId();
  if (!uid) return { friends: localPersonas(), requests: [] };
  const { data } = await supabase().from("friend_requests").select("from_user, to_user").or(`from_user.eq.${uid},to_user.eq.${uid}`).order("created_at", { ascending: false });
  const sent = new Set(data?.filter((r) => r.from_user === uid).map((r) => r.to_user));
  const got = (data ?? []).filter((r) => r.to_user === uid).map((r) => r.from_user as string);
  const info = await people(uid, got);
  const pick = (ids: string[]) => ids.flatMap((id) => info.get(id) ?? []);
  return { friends: [...pick(got.filter((id) => sent.has(id))), ...localPersonas()], requests: pick(got.filter((id) => !sent.has(id))) };
}

/** Where you stand with someone. */
export async function friendState(p: { userId: string; name: string }): Promise<FriendState> {
  if (p.userId === BOT_USER_ID) return localPersonas().some((f) => f.name === p.name) ? "friends" : "none";
  const uid = await myId();
  if (!uid) return "none";
  const { data } = await supabase().from("friend_requests").select("from_user").or(between(uid, p.userId));
  const mine = data?.some((r) => r.from_user === uid);
  const theirs = data?.some((r) => r.from_user === p.userId);
  return mine && theirs ? "friends" : mine ? "sent" : theirs ? "received" : "none";
}

/** Add someone, or add them back. Personas accept straight away. */
export async function addFriend(p: Friend): Promise<FriendState> {
  if (p.userId === BOT_USER_ID) {
    saveLocal([p, ...localPersonas().filter((f) => f.name !== p.name)]);
    return "friends";
  }
  const { error } = await supabase().from("friend_requests").insert({ from_user: await myId(), to_user: p.userId });
  if (error && error.code !== "23505") throw new Error(error.message); // 23505: already added
  return friendState(p);
}

/** Unfriend, or turn down a request: clears both directions. */
export async function removeFriend(p: Friend) {
  if (p.userId === BOT_USER_ID) return saveLocal(localPersonas().filter((f) => f.name !== p.name));
  const uid = await myId();
  if (uid) await supabase().from("friend_requests").delete().or(between(uid, p.userId));
}

/** Your chats with a friend, newest first. */
export async function chatsWith(f: Friend) {
  const db = supabase();
  const { data: mine } = await db.from("players").select("riff_id").eq("user_id", (await myId()) ?? "");
  const { data } = await db
    .from("players")
    .select("joined_at, riffs(code)")
    .in("riff_id", (mine ?? []).map((p) => p.riff_id))
    .eq("user_id", f.userId)
    .eq("name", f.name)
    .order("joined_at", { ascending: false });
  return (data ?? []).map((p) => ({ code: ((Array.isArray(p.riffs) ? p.riffs[0] : p.riffs) as { code: string }).code, at: p.joined_at as string }));
}

export const inviteTopic = (userId: string) => `friend-invite:${userId}`;

// ponytail: a Realtime broadcast, so the sender is self-reported; the receiver only shows it if they're friends.
// Server-checked invites would go through an API route.
/** Tell a friend about a chat you just opened for them, wherever they are in the app. */
export async function sendFriendInvite(to: string, invite: FriendInvite) {
  const db = supabase();
  const ch = db.channel(inviteTopic(to));
  await new Promise<void>((resolve, reject) =>
    ch.subscribe((status) => (status === "SUBSCRIBED" ? resolve() : status !== "CLOSED" && reject(new Error(status)))),
  );
  await ch.send({ type: "broadcast", event: "invite", payload: invite });
  await db.removeChannel(ch);
}
