import { search } from "@/lib/engine/search";
import { requireUser } from "@/lib/supabase/auth";
import type { SearchRequest, SearchResponse } from "@/lib/types";

export const maxDuration = 10; // Jev gets 3 s, then word overlap

/** Search the live queue (SPEC §7 Discovery), ranked by Jev. Call while polling /api/match in browse mode. */
export async function POST(req: Request) {
  const { query } = ((await req.json().catch(() => null)) ?? {}) as Partial<SearchRequest>;
  let userId: string;
  try {
    userId = await requireUser(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  return Response.json((await search(userId, typeof query === "string" ? query : "")) satisfies SearchResponse);
}
