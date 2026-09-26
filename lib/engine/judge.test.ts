import { expect, test } from "vitest";
import { normalizeJudge, speedPoints } from "./judge";

const start = "2026-09-26T10:00:00.000Z";
const at = (s: number) => new Date(Date.parse(start) + s * 1000).toISOString();

test("speed is 5 at the start, 0 at the buzzer, linear in between, clamped", () => {
  expect(speedPoints(start, at(0), 30)).toBe(5);
  expect(speedPoints(start, at(15), 30)).toBe(3); // 2.5 rounds up
  expect(speedPoints(start, at(30), 30)).toBe(0);
  expect(speedPoints(start, at(45), 30)).toBe(0);
  expect(speedPoints(start, at(-2), 30)).toBe(5);
});

test("normalizeJudge clamps scores, trims reasons and filters interests", () => {
  const r = normalizeJudge({
    A: { quality: 14, connection: -3, reason: "  committing to\n Sharknado 3 is brave  " },
    B: { quality: 6.6, connection: "4" },
    new_interests: { A: ["Minecraft", 7, "", "chess", "go", "tea"], B: "nope" },
  });
  expect(r.A).toEqual({ quality: 10, connection: 0, reason: "committing to Sharknado 3 is brave" });
  expect(r.B).toEqual({ quality: 7, connection: 0, reason: "Solid answer." });
  expect(r.new_interests).toEqual({ A: ["minecraft", "chess", "go"], B: [] });
});

test("normalizeJudge survives garbage", () => {
  expect(normalizeJudge(null).A.quality).toBe(0);
  expect(normalizeJudge("{").B.reason).toBe("Solid answer.");
});
