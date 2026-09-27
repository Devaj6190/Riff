// Dev: scripted demo chats (/dev). A script (demo-scripts.ts) fixes the whole chat, nudges and both people's
// messages, so the same conversation can be replayed to test scoring, Moment Spotlight, the post-chat summary and
// the coach. It's an ordinary game riff otherwise: the caller in seat A (their lines are sent for them), the bot
// user in seat B. The post-chat summary stays on the riff (demo_summary), never in the caller's real history. /api/tick plays one line per tick when due, and ends the riff
// after the last one. No written nudges, early closing, bonus mode or ending on score: the script decides.
// Nudges can be text, an image (from the pool, so it's instant) or a mini game. A mini game plays out for real: the
// caller taps in seat A, the script plays the bot's taps once their stage is up, and waits until the game is scored.
import { isGame } from "../games";
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, NudgeKind, NudgePayloads, PlayRequest, Riff, Seat } from "../types";
import { seatBot } from "./bot";
import { submitPlay } from "./games";
import { DEMO_SCRIPTS, type DemoScript } from "./demo-scripts";
import { endRiff } from "./ending";
import { timerSeconds } from "./pacing";
import { readChat } from "./reader";
import { SCORE_TIMEOUT_MS } from "./score";

export const DEMO_GAP_MS = 2500; // between lines

/** The bot's tap in a mini game (b's "picks", "writes" or "guesses" line). Indexes are 0-based here, 1-based in scripts. */
export type DemoPlay = { stage: "play"; pick: number; guess: number } | { stage: "write"; statements: string[]; lie: number } | { stage: "guess"; guess: number };
export type DemoStep = { nudge: string; image?: string; options?: string[]; truths?: true } | { seat: Seat; body: string } | { play: DemoPlay };

/**
 * Script lines: "Riff: <text nudge>", "Riff image: <prompt> | <file in /images/pool>", "Riff pick: <prompt> | a / b / c / d",
 * "Riff truths: <title>", "<a>: <message>", "<b>: <message>", and b's taps: "<b> picks: 3, guesses 1",
 * "<b> writes: one / two / three | lie 2", "<b> guesses: 2" (1-based).
 */
export function parseScript(s: DemoScript): DemoStep[] {
  return s.lines.map((line) => {
    const i = line.indexOf(":");
    const who = line.slice(0, i).trim();
    const body = line.slice(i + 1).trim();
    const [head, tail = ""] = body.split("|").map((x) => x.trim());
    const n = (x: string | undefined) => Number(x) - 1;
    const step = ((): DemoStep | null => {
      if (i <= 0 || !body) return null;
      if (who === "Riff") return { nudge: body };
      if (who === "Riff image") return head && tail ? { nudge: head, image: `/images/pool/${tail}` } : null;
      if (who === "Riff pick") {
        const options = tail.split("/").map((o) => o.trim()).filter(Boolean);
        return head && options.length === 4 ? { nudge: head, options } : null;
      }
      if (who === "Riff truths") return { nudge: body, truths: true };
      if (who === s.a.name) return { seat: "A", body };
      if (who === s.b.name) return { seat: "B", body };
      if (who === `${s.b.name} picks`) {
        const m = /^(\d)\D+(\d)$/.exec(body);
        return m ? { play: { stage: "play", pick: n(m[1]), guess: n(m[2]) } } : null;
      }
      if (who === `${s.b.name} writes`) {
        const statements = head.split(" / ").map((x) => x.trim()).filter(Boolean);
        const lie = n(/lie\s*(\d)/.exec(tail)?.[1]);
        return statements.length === 3 && lie >= 0 && lie < 3 ? { play: { stage: "write", statements, lie } } : null;
      }
      if (who === `${s.b.name} guesses`) return /^\d$/.test(body) ? { play: { stage: "guess", guess: n(body) } } : null;
      return null;
    })();
    if (!step) throw new Error(`demo script ${s.id}: can't read "${line}" (see the line formats in demo-scripts.ts)`);
    return step;
  });
}

/** The nudge row for a script's nudge line: text, a pool image, or a mini game at its first stage. */
export function demoNudge(step: Extract<DemoStep, { nudge: string }>, now: number): { kind: NudgeKind; payload: NudgePayloads[NudgeKind] } {
  const stageAt = new Date(now).toISOString();
  if (step.options) return { kind: "pick", payload: { prompt: step.nudge, options: step.options, stage: "play", stageAt, locked: [] } };
  if (step.truths) return { kind: "truths", payload: { prompt: step.nudge, stage: "write", stageAt, locked: [] } };
  if (step.image) return { kind: "image", payload: { prompt: step.nudge, imageUrl: step.image } };
  return { kind: "text", payload: { prompt: step.nudge } };
}

/** New demo riff with the caller in seat A. Null if there's no such script. */
export async function startDemo(userId: string, scriptId: string): Promise<string | null> {
  const script = DEMO_SCRIPTS.find((s) => s.id === scriptId);
  if (!script) return null;
  parseScript(script); // a typo in the script fails here, not halfway through the chat
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("insert_riff", { p_kind: "game" });
  if (error) throw error;
  const riff = data as Riff;
  const marked = await db.from("riffs").update({ demo_script: script.id }).eq("id", riff.id);
  if (marked.error) throw marked.error;
  const seated = await db.from("players").insert({ riff_id: riff.id, user_id: userId, seat: "A", ...script.a });
  if (seated.error) throw seated.error;
  await seatBot(riff.id, script.b);
  return riff.code;
}

/** One tick of a demo riff: fold new chat into the live notes (as in a normal riff), and play the next line if due. */
export async function demoTurn(riff: Riff, lastNudge: Nudge | null): Promise<void> {
  const { data: latest } = await supabaseAdmin()
    .from("messages")
    .select("created_at")
    .eq("riff_id", riff.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastMessageAt = latest ? Date.parse(latest.created_at) : 0;
  await Promise.all([lastMessageAt && readChat(riff.id, lastMessageAt), play(riff, lastNudge, lastMessageAt)]);
}

// ponytail: per-instance, like the bot; the compare-and-set on demo_step is what keeps each line to one send.
const playing = new Set<string>();

async function play(riff: Riff, lastNudge: Nudge | null, lastMessageAt: number): Promise<void> {
  const script = DEMO_SCRIPTS.find((s) => s.id === riff.demo_script);
  if (!script || playing.has(riff.id)) return;
  playing.add(riff.id);
  try {
    const db = supabaseAdmin();
    const next = parseScript(script)[riff.demo_step];
    const now = Date.now();
    const claim = async () => {
      const { data } = await db.from("riffs").update({ demo_step: riff.demo_step + 1 }).eq("id", riff.id).eq("demo_step", riff.demo_step).select("id");
      return !!data?.length;
    };

    // A mini game plays out for real (games.ts, /api/tick): the caller taps; the script plays the bot's tap once its
    // stage is up, and everything else waits until the game is scored.
    if (lastNudge && !lastNudge.scored_at && isGame(lastNudge)) {
      const p = lastNudge.payload;
      if (!next || !("play" in next) || next.play.stage !== p.stage || now - Date.parse(p.stageAt) < DEMO_GAP_MS) return;
      if (!(await claim())) return;
      const { data: bot, error } = await db.from("players").select("id, seat").eq("riff_id", riff.id).eq("seat", "B").single();
      if (error) throw error;
      await submitPlay(riff.id, bot, { riffId: riff.id, nudgeId: lastNudge.id, ...next.play } as PlayRequest).catch((e) => {
        if (!(e instanceof Response)) throw e; // their stage moved on (e.g. nothing to guess): skip the tap
      });
      return;
    }
    // A tap line for a game that's already over (it timed out first): skip it.
    if (next && "play" in next) {
      await claim();
      return;
    }

    // A new nudge, or the end, first closes the running one; the next tick scores it.
    if ((!next || "nudge" in next) && lastNudge && !lastNudge.scored_at) {
      if (Date.parse(lastNudge.ends_at) > now) {
        await db.from("nudges").update({ ends_at: new Date(now).toISOString() }).eq("id", lastNudge.id).is("scored_at", null);
      }
      return;
    }

    if (!next) {
      if (!lastNudge) return; // a New match after the script: just chat
      // Let the last nudge's scores land first, so the summary sees them.
      const { count } = await db.from("scores").select("id", { count: "exact", head: true }).eq("nudge_id", lastNudge.id);
      if (!count && now - Date.parse(lastNudge.scored_at!) < SCORE_TIMEOUT_MS) return;
      await endRiff(riff);
      return;
    }

    const lastAt = Math.max(Date.parse(riff.created_at), lastNudge ? Date.parse(lastNudge.created_at) : 0, lastMessageAt);
    if (now - lastAt < DEMO_GAP_MS) return;
    if (!(await claim())) return;

    if ("nudge" in next) {
      const number = (lastNudge?.number ?? 0) + 1;
      const { kind, payload } = demoNudge(next, now);
      const endsAt = new Date(now + timerSeconds(kind, number) * 1000).toISOString();
      const { error } = await db.from("nudges").insert({ riff_id: riff.id, number, kind, depth: 1, payload, is_bonus: false, for_seat: null, ends_at: endsAt });
      if (error) throw error;
    } else {
      const { data: player, error } = await db.from("players").select("id").eq("riff_id", riff.id).eq("seat", next.seat).single();
      if (error) throw error;
      const sent = await db.from("messages").insert({ riff_id: riff.id, player_id: player.id, body: next.body });
      if (sent.error) throw sent.error;
    }
  } finally {
    playing.delete(riff.id);
  }
}
