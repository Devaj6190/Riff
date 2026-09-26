"use client";

import { useEffect, useRef, useState } from "react";
import { Chat } from "@/components/Chat";
import { callApi } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import type { AdvanceRequest, AdvanceResponse, Answer, GamePhase, Player, Riff, Round, Score } from "@/lib/types";
import { mechanicAnswers } from "./mechanicAnswers";
import { useGameState, type GameSnapshot } from "./useGameState";

type Props = { me: Player; riff: Riff; players: Player[] };

export function GameScreen({ me, riff, players }: Props) {
  const { snap, reload } = useGameState(riff.id, { riff, players });
  const round = snap.rounds.find((r) => r.number === snap.riff.round_number);
  const deadline = phaseDeadline(snap.riff, round);
  const advanceError = useAdvanceOnExpiry(snap.riff.id, deadline, reload);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (snap.riff.phase !== "round_result") return;
    navigator.vibrate?.(30);
  }, [snap.riff.phase, round?.id]);

  const partner = snap.players.find((p) => p.id !== me.id);
  const myAnswer = round ? snap.answers.find((a) => a.round_id === round.id && a.player_id === me.id) : undefined;

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      await callApi<AdvanceResponse>("/api/advance", { riffId: snap.riff.id } satisfies AdvanceRequest);
      await reload();
    } catch (err) {
      setStartError(shortError(err, "Couldn't start"));
    } finally {
      setStarting(false);
    }
  }

  async function submitAnswer(payload: Answer["payload"]) {
    if (!round) return;
    setSending(true);
    setAnswerError(null);
    const { error } = await supabase().from("answers").insert({
      riff_id: snap.riff.id,
      round_id: round.id,
      player_id: me.id,
      payload,
    });
    setSending(false);
    if (error) {
      setAnswerError("Answer didn't send");
      return;
    }
    // The second answer ends the round early; the engine no-ops if the partner hasn't answered yet.
    callApi<AdvanceResponse>("/api/advance", { riffId: snap.riff.id } satisfies AdvanceRequest).catch(() => {});
    await reload();
  }

  return (
    <main data-phase={snap.riff.phase} className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-current/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{partner ? `You & ${partner.name}` : "Waiting for someone to join…"}</div>
          <div className="text-sm opacity-60">
            Riff <span className="font-mono tracking-widest">{snap.riff.code}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deadline && snap.riff.phase !== "round_active" && snap.riff.phase !== "countdown" && <Countdown deadline={deadline} />}
          {!partner && (
            <button type="button" onClick={() => navigator.clipboard?.writeText(location.href)} className="h-11 rounded-lg border border-current/20 px-4 text-sm">
              Copy link
            </button>
          )}
        </div>
      </header>

      {snap.riff.phase !== "lobby" && <ScoreBar players={snap.players} scores={snap.scores} target={snap.riff.target_score} meId={me.id} />}

      <PhaseBody
        snap={snap}
        me={me}
        round={round}
        myAnswer={myAnswer}
        deadline={deadline}
        starting={starting}
        startError={startError}
        answerError={answerError}
        sending={sending}
        onStart={start}
        onSubmit={submitAnswer}
      />
      {advanceError && <p className="px-4 pb-3 text-sm text-red-500">{advanceError}</p>}
    </main>
  );
}

function PhaseBody({
  snap,
  me,
  round,
  myAnswer,
  deadline,
  starting,
  startError,
  answerError,
  sending,
  onStart,
  onSubmit,
}: {
  snap: GameSnapshot;
  me: Player;
  round: Round | undefined;
  myAnswer: Answer | undefined;
  deadline: string | null;
  starting: boolean;
  startError: string | null;
  answerError: string | null;
  sending: boolean;
  onStart: () => void;
  onSubmit: (payload: Answer["payload"]) => Promise<void>;
}) {
  const phase: GamePhase = snap.riff.phase;
  switch (phase) {
    case "lobby":
      return <Lobby ready={snap.players.length >= 2} starting={starting} error={startError} onStart={onStart} chat={<Chat riffId={snap.riff.id} me={me} players={snap.players} />} />;
    case "round_active":
      return (
        <ActiveRound
          round={round}
          turfName={round?.is_bonus && round.bonus_seat ? snap.players.find((p) => p.seat === round.bonus_seat)?.name : undefined}
          submitted={Boolean(myAnswer)}
          busy={sending}
          error={answerError}
          onSubmit={onSubmit}
        />
      );
    case "round_result":
      return <Result round={round} players={snap.players} answers={snap.answers} scores={snap.scores} meId={me.id} popKey={`${round?.id ?? ""}:${snap.riff.phase}`} />;
    case "talk_window":
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="px-4 pt-3 text-sm font-semibold">Talk it out</p>
          <Chat riffId={snap.riff.id} me={me} players={snap.players} />
        </div>
      );
    case "countdown":
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="px-4 pt-6 text-center text-lg font-semibold">Next round in {deadline ? <Countdown deadline={deadline} prominent /> : "…"}</p>
          <Chat riffId={snap.riff.id} me={me} players={snap.players} />
        </div>
      );
    case "ended":
      return <Ended snap={snap} me={me} />;
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

function Lobby({ ready, starting, error, onStart, chat }: { ready: boolean; starting: boolean; error: string | null; onStart: () => void; chat: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
        <p>{ready ? "Both players are in." : "Share the code and wait for them."}</p>
        {ready && (
          <button type="button" onClick={onStart} disabled={starting} className="h-12 min-w-44 rounded-full bg-foreground px-6 font-semibold text-background disabled:opacity-40">
            {starting ? "Starting…" : "Start"}
          </button>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      {chat}
    </div>
  );
}

function ActiveRound({
  round,
  turfName,
  submitted,
  busy,
  error,
  onSubmit,
}: {
  round: Round | undefined;
  turfName: string | undefined;
  submitted: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: Answer["payload"]) => Promise<void>;
}) {
  if (!round) return <p className="p-4 opacity-70">The round is on its way…</p>;
  const AnswerSlot = mechanicAnswers[round.mechanic];
  return (
    <section key={round.id} className={`flex min-h-0 flex-1 flex-col ${round.is_bonus ? "riff-bonus" : "riff-drop"}`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <p className="text-sm opacity-60">Round {round.number}</p>
        <Countdown deadline={round.ends_at} />
      </div>
      {round.is_bonus && (
        <p className="px-4 pt-2 font-semibold">{turfName ? `🎁 Bonus Round — ${turfName}'s turf` : "🎁 Bonus Round"}</p>
      )}
      <AnswerSlot round={round} submitted={submitted} busy={busy} error={error} onSubmit={onSubmit} />
    </section>
  );
}

function Result({
  round,
  players,
  answers,
  scores,
  meId,
  popKey,
}: {
  round: Round | undefined;
  players: Player[];
  answers: Answer[];
  scores: Score[];
  meId: string;
  popKey: string;
}) {
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {players.map((player, i) => {
        const score = round ? scores.find((s) => s.round_id === round.id && s.player_id === player.id && s.kind === "round") : undefined;
        const answer = round ? answers.find((a) => a.round_id === round.id && a.player_id === player.id) : undefined;
        return (
          <li key={`${popKey}:${player.id}`} className="riff-pop rounded-2xl border border-current/15 p-4" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{player.id === meId ? "You" : player.name}</span>
              <span className="text-2xl font-bold tabular-nums">{score?.total ?? 0}</span>
            </div>
            {score ? (
              <p className="mt-1 text-sm opacity-70">
                Speed {score.speed} · Quality {score.quality} · Connection {score.connection}
                {score.multiplier === 2 ? " · 2×" : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm opacity-70">Scoring…</p>
            )}
            {score?.reason && <p className="mt-2">{score.reason}</p>}
            {answerText(answer) && <p className="mt-2 text-sm opacity-80">{answerText(answer)}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function Ended({ snap, me }: { snap: GameSnapshot; me: Player }) {
  const totals = totalsByPlayer(snap.scores);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 py-4">
        <h2 className="text-xl font-bold">Game over</h2>
        {snap.players.map((player) => (
          <div key={player.id} className="rounded-2xl border border-current/15 p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{player.id === me.id ? "You" : player.name}</span>
              <span className="text-2xl font-bold tabular-nums">{totals.get(player.id) ?? 0}</span>
            </div>
            {snap.riff.summary?.superlatives[player.seat] && <p className="mt-1 text-sm">{snap.riff.summary.superlatives[player.seat]}</p>}
          </div>
        ))}
      </div>
      <Chat riffId={snap.riff.id} me={me} players={snap.players} />
    </div>
  );
}

function ScoreBar({ players, scores, target, meId }: { players: Player[]; scores: Score[]; target: number; meId: string }) {
  const totals = totalsByPlayer(scores);
  return (
    <div className="flex flex-col gap-2 border-b border-current/10 px-4 py-3">
      {players.map((player) => {
        const score = totals.get(player.id) ?? 0;
        const width = target > 0 ? Math.min(100, (score / target) * 100) : 0;
        return (
          <div key={player.id}>
            <div className="flex justify-between text-sm">
              <span>{player.id === meId ? "You" : player.name}</span>
              <span className="tabular-nums">
                {score}
                <span className="opacity-50"> / {target}</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-current/10">
              <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Countdown({ deadline, prominent = false }: { deadline: string; prominent?: boolean }) {
  const seconds = useSecondsLeft(deadline);
  return (
    <span className={`tabular-nums ${prominent ? "text-3xl font-bold" : "text-sm"}`} aria-live="polite">
      {seconds == null ? "…" : `${seconds}s`}
    </span>
  );
}

function useSecondsLeft(deadline: string) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setSeconds(secondsUntil(deadline));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadline]);
  return seconds;
}

function useAdvanceOnExpiry(riffId: string, deadline: string | null, reload: () => Promise<void>) {
  const [failure, setFailure] = useState<{ deadline: string; message: string } | null>(null);
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!deadline) return;
    const end = Date.parse(deadline);
    if (Number.isNaN(end)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      if (cancelled || sent.current === deadline) return;
      sent.current = deadline;
      callApi<AdvanceResponse>("/api/advance", { riffId } satisfies AdvanceRequest)
        .then(() => {
          if (!cancelled) void reload();
        })
        .catch((err) => {
          if (!cancelled) setFailure({ deadline, message: shortError(err, "Couldn't move the riff forward") });
        });
    };
    const wait = end - Date.now();
    if (wait <= 0) fire();
    else timer = setTimeout(fire, wait);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deadline, riffId, reload]);

  return failure?.deadline === deadline ? failure.message : null;
}

function phaseDeadline(riff: Riff, round: Round | undefined): string | null {
  if (riff.phase === "lobby" || riff.phase === "ended") return null;
  if (riff.phase === "round_active") return round?.ends_at ?? riff.phase_ends_at;
  return riff.phase_ends_at;
}

function totalsByPlayer(scores: Score[]) {
  const totals = new Map<string, number>();
  for (const score of scores) totals.set(score.player_id, (totals.get(score.player_id) ?? 0) + score.total);
  return totals;
}

function shortError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message.trim() : "";
  if (!message || message.startsWith("<") || message.length > 180) return fallback;
  return message;
}

function secondsUntil(deadline: string) {
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000));
}

function answerText(answer: Answer | undefined): string | null {
  if (!answer) return null;
  const payload = answer.payload;
  if ("text" in payload && typeof payload.text === "string") return payload.text;
  return null;
}
