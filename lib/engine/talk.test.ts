import { expect, test } from "vitest";
import { TALK } from "./clock";
import { talkDeadline } from "./talk";

const S = 1_000_000;
const s = (sec: number) => S + sec * 1000;

test("a quiet window lasts the minimum", () => {
  expect(talkDeadline(S, [])).toBe(s(TALK.minSeconds));
  expect(talkDeadline(S, [{ seat: "A", at: s(3) }, { seat: "A", at: s(5) }])).toBe(s(20)); // one player talking alone
});

test("+8 s per message while both posted within 10 s", () => {
  const msgs = [
    { seat: "A" as const, at: s(2) },
    { seat: "B" as const, at: s(4) }, // A posted 2 s ago -> +8
    { seat: "A" as const, at: s(6) }, // B posted 2 s ago -> +8
    { seat: "A" as const, at: s(30) }, // B last posted 26 s ago -> no extension
  ];
  expect(talkDeadline(S, msgs)).toBe(s(36));
});

test("messages after the deadline don't extend it, and the window is capped", () => {
  expect(talkDeadline(S, [{ seat: "A", at: s(19) }, { seat: "B", at: s(25) }])).toBe(s(20));
  const burst = Array.from({ length: 40 }, (_, i) => ({ seat: (i % 2 ? "B" : "A") as "A" | "B", at: s(1 + i) }));
  expect(talkDeadline(S, burst)).toBe(s(TALK.maxSeconds));
});

test("messages before the window opened are ignored", () => {
  expect(talkDeadline(S, [{ seat: "A", at: s(-5) }, { seat: "B", at: s(1) }])).toBe(s(20));
});
