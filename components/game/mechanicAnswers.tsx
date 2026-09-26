"use client";

import type { ComponentType } from "react";
import type { Answer, Mechanic, Round, Seat } from "@/lib/types";
import { OpenPromptAnswer } from "./OpenPromptAnswer";
import { PickAnswer } from "./PickAnswer";
import { TwoTruthsAnswer } from "./TwoTruthsAnswer";

/** What the round screen passes into whichever mechanic is active. */
export type MechanicAnswerProps = {
  round: Round;
  seat: Seat; // the viewing player's seat
  submitted: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: Answer["payload"]) => Promise<void>;
};

const LABELS: Record<Mechanic, string> = {
  open_prompt: "Open prompt",
  two_truths: "Two truths and a lie",
  image: "Image",
  pick: "Pick",
  voice: "Voice note",
  meme_audio: "Meme audio",
};

/** Placeholder until that mechanic's answer UI lands. The screen never branches on mechanic. */
function PendingMechanic({ round }: MechanicAnswerProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-2 px-4 pb-6">
      <p className="text-sm opacity-60">{LABELS[round.mechanic]}</p>
      <p>This round type plugs in here.</p>
    </div>
  );
}

export const mechanicAnswers: Record<Mechanic, ComponentType<MechanicAnswerProps>> = {
  open_prompt: OpenPromptAnswer,
  two_truths: TwoTruthsAnswer,
  image: PendingMechanic,
  pick: PickAnswer,
  voice: PendingMechanic,
  meme_audio: PendingMechanic,
};
