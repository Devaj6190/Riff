// Nudge writing (SPEC §4.1, §4.2, §6). Nudges are written ahead into `queued_nudges` and shown by /api/tick,
// so a nudge never waits on a model when it pops up.
import { supabaseAdmin } from "../supabase/admin";
import type { ChatContext, Depth, NudgeKind, NudgePayloads, Player, QueuedNudge, Seat, Template, UserProfile } from "../types";
import { turfFor } from "./bonus";
import { totalsByPlayer } from "./ending";
import { PACING } from "./pacing";
import { loadChatContext } from "./reader";
import allTemplates from "./templates.json";

const TEMPLATES = allTemplates as Template[];
export const MODEL_TIMEOUT_MS = 20_000; // prefetch runs in the background with at least one nudge gap of lead time

/** Everything a writer gets to write one nudge for this pair. `templates[0]` is the pick for local fill. */
export type NudgeContext = {
  number: number;
  depth: Depth;
  players: Player[];
  chat: string[]; // "Name: message", oldest first
  known: ChatContext; // what the chat has revealed about each player, and the thread they're on (reader.ts)
  earlier: { prompt: string; quality: Record<string, number> }[]; // oldest first; quality 0-10 by name, absent = no answer
  past: Partial<Record<Seat, UserProfile>>; // from their earlier chats with other people: steer only, never quote
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
 * nudges walk the list instead of repeating. Returns up to 4 templates of the chosen one's kind, chosen first.
 * Intro nudges use the `intro`-tagged templates: the first one ("say hi") for nudge 1, the others after it.
 */
export function pickTemplates(templates: Template[], riffId: string, number: number, depth: Depth): Template[] {
  const intro = templates.filter((t) => t.tags.includes("intro"));
  const rest = templates.filter((t) => !t.tags.includes("intro"));
  const atDepth = rest.filter((t) => t.depth === depth);
  const pool = isIntro(number) && intro.length > 1 ? (number === 1 ? intro.slice(0, 1) : intro.slice(1)) : atDepth.length ? atDepth : rest;
  const start = (hash(riffId) + number) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.filter((t) => t.kind === rotated[0].kind).slice(0, 4);
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

async function loadContext(riffId: string, number: number): Promise<NudgeContext> {
  const db = supabaseAdmin();
  const [players, messages, nudges, scores, totals, known] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(40),
    db.from("nudges").select("id, number, for_seat, payload").eq("riff_id", riffId).lt("number", number).order("number", { ascending: false }),
    db.from("scores").select("nudge_id, player_id, quality, connection").eq("riff_id", riffId),
    totalsByPlayer(riffId),
    loadChatContext(riffId),
  ]);
  const seated = (players.data ?? []) as Player[];
  const name = new Map(seated.map((p) => [p.id, p.name]));
  const connected = new Set((scores.data ?? []).filter((s) => s.connection > 0).map((s) => s.player_id));
  const { data: profiles } = await db.from("user_profiles").select("user_id, profile").in("user_id", seated.map((p) => p.user_id));
  const profileOf = new Map((profiles ?? []).map((r) => [r.user_id, r.profile as UserProfile]));
  const depth = depthFor(number, seated.length === 2 && seated.every((p) => connected.has(p.id)));
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
    templates: pickTemplates(await playableTemplates(), riffId, number, depth),
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
  const ctx = await loadContext(riffId, number);
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

/** Fill the queue after nudge `current` shows: slot current+1 always, current+2 if its kind needs 2 nudges of lead. */
export async function prefetchNudges(riffId: string, current: number): Promise<void> {
  const db = supabaseAdmin();
  await Promise.all(
    ([1, 2] as const).map(async (ahead) => {
      const number = current + ahead;
      const { count } = await db
        .from("queued_nudges")
        .select("*", { count: "exact", head: true })
        .eq("riff_id", riffId)
        .eq("for_number", number);
      if (count) return;
      await writeSlot(riffId, await loadContext(riffId, number), ahead);
    }),
  );
}

/**
 * Run once nudge `current` is scored. The next nudge was written when `current` popped up, before anyone answered:
 * rewrite it with Grok now that the answers and their scores are in. Image slots only when bonus mode just switched
 * on, off or to the other player (too slow otherwise). The queued one stays until the rewrite replaces it, so a
 * pop-up mid-rewrite still gets a written nudge.
 */
export async function refreshNext(riffId: string, current: number): Promise<void> {
  const number = current + 1;
  const [{ data: queued }, ctx] = await Promise.all([
    supabaseAdmin().from("queued_nudges").select("for_seat").eq("riff_id", riffId).eq("for_number", number).maybeSingle(),
    loadContext(riffId, number),
  ]);
  if (ctx.templates[0].kind !== "text" && queued && queued.for_seat === (ctx.turf?.seat ?? null)) return;
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
