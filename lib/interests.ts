export const INTEREST_CHIPS = [
  "music", "gaming", "anime", "movies", "sports", "food", "travel",
  "fitness", "art", "memes", "books", "tech", "fashion", "outdoors",
];

export const INTERESTS_REQUIRED = 3;

export function normalizeInterest(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);
}

/** Trim, lowercase, drop empties and duplicates, keep the first three. */
export function normalizeInterests(raw: string[]): string[] {
  return [...new Set(raw.map(normalizeInterest).filter(Boolean))].slice(0, INTERESTS_REQUIRED);
}
