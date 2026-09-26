import { expect, test } from "vitest";
import type { Player, Seat } from "../types";
import { BONUS_GAP, bonusLength, turfFor } from "./bonus";

const sam = { id: "sam", seat: "A", interests: ["gaming"] } as unknown as Player;
const alex = { id: "alex", seat: "B", interests: ["movies"] } as unknown as Player;
const totals = (a: number, b: number) => new Map([["sam", a], ["alex", b]]);
const close = totals(10, 10);
/** Shown nudges newest first, from the seats they leaned toward (oldest first here, for readability). */
const shown = (...seats: (Seat | null)[]) => seats.map((for_seat, i) => ({ number: i + 1, for_seat })).reverse();

test("switches on for the trailing player once the gap reaches BONUS_GAP", () => {
  expect(turfFor([sam, alex], totals(10, 10 + BONUS_GAP - 1), shown(null))).toBeNull();
  expect(turfFor([sam, alex], totals(10, 10 + BONUS_GAP), shown(null))).toBe(sam);
  expect(turfFor([sam, alex], totals(10 + BONUS_GAP, 10), shown(null))).toBe(alex);
});

test("lasts 2 or 3 nudges whatever the scores do, alternating by where it started", () => {
  expect([bonusLength(4), bonusLength(5)]).toEqual([2, 3]);
  // Started on nudge 4 → 2 nudges.
  expect(turfFor([sam, alex], close, shown(null, null, null, "A"))).toBe(sam);
  expect(turfFor([sam, alex], close, shown(null, null, null, "A", "A"))).toBeNull();
  // Started on nudge 5 → 3 nudges.
  expect(turfFor([sam, alex], close, shown(null, null, null, null, "A", "A"))).toBe(sam);
  expect(turfFor([sam, alex], close, shown(null, null, null, null, "A", "A", "A"))).toBeNull();
});

test("one normal nudge after it ends before it can come back, even with the gap still big", () => {
  const wide = totals(0, 100);
  expect(turfFor([sam, alex], wide, shown(null, null, null, "A", "A"))).toBeNull();
  expect(turfFor([sam, alex], wide, shown(null, null, null, "A", "A", null))).toBe(sam);
});

test("no bonus mode before scores exist or with one player", () => {
  expect(turfFor([sam, alex], new Map(), [])).toBeNull();
  expect(turfFor([sam], totals(0, 50), [])).toBeNull();
});
