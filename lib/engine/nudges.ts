// Nudge writing (SPEC §4.1, §4.2, §6). Nudges are written ahead into `queued_nudges` and shown by /api/tick,
// so a nudge never waits on a model when it pops up.
import { supabaseAdmin } from "../supabase/admin";
import type { ChatContext, Depth, NudgeKind, NudgePayloads, Player, PublicProfile, QueuedNudge, Seat, Template, UserProfile } from "../types";
import { turfFor } from "./bonus";
import { jev } from "./jev";
import { totalsByPlayer } from "./ending";
import { profileOfPlayer, publicProfiles } from "./profiles";
import { PACING } from "./pacing";
import { loadChatContext } from "./reader";
import allTemplates from "./templates.json";

const TEMPLATES = allTemplates as Template[];
export const MODEL_TIMEOUT_MS = 20_000; // prefetch runs in the background with at least one nudge gap of lead time
const JEV_TIMEOUT_MS = 3000; // picking a kind or a draft; on timeout, the fallback

/** Everything a writer gets to write one nudge for this pair. `templates[0]` is the pick for local fill. */
export type NudgeContext = {
  number: number;
  depth: Depth;
  players: Player[];
  chat: string[]; // "Name: message", oldest first
  known: ChatContext; // what the chat has revealed about each player, and the thread they're on (reader.ts)
  earlier: { prompt: string; quality: Record<string, number> }[]; // oldest first; quality 0-10 by name, absent = no answer
  past: Partial<Record<Seat, UserProfile>>; // from their earlier chats with other people: steer only, never quote
  shown: Partial<Record<Seat, Pick<PublicProfile, "from" | "prompts" | "favorites">>>; // their public profiles: fair to reference
  templates: Template[]; // shortlist for this kind and depth
  turf: Player | null; // bonus mode (bonus.ts): lean this nudge toward this player's interests
  fast?: boolean; // write with Grok first (~1 s): a rewrite racing the next pop-up (refreshNext)
};

/**
 * One per kind, in `lib/engine/writers/<kind>.ts` as the default export. Dropping in a file (plus templates for
 * that kind in templates.json) enables the kind; nothing here needs editing.
 */
export type Writer<K extends NudgeKind = NudgeKind> = {
  lead: 1 | 2; // how many nudges ahead it must be written (images are slow: 2)
  write(ctx: NudgeContext): Promise<NudgePayloads[K]>; // AI; may throw
  fill(ctx: NudgeContext): NudgePayloads[K]; // local template fill, instant
};

export type PlannedNudge = { kind: NudgeKind; depth: Depth; payload: NudgePayloads[NudgeKind]; is_bonus: boolean; for_seat: Seat | null };

/** SPEC §4.2 after the intro: climb light → opinions → deep, drop back to fun, climb again. */
export const DEPTH_ARC: Depth[] = [1, 1, 2, 1, 2, 3, 1, 2, 3];

/** Intro nudges are light; then the arc. Deep only once both players have earned connection points. */
export function depthFor(number: number, bothConnected: boolean): Depth {
  if (number <= PACING.introNudges) return 1;
  const depth = DEPTH_ARC[(number - PACING.introNudges - 1) % DEPTH_ARC.length];
  return depth === 3 && !bothConnected ? 2 : depth;
}

export const isIntro = (number: number) => number <= PACING.introNudges;

/**
 * Deterministic per riff + nudge number, so a slot looked at twice picks the same template, and consecutive
 * nudges walk the list instead of repeating. Returns up to 4 templates of `kind` (all intro nudges are text).
 * Intro nudges use the `intro`-tagged templates: the first one ("say hi") for nudge 1, then just one of the others,
 * rotated per chat, so chats don't all open the same way (given a few, the model kept picking the same one).
 */
export function pickTemplates(templates: Template[], riffId: string, number: number, depth: Depth, kind: NudgeKind = "text"): Template[] {
  const intro = templates.filter((t) => t.tags.includes("intro"));
  if (isIntro(number) && intro.length > 1) {
    if (number === 1) return intro.slice(0, 1);
    return [intro[1 + ((hash(riffId) + number) % (intro.length - 1))]];
  }
  const rest = templates.filter((t) => !t.tags.includes("intro") && t.kind === kind);
  const atDepth = rest.filter((t) => t.depth === depth);
  const pool = atDepth.length ? atDepth : rest;
  const start = (hash(riffId) + number) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, 4);
}

/**
 * Variety first (SPEC §4.1): the kinds that may come next, given the kinds shown before (newest first). Intro nudges
 * are text; after an image or a mini game comes text; a mini game at most once in any 4 nudges, an image in any 3.
 */
export function allowedKinds(playable: NudgeKind[], recent: NudgeKind[], number: number): NudgeKind[] {
  if (isIntro(number) || (recent[0] && recent[0] !== "text")) return ["text"];
  return playable.filter((k) => k === "text" || !recent.slice(0, k === "image" ? 2 : 3).includes(k));
}

/** What each kind is good for, for Jev's pick (chooseKind). */
const KIND_FITS: Record<NudgeKind, string> = {
  text: "A text prompt: the default. Best when there's a thread worth building on, or they're opening up.",
  image: "An AI image with a prompt about it: a change of scene when a topic has run its course.",
  audio: "A meme audio clip to react to.",
  pick: "Guess their pick, a quick tap mini game (this-or-that, guess the other's pick): best when replies are getting short or the chat is stalling.",
  truths: "Two truths and a lie, a mini game: best once they're warmed up and curious about each other, not when replies are one-word.",
};

/**
 * Then the chat: Jev picks the kind that fits right now among `allowed`. Nudges are written ahead, so this never
 * holds up a pop-up. If Jev fails, text two times in three, else the other kinds in turn.
 */
export async function chooseKind(allowed: NudgeKind[], state: unknown, riffId: string, number: number): Promise<NudgeKind> {
  if (allowed.length === 1) return allowed[0];
  try {
    const { kind } = await jev(
      state,
      {
        kind: {
          type: "choice",
          instructions:
            "Two people who just met are texting in a chat app, and an AI drops a nudge into their chat every so often. Which kind of nudge fits best as the next one, given how the chat is going right now? Most nudges should be text prompts; pick a mini game or an image only when the chat calls for a change.",
          criteria: Object.fromEntries(allowed.map((k) => [k, KIND_FITS[k]])),
        },
      },
      JEV_TIMEOUT_MS,
    );
    if (kind?.type === "choice" && allowed.includes(kind.choice as NudgeKind)) return kind.choice as NudgeKind;
  } catch (e) {
    console.warn(`nudge ${number}: Jev kind pick failed, rotating`, e instanceof Error ? e.message : e);
  }
  const others = allowed.filter((k) => k !== "text");
  const turn = hash(riffId) + number;
  return turn % 3 || !others.length ? "text" : others[Math.floor(turn / 3) % others.length];
}

/**
 * The writers draft a few nudges; Jev picks the one these two would most want to answer right now. On any
 * failure, the first draft. Returns an index into `drafts`.
 */
export async function bestDraft(ctx: NudgeContext, drafts: string[]): Promise<number> {
  if (drafts.length < 2) return 0;
  try {
    const { best } = await jev(
      {
        players: ctx.players.map((p) => ({ name: p.name, interests: [...p.interests, ...p.extracted_interests], notes: ctx.known.notes[p.seat] })),
        thread: ctx.known.thread,
        recentChat: ctx.chat.slice(-12),
        earlierNudges: ctx.earlier.map((e) => e.prompt),
      },
      {
        best: {
          type: "choice",
          instructions: [
            "Two people who just met are texting in a chat app. Which of these nudges would both of them most want to answer right now?",
            "Best: builds on what they're actually talking about or into (not something any pair could get), specific, fun or interesting to answer in a text,",
            "and different from the earlier nudges.",
          ].join(" "),
          criteria: Object.fromEntries(drafts.map((d, i) => [String(i), d])),
        },
      },
      JEV_TIMEOUT_MS,
    );
    const i = best?.type === "choice" ? Number(best.choice) : NaN;
    return Number.isInteger(i) && i >= 0 && i < drafts.length ? i : 0;
  } catch (e) {
    console.warn(`nudge ${ctx.number}: Jev draft pick failed, first draft`, e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Replace `{interest}` with one of the pair's interests, or the bonus-mode player's when there is one. */
export function fillSeed(seed: string, players: Player[], turf: Player | null = null): string {
  const interests = (turf ? [turf] : players).flatMap((p) => [...p.interests, ...p.extracted_interests]);
  const pick = interests[Math.floor(Math.random() * interests.length)] ?? "your favourite hobby";
  return seed.replaceAll("{interest}", pick);
}

export async function writerFor(kind: NudgeKind): Promise<Writer | null> {
  try {
    return (await import(`./writers/${kind}.ts`)).default as Writer;
  } catch {
    return null;
  }
}

/** Templates whose kind has a writer. */
async function playableTemplates(): Promise<Template[]> {
  const kinds = [...new Set(TEMPLATES.map((t) => t.kind))];
  const ok = new Set((await Promise.all(kinds.map(async (k) => ((await writerFor(k)) ? k : null)))).filter(Boolean));
  return TEMPLATES.filter((t) => ok.has(t.kind));
}

/**
 * `ahead`: how many nudges ahead this slot is being written. Jev picks the kind from the chat (chooseKind), except
 * for an instant local fill (0). An image takes too long to write 1 ahead, so it's only chosen 2 ahead.
 */
async function loadContext(riffId: string, number: number, ahead: 0 | 1 | 2): Promise<NudgeContext> {
  const db = supabaseAdmin();
  const [players, messages, nudges, scores, totals, known, queued] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(40),
    db.from("nudges").select("id, number, kind, for_seat, payload").eq("riff_id", riffId).lt("number", number).order("number", { ascending: false }),
    db.from("scores").select("nudge_id, player_id, quality, connection").eq("riff_id", riffId),
    totalsByPlayer(riffId),
    loadChatContext(riffId),
    db.from("queued_nudges").select("for_number, kind").eq("riff_id", riffId).lt("for_number", number),
  ]);
  const seated = (players.data ?? []) as Player[];
  const name = new Map(seated.map((p) => [p.id, p.name]));
  const connected = new Set((scores.data ?? []).filter((s) => s.connection > 0).map((s) => s.player_id));
  const ids = seated.map((p) => p.user_id);
  const [{ data: profiles }, saved] = await Promise.all([db.from("user_profiles").select("user_id, profile").in("user_id", ids), publicProfiles(ids)]);
  const profileOf = new Map((profiles ?? []).map((r) => [r.user_id, r.profile as UserProfile]));
  const depth = depthFor(number, seated.length === 2 && seated.every((p) => connected.has(p.id)));
  const playable = await playableTemplates();
  // Shown and already-written nudges before this one, newest first: a slot written 2 ahead sees the one between.
  const shownKinds = new Map((nudges.data ?? []).map((n) => [n.number as number, n.kind as NudgeKind]));
  for (const q of queued.data ?? []) if (!shownKinds.has(q.for_number)) shownKinds.set(q.for_number, q.kind as NudgeKind);
  const recent = [...shownKinds].sort(([a], [b]) => b - a).map(([, k]) => k);
  const allowed = allowedKinds([...new Set(playable.map((t) => t.kind))], recent, number).filter((k) => k !== "image" || ahead === 2);
  const kind = ahead
    ? await chooseKind(
        allowed,
        {
          recentNudges: (nudges.data ?? []).slice(0, 4).map((n) => ({ kind: n.kind, prompt: n.payload?.prompt })),
          thread: known.thread,
          recentChat: (messages.data ?? []).slice(0, 12).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
        },
        riffId,
        number,
      )
    : allowed[0];
  return {
    number,
    depth,
    players: seated,
    chat: (messages.data ?? []).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
    known,
    earlier: (nudges.data ?? [])
      .filter((n) => typeof n.payload?.prompt === "string")
      .map((n) => ({
        prompt: n.payload.prompt as string,
        quality: Object.fromEntries((scores.data ?? []).filter((s) => s.nudge_id === n.id).map((s) => [name.get(s.player_id) ?? "?", s.quality])),
      }))
      .reverse(),
    past: Object.fromEntries(seated.filter((p) => profileOf.has(p.user_id)).map((p) => [p.seat, profileOf.get(p.user_id)!])),
    shown: Object.fromEntries(
      seated.map((p) => {
        const { from, prompts, favorites } = profileOfPlayer(p, saved);
        return [p.seat, { from, prompts, favorites }];
      }),
    ),
    templates: pickTemplates(playable, riffId, number, depth, kind),
    // ponytail: a slot written 2 ahead (images) can't see the nudge between; refreshNext corrects the next one.
    turf: isIntro(number) ? null : turfFor(seated, totals, nudges.data ?? []),
  };
}

/** The nudge for `number`: the queued one if prefetch got there, else an instant local fill. */
export async function nudgeFor(riffId: string, number: number): Promise<PlannedNudge> {
  const { data } = await supabaseAdmin()
    .from("queued_nudges")
    .select("*")
    .eq("riff_id", riffId)
    .eq("for_number", number)
    .maybeSingle<QueuedNudge>();
  if (data) return { kind: data.kind, depth: data.depth, payload: data.payload, is_bonus: data.is_bonus, for_seat: data.for_seat };
  const ctx = await loadContext(riffId, number, 0);
  const writer = (await writerFor(ctx.templates[0].kind))!;
  return { kind: ctx.templates[0].kind, depth: ctx.depth, payload: writer.fill(ctx), ...bonusFields(ctx) };
}

const bonusFields = (ctx: NudgeContext) => ({ is_bonus: !!ctx.turf, for_seat: ctx.turf?.seat ?? null });

/** Write with the model; fall back to a local fill on any failure or timeout. */
export async function writeOrFill(writer: Writer, ctx: NudgeContext): Promise<NudgePayloads[NudgeKind]> {
  try {
    return await writer.write(ctx);
  } catch (e) {
    console.warn(`nudge ${ctx.number}: model write failed, using local fill`, e instanceof Error ? e.message : e);
    return writer.fill(ctx);
  }
}

/**
 * Fill the queue after nudge `current` shows: slot current+1 always, current+2 if its kind needs 2 nudges of lead.
 * In order, so the variety rules for current+2 see the kind written for current+1.
 */
export async function prefetchNudges(riffId: string, current: number): Promise<void> {
  const db = supabaseAdmin();
  for (const ahead of [1, 2] as const) {
    const number = current + ahead;
    const { count } = await db
      .from("queued_nudges")
      .select("*", { count: "exact", head: true })
      .eq("riff_id", riffId)
      .eq("for_number", number);
    if (!count) await writeSlot(riffId, await loadContext(riffId, number, ahead), ahead);
  }
}

/**
 * Run once nudge `current` is scored. The next nudge was written when `current` popped up, before anyone answered:
 * rewrite it with Grok now that the answers and their scores are in (its kind may change too). An image stays unless
 * bonus mode just switched on, off or to the other player (too slow otherwise). The queued one stays until the rewrite replaces it, so a
 * pop-up mid-rewrite still gets a written nudge.
 */
export async function refreshNext(riffId: string, current: number): Promise<void> {
  const number = current + 1;
  const [{ data: queued }, ctx] = await Promise.all([
    supabaseAdmin().from("queued_nudges").select("kind, for_seat").eq("riff_id", riffId).eq("for_number", number).maybeSingle(),
    loadContext(riffId, number, 1),
  ]);
  if (queued?.kind === "image" && queued.for_seat === (ctx.turf?.seat ?? null)) return;
  await writeSlot(riffId, { ...ctx, fast: true }, 1, true);
}

async function writeSlot(riffId: string, ctx: NudgeContext, ahead: 1 | 2, replace = false): Promise<void> {
  const kind = ctx.templates[0].kind;
  const writer = (await writerFor(kind))!;
  if (writer.lead < ahead) return;
  // A failed rewrite keeps what's queued; a local fill would be worse than it.
  const payload = replace ? await writer.write(ctx).catch((e) => void console.warn(`nudge ${ctx.number}: rewrite failed`, e instanceof Error ? e.message : e)) : await writeOrFill(writer, ctx);
  if (!payload) return;
  const row = { riff_id: riffId, for_number: ctx.number, kind, depth: ctx.depth, payload, ...bonusFields(ctx) };
  const queue = supabaseAdmin().from("queued_nudges");
  // ponytail: a replace landing after the pop-up leaves an unused row for a shown number; harmless, restart clears it.
  const { error } = await (replace ? queue.upsert(row, { onConflict: "riff_id,for_number" }) : queue.insert(row));
  if (error && error.code !== "23505") throw error; // 23505: a concurrent write got this slot first
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
