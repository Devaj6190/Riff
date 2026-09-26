import { llmJson } from "../llm";
import { fillSeed, isIntro, MODEL_TIMEOUT_MS, type NudgeContext, type Writer } from "../nudges";

export const DEPTH = { 1: "light and playful", 2: "opinions and stories", 3: "personal and reflective, still kind" };

const writer: Writer<"text"> = {
  lead: 1,

  async write(ctx) {
    const out = (await llmJson(
      [
        "Two people are texting in a chat app. You drop a nudge into their chat: one prompt that sparks the next few messages.",
        "Pick one of the given templates and rewrite it for this pair: build on what they're talking about right now or their interests,",
        "keep the template's spirit, one prompt both can answer, under 140 characters, casual texting tone. Don't repeat earlier nudges.",
        VIBE_RULE,
        CONTEXT_RULE,
        "Match the depth you're given. If the chat is stalling, make it easy and fun to answer.",
        "In the intro stage, keep it a simple warm introduction: names, where they're from, what they're into.",
        BONUS_RULE,
        'JSON shape: {"templateId": string, "prompt": string}',
      ].join(" "),
      userMessage(ctx),
      MODEL_TIMEOUT_MS,
      { fast: ctx.fast },
    )) as { prompt?: unknown };
    const prompt = typeof out.prompt === "string" ? out.prompt.trim() : "";
    if (!prompt || prompt.length > 200) throw new Error(`bad prompt from model: ${JSON.stringify(out)}`);
    return { prompt };
  },

  fill: (ctx) => ({ prompt: fillSeed(ctx.templates[0].seed, ctx.players, ctx.turf) }),
};

export default writer;

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
    })),
    thread: ctx.known.thread,
    chatSoFar: ctx.chat,
    earlierNudges: ctx.earlier,
    leanTowards: ctx.turf && { name: ctx.turf.name, interests: [...ctx.turf.interests, ...ctx.turf.extracted_interests] },
    templates: ctx.templates.map((t) => ({ id: t.id, tone: t.tone, seed: t.seed })),
  });
}
