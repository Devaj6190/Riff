// One-off: a realistic profile photo for each of the AI's people (the search seeds and the stock bots), written to
// public/images/people/ under the names components/photos.ts gives them. Files already there are kept, so to redo a bad
// one, delete it (review them all at /dev/photos) and rerun.
//   node --env-file=.env.local node_modules/jiti/lib/jiti-cli.mjs scripts/seed-photos.ts
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp"; // ponytail: comes with next (image optimization), not declared in package.json
import { botPhoto, seedPhoto, STOCK_BOTS } from "../components/photos";
import { PERSONAS } from "../lib/engine/personas";

const WORKERS = 6;
const SIZE = 256; // 2x the largest avatar (96 px)

// Same providers as app/api/image/generate.ts, Muse first then Grok, but no pool fallback: a miss is retried or reported.
const PROVIDERS = [
  { url: `${process.env.META_BASE_URL || "https://api.meta.ai/v1"}/images/generations`, key: process.env.META_API_KEY, model: "muse-image-1.0" },
  { url: "https://api.x.ai/v1/images/generations", key: process.env.XAI_API_KEY, model: "grok-imagine-image-2.0" },
].filter((p) => p.key);
if (!PROVIDERS.length) throw new Error("No META_API_KEY or XAI_API_KEY: run with --env-file=.env.local");

type Person = { file: string; name: string; interests: string[]; age: number; school?: string; bio?: string };
// Seeds are all at Atlanta colleges, so 18 to 24, spread by index.
const people: Person[] = [
  ...PERSONAS.map((p, i) => ({ ...p, file: seedPhoto(p.id)!, age: 18 + (i % 7) })),
  ...STOCK_BOTS.map((b) => ({ ...b, file: botPhoto(b)!, age: 20 })),
];

const prompt = (p: Person) =>
  [
    `Photorealistic smartphone photo of ${p.name}, ${p.age === 18 ? "an" : "a"} ${p.age}-year-old college student${p.school ? ` at ${p.school}` : ""} in Atlanta, for their profile picture.`,
    p.bio && `Their bio: "${p.bio}".`,
    `Into ${p.interests.join(", ")}.`,
    "Head and shoulders, one person, facing the camera, relaxed and friendly, natural light, everyday clothes, a background that hints at what they're into.",
    "Candid, like a friend took it: not a studio portrait or a stock photo. Fully clothed, no text, signs or logos.",
  ]
    .filter(Boolean)
    .join(" ");

async function generate(text: string): Promise<Buffer> {
  const errors: string[] = [];
  for (const p of PROVIDERS) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: p.model, n: 1, response_format: "url", prompt: text }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const out = (await res.json())?.data?.[0];
      if (typeof out?.b64_json === "string") return Buffer.from(out.b64_json, "base64");
      if (typeof out?.url !== "string") throw new Error("no image in the response");
      const img = await fetch(out.url, { signal: AbortSignal.timeout(60_000) });
      if (!img.ok) throw new Error(`download ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    } catch (e) {
      errors.push(`${p.model}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

mkdirSync("public/images/people", { recursive: true });
const todo = people.filter((p) => !existsSync(`public${p.file}`));
const total = todo.length;
const failed: string[] = [];
let done = 0;

async function worker() {
  for (let p = todo.shift(); p; p = todo.shift()) {
    try {
      const raw = await generate(prompt(p)).catch(() => generate(prompt(p))); // one retry: a refusal or a timeout
      await sharp(raw).resize(SIZE, SIZE, { fit: "cover", position: sharp.strategy.attention }).webp({ quality: 80 }).toFile(`public${p.file}`);
      console.log(`${++done}/${total} ${p.file} ${p.name}`);
    } catch (e) {
      failed.push(p.file);
      console.warn(`failed ${p.file} ${p.name}: ${(e as Error).message}`);
    }
  }
}

console.log(`${people.length - total} already there, ${total} to make`);
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(failed.length ? `failed (rerun to retry): ${failed.join(", ")}` : "all done");
