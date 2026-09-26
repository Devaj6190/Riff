// Moment Spotlight (SPEC §156): up to 3 real moments from the match that just ended, each tagged with a show template
// and quoted verbatim (the model picks message line numbers; the server copies the messages). Shared by both players,
// shown once at the end like a Wrapped reel. No scores, no coaching.
import type { Moment, Seat } from "../types";

/** id → [show title, when it fits]. The model picks from these; the title is what the card shows. */
export const TEMPLATES: Record<string, [string, string]> = {
  laugh_riot: ["The Laugh Riot", "the funniest joke or line of the chat"],
  same_brain: ["Same Brain", "they said the same thing or had the exact same take at once"],
  bonded_over: ["Bonded Over", "a shared love that lit up the chat"],
  callback: ["The Callback", "someone brought back an earlier joke and it landed again"],
  inside_joke: ["An Inside Joke Is Born", "a phrase or bit that turned into their running joke"],
  hot_take: ["Hot Take Standoff", "a spicy opinion and the other one's reaction"],
  plot_twist: ["Plot Twist", "a surprising reveal nobody saw coming"],
  story_time: ["Story Time", "someone told a great story"],
  roast: ["Friendly Fire", "a playful roast that both enjoyed"],
  wholesome: ["Wholesome Hour", "a genuinely sweet or kind moment"],
  nerd_out: ["Nerd Alert", "someone went deep on a thing they love"],
  mind_blown: ["Mind Blown", "a fact or idea that impressed the other"],
  confession: ["The Confession", "someone admitted a guilty pleasure or embarrassing truth"],
  debate: ["The Great Debate", "a fun back-and-forth argument over something silly"],
  recommendation: ["Add It To The List", "one recommended a show, song, food or place to the other"],
  wordplay: ["Pun Intended", "a pun or clever wordplay"],
  meme_lord: ["Meme Lord", "a perfectly timed meme or pop-culture reference"],
  mutual_hate: ["United Against", "they bonded over something they both can't stand"],
  wild_card: ["Wild Card", "the most random, out-of-nowhere message"],
  hype: ["Hype Squad", "one cheered the other on"],
  vibe_check: ["Vibe Check Passed", "the moment the chat clicked"],
  small_world: ["Small World", "a surprising thing they have in common"],
  big_dream: ["Big Dreams", "someone shared a goal or dream"],
  food_fight: ["Food Fight", "strong opinions about food"],
  quotable: ["Most Quotable", "a line that belongs on a T-shirt"],
};

const MAX_MOMENTS = 3;
const MAX_LINES = 4;

export const MOMENTS_PROMPT = [
  "Two people just finished a chat game. Pick its best moments for a Spotify-Wrapped-style reel they'll watch together:",
  "funny, bonding or standout exchanges that actually happened. chat is numbered lines.",
  `Pick 0-${MAX_MOMENTS} moments; fewer is better than weak ones. Each is 1-${MAX_LINES} consecutive lines (from..to),`,
  "tagged with the template that fits best (each template at most once), plus a caption: one short, hype line in the",
  "voice of a show host, under 15 words. Kind only: nothing embarrassing, nothing about scores or how well they played.",
  `templates: ${Object.entries(TEMPLATES).map(([id, [, fits]]) => `${id} (${fits})`).join("; ")}.`,
  'JSON shape: {"moments": [{"template": s, "from": n, "to": n, "caption": s}]}',
].join(" ");

/**
 * Coerce model output into at most 3 moments in chat order. `lines` are the numbered chat lines (line n = lines[n-1]).
 * Drops unknown or repeated templates, bad or overlapping ranges, and anything without a caption.
 */
export function normalizeMoments(raw: unknown, lines: { seat: Seat; body: string }[]): Moment[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { moments?: unknown }).moments) ? (raw as { moments: unknown[] }).moments : [];
  const out: { from: number; to: number; moment: Moment }[] = [];
  for (const m of list) {
    if (out.length === MAX_MOMENTS) break;
    const { template, from, to, caption } = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    if (typeof template !== "string" || !TEMPLATES[template] || out.some((o) => o.moment.template === template)) continue;
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    const [f, t] = [from as number, to as number];
    if (f < 1 || t < f || t > lines.length || t - f >= MAX_LINES || out.some((o) => f <= o.to && t >= o.from)) continue;
    if (typeof caption !== "string" || !caption.trim()) continue;
    out.push({ from: f, to: t, moment: { template, title: TEMPLATES[template][0], lines: lines.slice(f - 1, t), caption: caption.trim().slice(0, 120) } });
  }
  return out.sort((a, b) => a.from - b.from).map((o) => o.moment);
}
