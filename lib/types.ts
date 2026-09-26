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
  for_seat: Seat | null; // bonus mode: the trailing player this nudge leans toward. Null = neither.
  created_at: string; // when it popped up
  ends_at: string; // its countdown: what each player texts before this is their answer
  scored_at: string | null; // set once the answers are scored, when the timer runs out
};

/**
 * An AI pop-up at the top of the chat with a countdown. Players answer by chatting before `ends_at`.
 * Narrowing on `kind` narrows `payload`.
 */
export type Nudge = { [K in NudgeKind]: NudgeBase & { kind: K; payload: NudgePayloads[K] } }[NudgeKind];

/** A nudge written ahead of time (server-only table), shown when its number comes up. */
export type QueuedNudge = {
  [K in NudgeKind]: Omit<NudgeBase, "number" | "ends_at" | "scored_at"> & { for_number: number; kind: K; payload: NudgePayloads[K] };
}[NudgeKind];

/** One player's points for answering one nudge. Players who didn't answer get no row. */
export type Score = {
  id: string;
  riff_id: string;
  nudge_id: string;
  player_id: string;
  speed: number; // 0–5, how fast their first message came after the nudge popped up
  quality: number; // 0–10
  connection: number; // 0–5, ties to the partner and to earlier messages
  total: number; // speed + quality + connection, computed by the DB
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
/** Test mode: seat the AI as player B in the caller's riff. */
export type BotRequest = { code: string };
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

/** What the scorer returns for one nudge's answers (SPEC §6). Speed is computed in code. */
export type ScoreResult = Record<Seat, { quality: number; connection: number }> & {
  new_interests: Partial<Record<Seat, string[]>>;
};
