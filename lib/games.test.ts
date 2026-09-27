import { expect, test } from "vitest";
import { pickPoints, playsStage, truthsPoints } from "./games";
import type { NudgePayloads } from "./types";

test("guess their pick: playing is 5, knowing their pick is 10 + connection 5", () => {
  expect(pickPoints({ A: { pick: 0, guess: 2 }, B: { pick: 2, guess: 1 } })).toEqual({
    A: { quality: 10, connection: 5 }, // guessed B's pick
    B: { quality: 5, connection: 0 },
  });
  expect(pickPoints({ A: { pick: 0, guess: 0 } })).toEqual({ A: { quality: 5, connection: 0 } }); // nothing to guess against
});

test("two truths: writing is 5, fooling them +5, spotting their lie is connection 5", () => {
  const s = ["a", "b", "c"];
  expect(truthsPoints({ A: { statements: s, lie: 1, guess: 2 }, B: { statements: s, lie: 2, guess: 0 } })).toEqual({
    A: { quality: 10, connection: 5 }, // B guessed 0, A's lie was 1; A spotted B's lie
    B: { quality: 5, connection: 0 },
  });
  expect(truthsPoints({ A: { statements: s, lie: 1 }, B: { guess: 1 } })).toEqual({
    A: { quality: 5, connection: 0 }, // B spotted it
    B: { quality: 0, connection: 5 }, // didn't write, still guessed right
  });
});

test("only players whose partner wrote statements play the guess stage", () => {
  const p: NudgePayloads["truths"] = { prompt: "", stage: "guess", stageAt: "", locked: [], statements: { A: ["a", "b", "c"] } };
  expect(playsStage(p, ["A", "B"])).toEqual(["B"]);
  expect(playsStage({ ...p, stage: "write" }, ["A", "B"])).toEqual(["A", "B"]);
});
