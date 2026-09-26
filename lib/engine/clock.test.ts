import { expect, test } from "vitest";
import { nextPhase, phaseSeconds } from "./clock";

const now = new Date("2026-09-26T12:00:00Z");
const past = new Date(now.getTime() - 1);
const future = new Date(now.getTime() + 1000);
const at = (phase: Parameters<typeof nextPhase>[0]["phase"], phaseEndsAt: Date | null, seats = 2, answers = 0) => ({
  phase,
  phaseEndsAt,
  seats,
  answers,
});

test("lobby starts the first round only once both seats are filled", () => {
  expect(nextPhase(at("lobby", null, 1), now)).toBeNull();
  expect(nextPhase(at("lobby", null, 2), now)).toBe("round_active");
});

test("each timed phase advances only once its deadline has passed", () => {
  const cycle = [
    ["round_active", "round_result"],
    ["round_result", "talk_window"],
    ["talk_window", "countdown"],
    ["countdown", "round_active"],
  ] as const;
  for (const [from, to] of cycle) {
    expect(nextPhase(at(from, future), now)).toBeNull();
    expect(nextPhase(at(from, now), now)).toBe(to);
    expect(nextPhase(at(from, past), now)).toBe(to);
  }
});

test("a round ends early once both players have answered", () => {
  expect(nextPhase(at("round_active", future, 2, 1), now)).toBeNull();
  expect(nextPhase(at("round_active", future, 2, 2), now)).toBe("round_result");
});

test("an ended riff never advances", () => {
  expect(nextPhase(at("ended", past), now)).toBeNull();
});

test("rounds use the per-mechanic timers from SPEC §4.6", () => {
  expect(phaseSeconds("round_active", "open_prompt")).toBe(30);
  expect(phaseSeconds("round_active", "two_truths")).toBe(45);
  expect(phaseSeconds("round_active", "pick")).toBe(20);
  expect(phaseSeconds("round_active", "voice")).toBe(45);
  expect(phaseSeconds("round_active", "meme_audio")).toBe(20);
  expect(phaseSeconds("talk_window", "open_prompt")).toBe(20);
  expect(phaseSeconds("countdown", "open_prompt")).toBe(5);
});
