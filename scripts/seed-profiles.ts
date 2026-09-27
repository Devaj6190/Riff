// One-off (SPEC §7 Profiles): write a hometown, 1-2 prompts and 2 favorites for every seed persona into
// lib/engine/persona-profiles.json (by seed index). Rerun after adding personas; existing entries are kept.
//   node --env-file=.env.local node_modules/jiti/lib/jiti-cli.mjs scripts/seed-profiles.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { llmJson } from "../lib/engine/llm";
import { PERSONAS } from "../lib/engine/personas";
import { FAVORITE_KINDS, normalizeMyProfile, PROMPTS } from "../lib/profile";

const OUT = "lib/engine/persona-profiles.json";
type Extra = Pick<ReturnType<typeof normalizeMyProfile> & object, "from" | "prompts" | "favorites">;

const out: (Extra | null)[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const todo = PERSONAS.map((p, i) => ({ i, p })).filter(({ i }) => !out[i]);
const SYSTEM = [
  "You write dating-app-style public profiles for fictional college students in Atlanta. For each person:",
  "from: a real US hometown as \"City, ST\", mostly Georgia and the Southeast, some elsewhere; don't guess it from their name.",
  `prompts: 1 or 2 of these exact prompt strings, each once: ${JSON.stringify(PROMPTS)}; answer in their voice, casual, mostly lowercase, max 80 chars, consistent with their interests and bio.`,
  `favorites: exactly 2 with different kinds from ${JSON.stringify(FAVORITE_KINDS)}; each a real, well-known thing that fits their interests; value max 60 chars.`,
  'JSON: {"people": [{"id": s, "from": s, "prompts": [{"prompt": s, "answer": s}], "favorites": [{"kind": s, "value": s}]}]}',
].join(" ");

for (let at = 0; at < todo.length; at += 25) {
  const batch = todo.slice(at, at + 25);
  const raw = (await llmJson(SYSTEM, JSON.stringify(batch.map(({ p }) => ({ id: p.id, name: p.name, interests: p.interests, bio: p.bio }))), 90_000, { fast: true })) as {
    people?: { id?: string }[];
  };
  for (const { i, p } of batch) {
    const got = raw.people?.find((x) => x.id === p.id);
    const ok = normalizeMyProfile({ ...got, name: p.name, age: 20, interests: p.interests });
    if (ok && ok.from && ok.prompts.length && ok.favorites.length) out[i] = { from: ok.from, prompts: ok.prompts, favorites: ok.favorites };
    else console.warn("skipped", p.id, JSON.stringify(got));
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`${Math.min(at + 25, todo.length)}/${todo.length}`);
}
console.log("missing:", PERSONAS.filter((_, i) => !out[i]).length);
