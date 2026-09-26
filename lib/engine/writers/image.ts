import { generateImage, poolImage } from "../../../app/api/image/generate";
import { llmJson } from "../llm";
import { fillSeed, MODEL_TIMEOUT_MS, type NudgeContext, type Writer } from "../nudges";
import { BONUS_RULE, userMessage } from "./text";

const IMAGE_TIMEOUT_MS = 25_000; // Muse Image ~12–19 s; written 2 nudges ahead (≥ 60 s) so nobody waits

const writer: Writer<"image"> = {
  lead: 2,

  async write(ctx) {
    const out = (await llmJson(
      [
        "Two people are texting in a chat app. You drop an image into their chat with one short prompt about it.",
        "Pick one of the given templates, then write a scene for an illustration built from both players' interests or what they're talking about,",
        "and rewrite the template's prompt for that scene: one prompt both can answer, under 120 characters, casual texting tone.",
        "The scene is 1-2 sentences, concrete and visual, no text or signs in it. Don't repeat earlier nudges.",
        BONUS_RULE,
        'JSON shape: {"templateId": string, "scene": string, "prompt": string}',
      ].join(" "),
      userMessage(ctx),
      MODEL_TIMEOUT_MS,
    )) as { scene?: unknown; prompt?: unknown };
    const scene = typeof out.scene === "string" ? out.scene.trim() : "";
    const prompt = typeof out.prompt === "string" ? out.prompt.trim() : "";
    if (!scene || !prompt || prompt.length > 200) throw new Error(`bad image nudge from model: ${JSON.stringify(out)}`);
    const { url } = await generateImage(scene, tags(ctx), IMAGE_TIMEOUT_MS);
    return { prompt, imageUrl: url };
  },

  fill: (ctx) => ({ prompt: fillSeed(ctx.templates[0].seed, ctx.players, ctx.turf), imageUrl: poolImage(tags(ctx)).url }),
};

export default writer;

const tags = (ctx: NudgeContext) => [...ctx.templates[0].tags, ...(ctx.turf ? [ctx.turf] : ctx.players).flatMap((p) => [...p.interests, ...p.extracted_interests])];
