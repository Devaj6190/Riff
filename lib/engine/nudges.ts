// Nudge writing (SPEC §4.1, §4.2, §6). Nudges are written ahead into `queued_nudges` and shown by /api/tick,
// so a nudge never waits on a model when it pops up.
import { supabaseAdmin } from "../supabase/admin";
import type { Depth, NudgeKind, NudgePayloads, Player, QueuedNudge, Seat, Template } from "../types";
import allTemplates from "./templates.json";

const TEMPLATES = allTemplates as Template[];
export const MODEL_TIMEOUT_MS = 20_000; // prefetch runs in the background with at least one nudge gap of lead time

/** Everything a writer gets to write one nudge for this pair. `templates[0]` is the pick for local fill. */
export type NudgeContext = {
  number: number;
  depth: Depth;
  players: Player[];
  chat: string[]; // "Name: message", oldest first
  previousPrompts: string[];
  templates: Template[]; // shortlist for this kind and depth
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

/** SPEC §4.2. */
export function depthFor(number: number, bothConnected: boolean): Depth {
  if (number <= 3) return 1;
  return number > 6 && bothConnected ? 3 : 2;
}

/**
 * Deterministic per riff + nudge number, so a slot looked at twice picks the same template, and consecutive
 * nudges walk the list instead of repeating. Returns up to 4 templates of the chosen one's kind, chosen first.
 */
export function pickTemplates(templates: Template[], riffId: string, number: number, depth: Depth): Template[] {
  const atDepth = templates.filter((t) => t.depth === depth);
  const pool = atDepth.length ? atDepth : templates;
  const start = (hash(riffId) + number) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.filter((t) => t.kind === rotated[0].kind).slice(0, 4);
}

/** Replace `{interest}` with one of the pair's interests. */
export function fillSeed(seed: string, players: Player[]): string {
  const interests = players.flatMap((p) => [...p.interests, ...p.extracted_interests]);
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
  const [players, messages, nudges, scores] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(40),
    db.from("nudges").select("payload").eq("riff_id", riffId).order("number"),
    db.from("scores").select("player_id, connection").eq("riff_id", riffId).gt("connection", 0),
  ]);
  const seated = (players.data ?? []) as Player[];
  const name = new Map(seated.map((p) => [p.id, p.name]));
  const connected = new Set((scores.data ?? []).map((s) => s.player_id));
  const depth = depthFor(number, seated.length === 2 && seated.every((p) => connected.has(p.id)));
  return {
    number,
    depth,
    players: seated,
    chat: (messages.data ?? []).reverse().map((m) => `${name.get(m.player_id) ?? "?"}: ${m.body}`),
    previousPrompts: (nudges.data ?? []).map((n) => n.payload?.prompt).filter((p): p is string => typeof p === "string"),
    templates: pickTemplates(await playableTemplates(), riffId, number, depth),
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
  return { kind: ctx.templates[0].kind, depth: ctx.depth, payload: writer.fill(ctx), is_bonus: false, for_seat: null };
}

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
      const ctx = await loadContext(riffId, number);
      const kind = ctx.templates[0].kind;
      const writer = (await writerFor(kind))!;
      if (writer.lead < ahead) return;
      const payload = await writeOrFill(writer, ctx);
      const { error } = await db.from("queued_nudges").insert({ riff_id: riffId, for_number: number, kind, depth: ctx.depth, payload });
      if (error && error.code !== "23505") throw error; // 23505: a concurrent prefetch or a Bonus nudge got this slot
    }),
  );
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
