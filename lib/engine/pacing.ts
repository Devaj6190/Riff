// When a nudge pops up (SPEC §4.5). Pure: /api/tick loads the chat since the last nudge and asks shouldNudge().
// The first nudges are introductions. After that Riff stays out of the way while the conversation flows, and
// nudges when it stalls or one person is carrying it. All numbers are placeholders to tune in playtesting.
import type { Seat } from "../types";

export const PACING = {
  introNudges: 2, // nudges 1..2 are introductions (say hi, name, where you're from…); nudge 1 pops up right away
  cooldownSeconds: 20, // never sooner than this after the last nudge
  quietSeconds: 15, // nobody has said anything for this long: the flow died
  ignoredSeconds: 45, // nobody has said anything since the nudge: give it this long before replacing it
  oneSidedSeconds: 30, // one person keeps talking and the other hasn't replied for this long
  maxGapSeconds: 180, // even a flowing chat gets one this often, so the game keeps moving
};

export type PaceState = {
  shown: number; // nudges shown so far
  since: number; // ms: last nudge, or when the chat started if there hasn't been one
  messages: { seat: Seat; at: number }[]; // since then, oldest first
};

export function shouldNudge(s: PaceState, now: number): boolean {
  if (s.shown === 0) return true; // intro: say hi
  const secs = (ms: number) => (now - ms) / 1000;
  const gap = secs(s.since);
  if (gap < PACING.cooldownSeconds) return false;
  if (gap >= PACING.maxGapSeconds) return true;
  const last = s.messages.at(-1);
  if (!last) return gap >= PACING.ignoredSeconds;
  if (secs(last.at) >= PACING.quietSeconds) return true;
  // One-sided: the other person hasn't said anything for a while (or at all since the nudge) while this one talks.
  const otherLast = s.messages.findLast((m) => m.seat !== last.seat)?.at ?? s.since;
  return secs(otherLast) >= PACING.oneSidedSeconds;
}
