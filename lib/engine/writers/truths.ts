// Two truths and a lie (SPEC §4.1): the nudge is the theme; players write their statements on the card.
import { llmJson } from "../llm";
import { bestDraft, fillSeed, MODEL_TIMEOUT_MS, type NudgeContext, type Writer } from "../nudges";
import type { NudgePayloads } from "../../types";
import { BONUS_RULE, CONTEXT_RULE, DRAFTS_RULE, userMessage } from "./text";

const writer: Writer<"truths"> = {
  lead: 1,

  async write(ctx) {
    const drafts = await draftTruths(ctx);
    return game(drafts[await bestDraft(ctx, drafts)]);
  },

  fill: (ctx) => game(fillSeed(ctx.templates[0].seed, ctx.players, ctx.turf)),
};

export default writer;

/** stageAt is set again when it pops up (/api/tick). */
const game = (prompt: string): NudgePayloads["truths"] => ({ prompt, stage: "write", stageAt: new Date().toISOString(), locked: [] });

export async function draftTruths(ctx: NudgeContext): Promise<string[]> {
  const out = (await llmJson(
    [
      "Two people who just met are texting in a chat app. You start a round of Two truths and a lie: each writes 3 statements about themselves, one a lie,",
      "then guesses the other's lie. Write the round's title with a theme both can answer from their own life, e.g. \"Two truths and a lie: concert edition\"",
      "or \"Two truths and a lie about your worst trip\". Under 70 characters. Use one of the given templates or make your own.",
      DRAFTS_RULE,
      CONTEXT_RULE,
      BONUS_RULE,
      'JSON shape: {"drafts": [{"hook": string, "prompt": string}, {...}, {...}]}',
    ].join(" "),
    userMessage(ctx),
    MODEL_TIMEOUT_MS,
    { fast: ctx.fast },
  )) as { drafts?: unknown };
  const drafts = (Array.isArray(out.drafts) ? out.drafts : [])
    .map((d) => (d && typeof d === "object" && typeof (d as Record<string, unknown>).prompt === "string" ? ((d as Record<string, unknown>).prompt as string).trim() : ""))
    .filter((p) => p && p.length <= 100);
  if (!drafts.length) throw new Error(`bad truths drafts from model: ${JSON.stringify(out)}`);
  return drafts;
}
