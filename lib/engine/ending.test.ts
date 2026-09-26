import { afterEach, expect, test } from "vitest";
import { isGameOver, targetScore } from "./ending";

test("game ends when either player reaches the target", () => {
  expect(isGameOver([99, 40], 100)).toBe(false);
  expect(isGameOver([100, 40], 100)).toBe(true);
  expect(isGameOver([20, 50], 50)).toBe(true);
  expect(isGameOver([], 100)).toBe(false);
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
