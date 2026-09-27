"use client";

import { Check, Lock, X } from "lucide-react";
import { useState } from "react";
import { callApi } from "@/lib/api";
import { other, STATEMENT_MAX, type GameNudge } from "@/lib/games";
import type { NudgePayloads, Player, PlayRequest, PlayResponse } from "@/lib/types";

const OPTION = "min-h-11 rounded-2xl bg-background/70 px-3 py-2 text-left text-sm font-semibold ring-1 ring-current/10 transition active:scale-[0.98] disabled:opacity-50";
const LABEL = "mb-2 text-xs font-semibold text-foreground/60";

type Send = (req: PlayRequest) => Promise<void>;
type Seats = { me: Player; them: string; mine: "A" | "B"; theirs: "A" | "B" };

/**
 * A mini game on the live nudge card (SPEC §4.1): tap through each stage, then the reveal. Taps go to /api/play;
 * the stage, who's locked in and the reveal come back on the nudge row.
 */
export function MiniGame({ nudge, me, partner }: { nudge: GameNudge; me: Player; partner?: Player }) {
  const [sent, setSent] = useState<string | null>(null); // the stage I locked in, before the row catches up
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = nudge.payload;
  const seats: Seats = { me, them: partner?.name ?? "them", mine: me.seat, theirs: other(me.seat) };
  const lockedIn = sent === p.stage || p.locked.includes(me.seat);

  const send: Send = async (req) => {
    setBusy(true);
    setError(null);
    try {
      await callApi<PlayResponse>("/api/play", req);
      setSent(req.stage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setBusy(false);
    }
  };

  const base = { riffId: nudge.riff_id, nudgeId: nudge.id };
  return (
    <div className="mt-3">
      {nudge.kind === "pick" ? (
        <PickGame p={nudge.payload} s={seats} lockedIn={lockedIn} busy={busy} onPick={(pick, guess) => send({ ...base, stage: "play", pick, guess })} />
      ) : (
        <TruthsGame
          p={nudge.payload}
          s={seats}
          lockedIn={lockedIn}
          busy={busy}
          onWrite={(statements, lie) => send({ ...base, stage: "write", statements, lie })}
          onGuess={(guess) => send({ ...base, stage: "guess", guess })}
        />
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Waiting({ s, partnerDone }: { s: Seats; partnerDone: boolean }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground/70">
      <Lock className="size-4 text-primary" aria-hidden />
      Locked in. {partnerDone ? "Revealing…" : `Waiting for ${s.them}…`}
    </p>
  );
}

function PartnerDone({ s, done }: { s: Seats; done: boolean }) {
  return done ? <p className="mt-2 text-xs text-foreground/50">{s.them} locked in</p> : null;
}

function PickGame({ p, s, lockedIn, busy, onPick }: { p: NudgePayloads["pick"]; s: Seats; lockedIn: boolean; busy: boolean; onPick: (pick: number, guess: number) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const partnerDone = p.locked.includes(s.theirs);

  if (p.stage === "reveal") {
    const mine = p.reveal?.[s.mine];
    const theirs = p.reveal?.[s.theirs];
    const opt = (i?: number) => (i === undefined ? "" : p.options[i]);
    const lines = [
      mine && theirs && mine.pick === theirs.pick && `You both picked ${opt(mine.pick)}`,
      mine && theirs && (mine.guess === theirs.pick ? `You knew ${s.them} would pick ${opt(theirs.pick)}` : `${s.them} picked ${opt(theirs.pick)}, you guessed ${opt(mine.guess)}`),
      mine && theirs && (theirs.guess === mine.pick ? `${s.them} read you right` : `${s.them} guessed ${opt(theirs.guess)} for you`),
      !mine && "You didn't pick in time",
      !theirs && `${s.them} didn't pick in time`,
    ].filter(Boolean);
    return (
      <div className="grid gap-1 text-sm">
        {lines.map((l) => (
          <p key={l as string} className="font-semibold">
            {l}
          </p>
        ))}
      </div>
    );
  }
  if (lockedIn) return <Waiting s={s} partnerDone={partnerDone} />;
  return (
    <div>
      <p className={LABEL}>{pick === null ? "Your pick" : `Now guess: what did ${s.them} pick?`}</p>
      <div className="grid grid-cols-2 gap-2">
        {p.options.map((o, i) => (
          <button key={i} type="button" disabled={busy} onClick={() => (pick === null ? setPick(i) : onPick(pick, i))} className={OPTION}>
            {o}
          </button>
        ))}
      </div>
      {pick !== null && (
        <button type="button" onClick={() => setPick(null)} className="mt-2 min-h-8 text-xs text-foreground/50">
          You picked {p.options[pick]} · change
        </button>
      )}
      <PartnerDone s={s} done={partnerDone} />
    </div>
  );
}

function TruthsGame({
  p,
  s,
  lockedIn,
  busy,
  onWrite,
  onGuess,
}: {
  p: NudgePayloads["truths"];
  s: Seats;
  lockedIn: boolean;
  busy: boolean;
  onWrite: (statements: string[], lie: number) => void;
  onGuess: (guess: number) => void;
}) {
  const [lines, setLines] = useState(["", "", ""]);
  const [lie, setLie] = useState<number | null>(null);
  const partnerDone = p.locked.includes(s.theirs);
  const theirStatements = p.statements?.[s.theirs];

  if (p.stage === "reveal") {
    const mine = p.reveal?.[s.mine];
    const theirs = p.reveal?.[s.theirs];
    return (
      <div className="grid gap-2 text-sm">
        {theirs?.statements && (
          <Statements
            title={`${s.them}'s`}
            statements={theirs.statements}
            lie={theirs.lie}
            note={mine?.guess === undefined ? undefined : mine.guess === theirs.lie ? "You spotted the lie" : `Fooled you: you guessed "${theirs.statements[mine.guess]}"`}
          />
        )}
        {mine?.statements && (
          <p className="font-semibold">
            {theirs?.guess === undefined ? `${s.them} didn't guess yours` : theirs.guess === mine.lie ? `${s.them} spotted your lie` : `You fooled ${s.them}`}
          </p>
        )}
      </div>
    );
  }

  if (p.stage === "guess") {
    if (!theirStatements) return <p className="text-sm text-foreground/70">{s.them} didn&apos;t write any, so nothing to guess. They&apos;re guessing yours…</p>;
    if (lockedIn) return <Waiting s={s} partnerDone={partnerDone} />;
    return (
      <div>
        <p className={LABEL}>Which one is {s.them}&apos;s lie?</p>
        <div className="grid gap-2">
          {theirStatements.map((line, i) => (
            <button key={i} type="button" disabled={busy} onClick={() => onGuess(i)} className={OPTION}>
              {line}
            </button>
          ))}
        </div>
        <PartnerDone s={s} done={partnerDone} />
      </div>
    );
  }

  if (lockedIn) return <Waiting s={s} partnerDone={partnerDone} />;
  const ready = lines.every((l) => l.trim()) && lie !== null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onWrite(lines.map((l) => l.trim()), lie);
      }}
    >
      <p className={LABEL}>Write 3 things about you. Tap Lie on the fake one.</p>
      <div className="grid gap-2">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={line}
              maxLength={STATEMENT_MAX}
              onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))}
              placeholder={["I've been to 3 concerts this year", "I can't whistle", "I once met a celebrity"][i]}
              aria-label={`Statement ${i + 1}`}
              className="h-11 min-w-0 flex-1 rounded-2xl bg-background/70 px-3 text-base ring-1 ring-current/10 outline-none focus:ring-primary"
            />
            <button
              type="button"
              aria-pressed={lie === i}
              onClick={() => setLie(i)}
              className={`h-11 shrink-0 rounded-full px-3 text-xs font-semibold ring-1 ring-current/15 ${lie === i ? "bg-primary text-primary-foreground" : "text-foreground/60"}`}
            >
              Lie
            </button>
          </div>
        ))}
      </div>
      <button type="submit" disabled={!ready || busy} className="mt-3 h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40">
        Lock in
      </button>
      <PartnerDone s={s} done={partnerDone} />
    </form>
  );
}

function Statements({ title, statements, lie, note }: { title: string; statements: string[]; lie?: number; note?: string }) {
  return (
    <div>
      <p className={LABEL}>{title}</p>
      <ul className="grid gap-1">
        {statements.map((line, i) => (
          <li key={i} className={`flex items-start gap-1.5 ${i === lie ? "font-semibold" : "text-foreground/70"}`}>
            {i === lie ? <X className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden /> : <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
            <span className="sr-only">{i === lie ? "Lie:" : "True:"}</span>
            {line}
          </li>
        ))}
      </ul>
      {note && <p className="mt-1.5 font-semibold">{note}</p>}
    </div>
  );
}
