import { expect, test } from "vitest";
import type { Player, Template } from "../types";
import { allowedKinds, DEPTH_ARC, depthFor, fillSeed, pickTemplates, writeOrFill, writerFor, type NudgeContext } from "./nudges";
import { EMPTY_CONTEXT } from "./reader";
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
  expect(pickTemplates(all, "riff-1", 2, 1)).toEqual([expect.objectContaining({ tags: ["intro"] })]); // one, so the model can't favor one
  expect(pickTemplates(all, "riff-1", 2, 1)[0].id).not.toBe("tx-intro-hi");
  const openers = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((r) => pickTemplates(all, `riff-${r}`, 2, 1)[0].id));
  expect(openers.size).toBeGreaterThan(2); // chats don't all open the same way
  for (let n = 3; n < 20; n++) expect(pickTemplates(all, "riff-1", n, depthFor(n, true)).some((t) => t.tags.includes("intro"))).toBe(false);
});

test("text and image templates at every depth, unique ids", () => {
  const all = templates as Template[];
  for (const kind of ["text", "image", "pick", "truths"] as const) {
    expect(new Set(all.filter((t) => t.kind === kind).map((t) => t.depth))).toEqual(new Set([1, 2, 3]));
  }
  expect(all.filter((t) => t.kind === "text").length).toBeGreaterThanOrEqual(50);
  expect(all.filter((t) => t.kind === "pick").every((t) => t.options?.length === 4)).toBe(true);
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

test("bonus mode: fills use only the trailing player's interests", () => {
  const gamer = player("Sam", ["gaming"]);
  for (let i = 0; i < 20; i++) expect(fillSeed("{interest}?", [player("Alex", ["movies"]), gamer], gamer)).toBe("gaming?");
});

test("writers are dispatched per kind by file; missing ones are skipped", async () => {
  expect((await writerFor("text"))?.lead).toBe(1);
  expect((await writerFor("image"))?.lead).toBe(2);
  expect(await writerFor("audio")).toBeNull();
  expect((await writerFor("pick"))?.lead).toBe(1);
  expect((await writerFor("truths"))?.lead).toBe(1);
});

test("variety: intros are text, text follows anything fun, games and images don't come back too soon", () => {
  const all = ["text", "image", "pick", "truths"] as const;
  expect(allowedKinds([...all], [], 2)).toEqual(["text"]);
  expect(allowedKinds([...all], ["image", "text"], 5)).toEqual(["text"]);
  expect(allowedKinds([...all], ["text", "pick", "text"], 6)).toEqual(["text", "image", "truths"]);
  expect(allowedKinds([...all], ["text", "text", "image", "text"], 7)).toEqual(["text", "image", "pick", "truths"]);
  expect(allowedKinds([...all], ["text", "image"], 7)).toEqual(["text", "pick", "truths"]);
});

test("mini game fills: pick takes the template's options, both start at their first stage", async () => {
  const ctx = (t: Template): NudgeContext => ({ number: 5, depth: 1, players: [player("Ana", ["surfing"])], chat: [], known: EMPTY_CONTEXT, earlier: [], past: {}, shown: {}, templates: [t], turf: null });
  const pk = (templates as Template[]).find((t) => t.kind === "pick")!;
  expect((await writerFor("pick"))!.fill(ctx(pk))).toMatchObject({ prompt: pk.seed, options: pk.options, stage: "play", locked: [] });
  const tt: Template = { id: "t", kind: "truths", tone: "fun", depth: 1, seed: "Two truths and a lie: {interest} edition", tags: [] };
  expect((await writerFor("truths"))!.fill(ctx(tt))).toMatchObject({ prompt: "Two truths and a lie: surfing edition", stage: "write" });
});

test("a failed model write falls back to a local fill, with a pool image for image nudges", async () => {
  const ctx = (kind: Template["kind"]): NudgeContext => ({
    number: 1,
    depth: 1,
    players: [player("Ana", ["hiking"]), player("Ben", ["travel"])],
    chat: [],
    known: EMPTY_CONTEXT,
    earlier: [],
    past: {},
    shown: {},
    templates: [{ id: "t", kind, tone: "fun", depth: 1, seed: "Best {interest} spot?", tags: [] }],
    turf: null,
  });
  const failing = async (kind: "text" | "image") => ({ ...(await writerFor(kind))!, write: () => Promise.reject(new Error("timeout")) });
  expect(await writeOrFill(await failing("text"), ctx("text"))).toEqual({ prompt: expect.stringMatching(/^Best (hiking|travel) spot\?$/) });
  const image = await writeOrFill(await failing("image"), ctx("image"));
  expect(image).toMatchObject({ imageUrl: expect.stringMatching(/^\/images\/pool\//) });
});
