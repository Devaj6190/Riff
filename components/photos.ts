// Profile photos for the AI's people: the search seeds and the stock bots. Real people keep their letter avatar.
// The files come from scripts/seed-photos.ts; one that's missing or fails to load falls back to the letter too.
// Relative imports: scripts/seed-photos.ts and Vitest have no @/ alias.
import { seedFor } from "../lib/engine/personas";

const DIR = "/images/people";

/** Stock bot personas that aren't seeds (lib/engine/bot.ts, which is server-only): test mode and the /dev demo chats. */
export const STOCK_BOTS = [
  { name: "Maya", interests: ["anime", "food", "travel"] },
  { name: "Jordan", interests: ["sports", "memes", "gaming"] },
  { name: "Priya", interests: ["books", "art", "music"] },
  { name: "Leo", interests: ["fitness", "outdoors", "food"] },
];

/** A search result's photo. Only seeds have one ("seed:<n>"); a real person's id is their user id. */
export function seedPhoto(id: string): string | undefined {
  const n = /^seed:(\d+)$/.exec(id)?.[1];
  return n ? `${DIR}/seed-${n}.webp` : undefined;
}

/** A bot player's photo: the seed it's playing, or a stock persona. Anyone else (the Coach) keeps the letter. */
export function botPhoto(p: { name: string; interests: string[] }): string | undefined {
  const seed = seedFor(p);
  if (seed) return seedPhoto(seed.id);
  return STOCK_BOTS.some((b) => b.name === p.name) ? `${DIR}/bot-${p.name.toLowerCase()}.webp` : undefined;
}
