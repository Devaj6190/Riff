// Round writing (SPEC §4.1, §4.2, §6). Rounds are written ahead into `queued_rounds` and promoted by /api/advance,
// so a round never waits on a model call when it starts.
import { supabaseAdmin } from "../supabase/admin";
import type { Depth, Mechanic, Player, QueuedRound, RoundPayloads, Template } from "../types";
import allTemplates from "./templates.json";

const TEMPLATES = allTemplates as Template[];
export const MODEL_TIMEOUT_MS = 20_000; // prefetch runs in the background; a round has ~60 s of lead time

/** Everything a writer gets to write one round for this pair. `templates[0]` is the pick for local fill. */
export type RoundContext = {
  number: number;
  depth: Depth;
  players: Player[];
  chat: string[]; // "Name: message", oldest first
  previousPrompts: string[];
  templates: Template[]; // shortlist for this mechanic and depth
};

/**
 * One per mechanic, in `lib/engine/writers/<mechanic>.ts` as the default export. Dropping in a file (plus
 * templates for that mechanic in templates.json) enables the mechanic; nothing here needs editing.
 */
export type Writer<M extends Mechanic = Mechanic> = {
  lead: 1 | 2; // how many rounds ahead it must be written (images are slow: 2)
  write(ctx: RoundContext): Promise<RoundPayloads[M]>; // AI; may throw
  fill(ctx: RoundContext): RoundPayloads[M]; // local template fill, instant
};

export type PlannedRound = { mechanic: Mechanic; depth: Depth; payload: RoundPayloads[Mechanic] };

/** SPEC §4.2. ponytail: "depth 2 earlier if talk windows are lively" skipped until talk scoring (#5) exists. */
export function depthFor(number: number, bothConnected: boolean): Depth {
  if (number <= 3) return 1;
  return number > 6 && bothConnected ? 3 : 2;
}

/**
 * Deterministic per riff + round number, so a slot looked at twice picks the same template, and consecutive
 * rounds walk the list instead of repeating. Returns up to 4 templates of the chosen one's mechanic, chosen first.
 */
export function pickTemplates(templates: Template[], riffId: string, number: number, depth: Depth): Template[] {
  const atDepth = templates.filter((t) => t.depth === depth);
  const pool = atDepth.length ? atDepth : templates;
  const start = (hash(riffId) + number) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.filter((t) => t.mechanic === rotated[0].mechanic).slice(0, 4);
}

/** Replace `{interest}` with one of the pair's interests. */
export function fillSeed(seed: string, players: Player[]): string {
  const interests = players.flatMap((p) => [...p.interests, ...p.extracted_interests]);
  const pick = interests[Math.floor(Math.random() * interests.length)] ?? "your favourite hobby";
  return seed.replaceAll("{interest}", pick);
}

export async function writerFor(mechanic: Mechanic): Promise<Writer | null> {
  try {
    return (await import(`./writers/${mechanic}.ts`)).default as Writer;
  } catch {
    return null;
  }
}

/** Templates whose mechanic has a writer. */
async function playableTemplates(): Promise<Template[]> {
  const mechanics = [...new Set(TEMPLATES.map((t) => t.mechanic))];
  const ok = new Set((await Promise.all(mechanics.map(async (m) => ((await writerFor(m)) ? m : null)))).filter(Boolean));
  return TEMPLATES.filter((t) => ok.has(t.mechanic));
}

async function loadContext(riffId: string, number: number): Promise<RoundContext> {
  const db = supabaseAdmin();
  const [players, messages, rounds, scores] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db.from("messages").select("player_id, body").eq("riff_id", riffId).order("created_at", { ascending: false }).limit(40),
    db.from("rounds").select("payload").eq("riff_id", riffId).order("number"),
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
    previousPrompts: (rounds.data ?? []).map((r) => r.payload?.prompt).filter((p): p is string => typeof p === "string"),
    templates: pickTemplates(await playableTemplates(), riffId, number, depth),
  };
}

/** The round for `number`: the queued one if prefetch got there, else an instant local fill. */
export async function roundFor(riffId: string, number: number): Promise<PlannedRound> {
  const { data } = await supabaseAdmin()
    .from("queued_rounds")
    .select("*")
    .eq("riff_id", riffId)
    .eq("for_number", number)
    .maybeSingle<QueuedRound>();
  if (data) return { mechanic: data.mechanic, depth: data.depth, payload: data.payload };
  const ctx = await loadContext(riffId, number);
  const writer = (await writerFor(ctx.templates[0].mechanic))!;
  return { mechanic: ctx.templates[0].mechanic, depth: ctx.depth, payload: writer.fill(ctx) };
}

/** Write with the model; fall back to a local fill on any failure or timeout. */
export async function writeOrFill(writer: Writer, ctx: RoundContext): Promise<RoundPayloads[Mechanic]> {
  try {
    return await writer.write(ctx);
  } catch (e) {
    console.warn(`round ${ctx.number}: model write failed, using local fill`, e instanceof Error ? e.message : e);
    return writer.fill(ctx);
  }
}

/** Fill the queue after round `current` starts: slot current+1 always, current+2 if its mechanic needs 2 rounds of lead. */
export async function prefetchRounds(riffId: string, current: number): Promise<void> {
  const db = supabaseAdmin();
  for (const ahead of [1, 2] as const) {
    const number = current + ahead;
    const { count } = await db
      .from("queued_rounds")
      .select("*", { count: "exact", head: true })
      .eq("riff_id", riffId)
      .eq("for_number", number);
    if (count) continue;
    const ctx = await loadContext(riffId, number);
    const mechanic = ctx.templates[0].mechanic;
    const writer = (await writerFor(mechanic))!;
    if (writer.lead < ahead) continue;
    const payload = await writeOrFill(writer, ctx);
    const { error } = await db.from("queued_rounds").insert({ riff_id: riffId, for_number: number, mechanic, depth: ctx.depth, payload });
    if (error && error.code !== "23505") throw error; // 23505: a concurrent prefetch already filled this slot
  }
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
