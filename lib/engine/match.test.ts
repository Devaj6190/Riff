import { describe, expect, it } from "vitest";
import { byOverlap } from "./match";

describe("byOverlap", () => {
  it("picks the candidate sharing the most words, first on ties", () => {
    const mine = ["indie games", "Succession"];
    expect(byOverlap(mine, [["cooking"], ["video games", "succession memes"], ["board games"]], ["a", "b", "c"])).toBe("b");
    expect(byOverlap(mine, [["cooking"], ["hiking"]], ["a", "b"])).toBe("a");
  });
});
