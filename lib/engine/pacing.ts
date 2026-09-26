// When a nudge pops up and how long its timer runs (SPEC §4.5, §4.6). Pure: /api/tick loads the chat since the
// last nudge and asks shouldNudge(). The first nudges are introductions. After a nudge's timer runs out, Riff stays
// out of the way while the conversation flows, and nudges when it stalls or one person is carrying it.
// All numbers are placeholders to tune in playtesting.
import type { NudgeKind, Seat } from "../types";

export const PACING = {
  introNudges: 2, // nudges 1..2 are introductions (say hi, name, where you're from…); nudge 1 pops up right away
  breatherSeconds: 10, // after a timer runs out, never sooner than this (points pop, the answers get read)
  quietSeconds: 15, // nobody has said anything for this long: the flow died
  oneSidedSeconds: 30, // one person keeps talking and the other hasn't replied for this long
  maxGapSeconds: 180, // even a flowing chat gets one this often after the last timer ran out
};

/** Answer timers (SPEC §4.6). Speed points run linearly over the full timer. */
const TIMER_SECONDS: Record<NudgeKind, number> = { text: 30, image: 30, audio: 20 };
const INTRO_TIMER_SECONDS = 45; // saying hi and where you're from takes a couple of messages

export function timerSeconds(kind: NudgeKind, number: number): number {
  return number <= PACING.introNudges ? INTRO_TIMER_SECONDS : TIMER_SECONDS[kind];
}

export type PaceState = {
  shown: number; // nudges shown so far
  poppedAt: number; // ms: the last nudge popped up, or the chat started if there hasn't been one
  endsAt: number; // ms: the last nudge's timer runs out (= poppedAt if there hasn't been one)
  messages: { seat: Seat; at: number }[]; // since poppedAt, oldest first
};

export function shouldNudge(s: PaceState, now: number): boolean {
  if (s.shown === 0) return true; // intro: say hi
  const secs = (ms: number) => (now - ms) / 1000;
  const sinceEnd = secs(s.endsAt);
  if (sinceEnd < PACING.breatherSeconds) return false; // a timer is running, or just ran out
  if (sinceEnd >= PACING.maxGapSeconds) return true;
  const last = s.messages.at(-1);
  if (!last) return true; // nobody said anything to that nudge: try another
  if (secs(last.at) >= PACING.quietSeconds) return true;
  // One-sided: the other person hasn't said anything for a while (or at all since the nudge) while this one talks.
  const otherLast = s.messages.findLast((m) => m.seat !== last.seat)?.at ?? s.poppedAt;
  return secs(otherLast) >= PACING.oneSidedSeconds;
}
