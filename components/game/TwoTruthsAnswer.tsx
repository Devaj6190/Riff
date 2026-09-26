"use client";

import { useState } from "react";
import type { TwoTruthsStatements } from "@/lib/types";
import type { MechanicAnswerProps } from "./mechanicAnswers";

const LIE_INDEXES = [0, 1, 2] as const;

/** Write stage: three statements + mark the lie. Guess stage: tap the partner's lie. */
export function TwoTruthsAnswer({ round, seat, submitted, busy, error, onSubmit }: MechanicAnswerProps) {
  const [statements, setStatements] = useState<TwoTruthsStatements>(["", "", ""]);
  const [lie, setLie] = useState<0 | 1 | 2 | null>(null);
  const [guess, setGuess] = useState<0 | 1 | 2 | null>(null);
  if (round.mechanic !== "two_truths") return null;
  const payload = round.payload;

  if (payload.stage === "guess") {
    const theirs = payload.statements[seat === "A" ? "B" : "A"];
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <p className="text-xl font-semibold">Which one is the lie?</p>
        {LIE_INDEXES.map((i) => (
          <button
            key={i}
            type="button"
            onClick={async () => {
              if (submitted || busy) return;
              setGuess(i);
              await onSubmit({ guess: i });
            }}
            disabled={(submitted || busy) && guess !== i}
            aria-pressed={guess === i}
            className={`min-h-14 rounded-2xl border-2 p-4 text-left disabled:opacity-40 ${guess === i ? "border-foreground" : "border-current/15"}`}
          >
            {theirs[i]}
          </button>
        ))}
        {submitted && <p className="text-sm opacity-70">Guess locked in.</p>}
        {error && !submitted && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  const ready = lie !== null && statements.every((s) => s.trim());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || lie === null) return;
        await onSubmit({ statements: statements.map((s) => s.trim()) as TwoTruthsStatements, lieIndex: lie });
      }}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4"
    >
      <p className="text-xl font-semibold">{payload.prompt}</p>
      <p className="text-sm opacity-70">Two truths, one lie. Tap “lie” on the fake one.</p>
      {LIE_INDEXES.map((i) => (
        <div key={i} className="flex gap-2">
          <input
            value={statements[i]}
            onChange={(e) => setStatements((prev) => prev.map((s, j) => (j === i ? e.target.value : s)) as TwoTruthsStatements)}
            maxLength={140}
            disabled={submitted}
            aria-label={`Statement ${i + 1}`}
            placeholder={`Statement ${i + 1}`}
            className="h-11 min-w-0 flex-1 rounded-lg border border-current/20 bg-transparent px-3"
          />
          <button
            type="button"
            onClick={() => setLie(i)}
            disabled={submitted}
            aria-pressed={lie === i}
            className={`h-11 rounded-lg border px-3 text-sm ${lie === i ? "border-transparent bg-foreground text-background" : "border-current/20"}`}
          >
            lie
          </button>
        </div>
      ))}
      {submitted ? (
        <p className="text-sm opacity-70">Locked in. Waiting for your partner.</p>
      ) : (
        <button type="submit" disabled={!ready || busy} className="h-12 rounded-full bg-foreground font-semibold text-background disabled:opacity-40">
          {busy ? "…" : "Lock it in"}
        </button>
      )}
      {error && !submitted && <p className="text-sm text-red-500">{error}</p>}
    </form>
  );
}
