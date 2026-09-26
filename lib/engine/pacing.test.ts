import { expect, test } from "vitest";
import type { Seat } from "../types";
import { PACING, shouldNudge } from "./pacing";

const T = 1_000_000;
const s = (sec: number) => T + sec * 1000;
const msg = (seat: Seat, sec: number) => ({ seat, at: s(sec) });

test("the intro nudge pops up as soon as the chat starts", () => {
  expect(shouldNudge({ shown: 0, since: T, messages: [] }, T)).toBe(true);
});

test("never inside the cooldown, even when the chat died", () => {
  expect(shouldNudge({ shown: 1, since: T, messages: [] }, s(PACING.cooldownSeconds - 1))).toBe(false);
});

test("a flowing back-and-forth is left alone until maxGapSeconds", () => {
  const flowing = Array.from({ length: 40 }, (_, i) => msg(i % 2 ? "B" : "A", i * 4));
  const now = s(40 * 4 - 2);
  expect(shouldNudge({ shown: 3, since: T, messages: flowing }, now)).toBe(false);
  expect(shouldNudge({ shown: 3, since: T, messages: [...flowing, msg("A", PACING.maxGapSeconds - 1)] }, s(PACING.maxGapSeconds))).toBe(true);
});

test("a lull after they talked brings the next nudge", () => {
  const talked = [msg("A", 5), msg("B", 10)];
  expect(shouldNudge({ shown: 2, since: T, messages: talked }, s(10 + PACING.quietSeconds - 1))).toBe(false);
  expect(shouldNudge({ shown: 2, since: T, messages: talked }, s(10 + PACING.quietSeconds))).toBe(true);
});

test("an ignored nudge gets ignoredSeconds before it's replaced", () => {
  expect(shouldNudge({ shown: 2, since: T, messages: [] }, s(PACING.ignoredSeconds - 1))).toBe(false);
  expect(shouldNudge({ shown: 2, since: T, messages: [] }, s(PACING.ignoredSeconds))).toBe(true);
});

test("one person carrying the chat brings a nudge", () => {
  const carrying = [msg("B", 2), msg("A", 5), msg("A", 12), msg("A", 20), msg("A", 28)];
  expect(shouldNudge({ shown: 2, since: T, messages: carrying }, s(2 + PACING.oneSidedSeconds - 1))).toBe(false);
  expect(shouldNudge({ shown: 2, since: T, messages: carrying }, s(2 + PACING.oneSidedSeconds))).toBe(true);
});
