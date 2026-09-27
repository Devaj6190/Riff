// Guess their pick (SPEC §4.1): a this-or-that with 4 options; each player taps their pick and a guess of the other's.
import { llmJson } from "../llm";
import { bestDraft, fillSeed, MODEL_TIMEOUT_MS, type NudgeContext, type Writer } from "../nudges";
import type { NudgePayloads } from "../../types";
import { BONUS_RULE, CONTEXT_RULE, DRAFTS_RULE, userMessage, VIBE_RULE } from "./text";

export const OPTION_MAX = 40;

const writer: Writer<"pick"> = {
  lead: 1,

  async write(ctx) {
    const drafts = await draftPick(ctx);
    const pick = drafts[await bestDraft(ctx, drafts.map((d) => `${d.prompt} ${d.options.join(" / ")}`))];
    return game(pick.prompt, pick.options);
  },

  fill: (ctx) => game(fillSeed(ctx.templates[0].seed, ctx.players, ctx.turf), ctx.templates[0].options ?? []),
};

export default writer;

/** stageAt is set again when it pops up (/api/tick). */
const game = (prompt: string, options: string[]): NudgePayloads["pick"] => ({ prompt, options, stage: "play", stageAt: new Date().toISOString(), locked: [] });

export async function draftPick(ctx: NudgeContext): Promise<{ hook: string; prompt: string; options: string[] }[]> {
  const out = (await llmJson(
    [
      "Two people who just met are texting in a chat app. You start a quick mini game, Guess their pick: a question with 4 options;",
      "each taps their own pick and guesses which one the other picked. The options should be distinct, all tempting, and say something about the person picking.",
      "Use one of the given templates as the format, or make your own. Prompt under 80 characters; each option 1-4 words, under 40 characters.",
      DRAFTS_RULE,
      VIBE_RULE,
      CONTEXT_RULE,
      BONUS_RULE,
      'JSON shape: {"drafts": [{"hook": string, "prompt": string, "options": [string, string, string, string]}, {...}, {...}]}',
    ].join(" "),
    userMessage(ctx),
    MODEL_TIMEOUT_MS,
    { fast: ctx.fast },
  )) as { drafts?: unknown };
  const drafts = (Array.isArray(out.drafts) ? out.drafts : [])
    .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : {}))
    .map((d) => ({
      hook: typeof d.hook === "string" ? d.hook.trim() : "",
      prompt: typeof d.prompt === "string" ? d.prompt.trim() : "",
      options: Array.isArray(d.options) ? d.options.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter((o) => o && o.length <= OPTION_MAX) : [],
    }))
    .filter((d) => d.prompt && d.prompt.length <= 120 && d.options.length === 4 && new Set(d.options).size === 4);
  if (!drafts.length) throw new Error(`bad pick drafts from model: ${JSON.stringify(out)}`);
  return drafts;
}
