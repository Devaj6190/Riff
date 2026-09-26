import { expect, test } from "vitest";
import { normalizeScore, speedPoints } from "./score";

const popped = "2026-09-26T10:00:00.000Z";
const at = (s: number) => new Date(Date.parse(popped) + s * 1000).toISOString();

test("speed is 5 right away, 0 at the buzzer, linear in between, clamped", () => {
  expect(speedPoints(popped, at(0), at(30))).toBe(5);
  expect(speedPoints(popped, at(15), at(30))).toBe(3); // 2.5 rounds up
  expect(speedPoints(popped, at(30), at(30))).toBe(0);
  expect(speedPoints(popped, at(45), at(30))).toBe(0);
  expect(speedPoints(popped, at(-2), at(30))).toBe(5);
});

test("normalizeScore clamps scores, trims reasons and filters interests", () => {
  const r = normalizeScore({
    A: { quality: 14, connection: -3, reason: "  committing to\n Sharknado 3 is brave  " },
    B: { quality: 6.6, connection: "4" },
    new_interests: { A: ["Minecraft", 7, "", "chess", "go", "tea"], B: "nope" },
  });
  expect(r.A).toEqual({ quality: 10, connection: 0, reason: "committing to Sharknado 3 is brave" });
  expect(r.B).toEqual({ quality: 7, connection: 0, reason: "Solid answer." });
  expect(r.new_interests).toEqual({ A: ["minecraft", "chess", "go"], B: [] });
});

test("normalizeScore survives garbage", () => {
  expect(normalizeScore(null).A.quality).toBe(0);
  expect(normalizeScore("{").B.reason).toBe("Solid answer.");
});
