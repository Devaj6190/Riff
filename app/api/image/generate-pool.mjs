// Run explicitly: node --env-file=.env.local app/api/image/generate-pool.mjs
// Makes four paid Grok Imagine calls and records latency without logging credentials.
import { mkdir, writeFile } from "node:fs/promises";

const scenes = [
  { id: "mountain-retreat", tags: ["travel", "outdoors", "fitness", "sports"], prompt: "A dream mountain retreat with a lakeside cabin, hammock, hiking trail and a canoe. Warm sunrise, playful editorial illustration." },
  { id: "arcade-cafe", tags: ["gaming", "anime", "tech", "memes"], prompt: "A whimsical cozy arcade cafe with retro game consoles, a friendly little robot and colorful neon lights. Playful editorial illustration." },
  { id: "rooftop-jam", tags: ["music", "art", "fashion"], prompt: "A colorful rooftop hangout with acoustic guitars, a keyboard, murals and bright beanbags under fairy lights. Playful editorial illustration." },
  { id: "reading-picnic", tags: ["books", "food", "movies"], prompt: "A cozy garden picnic with books, pastries, tea and an outdoor movie screen under a leafy canopy. Playful editorial illustration." },
];
if (!process.env.XAI_API_KEY) throw new Error("XAI_API_KEY is required");
await mkdir("public/images/pool", { recursive: true });
const manifest = [];
for (const scene of scenes) {
  const start = performance.now();
  const response = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "grok-imagine-image-2.0", prompt: `${scene.prompt} Safe for all ages, no violence, no nudity, no text.`, n: 1, response_format: "b64_json" }),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  const latencyMs = Math.round(performance.now() - start);
  if (!response.ok || !result.data?.[0]?.b64_json) throw new Error(`Grok failed: HTTP ${response.status}, ${latencyMs}ms`);
  await writeFile(`public/images/pool/${scene.id}.jpg`, Buffer.from(result.data[0].b64_json, "base64"));
  manifest.push({ ...scene, url: `/images/pool/${scene.id}.jpg`, model: "grok-imagine-image-2.0", latencyMs });
  console.log(JSON.stringify({ id: scene.id, latencyMs }));
}
await writeFile("app/api/image/pool.json", JSON.stringify(manifest, null, 2) + "\n");
