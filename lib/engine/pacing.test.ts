import { expect, test } from "vitest";
import { PACING, shouldNudge } from "./pacing";

const T = 1_000_000;
const s = (sec: number) => T + sec * 1000;

test("first nudge: on the first lull after someone speaks, or after firstMaxSeconds regardless", () => {
  const hey = { since: T, first: true, messagesSince: 2, lastMessageAt: s(3) };
  expect(shouldNudge(hey, s(3 + PACING.quietSeconds - 1))).toBe(false);
  expect(shouldNudge(hey, s(3 + PACING.quietSeconds))).toBe(true);
  expect(shouldNudge({ since: T, first: true, messagesSince: 0, lastMessageAt: null }, s(PACING.firstMaxSeconds - 1))).toBe(false);
  expect(shouldNudge({ since: T, first: true, messagesSince: 0, lastMessageAt: null }, s(PACING.firstMaxSeconds))).toBe(true);
});

test("a lull earns a nudge, but not inside the cooldown", () => {
  const lull = { since: T, first: false, messagesSince: 3, lastMessageAt: s(2) };
  expect(shouldNudge(lull, s(PACING.cooldownSeconds - 1))).toBe(false);
  expect(shouldNudge(lull, s(PACING.cooldownSeconds))).toBe(true);
});

test("a busy chat still gets one every maxGapSeconds", () => {
  const busy = { since: T, first: false, messagesSince: 40, lastMessageAt: s(PACING.maxGapSeconds - 1) };
  expect(shouldNudge(busy, s(PACING.maxGapSeconds - 1))).toBe(false);
  expect(shouldNudge(busy, s(PACING.maxGapSeconds))).toBe(true);
});

test("an ignored nudge isn't replaced until maxGapSeconds", () => {
  const ignored = { since: T, first: false, messagesSince: 0, lastMessageAt: null };
  expect(shouldNudge(ignored, s(PACING.maxGapSeconds - 1))).toBe(false);
  expect(shouldNudge(ignored, s(PACING.maxGapSeconds))).toBe(true);
});
