import { requirePlayer } from "../../../lib/supabase/auth";
import type { TranscribeResponse } from "../../../lib/types";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const AUDIO_TYPES = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav",
  "audio/aac", "audio/flac", "audio/x-flac",
]);

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length")) > MAX_AUDIO_BYTES + 100_000) {
    return new Response("Audio upload too large", { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const riffId = form?.get("riffId");
  const audio = form?.get("audio");
  if (typeof riffId !== "string" || !riffId || riffId.length > 100 || !(audio instanceof File)
    || audio.size === 0 || audio.size > MAX_AUDIO_BYTES || !AUDIO_TYPES.has(audio.type)) {
    return new Response("Invalid audio upload", { status: 400 });
  }
  try {
    await requirePlayer(req, riffId);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const key = process.env.XAI_API_KEY;
  if (!key) return new Response("Transcription unavailable", { status: 503 });
  const upstream = new FormData();
  upstream.set("model", "grok-voice-transcribe-2.0");
  upstream.set("file", audio, audio.name);
  try {
    const response = await fetch("https://api.x.ai/v1/stt", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return new Response("Transcription unavailable", { status: 502 });
    const result: unknown = await response.json();
    const text = result && typeof result === "object" && "text" in result ? result.text : null;
    if (typeof text !== "string" || !text.trim()) return new Response("No speech detected", { status: 422 });
    return Response.json({ transcript: text.trim() } satisfies TranscribeResponse);
  } catch {
    return new Response("Transcription unavailable", { status: 502 });
  }
}
