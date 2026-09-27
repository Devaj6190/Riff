import { expect, test } from "vitest";
import { PERSONAS } from "./personas";
import { rankPeople } from "./search";
import type { SearchPerson } from "../types";

const p = (id: string, seed: boolean): SearchPerson => ({ id, name: id, interests: ["x"], mode: "browse", seed });
const people = [p("real1", false), p("seed:0", true), p("real2", false), p("seed:1", true)];

test("empty search puts real people first, each group by fit", () => {
  const ranked = rankPeople(people, { "seed:0": 0.9, real2: 0.06, real1: 0.04 }, true);
  expect(ranked.map((x) => x.id)).toEqual(["real2", "real1", "seed:0", "seed:1"]);
});

test("a query ranks by relevance alone; ties keep queue order", () => {
  const ranked = rankPeople(people, { "seed:0": 0.9, real2: 0.1 }, false);
  expect(ranked.map((x) => x.id)).toEqual(["seed:0", "real2", "real1", "seed:1"]);
});

test("300 seeds with unique ids and names that fit the players table", () => {
  expect(PERSONAS).toHaveLength(300);
  expect(new Set(PERSONAS.map((s) => s.id)).size).toBe(300);
  expect(new Set(PERSONAS.map((s) => s.name)).size).toBe(300);
  for (const s of PERSONAS) {
    expect(s.name.length).toBeLessThanOrEqual(24);
    expect(s.interests).toHaveLength(3);
  }
});
