import { expect, test } from "vitest";
import { PERSONAS } from "../lib/engine/personas";
import { botPhoto, seedPhoto, STOCK_BOTS } from "./photos";

test("seedPhoto: seeds only, by index", () => {
  expect(seedPhoto("seed:0")).toBe("/images/people/seed-0.webp");
  expect(seedPhoto("seed:299")).toBe("/images/people/seed-299.webp");
  expect(seedPhoto("00000000-0000-4000-8000-000000000001")).toBeUndefined();
  expect(seedPhoto("seed:")).toBeUndefined();
});

test("botPhoto: the seed it plays, a stock bot, or nothing", () => {
  const seed = PERSONAS[12];
  expect(botPhoto({ name: seed.name, interests: seed.interests })).toBe("/images/people/seed-12.webp");
  expect(botPhoto(STOCK_BOTS[0])).toBe(`/images/people/bot-${STOCK_BOTS[0].name.toLowerCase()}.webp`);
  expect(botPhoto({ name: "Coach", interests: ["pop culture"] })).toBeUndefined();
});

test("every photo file name is unique", () => {
  const files = [...PERSONAS.map((p) => seedPhoto(p.id)), ...STOCK_BOTS.map(botPhoto)];
  expect(files.every(Boolean)).toBe(true);
  expect(new Set(files).size).toBe(files.length);
});
