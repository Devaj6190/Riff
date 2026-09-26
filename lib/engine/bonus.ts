// Bonus mode (SPEC §4.4): while one player trails by BONUS_GAP or more, nudges lean toward the trailing player's
// interests. Gaming vs movies, movies player winning → gaming-heavy nudges, so the other can answer better and is
// encouraged to. Both players still answer, scoring is unchanged, and nobody is told who's behind.
import type { Player } from "../types";

export const BONUS_GAP = 15;

/** The player nudges should lean toward right now, or null when the scores are close. `players` in seat order. */
export function turfFor(players: Player[], totals: Map<string, number>): Player | null {
  if (players.length !== 2) return null;
  const [a, b] = players.map((p) => totals.get(p.id) ?? 0);
  if (Math.abs(a - b) < BONUS_GAP) return null;
  return a < b ? players[0] : players[1];
}
