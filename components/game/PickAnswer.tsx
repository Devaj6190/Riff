"use client";

import { useState } from "react";
import type { MechanicAnswerProps } from "./mechanicAnswers";

/** Four big tap targets (image when the option has one). One tap submits. */
export function PickAnswer({ round, submitted, busy, error, onSubmit }: MechanicAnswerProps) {
  const [picked, setPicked] = useState<number | null>(null);
  if (round.mechanic !== "pick") return null;
  const locked = submitted || busy;

  async function pick(choice: number) {
    if (locked) return;
    setPicked(choice);
    await onSubmit({ choice });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
      <p className="text-xl font-semibold">{round.payload.prompt}</p>
      <div className="grid grid-cols-2 gap-3">
        {round.payload.options.map((option, i) => {
          const mine = picked === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
              disabled={locked && !mine}
              aria-pressed={mine}
              className={`relative flex min-h-24 flex-col overflow-hidden rounded-2xl border-2 text-left transition-opacity disabled:opacity-40 ${mine ? "border-primary" : "border-current/15"}`}
            >
              {option.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- remote/generated images of unknown size
                <img src={option.imageUrl} alt={option.label} className="aspect-square w-full object-cover" />
              )}
              <span className="p-3 font-semibold">{option.label}</span>
            </button>
          );
        })}
      </div>
      {submitted && <p className="text-sm opacity-70">Locked in. Waiting for the round to finish.</p>}
      {error && !submitted && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
