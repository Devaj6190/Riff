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

export async function generateImage(prompt: string, tags: string[]): Promise<ImageResponse> {
  const fallback = () => poolImage(tags);
  const key = process.env.XAI_API_KEY;
  if (!key) return fallback();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Race the whole operation (including JSON body reading), then abort the request.
    // The deadline still holds if an upstream transport ignores cancellation.
    const deadline = new Promise<ImageResponse>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(fallback()); }, 5000);
    });
    const generation = (async (): Promise<ImageResponse> => {
      const response = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-imagine-image-2.0", n: 1, response_format: "url",
          prompt: `Create a playful scene for an all-ages conversation game. No violence, nudity, or sexual content. Scene request: ${prompt}`,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return fallback();
      const result = await response.json();
      const url = result?.data?.[0]?.url;
      if (typeof url !== "string" || new URL(url).protocol !== "https:") return fallback();
      return { url, fromPool: false };
    })();
    return await Promise.race([generation, deadline]);
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
