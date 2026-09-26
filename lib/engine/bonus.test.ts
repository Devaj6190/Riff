import { expect, test } from "vitest";
import type { Player } from "../types";
import { BONUS_GAP, turfFor } from "./bonus";

const sam = { id: "sam", seat: "A", interests: ["gaming"] } as unknown as Player;
const alex = { id: "alex", seat: "B", interests: ["movies"] } as unknown as Player;
const totals = (a: number, b: number) => new Map([["sam", a], ["alex", b]]);

test("nudges lean toward the trailing player once the gap reaches BONUS_GAP", () => {
  expect(turfFor([sam, alex], totals(10, 10 + BONUS_GAP - 1))).toBeNull();
  expect(turfFor([sam, alex], totals(10, 10 + BONUS_GAP))).toBe(sam);
  expect(turfFor([sam, alex], totals(10 + BONUS_GAP, 10))).toBe(alex);
});

test("no bonus mode before scores exist or with one player", () => {
  expect(turfFor([sam, alex], new Map())).toBeNull();
  expect(turfFor([sam], totals(0, 50))).toBeNull();
});
