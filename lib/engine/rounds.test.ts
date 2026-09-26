import { expect, test } from "vitest";
import type { Player, Template } from "../types";
import { depthFor, fillSeed, pickTemplates, writeOrFill, writerFor, type RoundContext } from "./rounds";
import templates from "./templates.json";

const player = (name: string, interests: string[]) => ({ name, interests, extracted_interests: [] }) as unknown as Player;

test("depth ladder: light openers, depth 3 only after round 6 with both players connected", () => {
  expect([1, 2, 3].map((n) => depthFor(n, true))).toEqual([1, 1, 1]);
  expect(depthFor(4, false)).toBe(2);
  expect(depthFor(6, true)).toBe(2);
  expect(depthFor(7, false)).toBe(2);
  expect(depthFor(7, true)).toBe(3);
});

test("at least 20 open-prompt templates across every tone and depth", () => {
  const open = (templates as Template[]).filter((t) => t.mechanic === "open_prompt");
  expect(open.length).toBeGreaterThanOrEqual(20);
  expect(new Set(open.map((t) => t.tone))).toEqual(new Set(["fun", "deep", "know"]));
  expect(new Set(open.map((t) => t.depth))).toEqual(new Set([1, 2, 3]));
  expect(new Set(open.map((t) => t.id)).size).toBe(open.length);
});

test("pickTemplates is stable per slot, matches depth and mechanic, and varies between rounds", () => {
  const all = templates as Template[];
  const a = pickTemplates(all, "riff-1", 2, 1);
  expect(pickTemplates(all, "riff-1", 2, 1)).toEqual(a);
  expect(a.every((t) => t.depth === 1 && t.mechanic === a[0].mechanic)).toBe(true);
  expect(a.length).toBeGreaterThan(1);
  expect(pickTemplates(all, "riff-1", 3, 1)[0]).not.toEqual(a[0]);
});

test("fillSeed puts one of the pair's interests into the template", () => {
  const out = fillSeed("What {interest} hot take?", [player("Ana", ["chess"])]);
  expect(out).toBe("What chess hot take?");
});

test("writers are dispatched per mechanic by file; missing ones are skipped", async () => {
  expect((await writerFor("open_prompt"))?.lead).toBe(1);
  expect(await writerFor("meme_audio")).toBeNull();
});

test("a failed model write falls back to a local template fill", async () => {
  const writer = (await writerFor("open_prompt"))!;
  const ctx: RoundContext = {
    number: 1,
    depth: 1,
    players: [player("Ana", ["hiking"]), player("Ben", ["hiking"])],
    chat: [],
    previousPrompts: [],
    templates: [{ id: "t", mechanic: "open_prompt", tone: "fun", depth: 1, seed: "Best {interest} spot?", tags: [] }],
  };
  const failing = { ...writer, write: () => Promise.reject(new Error("timeout")) };
  expect(await writeOrFill(failing, ctx)).toEqual({ prompt: "Best hiking spot?" });
});
