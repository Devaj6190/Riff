import { expect, test } from "vitest";
import type { NudgePayloads, PlayRequest } from "../types";
import { nextPlay } from "./games";

const base = { riffId: "r", nudgeId: "n" };
const pick: NudgePayloads["pick"] = { prompt: "Pick one", options: ["a", "b", "c", "d"], stage: "play", stageAt: "", locked: [] };
const truths: NudgePayloads["truths"] = { prompt: "Two truths", stage: "write", stageAt: "", locked: [] };
const status = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof Response ? e.status : "threw";
  }
  return "ok";
};

test("a play must match the stage on screen, once per stage, with real indexes", () => {
  expect(nextPlay(pick, "A", { ...base, stage: "play", pick: 1, guess: 3 }, undefined)).toEqual({ pick: 1, guess: 3 });
  expect(status(() => nextPlay(pick, "A", { ...base, stage: "play", pick: 4, guess: 0 }, undefined))).toBe(400);
  expect(status(() => nextPlay({ ...pick, locked: ["A"] }, "A", { ...base, stage: "play", pick: 0, guess: 0 }, undefined))).toBe(409);
  expect(status(() => nextPlay({ ...pick, stage: "reveal" }, "A", { ...base, stage: "play", pick: 0, guess: 0 }, undefined))).toBe(409);
});

test("two truths: 3 statements and a lie, then a guess only at a partner who wrote", () => {
  const write: PlayRequest = { ...base, stage: "write", statements: [" I surf ", "I have a twin", "I hate pizza"], lie: 2 };
  const wrote = nextPlay(truths, "A", write, undefined);
  expect(wrote).toEqual({ statements: ["I surf", "I have a twin", "I hate pizza"], lie: 2 });
  expect(status(() => nextPlay(truths, "A", { ...base, stage: "write", statements: ["x", "", "y"], lie: 0 }, undefined))).toBe(400);
  const guessing = { ...truths, stage: "guess" as const, statements: { B: ["a", "b", "c"] } };
  expect(nextPlay(guessing, "A", { ...base, stage: "guess", guess: 1 }, wrote)).toEqual({ ...wrote, guess: 1 });
  expect(status(() => nextPlay(guessing, "B", { ...base, stage: "guess", guess: 1 }, undefined))).toBe(409); // A wrote nothing
});
