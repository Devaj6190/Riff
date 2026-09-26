import { expect, test } from "vitest";
import { normalizeMoments } from "./moments";

const lines = ["hi", "pineapple pizza is elite", "HOW DARE YOU", "lol", "ok fine", "bye"].map((body, i) => ({ seat: i % 2 ? "B" : "A", body }) as const);

test("normalizeMoments quotes the picked lines verbatim, in chat order, and drops bad picks", () => {
  const out = normalizeMoments(
    {
      moments: [
        { template: "wild_card", from: 6, to: 6, caption: "  Out of nowhere.  " },
        { template: "hot_take", from: 2, to: 3, caption: "A pizza war!" },
        { template: "hot_take", from: 4, to: 4, caption: "repeat template" },
        { template: "made_up", from: 4, to: 4, caption: "unknown template" },
        { template: "laugh_riot", from: 3, to: 4, caption: "overlaps hot_take" },
        { template: "story_time", from: 1, to: 5, caption: "too long" },
        { template: "roast", from: 5, to: 9, caption: "past the end" },
        { template: "wholesome", from: 5, to: 5, caption: "" },
      ],
    },
    lines,
  );
  expect(out.map((m) => m.template)).toEqual(["hot_take", "wild_card"]);
  expect(out[0]).toEqual({
    template: "hot_take",
    title: "Hot Take Standoff",
    lines: [
      { seat: "B", body: "pineapple pizza is elite" },
      { seat: "A", body: "HOW DARE YOU" },
    ],
    caption: "A pizza war!",
  });
  expect(out[1].caption).toBe("Out of nowhere.");
});

test("normalizeMoments caps at 3 and survives junk", () => {
  const pick = (template: string, n: number) => ({ template, from: n, to: n, caption: "x" });
  expect(normalizeMoments({ moments: [pick("laugh_riot", 1), pick("roast", 2), pick("hype", 3), pick("wordplay", 4)] }, lines)).toHaveLength(3);
  expect(normalizeMoments(null, lines)).toEqual([]);
  expect(normalizeMoments({ moments: "nope" }, lines)).toEqual([]);
});
