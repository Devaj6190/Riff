// Onboarding hometown check: is what they typed a real city or town? Jev answers in one pass (jev.ts).
import { jev } from "./jev";

export const PLACE_QUESTION =
  "Is hometown a real city, town or place people live in (any country, any spelling or casing, abbreviations like NYC or LA, optionally with a state or country)? Gibberish, jokes, fictional places and non-places are not.";
export const PLACE_BELOW = 0.3; // lenient: a real but obscure town shouldn't bounce

/** False only when Jev is fairly sure it isn't a real place. Fails open: no key, an error or a timeout accepts it. */
export async function isRealPlace(place: string): Promise<boolean> {
  const text = place.trim();
  if (text.length < 2 || text.length > 80) return false;
  try {
    const { real } = await jev(
      { hometown: text },
      { real: { type: "noul", instructions: PLACE_QUESTION } },
      3000,
    );
    return real.type !== "noul" || real.noul >= PLACE_BELOW;
  } catch (e) {
    console.error("place check failed", e);
    return true;
  }
}
