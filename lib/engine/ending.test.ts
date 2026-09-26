import { afterEach, expect, test } from "vitest";
import { isGameOver, targetScore } from "./ending";

test("game ends at the target or after the round cap", () => {
  expect(isGameOver([99, 40], 100, 5)).toBe(false);
  expect(isGameOver([100, 40], 100, 5)).toBe(true);
  expect(isGameOver([20, 50], 50, 3)).toBe(true);
  expect(isGameOver([30, 40], 100, 12)).toBe(true);
  expect(isGameOver([], 100, 1)).toBe(false);
});

afterEach(() => {
  delete process.env.RIFF_TARGET_SCORE;
});

test("RIFF_TARGET_SCORE overrides the target (Expo mode)", () => {
  expect(targetScore(100)).toBe(100);
  process.env.RIFF_TARGET_SCORE = "50";
  expect(targetScore(100)).toBe(50);
  process.env.RIFF_TARGET_SCORE = "abc";
  expect(targetScore(100)).toBe(100);
});
