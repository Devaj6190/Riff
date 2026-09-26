// The game clock (SPEC §6 Game state): lobby → round_active → round_result → talk_window → countdown → round_active …
// Pure: /api/advance loads the riff, asks nextPhase() where it goes, and writes it with a conditional update.
import type { GamePhase, Mechanic } from "@/lib/types";

/** Round timers, SPEC §4.6. Image rounds are a text answer, so they get the text timer. */
const ROUND_SECONDS: Record<Mechanic, number> = {
  open_prompt: 30,
  two_truths: 45,
  image: 30,
  pick: 20,
  voice: 45,
  meme_audio: 20,
};

// ponytail: talk window is the fixed 20 s minimum; extension rules land with /api/talk (#5).
const PHASE_SECONDS = { round_result: 6, talk_window: 20, countdown: 5 };

const AFTER: Partial<Record<GamePhase, GamePhase>> = {
  round_active: "round_result",
  round_result: "talk_window",
  talk_window: "countdown",
  countdown: "round_active",
};

export type ClockState = {
  phase: GamePhase;
  phaseEndsAt: Date | null;
  seats: number; // players seated
  answers: number; // answers to the current round
};

/** The phase to move to now, or null if the riff should stay put. */
export function nextPhase(s: ClockState, now: Date): GamePhase | null {
  if (s.phase === "lobby") return s.seats >= 2 ? "round_active" : null;
  const next = AFTER[s.phase];
  if (!next) return null;
  const expired = !s.phaseEndsAt || now >= s.phaseEndsAt;
  const allAnswered = s.phase === "round_active" && s.answers >= 2;
  return expired || allAnswered ? next : null;
}

/** How long `phase` lasts; `mechanic` is the round's, used for round_active. */
export function phaseSeconds(phase: GamePhase, mechanic: Mechanic = "open_prompt"): number {
  if (phase === "round_active") return ROUND_SECONDS[mechanic];
  return PHASE_SECONDS[phase as keyof typeof PHASE_SECONDS];
}
