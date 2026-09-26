// Live chat reading. When there are new messages, Grok folds them into riff_context: running notes on what each
// player has shared, and the thread they're on. Scoring and the nudge writers read it (loadChatContext).
import { supabaseAdmin } from "../supabase/admin";
import type { ChatContext, Seat } from "../types";
import { llmJson } from "./llm";

export const EMPTY_CONTEXT: ChatContext = { notes: { A: [], B: [] }, thread: { topic: "", open: [], callbacks: [] } };

/** Up to `max` trimmed, non-empty strings of at most `len` chars; anything else is dropped. */
export const strings = (v: unknown, max: number, len = 80): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, max) : [];

const obj = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;

/** Coerce model output into a ChatContext. */
export function normalizeContext(raw: unknown): ChatContext {
  const o = obj(raw);
  const notes = obj(o.notes);
  const thread = obj(o.thread);
  return {
    notes: { A: strings(notes.A, 15), B: strings(notes.B, 15) },
    thread: { topic: typeof thread.topic === "string" ? thread.topic.trim().slice(0, 80) : "", open: strings(thread.open, 3), callbacks: strings(thread.callbacks, 3) },
  };
}

export async function loadChatContext(riffId: string): Promise<ChatContext> {
  const { data } = await supabaseAdmin().from("riff_context").select("context").eq("riff_id", riffId).maybeSingle();
  return (data?.context as ChatContext | undefined) ?? EMPTY_CONTEXT;
}

// ponytail: per-instance, so two clients ticking every second start one read, and a burst of texts becomes the next
// read. Another serverless instance may read the same messages; the compare-and-set on read_through drops its write.
const reading = new Set<string>();
const readUpTo = new Map<string, number>(); // ms: newest message folded in, per riff

/** Fold messages newer than riff_context.read_through into it. Called from /api/tick whenever there's chat. */
export async function readChat(riffId: string, lastMessageAt: number): Promise<void> {
  if (reading.has(riffId) || (readUpTo.get(riffId) ?? 0) >= lastMessageAt) return;
  reading.add(riffId);
  try {
    const db = supabaseAdmin();
    const { data: row } = await db.from("riff_context").select("context, read_through").eq("riff_id", riffId).maybeSingle();
    const since: number = row?.read_through ?? 0;
    const [players, messages] = await Promise.all([
      db.from("players").select("id, seat, name").eq("riff_id", riffId),
      db.from("messages").select("id, player_id, body, created_at").eq("riff_id", riffId).gt("id", since).order("id").limit(50),
    ]);
    const fresh = messages.data ?? [];
    if (!fresh.length) return;
    const seat = new Map((players.data ?? []).map((p) => [p.id, p.seat as Seat]));
    const context = normalizeContext(
      await llmJson(
        [
          "Two people who just met are texting in a chat app. You keep running notes on their conversation:",
          "you get the notes so far and the newest messages, and return the updated notes.",
          "notes: per player, short facts, opinions, stories, likes and dislikes they've shared about themselves",
          '("has a corgi named Mochi", "thinks Dune 2 beats Dune 1"). Keep earlier notes unless corrected, merge duplicates,',
          "at most 15 per player (drop the least telling). Leave out contact details, addresses and social handles.",
          "thread.topic: what they're on right now, a few words. thread.open: questions asked but not answered yet, up to 3.",
          "thread.callbacks: running jokes or moments they keep coming back to, up to 3.",
          'JSON shape: {"notes": {"A": [s], "B": [s]}, "thread": {"topic": s, "open": [s], "callbacks": [s]}}',
        ].join(" "),
        JSON.stringify({
          players: (players.data ?? []).map((p) => ({ seat: p.seat, name: p.name })),
          notesSoFar: row?.context ?? EMPTY_CONTEXT,
          newMessages: fresh.map((m) => `${seat.get(m.player_id) ?? "?"}: ${m.body}`),
        }),
        6000,
        { fast: true },
      ),
    );
    const through = fresh.at(-1)!;
    const write = row
      ? db.from("riff_context").update({ context, read_through: through.id, updated_at: new Date().toISOString() }).eq("riff_id", riffId).eq("read_through", since)
      : db.from("riff_context").insert({ riff_id: riffId, context, read_through: through.id });
    const { error } = await write;
    if (error && error.code !== "23505") throw error; // 23505: another instance wrote the first read
    readUpTo.set(riffId, Date.parse(through.created_at));
  } finally {
    reading.delete(riffId);
  }
}
