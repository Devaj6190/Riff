import { checkProfile, loadMyProfile, partnerProfile, saveMyProfile } from "@/lib/engine/profiles";
import { normalizeMyProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/auth";
import type { ProfileRequest, ProfileResponse } from "@/lib/types";

export const maxDuration = 10; // Jev gets 3 s on save, then it fails open

/** Public profiles (SPEC §7 Profiles): mine, my chat partner's, or save mine (Jev-checked). */
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Partial<ProfileRequest>;
  try {
    const userId = await requireUser(req);
    if (body.action === "get") return Response.json({ profile: await loadMyProfile(userId) } satisfies ProfileResponse);
    if (body.action === "partner" && typeof body.riffId === "string") {
      return Response.json({ profile: await partnerProfile(userId, body.riffId) } satisfies ProfileResponse);
    }
    if (body.action === "save") {
      const profile = normalizeMyProfile(body.profile);
      if (!profile) return new Response("bad profile", { status: 400 });
      const errors = await checkProfile(profile, await loadMyProfile(userId));
      if (Object.keys(errors).length) return Response.json({ profile: null, errors } satisfies ProfileResponse);
      await saveMyProfile(userId, profile);
      return Response.json({ profile } satisfies ProfileResponse);
    }
    return new Response("action must be get, partner or save", { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
