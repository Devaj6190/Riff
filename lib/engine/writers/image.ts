import { generateImage, poolImage } from "../../../app/api/image/generate";
import { llmJson } from "../llm";
import { bestDraft, fillSeed, MODEL_TIMEOUT_MS, type NudgeContext, type Writer } from "../nudges";
import { BONUS_RULE, CONTEXT_RULE, DRAFTS_RULE, userMessage, VIBE_RULE } from "./text";

const IMAGE_TIMEOUT_MS = 25_000; // Muse Image ~12–19 s; written 2 nudges ahead (≥ 60 s) so nobody waits

type Draft = { scene: string; style: "cartoon" | "photo"; prompt: string };

const writer: Writer<"image"> = {
  lead: 2,

  async write(ctx) {
    const out = (await llmJson(
      [
        "Two people who just met are texting in a chat app. You drop an image into their chat with one short prompt about it.",
        "For each draft, write a scene for an illustration built from both players' interests or what they're talking about,",
        "and a prompt about that scene: one prompt both can answer, under 120 characters, casual texting tone.",
        "The scene is 1-2 sentences, concrete and visual, no text or signs in it.",
        "Pick the style that fits: \"cartoon\" for absurd, meme-y or impossible scenes; \"photo\" for real places, food, rooms, trips and anything that should look real.",
        DRAFTS_RULE,
        VIBE_RULE,
        CONTEXT_RULE,
        BONUS_RULE,
        'JSON shape: {"drafts": [{"hook": string, "scene": string, "style": "cartoon" | "photo", "prompt": string}, {...}, {...}]}',
      ].join(" "),
      userMessage(ctx),
      MODEL_TIMEOUT_MS,
    )) as { drafts?: unknown };
    const drafts: Draft[] = (Array.isArray(out.drafts) ? out.drafts : [])
      .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : {}))
      .map((d) => ({
        scene: typeof d.scene === "string" ? d.scene.trim() : "",
        style: d.style === "photo" ? ("photo" as const) : ("cartoon" as const),
        prompt: typeof d.prompt === "string" ? d.prompt.trim() : "",
      }))
      .filter((d) => d.scene && d.prompt && d.prompt.length <= 200);
    if (!drafts.length) throw new Error(`bad image drafts from model: ${JSON.stringify(out)}`);
    const pick = drafts[await bestDraft(ctx, drafts.map((d) => `${d.prompt} (image: ${d.scene})`))];
    const { url } = await generateImage(pick.scene, tags(ctx), IMAGE_TIMEOUT_MS, pick.style);
    return { prompt: pick.prompt, imageUrl: url };
  },

  fill: (ctx) => ({ prompt: fillSeed(ctx.templates[0].seed, ctx.players, ctx.turf), imageUrl: poolImage(tags(ctx)).url }),
};

export default writer;

const tags = (ctx: NudgeContext) => [...ctx.templates[0].tags, ...(ctx.turf ? [ctx.turf] : ctx.players).flatMap((p) => [...p.interests, ...p.extracted_interests])];
