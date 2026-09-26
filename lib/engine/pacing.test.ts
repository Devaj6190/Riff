import { expect, test } from "vitest";
import type { Seat } from "../types";
import { PACING, shouldNudge, timerSeconds } from "./pacing";

const T = 1_000_000;
const s = (sec: number) => T + sec * 1000;
const msg = (seat: Seat, sec: number) => ({ seat, at: s(sec) });
// A nudge popped at T with a 30 s timer.
const after = (messages: { seat: Seat; at: number }[]) => ({ shown: 3, poppedAt: T, endsAt: s(30), messages });

test("the intro nudge pops up as soon as the chat starts, with a longer timer", () => {
  expect(shouldNudge({ shown: 0, poppedAt: T, endsAt: T, messages: [] }, T)).toBe(true);
  expect(timerSeconds("text", 1)).toBeGreaterThan(timerSeconds("text", 5));
});

test("never while a timer runs or during the breather after it", () => {
  expect(shouldNudge(after([]), s(29))).toBe(false);
  expect(shouldNudge(after([]), s(30 + PACING.breatherSeconds - 1))).toBe(false);
});

test("a nudge nobody answered is replaced right after the breather", () => {
  expect(shouldNudge(after([]), s(30 + PACING.breatherSeconds))).toBe(true);
});

test("a flowing back-and-forth is left alone until maxGapSeconds after the timer", () => {
  const flowing = Array.from({ length: 50 }, (_, i) => msg(i % 2 ? "B" : "A", i * 4));
  expect(shouldNudge(after(flowing), s(49 * 4 + 2))).toBe(false);
  const end = 30 + PACING.maxGapSeconds;
  expect(shouldNudge(after([...flowing, msg("A", end - 1)]), s(end))).toBe(true);
});

test("a lull after they talked brings the next nudge", () => {
  const talked = [msg("A", 35), msg("B", 38)];
  expect(shouldNudge(after(talked), s(38 + PACING.quietSeconds - 1))).toBe(false);
  expect(shouldNudge(after(talked), s(38 + PACING.quietSeconds))).toBe(true);
});

test("one person carrying the chat brings a nudge", () => {
  const carrying = [msg("B", 20), msg("A", 25), msg("A", 35), msg("A", 42), msg("A", 48)];
  expect(shouldNudge(after(carrying), s(20 + PACING.oneSidedSeconds - 1))).toBe(false);
  expect(shouldNudge(after(carrying), s(20 + PACING.oneSidedSeconds))).toBe(true);
});
