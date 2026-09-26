// Bonus Round (SPEC §4.4): when one player falls far enough behind, the next round is written from their own
// words and interests, and their score for it counts double (judge.ts applies the multiplier).
import { supabaseAdmin } from "../supabase/admin";
import type { Answer, Player } from "../types";
import { totalsByPlayer } from "./ending";
import { answerText } from "./judge";
import { llmJson } from "./llm";
import { MODEL_TIMEOUT_MS } from "./rounds";

export const BONUS_GAP = 15;
export const BONUS_COOLDOWN = 2; // rounds after a Bonus Round that can't be one

/** SPEC §4.4 trigger. `jitter` is the random 0–5 on top of the gap; `lastBonus` the latest Bonus Round's number. */
export function shouldBonus(gap: number, jitter: number, next: number, lastBonus: number | null): boolean {
  return gap >= BONUS_GAP + jitter && (lastBonus === null || next - lastBonus > BONUS_COOLDOWN);
}

/**
 * Run once round `current` is judged. If the trailing player qualifies, write round current+1 for them and put it
 * in the queue slot, replacing whatever prefetch wrote there. Never throws for model problems.
 */
export async function maybeBonus(riffId: string, current: number): Promise<void> {
  const db = supabaseAdmin();
  const [players, last, totals] = await Promise.all([
    db.from("players").select("*").eq("riff_id", riffId).order("seat"),
    db.from("rounds").select("number").eq("riff_id", riffId).eq("is_bonus", true).order("number", { ascending: false }).limit(1).maybeSingle(),
    totalsByPlayer(riffId),
  ]);
  const seated = (players.data ?? []) as Player[];
  if (seated.length !== 2) return;
  const [a, b] = seated.map((p) => totals.get(p.id) ?? 0);
  const next = current + 1;
  if (!shouldBonus(Math.abs(a - b), Math.floor(Math.random() * 6), next, last.data?.number ?? null)) return;

  const trailing = a < b ? seated[0] : seated[1];
  const prompt = await writeBonus(trailing, seated.find((p) => p !== trailing)!, await ownWords(riffId, trailing.id));

  // Too slow: the round already started without it.
  const { data: riff } = await db.from("riffs").select("round_number").eq("id", riffId).single();
  if (riff?.round_number !== current) return;
  // ponytail: whose turf rides in the payload; roundFor moves it to rounds.bonus_seat. A queued_rounds.bonus_seat
  // column is the clean version if the queue ever needs to be read elsewhere.
  const { error } = await db.from("queued_rounds").upsert(
    { riff_id: riffId, for_number: next, mechanic: "open_prompt", depth: 2, payload: { prompt, bonusSeat: trailing.seat } },
    { onConflict: "riff_id,for_number" },
  );
  if (error) throw error;
}

/** What the player actually said: their chat messages and round answers, most recent first. */
async function ownWords(riffId: string, playerId: string): Promise<string[]> {
  const db = supabaseAdmin();
  const [messages, answers] = await Promise.all([
    db.from("messages").select("body").eq("riff_id", riffId).eq("player_id", playerId).order("created_at", { ascending: false }).limit(20),
    db.from("answers").select("*").eq("player_id", playerId).order("submitted_at", { ascending: false }).limit(10),
  ]);
  const lines = [...(messages.data ?? []).map((m) => m.body as string), ...((answers.data ?? []) as Answer[]).map((a) => answerText(a))];
  return lines.filter((l): l is string => typeof l === "string" && l.trim().split(/\s+/).length >= 3).map((l) => l.trim());
}

export async function writeBonus(turf: Player, other: Player, words: string[]): Promise<string> {
  if (words.length) {
    try {
      const out = (await llmJson(
        [
          `You write the Bonus Round in a two-player conversation game. It is ${turf.name}'s turf.`,
          `Pick the most fun thing ${turf.name} said (copy it exactly from theirWords; trim to under 90 characters if long)`,
          `and write one open follow-up question on it that both players can answer, drawing on ${turf.name}'s interests.`,
          "Under 140 characters, warm and playful, no quote marks in the question.",
          "Never mention scores, points, who is ahead or behind, or how anyone is doing in the game.",
          'JSON shape: {"quote": string, "question": string}',
        ].join(" "),
        JSON.stringify({ turf: { name: turf.name, interests: interestsOf(turf), theirWords: words }, otherPlayer: other.name }),
        MODEL_TIMEOUT_MS,
        { fast: true }, // Grok first: ~1 s, where Muse took 17–21 s against a ~26 s budget
      )) as { quote?: unknown; question?: unknown };
      const quote = typeof out.quote === "string" ? out.quote.trim().replace(/^"|"$/g, "") : "";
      const question = typeof out.question === "string" ? out.question.trim() : "";
      // The quote is assembled here, not left to the model, so it's always there and always really theirs.
      if (quote && question && question.length <= 200 && words.some((w) => norm(w).includes(norm(quote)))) {
        return `${turf.name} said "${quote}". ${question}`;
      }
      console.warn("bonus: model quote not verifiable, using local fill", JSON.stringify(out));
    } catch (e) {
      console.warn("bonus: model write failed, using local fill", e instanceof Error ? e.message : e);
    }
  }
  return fillBonus(turf, words);
}

/** Local fallback: quote their own words back, or lean on an interest if they haven't said anything yet. */
export function fillBonus(turf: Player, words: string[]): string {
  const said = words[0];
  if (said) {
    const quote = said.length > 90 ? `${said.slice(0, 87).trimEnd()}…` : said;
    return `${turf.name} said "${quote}". What's the story behind that, and what's your version?`;
  }
  const interest = interestsOf(turf)[0];
  return interest ? `${turf.name}'s turf: what's the best thing about ${interest} that most people miss?` : `${turf.name}'s turf: what's something you could talk about for hours?`;
}

const interestsOf = (p: Player) => [...p.interests, ...p.extracted_interests];
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
