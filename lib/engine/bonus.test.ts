import { expect, test } from "vitest";
import type { Player } from "../types";
import { fillBonus, shouldBonus } from "./bonus";

const sam = { name: "Sam", interests: ["climbing"], extracted_interests: [] } as unknown as Player;

test("trigger: gap of at least 15 + jitter", () => {
  expect(shouldBonus(14, 0, 4, null)).toBe(false);
  expect(shouldBonus(15, 0, 4, null)).toBe(true);
  expect(shouldBonus(19, 5, 4, null)).toBe(false);
  expect(shouldBonus(20, 5, 4, null)).toBe(true);
});

test("cooldown: the 2 nudges after a Bonus nudge can't be one", () => {
  expect(shouldBonus(30, 0, 6, 5)).toBe(false);
  expect(shouldBonus(30, 0, 7, 5)).toBe(false);
  expect(shouldBonus(30, 0, 8, 5)).toBe(true);
});

test("local fill quotes the player's own words, else leans on an interest", () => {
  expect(fillBonus(sam, ["I once slept on a glacier"])).toContain('Sam said "I once slept on a glacier"');
  expect(fillBonus(sam, [])).toContain("climbing");
});
