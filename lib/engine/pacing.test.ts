import { expect, test } from "vitest";
import type { Seat } from "../types";
import { PACING, mayClose, shouldNudge, timerSeconds } from "./pacing";

const T = 1_000_000;
const s = (sec: number) => T + sec * 1000;
const msg = (seat: Seat, sec: number) => ({ seat, at: s(sec) });
// A nudge popped at T; its timer runs out at 30 s.
const after = (messages: { seat: Seat; at: number }[], typing = false) => ({ shown: 3, endsAt: s(30), messages, typing });

test("the intro nudge pops up as soon as the chat starts, with a longer timer", () => {
  expect(shouldNudge({ shown: 0, endsAt: T, messages: [], typing: false }, T)).toBe(true);
  expect(timerSeconds("text", 1)).toBeGreaterThan(timerSeconds("text", 5));
});

test("never while a timer runs", () => {
  expect(shouldNudge(after([]), s(29))).toBe(false);
});

test("a nudge nobody answered is replaced the moment its timer runs out", () => {
  expect(shouldNudge(after([]), s(30))).toBe(true);
});

test("after the timer, the next nudge waits for a quiet moment", () => {
  const talked = [msg("A", 10), msg("B", 29)];
  expect(shouldNudge(after(talked), s(29 + PACING.quietSeconds - 1))).toBe(false);
  expect(shouldNudge(after(talked), s(29 + PACING.quietSeconds))).toBe(true);
  expect(shouldNudge(after(talked, true), s(29 + PACING.quietSeconds))).toBe(false); // someone's typing
});

test("however lively the chat, the next nudge pops capSeconds after the timer", () => {
  const flowing = [msg("A", 10), msg("B", 20), ...Array.from({ length: 10 }, (_, i) => msg(i % 2 ? "B" : "A", 30 + i * 1.5))];
  const cap = 30 + PACING.capSeconds;
  expect(shouldNudge(after(flowing, true), s(cap - 1))).toBe(false);
  expect(shouldNudge(after(flowing, true), s(cap))).toBe(true);
});

test("the judge is asked only once both said something and nobody's typing", () => {
  expect(mayClose(after([msg("A", 5)]), s(6))).toBe(false);
  expect(mayClose(after([msg("A", 5), msg("B", 8)]), s(9))).toBe(true);
  expect(mayClose(after([msg("A", 5), msg("B", 8)], true), s(9))).toBe(false);
  expect(mayClose(after([msg("A", 5), msg("B", 8)]), s(30 - PACING.closeSeconds))).toBe(false); // already closing
});
