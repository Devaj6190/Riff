// Drives one riff through a full round of the game clock against a running dev server and the real Supabase project.
// Usage: npm run dev -- -p 3001, then: node --env-file=.env.local scripts/advance-e2e.mts [baseUrl]
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3001";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function player() {
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInAnonymously();
  if (error) throw error;
  return { db, token: data.session!.access_token };
}

async function advance(riffId: string, token?: string) {
  const res = await fetch(`${base}/api/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ riffId }),
  });
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
}

async function riffOf(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("riffs").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

/** Wait out the current phase's deadline, then advance and expect `phase`. */
async function expireInto(db: SupabaseClient, riffId: string, token: string, phase: string) {
  const r = await riffOf(db, riffId);
  assert.ok(r.phase_ends_at, `${r.phase} has a deadline`);
  assert.deepEqual((await advance(riffId, token)).body, { phase: r.phase, advanced: false }, "early call is a no-op");
  await new Promise((ok) => setTimeout(ok, Math.max(0, new Date(r.phase_ends_at).getTime() - Date.now()) + 300));
  assert.deepEqual((await advance(riffId, token)).body, { phase, advanced: true });
  console.log(`✓ ${r.phase} → ${phase} on its deadline`);
}

const a = await player();
const b = await player();
const outsider = await player();

const { data: code, error } = await a.db.rpc("create_riff", { p_name: "Ana", p_interests: ["music"] });
if (error) throw error;
const riffId = (await a.db.from("riffs").select("id").eq("code", code).single()).data!.id as string;
console.log(`riff ${code} (${riffId})`);

assert.equal((await advance(riffId)).status, 401);
assert.equal((await advance(riffId, outsider.token)).status, 403);
console.log("✓ no token → 401, non-member → 403");

assert.deepEqual((await advance(riffId, a.token)).body, { phase: "lobby", advanced: false });
console.log("✓ lobby waits for the second seat");

const joined = await b.db.rpc("join_riff", { p_code: code, p_name: "Ben", p_interests: ["chess"] });
if (joined.error) throw joined.error;

const both = await Promise.all([advance(riffId, a.token), advance(riffId, b.token)]);
assert.deepEqual(both.map((r) => r.body.advanced).sort(), [false, true], "exactly one concurrent call wins");
const started = await riffOf(a.db, riffId);
assert.equal(started.phase, "round_active");
const { data: round } = await a.db.from("rounds").select("*").eq("riff_id", riffId).eq("number", 1).single();
assert.equal(+new Date(round.ends_at), +new Date(started.phase_ends_at), "round and riff share the deadline");
const secs = (+new Date(round.ends_at) - Date.now()) / 1000;
assert.ok(secs > 25 && secs <= 30, `open prompt timer ~30 s (got ${secs})`);
console.log("✓ both seated → round 1 starts with a 30 s timer; the duplicate call was a no-op");

const { data: seats } = await a.db.from("players").select("id, user_id").eq("riff_id", riffId);
for (const p of [a, b]) {
  const { data: user } = await p.db.auth.getUser();
  const me = seats!.find((s) => s.user_id === user.user!.id)!;
  const ins = await p.db.from("answers").insert({ riff_id: riffId, round_id: round.id, player_id: me.id, payload: { text: "hi" } });
  if (ins.error) throw ins.error;
  if (p === a) assert.deepEqual((await advance(riffId, a.token)).body, { phase: "round_active", advanced: false });
}
assert.deepEqual((await advance(riffId, a.token)).body, { phase: "round_result", advanced: true });
console.log("✓ round ends early once both players answer");

await expireInto(a.db, riffId, a.token, "talk_window");
await expireInto(b.db, riffId, b.token, "countdown");
await expireInto(a.db, riffId, a.token, "round_active");
const next = await riffOf(a.db, riffId);
assert.equal(next.round_number, 2);
assert.ok((await a.db.from("rounds").select("id").eq("riff_id", riffId).eq("number", 2).single()).data);
console.log("✓ countdown → round 2 is live. Full loop passed.");
