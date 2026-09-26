import { llmJson } from "../llm";
import { fillSeed, MODEL_TIMEOUT_MS, type RoundContext, type Writer } from "../rounds";

const DEPTH = { 1: "light and playful", 2: "opinions and stories", 3: "personal and reflective, still kind" };

const writer: Writer<"open_prompt"> = {
  lead: 1,

  async write(ctx) {
    const out = (await llmJson(
      [
        "You write one open-ended question for both players in a round of a two-player conversation game.",
        "Pick one of the given templates and rewrite it for this pair: weave in their interests or something from the chat,",
        "keep the template's spirit, one question both can answer, under 140 characters, casual tone. Don't repeat earlier rounds.",
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

function userMessage(ctx: RoundContext): string {
  return JSON.stringify({
    round: ctx.number,
    depth: `${ctx.depth} (${DEPTH[ctx.depth]})`,
    players: ctx.players.map((p) => ({ name: p.name, interests: [...p.interests, ...p.extracted_interests] })),
    chatSoFar: ctx.chat,
    earlierRounds: ctx.previousPrompts,
    templates: ctx.templates.map((t) => ({ id: t.id, tone: t.tone, seed: t.seed })),
  });
}
