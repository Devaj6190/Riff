// Shared contracts. Mirrors supabase/migrations. Changes only on `main`.

export type Seat = "A" | "B";

export type GamePhase = "lobby" | "round_active" | "round_result" | "talk_window" | "countdown" | "ended";

export type Mechanic = "open_prompt" | "two_truths" | "image" | "pick" | "voice" | "meme_audio";

export type Tone = "fun" | "deep" | "know";

export type Depth = 1 | 2 | 3;

// DB rows ---------------------------------------------------------------------

export type Room = {
  id: string;
  code: string;
  phase: GamePhase;
  phase_ends_at: string | null;
  round_number: number;
  target_score: number;
  created_at: string;
  ended_at: string | null;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string;
  seat: Seat;
  name: string;
  interests: string[];
  extracted_interests: string[];
  joined_at: string;
};

export type Message = {
  id: number;
  room_id: string;
  player_id: string;
  body: string;
  created_at: string;
};

export type Round = {
  id: string;
  room_id: string;
  number: number;
  mechanic: Mechanic;
  depth: Depth;
  is_bonus: boolean;
  bonus_seat: Seat | null;
  payload: Record<string, unknown>; // shape depends on mechanic
  starts_at: string;
  ends_at: string;
};

export type Answer = {
  id: string;
  room_id: string;
  round_id: string;
  player_id: string;
  payload: Record<string, unknown>;
  submitted_at: string;
};

export type Score = {
  id: string;
  room_id: string;
  round_id: string;
  player_id: string;
  kind: "round" | "talk";
  speed: number; // 0–5
  quality: number; // 0–10
  connection: number; // 0–5
  multiplier: 1 | 2;
  total: number; // (speed + quality + connection) * multiplier, computed by the DB
  reason: string | null;
  created_at: string;
};

// Game content ----------------------------------------------------------------

/** A round template (SPEC §4.1). The AI picks one and rewrites it for the pair. */
export type Template = {
  id: string;
  mechanic: Mechanic;
  tone: Tone;
  depth: Depth;
  seed: string;
  tags: string[];
};

/** What /api/judge returns (SPEC §6). */
export type JudgeResult = Record<Seat, { quality: number; connection: number; reason: string }> & {
  new_interests: Partial<Record<Seat, string[]>>;
};
