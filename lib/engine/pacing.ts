// When a nudge pops up and how long its timer runs (SPEC §4.5, §4.6). Pure: /api/tick loads the chat since the
// last nudge and asks shouldNudge(). The first nudges are introductions. Once both have answered (judged live, see
// judgeAnswered in score.ts), the timer drops to closeSeconds. After it runs out, the pair can keep talking: the next
// nudge waits for a quiet moment, but never longer than capSeconds.
// All numbers are placeholders to tune in playtesting.
import type { NudgeKind, Seat } from "../types";

export const PACING = {
  introNudges: 2, // nudges 1..2 are introductions (say hi, name, where you're from…); nudge 1 pops up right away
  closeSeconds: 2, // both answered: the timer drops to this, so the nudge closes smoothly instead of vanishing
  quietSeconds: 5, // after the timer: nobody sent a message or typed for this long, so the next nudge pops
  capSeconds: 15, // after the timer: the next nudge pops by now even if they're still talking
  typingSeconds: 3, // a keystroke counts as "typing" for this long (the client reports it with each tick)
};

/** Answer timers (SPEC §4.6). Speed points run linearly over the full timer, even when it's closed early. */
const TIMER_SECONDS: Record<NudgeKind, number> = { text: 30, image: 30, audio: 20 };
const INTRO_TIMER_SECONDS = 45; // saying hi and where you're from takes a couple of messages

export function timerSeconds(kind: NudgeKind, number: number): number {
  return number <= PACING.introNudges ? INTRO_TIMER_SECONDS : TIMER_SECONDS[kind];
}

export type PaceState = {
  shown: number; // nudges shown so far
  endsAt: number; // ms: the last nudge's timer runs out
  messages: { seat: Seat; at: number }[]; // since the last nudge popped up, oldest first
  typing: boolean; // someone typed in the last typingSeconds
};

export function shouldNudge(s: PaceState, now: number): boolean {
  if (s.shown === 0) return true; // intro: say hi
  if (now < s.endsAt) return false; // a timer is running
  const last = s.messages.at(-1);
  if (!last) return true; // nobody said anything to that nudge: try another
  if (now - s.endsAt >= PACING.capSeconds * 1000) return true;
  return !s.typing && now - last.at >= PACING.quietSeconds * 1000;
}

/** Worth asking the judge whether both answered: the timer isn't already closing, each seat said something, and
 *  nobody's mid-message (they may be adding to their answer). */
export function mayClose(s: PaceState, now: number): boolean {
  return (
    s.shown > 0 &&
    s.endsAt - now > PACING.closeSeconds * 1000 &&
    !s.typing &&
    s.messages.some((m) => m.seat === "A") &&
    s.messages.some((m) => m.seat === "B")
  );
}
