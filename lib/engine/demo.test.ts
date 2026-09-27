import { expect, test } from "vitest";
import { parseScript } from "./demo";
import { DEMO_SCRIPTS } from "./demo-scripts";

test("every demo script parses and opens with a nudge", () => {
  for (const s of DEMO_SCRIPTS) expect(parseScript(s)[0]).toHaveProperty("nudge");
});

test("lines map to nudges and seats; unknown speakers throw", () => {
  const s = { ...DEMO_SCRIPTS[0], lines: ["Riff: hi?", "Sam: hey: there", "Maya: yo"] };
  expect(parseScript(s)).toEqual([{ nudge: "hi?" }, { seat: "A", body: "hey: there" }, { seat: "B", body: "yo" }]);
  expect(() => parseScript({ ...s, lines: ["Bob: hi"] })).toThrow();
  expect(() => parseScript({ ...s, lines: ["no speaker"] })).toThrow();
});
