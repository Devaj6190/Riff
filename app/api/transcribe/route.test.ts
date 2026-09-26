import { afterEach, expect, test, vi } from "vitest";
import { POST } from "./route";

const { requirePlayer } = vi.hoisted(() => ({ requirePlayer: vi.fn() }));
vi.mock("../../../lib/supabase/auth", () => ({ requirePlayer }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); requirePlayer.mockReset(); });

function request(audio = new File([new Uint8Array([1, 2, 3])], "answer.webm", { type: "audio/webm" })) {
  const body = new FormData();
  body.set("riffId", "riff-1");
  body.set("audio", audio);
  return new Request("http://localhost:3003/api/transcribe", { method: "POST", body });
}

test("guards transcription with riff membership before calling Grok", async () => {
  requirePlayer.mockRejectedValue(new Response("Not a player in this riff", { status: 403 }));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await POST(request())).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

test("sends audio to Grok STT and returns its transcript", async () => {
  requirePlayer.mockResolvedValue({ id: "player-1" });
  vi.stubEnv("XAI_API_KEY", "test-key");
  const fetch = vi.fn().mockResolvedValue(Response.json({ text: "  Take me to the mountains.  " }));
  vi.stubGlobal("fetch", fetch);
  expect(await (await POST(request())).json()).toEqual({ transcript: "Take me to the mountains." });
  expect(requirePlayer).toHaveBeenCalledWith(expect.any(Request), "riff-1");
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("https://api.x.ai/v1/stt");
  expect(init.headers.Authorization).toBe("Bearer test-key");
  expect([...init.body.keys()]).toEqual(["model", "file"]);
  expect(init.body.get("model")).toBe("grok-voice-transcribe-2.0");
});

test.each([
  [new File([], "empty.webm", { type: "audio/webm" }), 400],
  [new File(["not audio"], "note.txt", { type: "text/plain" }), 400],
  [new File([new Uint8Array(12 * 1024 * 1024 + 1)], "large.webm", { type: "audio/webm" }), 400],
])("rejects invalid audio without an upstream call", async (audio, status) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await POST(request(audio))).status).toBe(status);
  expect(fetch).not.toHaveBeenCalled();
});

test("fails cleanly when Grok rejects audio", async () => {
  requirePlayer.mockResolvedValue({ id: "player-1" });
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unsupported", { status: 415 })));
  expect((await POST(request())).status).toBe(502);
});

test("empty transcription asks the player to type", async () => {
  requirePlayer.mockResolvedValue({ id: "player-1" });
  vi.stubEnv("XAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ text: "  " })));
  expect((await POST(request())).status).toBe(422);
});

test("a missing key fails after the player guard", async () => {
  requirePlayer.mockResolvedValue({ id: "player-1" });
  vi.stubEnv("XAI_API_KEY", "");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await POST(request())).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
