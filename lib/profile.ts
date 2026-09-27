// Public profiles (SPEC §7 Profiles): the fixed prompt and favorite lists, and the shape check both sides share.
import { INTERESTS_REQUIRED, normalizeInterest } from "./interests";
import type { Favorite, MyProfile, ProfilePrompt } from "./types";

export const PROMPTS = [
  "Currently obsessed with…",
  "My hot take…",
  "Ask me about…",
  "Don't get me started on…",
  "The way to win me over…",
  "I'll never shut up about…",
  "My most controversial opinion…",
  "A random fact I love…",
  "My comfort rewatch…",
  "I'm weirdly good at…",
  "Two truths and a lie…",
  "Perfect weekend…",
];

export const FAVORITE_KINDS = [
  "game",
  "movie",
  "show",
  "anime",
  "artist",
  "song",
  "album",
  "book",
  "podcast",
  "youtuber",
  "sports team",
  "athlete",
  "food",
  "restaurant",
  "place",
];

export const MAX_PROMPTS = 3;
export const MAX_FAVORITES = 3;
export const PROMPT_ANSWER_MAX = 80;
export const FAVORITE_MAX = 60;
export const MIN_AGE = 15;
const MAX_INTERESTS = 30;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "").slice(0, max);

/** Trim and clamp a profile from a request, or null if it can't be one (bad basics, unknown prompt or category, repeats). */
export function normalizeMyProfile(raw: unknown): MyProfile | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = text(o.name, 24);
  const age = o.age;
  if (!name || typeof age !== "number" || !Number.isInteger(age) || age < MIN_AGE || age > 120) return null;
  if (!Array.isArray(o.interests) || !Array.isArray(o.prompts ?? []) || !Array.isArray(o.favorites ?? [])) return null;
  const interests = [...new Set(o.interests.map((i) => normalizeInterest(String(i))).filter(Boolean))].slice(0, MAX_INTERESTS);
  if (interests.length < INTERESTS_REQUIRED) return null;
  const prompts: ProfilePrompt[] = ((o.prompts ?? []) as unknown[]).map((p) => {
    const r = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    return { prompt: String(r.prompt), answer: text(r.answer, PROMPT_ANSWER_MAX) };
  });
  const favorites: Favorite[] = ((o.favorites ?? []) as unknown[]).map((f) => {
    const r = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    return { kind: String(r.kind), value: text(r.value, FAVORITE_MAX) };
  });
  const unique = (xs: string[]) => new Set(xs).size === xs.length;
  if (prompts.length > MAX_PROMPTS || !prompts.every((p) => PROMPTS.includes(p.prompt) && p.answer) || !unique(prompts.map((p) => p.prompt))) return null;
  if (favorites.length > MAX_FAVORITES || !favorites.every((f) => FAVORITE_KINDS.includes(f.kind) && f.value) || !unique(favorites.map((f) => f.kind))) return null;
  return { name, lastName: text(o.lastName, 40), age, from: text(o.from, 80), interests, prompts, favorites };
}
