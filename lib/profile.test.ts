import { expect, test } from "vitest";
import { PERSONAS } from "./engine/personas";
import { normalizeMyProfile } from "./profile";

const base = { name: " Sam ", lastName: "Lee", age: 20, from: "Atlanta, GA", interests: ["Gaming", "anime", "ramen"] };

test("trims and keeps a valid profile", () => {
  const p = normalizeMyProfile({ ...base, prompts: [{ prompt: "My hot take…", answer: "  pineapple   belongs " }], favorites: [{ kind: "game", value: "Elden Ring" }] });
  expect(p).toMatchObject({ name: "Sam", interests: ["gaming", "anime", "ramen"], prompts: [{ answer: "pineapple belongs" }] });
});

test("rejects made-up prompts and categories, repeats, too many, too young", () => {
  expect(normalizeMyProfile({ ...base, prompts: [{ prompt: "Tell me anything", answer: "x" }] })).toBeNull();
  expect(normalizeMyProfile({ ...base, favorites: [{ kind: "car", value: "Civic" }] })).toBeNull();
  expect(normalizeMyProfile({ ...base, favorites: [{ kind: "game", value: "a" }, { kind: "game", value: "b" }] })).toBeNull();
  expect(normalizeMyProfile({ ...base, prompts: ["My hot take…", "Ask me about…", "Perfect weekend…", "My comfort rewatch…"].map((prompt) => ({ prompt, answer: "x" })) })).toBeNull();
  expect(normalizeMyProfile({ ...base, age: 14 })).toBeNull();
});

test("every seed has a profile that passes the same check", () => {
  for (const s of PERSONAS) {
    expect(normalizeMyProfile({ ...s, age: 20 }), s.id).not.toBeNull();
    expect(s.from && s.prompts.length && s.favorites.length, s.id).toBeTruthy();
  }
});
