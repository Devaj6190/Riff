// Shared contracts. Mirrors supabase/migrations. Changes only on `main`.

export type Seat = "A" | "B";

export type RiffPhase = "lobby" | "chatting" | "ended";

export type NudgeKind = "text" | "image" | "audio";

export type Tone = "fun" | "deep" | "know";

export type Depth = 1 | 2 | 3;

// DB rows ---------------------------------------------------------------------

export type Riff = {
  id: string;
  code: string;
  phase: RiffPhase; // lobby until the second player joins; ended by score or by a player, chat stays open
  target_score: number;
  created_at: string;
  ended_at: string | null;
  summary: RiffSummary | null; // written by the engine when the riff ends
  reported_at: string | null;
};

export type RiffSummary = { superlatives: Record<Seat, string> };

export type Player = {
  id: string;
  riff_id: string;
  user_id: string;
  seat: Seat;
  name: string;
  interests: string[];
  extracted_interests: string[];
  joined_at: string;
};

export type Message = {
  id: number;
  riff_id: string;
  player_id: string;
  body: string;
  created_at: string;
};

type NudgeBase = {
  id: string;
  riff_id: string;
  number: number; // 1, 2, 3… in the order shown
  depth: Depth;
  is_bonus: boolean;
  for_seat: Seat | null; // Bonus nudge: whose turf. Null = both players.
  created_at: string; // when it popped up
};

/** An AI pop-up at the top of the chat. Players respond by chatting. Narrowing on `kind` narrows `payload`. */
export type Nudge = { [K in NudgeKind]: NudgeBase & { kind: K; payload: NudgePayloads[K] } }[NudgeKind];

/** A nudge written ahead of time (server-only table), shown when its number comes up. */
export type QueuedNudge = {
  [K in NudgeKind]: Omit<NudgeBase, "number"> & { for_number: number; kind: K; payload: NudgePayloads[K] };
}[NudgeKind];

/** Hidden score for the chat after a nudge, up to the next one. */
export type Score = {
  id: string;
  riff_id: string;
  nudge_id: string;
  player_id: string;
  quality: number; // 0–10
  connection: number; // 0–5
  multiplier: 1 | 2;
  total: number; // (quality + connection) * multiplier, computed by the DB
  reason: string | null;
  created_at: string;
};

export type NudgePayloads = {
  text: { prompt: string };
  image: { prompt: string; imageUrl: string };
  audio: { prompt: string; clipId: string; clipUrl: string }; // the answer lives in clips.json, looked up by clipId
};

/** An entry in clips.json (SPEC §6). */
export type Clip = {
  id: string;
  file: string; // path under /public/clips
  tags: string[];
  answer: string;
  license: string;
  sourceUrl: string;
};

// API contracts ---------------------------------------------------------------
// Every route takes JSON (except /api/transcribe) plus `Authorization: Bearer <supabase access token>`.
// Call them with callApi() from lib/api.ts; guard them with requirePlayer() from lib/supabase/auth.ts.

/** POST /api/tick: call every few seconds while chatting. Shows the next nudge if it's time. Idempotent. */
export type TickRequest = { riffId: string };
export type TickResponse = { phase: RiffPhase; nudged: boolean };

/** POST /api/end: end the riff now, or start a new match in it (chat is kept). */
export type EndRequest = { riffId: string; action: "end" | "restart" };
export type EndResponse = { phase: RiffPhase };

/** POST /api/image: generate one image (Muse Image, then Grok Imagine), falling back to the pre-generated pool. */
export type ImageRequest = { riffId: string; prompt: string; tags: string[] };
export type ImageResponse = { url: string; fromPool: boolean };

/** POST /api/transcribe: multipart form with `riffId` and `audio` (a file). */
export type TranscribeResponse = { transcript: string };

// Game content ----------------------------------------------------------------

/** A nudge template (SPEC §4.1). The AI picks one and rewrites it for the pair. */
export type Template = {
  id: string;
  kind: NudgeKind;
  tone: Tone;
  depth: Depth;
  seed: string;
  tags: string[];
};

/** What the scorer returns for one stretch of chat (SPEC §6). */
export type ScoreResult = Record<Seat, { quality: number; connection: number; reason: string }> & {
  new_interests: Partial<Record<Seat, string[]>>;
};
