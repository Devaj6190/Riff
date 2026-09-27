// Dev: scripted demo chats (/dev). A script (demo-scripts.ts) fixes the whole chat, nudges and both people's
// messages, so the same conversation can be replayed to test scoring, Moment Spotlight, the post-chat summary and
// the coach. It's an ordinary game riff otherwise: the caller in seat A (their lines are sent for them), the bot
// user in seat B. The post-chat summary stays on the riff (demo_summary), never in the caller's real history. /api/tick plays one line per tick when due, and ends the riff
// after the last one. No written nudges, early closing, bonus mode or ending on score: the script decides.
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, Riff, Seat } from "../types";
import { seatBot } from "./bot";
import { DEMO_SCRIPTS, type DemoScript } from "./demo-scripts";
import { endRiff } from "./ending";
import { timerSeconds } from "./pacing";
import { readChat } from "./reader";
import { SCORE_TIMEOUT_MS } from "./score";

export const DEMO_GAP_MS = 2500; // between lines

export type DemoStep = { nudge: string } | { seat: Seat; body: string };

export function parseScript(s: DemoScript): DemoStep[] {
  return s.lines.map((line) => {
    const i = line.indexOf(":");
    const who = line.slice(0, i).trim();
    const body = line.slice(i + 1).trim();
    if (i > 0 && body && who === "Riff") return { nudge: body };
    if (i > 0 && body && who === s.a.name) return { seat: "A", body };
    if (i > 0 && body && who === s.b.name) return { seat: "B", body };
    throw new Error(`demo script ${s.id}: "${line}" must be "Riff: …", "${s.a.name}: …" or "${s.b.name}: …"`);
  });
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
    const { data: claimed } = await db
      .from("riffs")
      .update({ demo_step: riff.demo_step + 1 })
      .eq("id", riff.id)
      .eq("demo_step", riff.demo_step)
      .select("id");
    if (!claimed?.length) return;

    if ("nudge" in next) {
      const number = (lastNudge?.number ?? 0) + 1;
      const endsAt = new Date(now + timerSeconds("text", number) * 1000).toISOString();
      const { error } = await db
        .from("nudges")
        .insert({ riff_id: riff.id, number, kind: "text", depth: 1, payload: { prompt: next.nudge }, is_bonus: false, for_seat: null, ends_at: endsAt });
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
