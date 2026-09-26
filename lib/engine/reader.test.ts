import { expect, test } from "vitest";
import { normalizeHistory, normalizeProfile } from "./ending";
import { normalizeContext } from "./reader";

test("normalizeContext keeps string notes per seat, caps lists, defaults junk", () => {
  const c = normalizeContext({
    notes: { A: [" has a corgi ", 3, "", ...Array(20).fill("x")], B: "nope" },
    thread: { topic: "dogs", open: ["q1", "q2", "q3", "q4"], callbacks: null },
  });
  expect(c.notes.A[0]).toBe("has a corgi");
  expect(c.notes.A).toHaveLength(15);
  expect(c.notes.B).toEqual([]);
  expect(c.thread).toEqual({ topic: "dogs", open: ["q1", "q2", "q3"], callbacks: [] });
  expect(normalizeContext(null).thread.topic).toBe("");
});

test("normalizeHistory shares the recap and fills both seats", () => {
  const h = normalizeHistory({ recap: "Talked dogs.", A: { learned: ["has a corgi"], misses: ["Succession ref"] } });
  expect(h.A).toEqual({ recap: "Talked dogs.", learned: ["has a corgi"], clicked: [], died: [], misses: ["Succession ref"] });
  expect(h.B.recap).toBe("Talked dogs.");
  expect(h.B.learned).toEqual([]);
});

test("normalizeProfile keeps strings, counts chats, defaults junk", () => {
  const p = normalizeProfile({ about: " Quick, jokey texter. ", enjoys: ["anime", 4], flat: "nope" }, 3);
  expect(p).toEqual({ about: "Quick, jokey texter.", enjoys: ["anime"], flat: [], misses: [], chats: 3 });
});
