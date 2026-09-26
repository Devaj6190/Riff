// Bonus mode (SPEC §4.4): when one player trails by BONUS_GAP or more, nudges lean toward the trailing player's
// interests for 2 or 3 nudges. Gaming vs movies, movies player winning → gaming-heavy nudges, so the other can answer
// better and is encouraged to. Both players still answer, scoring is unchanged, and nobody is told who's behind.
import type { Player, Seat } from "../types";

export const BONUS_GAP = 25;

/** How many nudges bonus mode lasts: 2 or 3, alternating with the nudge it started on (no extra state needed). */
export const bonusLength = (firstNumber: number) => 2 + (firstNumber % 2);

/**
 * The player the next nudge should lean toward, or null. `players` in seat order; `shown` the nudges shown so far,
 * newest first. Once on, bonus mode stays on for its length whatever the scores do; after it ends there's at least
 * one normal nudge before it can come back.
 */
export function turfFor(players: Player[], totals: Map<string, number>, shown: { number: number; for_seat: Seat | null }[]): Player | null {
  if (players.length !== 2) return null;
  const seat = shown[0]?.for_seat;
  if (seat) {
    let streak = 0;
    while (streak < shown.length && shown[streak].for_seat === seat) streak++;
    return streak < bonusLength(shown[streak - 1].number) ? players.find((p) => p.seat === seat)! : null;
  }
  const [a, b] = players.map((p) => totals.get(p.id) ?? 0);
  if (Math.abs(a - b) < BONUS_GAP) return null;
  return a < b ? players[0] : players[1];
}
