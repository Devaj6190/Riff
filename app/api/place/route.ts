import { isRealPlace } from "@/lib/engine/place";
import { requireUser } from "@/lib/supabase/auth";
import type { PlaceRequest, PlaceResponse } from "@/lib/types";

export const maxDuration = 10; // Jev gets 3 s, then it fails open

/** Onboarding: is the hometown a real place? The client shakes the field red when it isn't. */
export async function POST(req: Request) {
  const { place } = ((await req.json().catch(() => null)) ?? {}) as Partial<PlaceRequest>;
  if (typeof place !== "string") return new Response("place required", { status: 400 });
  try {
    await requireUser(req); // signed-in only: every call is a paid Jev request
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  return Response.json({ valid: await isRealPlace(place) } satisfies PlaceResponse);
}
