import { expect, test } from "vitest";
import type { Player, Template } from "../types";
import { DEPTH_ARC, depthFor, fillSeed, pickTemplates, writeOrFill, writerFor, type NudgeContext } from "./nudges";
import templates from "./templates.json";

const player = (name: string, interests: string[]) => ({ name, interests, extracted_interests: [] }) as unknown as Player;

test("depth: light intro, then climbs and drops back to fun; deep only once both are connected", () => {
  expect([1, 2].map((n) => depthFor(n, true))).toEqual([1, 1]);
  expect([3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => depthFor(n, true))).toEqual(DEPTH_ARC);
  expect([3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => depthFor(n, false))).not.toContain(3);
  expect(depthFor(12, true)).toBe(DEPTH_ARC[0]); // the arc repeats
});

test("intro: nudge 1 says hi, nudge 2 is another intro, later nudges never are", () => {
  const all = templates as Template[];
  expect(pickTemplates(all, "riff-1", 1, 1).map((t) => t.id)).toEqual(["tx-intro-hi"]);
  expect(pickTemplates(all, "riff-1", 2, 1).every((t) => t.tags.includes("intro") && t.id !== "tx-intro-hi")).toBe(true);
  for (let n = 3; n < 20; n++) expect(pickTemplates(all, "riff-1", n, depthFor(n, true)).some((t) => t.tags.includes("intro"))).toBe(false);
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
  const a = pickTemplates(all, "riff-1", 5, 1);
  expect(pickTemplates(all, "riff-1", 5, 1)).toEqual(a);
  expect(a.every((t) => t.depth === 1 && t.kind === a[0].kind)).toBe(true);
  expect(pickTemplates(all, "riff-1", 6, 1)[0]).not.toEqual(a[0]);
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
