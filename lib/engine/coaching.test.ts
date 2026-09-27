import { expect, test } from "vitest";
import { lessonSystem } from "./coach";
import { normalizeCoaching } from "./coaching";

const lines = [
  { seat: "A" as const, body: "wait you've been to Tokyo twice??" },
  { seat: "B" as const, body: "yeah and I'm so delulu about going back" },
  { seat: "A" as const, body: "lol yeah" },
];

test("quotes must be the player's own messages; the partner's words and made-up lines are dropped", () => {
  const raw = {
    A: {
      good: { point: "Great follow-up", quote: "wait you've been to Tokyo twice??" },
      flat: { point: "Missed the slang", quote: "yeah and I'm so delulu about going back" }, // B's line
      improve: { tip: "Ask about the story", said: "lol yeah", try: "no way, what's pulling you back?" },
      coach: { title: "Catching slang", why: "You skipped past 'delulu'.", learn: ["what delulu means", "how to riff on it"] },
    },
    B: { good: { point: "x", quote: "never said this" }, flat: { point: "y" }, improve: { tip: "z", said: "not mine", try: "t" }, coach: null },
  };
  const out = normalizeCoaching(raw, lines);
  expect(out.A).toEqual({
    good: { point: "Great follow-up", quote: "wait you've been to Tokyo twice??" },
    flat: { point: "Missed the slang", quote: undefined },
    improve: { tip: "Ask about the story", said: "lol yeah", try: "no way, what's pulling you back?" },
    coach: { title: "Catching slang", why: "You skipped past 'delulu'.", learn: ["what delulu means", "how to riff on it"] },
  });
  expect(out.B).toEqual({ good: { point: "x", quote: undefined }, flat: { point: "y", quote: undefined }, improve: { tip: "z" }, coach: null });
  expect(normalizeCoaching({ A: { good: { point: "only this" } } }, lines)).toEqual({}); // incomplete: no report
});

test("the coach's lesson is built from the report's focus, not a template", () => {
  const report = normalizeCoaching(
    { A: { good: { point: "g" }, flat: { point: "f", quote: "lol yeah" }, improve: { tip: "t" }, coach: { title: "Catching slang", why: "You skipped 'delulu'.", learn: ["delulu"] } } },
    lines,
  ).A!;
  const system = lessonSystem({ name: "Coach" }, { name: "Sam", interests: ["anime"] }, report);
  expect(system).toContain('"Catching slang"');
  expect(system).toContain('["delulu"]');
  expect(system).toContain('"lol yeah"');
});
