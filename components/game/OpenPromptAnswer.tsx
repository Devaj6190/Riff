"use client";

import { useState } from "react";
import type { MechanicAnswerProps } from "./mechanicAnswers";

/** Text answer for an open prompt. Other mechanics swap in through `mechanicAnswers`. */
export function OpenPromptAnswer({ round, submitted, busy, error, onSubmit }: MechanicAnswerProps) {
  const [text, setText] = useState("");
  if (round.mechanic !== "open_prompt") return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    await onSubmit({ text: body });
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-xl font-semibold">{round.payload.prompt}</p>
      </div>
      {submitted ? (
        <p className="border-t border-current/10 px-4 py-4 text-sm">Answer in. Waiting for the round to finish.</p>
      ) : (
        <form onSubmit={send} className="flex gap-2 border-t border-current/10 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Your answer"
            aria-label="Your answer"
            className="h-11 min-w-0 flex-1 rounded-full border border-current/20 bg-transparent px-4"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="h-11 rounded-full bg-foreground px-5 font-semibold text-background disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
      )}
      {error && !submitted && <p className="px-4 pb-3 text-sm text-red-500">{error}</p>}
    </>
  );
}
