import { requirePlayer } from "../../../lib/supabase/auth";
import type { ImageRequest } from "../../../lib/types";
import { generateImage } from "./generate";

function isImageRequest(value: unknown): value is ImageRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.riffId === "string" && body.riffId.trim().length > 0 && body.riffId.length <= 100
    && typeof body.prompt === "string" && body.prompt.trim().length > 0 && body.prompt.length <= 2000
    && Array.isArray(body.tags) && body.tags.length <= 20
    && body.tags.every((tag) => typeof tag === "string" && tag.length <= 80);
}

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  if (!isImageRequest(body)) return Response.json({ error: "Invalid image request" }, { status: 400 });
  try {
    await requirePlayer(req, body.riffId);
    return Response.json(await generateImage(body.prompt, body.tags));
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
