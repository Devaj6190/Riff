import { llmJson } from "../llm";
import { bestDraft, fillSeed, isIntro, MODEL_TIMEOUT_MS, type NudgeContext, type Writer } from "../nudges";

export const DEPTH = { 1: "light and playful", 2: "opinions and stories", 3: "personal and reflective, still kind" };

export type Draft = { hook: string; prompt: string };

const writer: Writer<"text"> = {
  lead: 1,

  async write(ctx) {
    const drafts = await draftText(ctx);
    return { prompt: drafts[await bestDraft(ctx, drafts.map((d) => d.prompt))].prompt };
  },

  fill: (ctx) => ({ prompt: fillSeed(ctx.templates[0].seed, ctx.players, ctx.turf) }),
};

export default writer;

/** 3 candidate nudges, each with the hook it builds on; the writer keeps Jev's pick (bestDraft). */
export async function draftText(ctx: NudgeContext): Promise<Draft[]> {
  const out = (await llmJson(
    [
      "Two people who just met are texting in a chat app. You drop a nudge into their chat: one prompt that sparks the next few messages.",
      DRAFTS_RULE,
      "Each prompt: one prompt both can answer, under 140 characters, casual texting tone.",
      VIBE_RULE,
      CONTEXT_RULE,
      "Match the depth you're given. If the chat is stalling, make it easy and fun to answer.",
      "In the intro stage, keep it a warm, easy introduction built on the template; if they've already covered it, build on what they said instead of asking again.",
      BONUS_RULE,
      EXAMPLES,
      'JSON shape: {"drafts": [{"hook": string, "prompt": string}, {...}, {...}]}',
    ].join(" "),
    userMessage(ctx),
    MODEL_TIMEOUT_MS,
    { fast: ctx.fast },
  )) as { drafts?: unknown };
  const drafts = (Array.isArray(out.drafts) ? out.drafts : [])
    .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : {}))
    .map((d) => ({ hook: typeof d.hook === "string" ? d.hook.trim() : "", prompt: typeof d.prompt === "string" ? d.prompt.trim() : "" }))
    .filter((d) => d.prompt && d.prompt.length <= 200)
    .slice(0, 3);
  if (!drafts.length) throw new Error(`bad drafts from model: ${JSON.stringify(out)}`);
  return drafts;
}

/** Drafts grounded in this chat, and different from each other (SPEC §4.1: how a nudge is written). */
export const DRAFTS_RULE = [
  "Write 3 drafts. For each, first name its hook: the specific thing it builds on, like something one of them just said, an open question, a running joke,",
  "a note, a profile answer or favorite, or an interest they share. Prefer what they're on right now. The templates are formats to borrow, not scripts.",
  "Make the 3 different moves, not 3 wordings of one idea: e.g. one digs into the current thread, one puts a template's format on their interests,",
  "one plays off something from a profile or earlier in the chat. Write for these two: name the actual things they mentioned, never a generic \"what's your favorite X\".",
  "Never repeat or rephrase an earlier nudge.",
].join(" ");

/** Bad → good pairs: the fastest way to show the model what "written for these two" means. */
export const EXAMPLES = [
  "Examples. Bad: \"What's your favorite movie?\" (any pair could get it). Good, they were arguing about Dune: \"Dune 2 or Interstellar, best soundtrack. No 'both'.\"",
  "Bad: \"What does your For You page say about you?\" when they've been talking climbing for 5 minutes. Good: \"Worst climbing fail you've witnessed in person. Details.\"",
  "Bad: \"Tell each other a fun fact!\" Good, Sam's profile says 'weirdly good at parallel parking': \"Sam claims elite parallel parking. Alex, rate your own driving 1-10, honestly.\"",
].join(" ");

/** How nudges sound: in tune with internet culture, not an icebreaker card. */
export const VIBE_RULE = [
  "Sound like a group chat, not an icebreaker card: meme-aware, current internet and pop culture (music, shows, games, trends, slang used naturally).",
  "Prefer hot takes, pick-a-side, rate-it, red flags, would-you-rather with a twist, and stories over bland \"what's your favorite\" or \"what would you do first\" questions.",
  "Mildly controversial is good (dating, money, family, overrated things, spicy opinions) as long as it stays within the safety rules.",
].join(" ");

/** What the writers get beyond the chat itself (reader.ts, loadContext) and how to use it. */
export const CONTEXT_RULE = [
  "Each player's notes are what they've shared in this chat; thread is what they're on now, open questions and running jokes.",
  "Use them: dig into something a player said, pick up an open question, or call back to a joke.",
  "earlierNudges shows how well each player answered each earlier nudge (quality 0-10; a missing name didn't answer).",
  "Both low: that topic isn't theirs, move away from it. One high, one low: it's that player's ground.",
  "Both high: go deeper on it, or come back to it from another angle.",
  "pastChats is what we know from a player's earlier chats with other people. Use it only to choose topics:",
  "lean into what they enjoy, steer clear of what fell flat or what they didn't get.",
  "Never mention it, quote it, or hint that you know anything they haven't said in this chat.",
  "profile is what a player chose to show on their public profile (hometown, prompt answers, favorites); both can see it,",
  "so it's fair game: play off an answer, or pit their favorites against each other.",
].join(" ");

/** Bonus mode (bonus.ts): shift the topic toward the trailing player's ground without saying why. */
export const BONUS_RULE = [
  "If leanTowards is set, build this nudge around that player's interests and things they've said, so they can answer well;",
  "it must still be answerable by both. Never mention scores, points, who is ahead or behind, or that the topic was chosen for anyone.",
].join(" ");

export function userMessage(ctx: NudgeContext): string {
  return JSON.stringify({
    nudge: ctx.number,
    stage: isIntro(ctx.number) ? "intro" : "main",
    depth: `${ctx.depth} (${DEPTH[ctx.depth]})`,
    players: ctx.players.map((p) => ({
      name: p.name,
      interests: [...p.interests, ...p.extracted_interests],
      notes: ctx.known.notes[p.seat],
      pastChats: ctx.past[p.seat], // UserProfile: enjoys, flat (fell flat), misses (didn't get)
      profile: ctx.shown[p.seat], // what they put on their public profile: hometown, prompts, favorites
    })),
    thread: ctx.known.thread,
    chatSoFar: ctx.chat,
    earlierNudges: ctx.earlier,
    leanTowards: ctx.turf && { name: ctx.turf.name, interests: [...ctx.turf.interests, ...ctx.turf.extracted_interests] },
    templates: ctx.templates.map((t) => ({ id: t.id, tone: t.tone, seed: t.seed })),
  });
}
