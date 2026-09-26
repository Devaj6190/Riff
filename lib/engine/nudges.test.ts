import { expect, test } from "vitest";
import type { Player, Template } from "../types";
import { depthFor, fillSeed, pickTemplates, writeOrFill, writerFor, type NudgeContext } from "./nudges";
import templates from "./templates.json";

const player = (name: string, interests: string[]) => ({ name, interests, extracted_interests: [] }) as unknown as Player;

test("depth ladder: light openers, depth 3 only after nudge 6 with both players connected", () => {
  expect([1, 2, 3].map((n) => depthFor(n, true))).toEqual([1, 1, 1]);
  expect(depthFor(4, false)).toBe(2);
  expect(depthFor(6, true)).toBe(2);
  expect(depthFor(7, false)).toBe(2);
  expect(depthFor(7, true)).toBe(3);
});

test("text and image templates at every depth, unique ids", () => {
  const all = templates as Template[];
  for (const kind of ["text", "image"] as const) {
    expect(new Set(all.filter((t) => t.kind === kind).map((t) => t.depth))).toEqual(new Set([1, 2, 3]));
  }
  expect(all.filter((t) => t.kind === "text").length).toBeGreaterThanOrEqual(20);
  expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
});

test("pickTemplates is stable per slot, matches depth and kind, and varies between nudges", () => {
  const all = templates as Template[];
  const a = pickTemplates(all, "riff-1", 2, 1);
  expect(pickTemplates(all, "riff-1", 2, 1)).toEqual(a);
  expect(a.every((t) => t.depth === 1 && t.kind === a[0].kind)).toBe(true);
  expect(pickTemplates(all, "riff-1", 3, 1)[0]).not.toEqual(a[0]);
});

test("fillSeed puts one of the pair's interests into the template", () => {
  expect(fillSeed("What {interest} hot take?", [player("Ana", ["chess"])])).toBe("What chess hot take?");
});

test("writers are dispatched per kind by file; missing ones are skipped", async () => {
  expect((await writerFor("text"))?.lead).toBe(1);
  expect((await writerFor("image"))?.lead).toBe(2);
  expect(await writerFor("audio")).toBeNull();
});

test("a failed model write falls back to a local fill, with a pool image for image nudges", async () => {
  const ctx = (kind: Template["kind"]): NudgeContext => ({
    number: 1,
    depth: 1,
    players: [player("Ana", ["hiking"]), player("Ben", ["travel"])],
    chat: [],
    previousPrompts: [],
    templates: [{ id: "t", kind, tone: "fun", depth: 1, seed: "Best {interest} spot?", tags: [] }],
  });
  const failing = async (kind: "text" | "image") => ({ ...(await writerFor(kind))!, write: () => Promise.reject(new Error("timeout")) });
  expect(await writeOrFill(await failing("text"), ctx("text"))).toEqual({ prompt: expect.stringMatching(/^Best (hiking|travel) spot\?$/) });
  const image = await writeOrFill(await failing("image"), ctx("image"));
  expect(image).toMatchObject({ imageUrl: expect.stringMatching(/^\/images\/pool\//) });
});
