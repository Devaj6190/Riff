import { expect, test } from "vitest";
import { demoNudge, parseScript } from "./demo";
import { DEMO_SCRIPTS } from "./demo-scripts";

test("every demo script parses and opens with a nudge", () => {
  for (const s of DEMO_SCRIPTS) expect(parseScript(s)[0]).toHaveProperty("nudge");
});

test("lines map to nudges and seats; unknown speakers throw", () => {
  const s = { ...DEMO_SCRIPTS.find((d) => d.id === "clicks")!, lines: ["Riff: hi?", "Sam: hey: there", "Maya: yo"] };
  expect(parseScript(s)).toEqual([{ nudge: "hi?" }, { seat: "A", body: "hey: there" }, { seat: "B", body: "yo" }]);
  expect(() => parseScript({ ...s, lines: ["Bob: hi"] })).toThrow();
  expect(() => parseScript({ ...s, lines: ["no speaker"] })).toThrow();
});

test("the full demo's nudges: image, mini games and the bot's taps (1-based in scripts)", () => {
  const s = { ...DEMO_SCRIPTS.find((d) => d.id === "showcase")!, lines: ["Riff image: First move? | arcade-cafe.jpg", "Riff pick: Saturday? | a / b / c / d", "Priya picks: 3, guesses 4", "Riff truths: Travel edition", "Priya writes: one / two / three | lie 1", "Priya guesses: 2"] };
  expect(parseScript(s)).toEqual([
    { nudge: "First move?", image: "/images/pool/arcade-cafe.jpg" },
    { nudge: "Saturday?", options: ["a", "b", "c", "d"] },
    { play: { stage: "play", pick: 2, guess: 3 } },
    { nudge: "Travel edition", truths: true },
    { play: { stage: "write", statements: ["one", "two", "three"], lie: 0 } },
    { play: { stage: "guess", guess: 1 } },
  ]);
  expect(demoNudge({ nudge: "Saturday?", options: ["a", "b", "c", "d"] }, 0)).toMatchObject({ kind: "pick", payload: { stage: "play", locked: [] } });
  expect(() => parseScript({ ...s, lines: ["Riff pick: Saturday? | a / b"] })).toThrow(); // needs 4 options
  expect(() => parseScript({ ...s, lines: ["Priya writes: one / two | lie 1"] })).toThrow(); // needs 3 statements
});
