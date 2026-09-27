// Mini games (SPEC §4.1, §4.3), the parts shared by the app and the server: who still has to play a stage, and the
// scoring rules. The server side (plays, stages, scoring) is lib/engine/games.ts.
import type { Nudge, NudgePayloads, PickPlay, Seat, TruthsPlay } from "./types";

export type GameNudge = Extract<Nudge, { kind: "pick" | "truths" }>;
export type GamePayload = NudgePayloads["pick" | "truths"];

export const isGame = (n: Pick<Nudge, "kind">): n is GameNudge => n.kind === "pick" || n.kind === "truths";

export const STATEMENT_MAX = 80;

export const other = (seat: Seat): Seat => (seat === "A" ? "B" : "A");

/** Seats that play this stage: both, except the guess stage, where only those whose partner wrote statements. */
export function playsStage(p: GamePayload, seats: Seat[]): Seat[] {
  return p.stage === "guess" && "statements" in p ? seats.filter((s) => p.statements?.[other(s)]?.length) : seats;
}

type Points = { quality: number; connection: number };

/** Guess their pick: playing = quality 5; guessing the partner's pick right = +5 quality and connection 5. */
export function pickPoints(plays: Partial<Record<Seat, PickPlay>>): Partial<Record<Seat, Points>> {
  const out: Partial<Record<Seat, Points>> = {};
  for (const seat of ["A", "B"] as Seat[]) {
    const mine = plays[seat];
    if (!mine) continue;
    const knew = plays[other(seat)]?.pick === mine.guess;
    out[seat] = { quality: knew ? 10 : 5, connection: knew ? 5 : 0 };
  }
  return out;
}

/** Two truths and a lie: writing all 3 = quality 5; fooling the partner = +5 quality; spotting their lie = connection 5. */
export function truthsPoints(plays: Partial<Record<Seat, TruthsPlay>>): Partial<Record<Seat, Points>> {
  const out: Partial<Record<Seat, Points>> = {};
  for (const seat of ["A", "B"] as Seat[]) {
    const mine = plays[seat];
    if (!mine) continue;
    const theirs = plays[other(seat)];
    const wrote = mine.statements?.length === 3 && mine.lie !== undefined;
    const fooled = wrote && theirs?.guess !== undefined && theirs.guess !== mine.lie;
    const spotted = mine.guess !== undefined && theirs?.lie === mine.guess;
    out[seat] = { quality: (wrote ? 5 : 0) + (fooled ? 5 : 0), connection: spotted ? 5 : 0 };
  }
  return out;
}
