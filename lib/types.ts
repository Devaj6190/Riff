// Shared contracts. Mirrors supabase/migrations. Changes only on `main`.

export type Seat = "A" | "B";

export type GamePhase = "lobby" | "round_active" | "round_result" | "talk_window" | "countdown" | "ended";

export type Mechanic = "open_prompt" | "two_truths" | "image" | "pick" | "voice" | "meme_audio";

export type Tone = "fun" | "deep" | "know";

export type Depth = 1 | 2 | 3;

// DB rows ---------------------------------------------------------------------

export type Riff = {
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

type RoundBase = {
  id: string;
  riff_id: string;
  number: number;
  depth: Depth;
  is_bonus: boolean;
  bonus_seat: Seat | null;
  starts_at: string;
  ends_at: string;
};

/** A round; narrowing on `mechanic` narrows `payload`. */
export type Round = { [M in Mechanic]: RoundBase & { mechanic: M; payload: RoundPayloads[M] } }[Mechanic];

export type Answer<M extends Mechanic = Mechanic> = {
  id: string;
  riff_id: string;
  round_id: string;
  player_id: string;
  payload: AnswerPayloads[M];
  submitted_at: string;
};

export type Score = {
  id: string;
  riff_id: string;
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

// Round + answer payloads (rounds.payload / answers.payload) -------------------
// Engine writes round payloads, UI renders them and writes answer payloads. Answer keys never go in a round payload.

export type TwoTruthsStatements = [string, string, string];
export type PickOption = { label: string; imageUrl?: string };

export type RoundPayloads = {
  open_prompt: { prompt: string };
  // Two rounds: both write, then both guess. The guess round shows statements only; lies stay in the write answers.
  // ponytail: write answers become readable once that round ends, so a devtools user could peek. Fine for a demo.
  two_truths: { stage: "write"; prompt: string } | { stage: "guess"; statements: Record<Seat, TwoTruthsStatements> };
  image: { prompt: string; imageUrl: string };
  pick: { prompt: string; options: PickOption[] }; // 4 options
  voice: { prompt: string };
  meme_audio: { prompt: string; clipId: string; clipUrl: string }; // the answer lives in clips.json, looked up by clipId
};

export type AnswerPayloads = {
  open_prompt: { text: string };
  two_truths: { statements: TwoTruthsStatements; lieIndex: 0 | 1 | 2 } | { guess: 0 | 1 | 2 };
  image: { text: string };
  pick: { choice: number }; // index into options
  voice: { transcript: string; audioPath?: string }; // audioPath (Supabase Storage) is absent when typed instead
  meme_audio: { guess: string; reaction: string };
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
