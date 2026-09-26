import type { ImageResponse } from "../../../lib/types";
import pool from "./pool.json";

/** Prefer the most tag overlap; randomize ties so Pick options can vary. */
export function poolImage(tags: string[]): ImageResponse {
  const wanted = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  const scores = pool.map((image) => image.tags.filter((tag) => wanted.has(tag)).length);
  const best = Math.max(...scores);
  const candidates = pool.filter((_, index) => scores[index] === best);
  return { url: candidates[Math.floor(Math.random() * candidates.length)].url, fromPool: true };
}

// Style + safety only. Don't describe the app here: both models drew "Conversation Game" signs into scenes.
export type ImageStyle = "cartoon" | "photo";
const STYLE: Record<ImageStyle, string> = {
  cartoon: "Playful, colourful cartoon illustration, bold shapes, a little absurd.",
  photo: "Photorealistic photo, natural light, candid, shot on a phone camera.",
};
const SAFETY = " All-ages. No violence, nudity or sexual content, and no written text, signs or logos. Scene: ";

type ImageProvider = { url: string; key: string | undefined; model: string };

/** Muse Image first (faster, cheaper, Meta credits), Grok Imagine as the fallback, then the pool. */
function providers(): ImageProvider[] {
  return [
    { url: `${process.env.META_BASE_URL || "https://api.meta.ai/v1"}/images/generations`, key: process.env.META_API_KEY, model: "muse-image-1.0" },
    { url: "https://api.x.ai/v1/images/generations", key: process.env.XAI_API_KEY, model: "grok-imagine-image-2.0" },
  ].filter((p) => p.key);
}

/**
 * One image within `timeoutMs` overall (providers share the deadline, including reading the body).
 * Measured: Muse ~12 s, Grok ~25 s, so callers that need a generated image must ask ahead of time.
 */
export async function generateImage(prompt: string, tags: string[], timeoutMs = 5000, style: ImageStyle = "cartoon"): Promise<ImageResponse> {
  const fallback = () => poolImage(tags);
  const chain = providers();
  if (!chain.length) return fallback();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The deadline still holds if an upstream transport ignores cancellation.
    const deadline = new Promise<ImageResponse>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(fallback()); }, timeoutMs);
    });
    const generation = (async (): Promise<ImageResponse> => {
      for (const provider of chain) {
        const image = await tryProvider(provider, STYLE[style] + SAFETY + prompt, controller.signal).catch(() => null);
        if (image) return image;
        if (controller.signal.aborted) break;
      }
      return fallback();
    })();
    return await Promise.race([generation, deadline]);
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

async function tryProvider(p: ImageProvider, prompt: string, signal: AbortSignal): Promise<ImageResponse | null> {
  const response = await fetch(p.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: p.model, n: 1, response_format: "url", prompt }),
    signal,
  });
  if (!response.ok) return null;
  const url = (await response.json())?.data?.[0]?.url;
  if (typeof url !== "string" || !URL.canParse(url) || new URL(url).protocol !== "https:") return null;
  return { url, fromPool: false };
}
