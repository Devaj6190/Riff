import { expect, test } from "vitest";
import { normalizeScore } from "./score";

test("normalizeScore clamps scores, trims reasons and filters interests", () => {
  const r = normalizeScore({
    A: { quality: 14, connection: -3, reason: "  committing to\n Sharknado 3 is brave  " },
    B: { quality: 6.6, connection: "4" },
    new_interests: { A: ["Minecraft", 7, "", "chess", "go", "tea"], B: "nope" },
  });
  expect(r.A).toEqual({ quality: 10, connection: 0, reason: "committing to Sharknado 3 is brave" });
  expect(r.B).toEqual({ quality: 7, connection: 0, reason: "Solid chat." });
  expect(r.new_interests).toEqual({ A: ["minecraft", "chess", "go"], B: [] });
});

test("normalizeScore survives garbage", () => {
  expect(normalizeScore(null).A.quality).toBe(0);
  expect(normalizeScore("{").B.reason).toBe("Solid chat.");
});
