import { expect, test } from "vitest";
import { normalizeInterests } from "./interests";

test("normalizeInterests trims, lowercases, dedupes and caps at three", () => {
  expect(normalizeInterests(["  Music ", "music", "", "Board   Games", "anime", "tech"])).toEqual([
    "music",
    "board games",
    "anime",
  ]);
});
