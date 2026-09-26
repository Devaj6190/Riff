import { llmJson } from "../llm";
import { fillSeed, MODEL_TIMEOUT_MS, type NudgeContext, type Writer } from "../nudges";

export const DEPTH = { 1: "light and playful", 2: "opinions and stories", 3: "personal and reflective, still kind" };

const writer: Writer<"text"> = {
  lead: 1,

  async write(ctx) {
    const out = (await llmJson(
      [
        "Two people are texting in a chat app. You drop a nudge into their chat: one prompt that sparks the next few messages.",
        "Pick one of the given templates and rewrite it for this pair: build on what they're talking about right now or their interests,",
        "keep the template's spirit, one prompt both can answer, under 140 characters, casual texting tone. Don't repeat earlier nudges.",
        'JSON shape: {"templateId": string, "prompt": string}',
      ].join(" "),
      userMessage(ctx),
      MODEL_TIMEOUT_MS,
    )) as { prompt?: unknown };
    const prompt = typeof out.prompt === "string" ? out.prompt.trim() : "";
    if (!prompt || prompt.length > 200) throw new Error(`bad prompt from model: ${JSON.stringify(out)}`);
    return { prompt };
  },

  fill: (ctx) => ({ prompt: fillSeed(ctx.templates[0].seed, ctx.players) }),
};

export default writer;

export function userMessage(ctx: NudgeContext): string {
  return JSON.stringify({
    nudge: ctx.number,
    depth: `${ctx.depth} (${DEPTH[ctx.depth]})`,
    players: ctx.players.map((p) => ({ name: p.name, interests: [...p.interests, ...p.extracted_interests] })),
    chatSoFar: ctx.chat,
    earlierNudges: ctx.previousPrompts,
    templates: ctx.templates.map((t) => ({ id: t.id, tone: t.tone, seed: t.seed })),
  });
}
