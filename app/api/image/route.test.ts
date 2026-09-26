import { afterEach, expect, test, vi } from "vitest";
import { POST } from "./route";
import { poolImage } from "./generate";
import pool from "./pool.json";
import { readFileSync } from "node:fs";

const { requirePlayer } = vi.hoisted(() => ({ requirePlayer: vi.fn() }));
vi.mock("../../../lib/supabase/auth", () => ({ requirePlayer }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); requirePlayer.mockReset(); });

function request() {
  return new Request("http://localhost:3003/api/image", {
    method: "POST", body: JSON.stringify({ riffId: "riff-1", prompt: "A dream trip", tags: ["travel"] }),
  });
}

test("rejects a non-player before spending on image generation", async () => {
  requirePlayer.mockRejectedValue(new Response("Not a player in this riff", { status: 403 }));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await POST(request())).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

test("returns the generated image for an authenticated player", async () => {
  requirePlayer.mockResolvedValue({ id: "player-1" });
  vi.stubEnv("XAI_API_KEY", "test-key");
  const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ url: "https://imgen.x.ai/scene.jpg" }] }));
  vi.stubGlobal("fetch", fetch);
  expect(await (await POST(request())).json()).toEqual({ url: "https://imgen.x.ai/scene.jpg", fromPool: false });
  expect(requirePlayer).toHaveBeenCalledWith(expect.any(Request), "riff-1");
  expect(fetch).toHaveBeenCalledWith("https://api.x.ai/v1/images/generations", expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
  }));
});

test("a stalled generation is aborted after five seconds and returns a matching pool image", async () => {
  vi.useFakeTimers();
  requirePlayer.mockResolvedValue({ id: "player-1" });
  vi.stubEnv("XAI_API_KEY", "test-key");
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  }));
  const pending = POST(request());
  await vi.advanceTimersByTimeAsync(5000);
  expect(await (await pending).json()).toEqual({ url: "/images/pool/mountain-retreat.jpg", fromPool: true });
  expect(signal?.aborted).toBe(true);
});

test.each(["{", "null", JSON.stringify({ riffId: "riff-1", prompt: "", tags: [] }),
  JSON.stringify({ riffId: "riff-1", prompt: "A scene", tags: [42] })])("invalid input returns 400 without generating: %s", async (body) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await POST(new Request("http://localhost:3003/api/image", { method: "POST", body }))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

test.each([503, 429, 401])("provider HTTP %s falls back to a tagged image", async (status) => {
  vi.stubEnv("XAI_API_KEY", "test-key");
  requirePlayer.mockResolvedValue({ id: "player-1" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status })));
  expect(await (await POST(request())).json()).toEqual({ url: "/images/pool/mountain-retreat.jpg", fromPool: true });
});

test.each([{}, { data: [] }, { data: [{ url: "javascript:alert(1)" }] }, { data: [{ url: "broken" }] }])("malformed provider output uses the pool: %j", async (body) => {
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  expect((await (await POST(request())).json()).fromPool).toBe(true);
});

test("network failures use the pool", async () => {
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
  expect((await (await POST(request())).json()).fromPool).toBe(true);
});

test("missing API credentials use the pool without a network call", async () => {
  vi.stubEnv("XAI_API_KEY", "");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await (await POST(request())).json()).fromPool).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

test("deadline includes reading a stalled response body", async () => {
  vi.useFakeTimers();
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
  const pending = POST(request());
  await vi.advanceTimersByTimeAsync(5000);
  expect((await (await pending).json()).fromPool).toBe(true);
});

test("tag matching normalizes input and prefers maximum overlap", () => {
  expect(poolImage([" MUSIC ", "Art", "travel", "travel"]).url).toBe("/images/pool/rooftop-jam.jpg");
  for (const tags of [[], ["unlisted interest"]]) {
    expect(pool.map((image) => image.url)).toContain(poolImage(tags).url);
  }
});

test("every starter pool entry has tags and a checked-in JPEG", () => {
  expect(pool.length).toBeGreaterThanOrEqual(4);
  for (const entry of pool) {
    expect(entry.tags.length).toBeGreaterThan(0);
    const bytes = readFileSync(`public${entry.url}`);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(bytes.length).toBeGreaterThan(10000);
  }
});
