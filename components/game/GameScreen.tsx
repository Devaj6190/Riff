"use client";

import { useEffect, useRef, useState } from "react";
import { Chat } from "@/components/Chat";
import { callApi } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import type { AdvanceRequest, AdvanceResponse, Answer, GamePhase, Player, Riff, Round, Score, Seat } from "@/lib/types";
import { EndControls, endRiff } from "./EndControls";
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
  const [chatOnly, setChatOnly] = useState(false);

  useEffect(() => {
    if (snap.riff.phase === "round_result") navigator.vibrate?.(30);
    if (snap.riff.phase === "round_active" && round?.is_bonus) navigator.vibrate?.([60, 80, 60, 80, 120]);
  }, [snap.riff.phase, round?.id, round?.is_bonus]);

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
          {deadline && snap.riff.phase !== "round_active" && snap.riff.phase !== "talk_window" && snap.riff.phase !== "countdown" && <Countdown deadline={deadline} />}
          {partner && snap.riff.phase !== "lobby" && snap.riff.phase !== "ended" && <EndControls riffId={snap.riff.id} me={me} partner={partner} />}
          {!partner && (
            <button type="button" onClick={() => navigator.clipboard?.writeText(location.href)} className="h-11 rounded-lg border border-current/20 px-4 text-sm">
              Copy link
            </button>
          )}
        </div>
      </header>

      {chatOnly && snap.riff.phase === "ended" ? (
        <Chat riffId={snap.riff.id} me={me} players={snap.players} />
      ) : (
        <>
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
            onKeepChatting={() => setChatOnly(true)}
          />
        </>
      )}
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
  onKeepChatting,
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
  onKeepChatting: () => void;
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
          seat={me.seat}
          submitted={Boolean(myAnswer)}
          busy={sending}
          error={answerError}
          onSubmit={onSubmit}
        />
      );
    case "round_result":
      return <Result round={round} rounds={snap.rounds} players={snap.players} answers={snap.answers} scores={snap.scores} meId={me.id} popKey={`${round?.id ?? ""}:${snap.riff.phase}`} />;
    case "talk_window":
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <p className="text-sm font-semibold">Talk it out</p>
            {deadline && <Countdown deadline={deadline} />}
          </div>
          {/* Each message may extend the window; the engine recomputes and publishes the new deadline. */}
          <Chat
            riffId={snap.riff.id}
            me={me}
            players={snap.players}
            onSent={() => void callApi<AdvanceResponse>("/api/advance", { riffId: snap.riff.id } satisfies AdvanceRequest).catch(() => {})}
          />
        </div>
      );
    case "countdown":
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="px-4 pt-6 text-center text-lg font-semibold">
            Next round in {deadline ? <Countdown deadline={deadline} prominent suffix="…" /> : "…"}
          </p>
          <Chat riffId={snap.riff.id} me={me} players={snap.players} />
        </div>
      );
    case "ended":
      return <Ended snap={snap} me={me} onKeepChatting={onKeepChatting} />;
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
          <button type="button" onClick={onStart} disabled={starting} className="h-12 min-w-44 rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-40">
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
  seat,
  submitted,
  busy,
  error,
  onSubmit,
}: {
  round: Round | undefined;
  turfName: string | undefined;
  seat: Seat;
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
        <div className="riff-bonus-banner mx-4 mt-3 rounded-2xl px-4 py-3 text-black">
          <p className="text-lg font-bold">{turfName ? `🎁 Bonus Round — ${turfName}'s turf` : "🎁 Bonus Round"}</p>
          <p className="text-sm font-semibold opacity-80">{turfName ? `2× points for ${turfName} this round` : "2× points this round"}</p>
        </div>
      )}
      <AnswerSlot round={round} seat={seat} submitted={submitted} busy={busy} error={error} onSubmit={onSubmit} />
    </section>
  );
}

function Result({
  round,
  rounds,
  players,
  answers,
  scores,
  meId,
  popKey,
}: {
  round: Round | undefined;
  rounds: Round[];
  players: Player[];
  answers: Answer[];
  scores: Score[];
  meId: string;
  popKey: string;
}) {
  const answerOf = (player: Player) => (round ? answers.find((a) => a.round_id === round.id && a.player_id === player.id) : undefined);
  const picks = round?.mechanic === "pick" ? players.map((p) => answerOf(p)?.payload).map((a) => (a && "choice" in a ? a.choice : null)) : [];
  const matched = picks.length === 2 && picks[0] !== null && picks[0] === picks[1];
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {matched && round?.mechanic === "pick" && (
        <li key={`${popKey}:match`} className="riff-burst rounded-2xl bg-primary p-4 text-center text-primary-foreground">
          <p className="text-2xl font-bold">It&apos;s a match! 🎉</p>
          <p className="text-sm opacity-80">You both picked {round.payload.options[picks[0]!]?.label}</p>
        </li>
      )}
      {players.map((player, i) => {
        const score = round ? scores.find((s) => s.round_id === round.id && s.player_id === player.id && s.kind === "round") : undefined;
        const answer = answerOf(player);
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
            {round && answerSummary(round, answer) && <p className="mt-2 text-sm opacity-80">{answerSummary(round, answer)}</p>}
            {round && <TwoTruthsReveal round={round} rounds={rounds} answers={answers} player={player} players={players} />}
          </li>
        );
      })}
    </ul>
  );
}

function Ended({ snap, me, onKeepChatting }: { snap: GameSnapshot; me: Player; onKeepChatting: () => void }) {
  const totals = totalsByPlayer(snap.scores);
  const [a, b] = snap.players.map((p) => ({ player: p, total: totals.get(p.id) ?? 0 }));
  const winner = a && b && a.total !== b.total ? (a.total > b.total ? a.player : b.player) : null;
  const [restarting, setRestarting] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 px-4 py-4">
        <h2 className="riff-pop text-2xl font-bold">{winner ? (winner.id === me.id ? "You win! 🏆" : `${winner.name} wins! 🏆`) : "It's a tie! 🤝"}</h2>
        {snap.players.map((player) => (
          <div key={player.id} className="rounded-2xl border border-current/15 p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{player.id === me.id ? "You" : player.name}</span>
              <span className="text-2xl font-bold tabular-nums">{totals.get(player.id) ?? 0}</span>
            </div>
            <p className="mt-1 text-sm">{snap.riff.summary?.superlatives[player.seat] ?? "Writing your superlative…"}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={restarting}
            onClick={async () => {
              setRestarting(true);
              await endRiff(snap.riff.id, "restart").catch(() => setRestarting(false));
            }}
            className="h-12 flex-1 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
          >
            {restarting ? "…" : "Play again"}
          </button>
          <button type="button" onClick={onKeepChatting} className="h-12 flex-1 rounded-full border border-current/20 font-semibold">
            Keep chatting
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ players, scores, target, meId }: { players: Player[]; scores: Score[]; target: number; meId: string }) {
  const totals = totalsByPlayer(scores);
  const talkTotal = scores.reduce((sum, score) => sum + (score.kind === "talk" ? score.total : 0), 0);
  const seenTalk = useRef<number | null>(null);
  useEffect(() => {
    if (seenTalk.current !== null && talkTotal > seenTalk.current) navigator.vibrate?.(20);
    seenTalk.current = talkTotal;
  }, [talkTotal]);
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
                <span key={score} className="riff-pop">
                  {score}
                </span>
                <span className="opacity-50"> / {target}</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-current/10">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Countdown({ deadline, prominent = false, suffix = "s" }: { deadline: string; prominent?: boolean; suffix?: string }) {
  const seconds = useSecondsLeft(deadline);
  return (
    <span className={`tabular-nums ${prominent ? "text-3xl font-bold" : "text-sm"}`} aria-live="polite">
      {seconds == null ? "…" : `${seconds}${suffix}`}
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

/** What to show under a player's result. Never reveals a two-truths lie before the guess round. */
function answerSummary(round: Round, answer: Answer | undefined): string | null {
  if (!answer) return null;
  const payload = answer.payload;
  if ("text" in payload) return payload.text;
  if ("transcript" in payload) return payload.transcript;
  if ("choice" in payload && round.mechanic === "pick") return `Picked: ${round.payload.options[payload.choice]?.label ?? "?"}`;
  if ("statements" in payload) return "Statements locked in.";
  return null;
}

/** Guess-round result line: what this player guessed vs the partner's actual lie. */
function TwoTruthsReveal({ round, rounds, answers, player, players }: { round: Round; rounds: Round[]; answers: Answer[]; player: Player; players: Player[] }) {
  if (round.mechanic !== "two_truths" || round.payload.stage !== "guess") return null;
  const partner = players.find((p) => p.id !== player.id);
  const writeRound = [...rounds].reverse().find((r) => r.number < round.number && r.mechanic === "two_truths" && r.payload.stage === "write");
  const theirWrite = writeRound && partner ? answers.find((a) => a.round_id === writeRound.id && a.player_id === partner.id)?.payload : undefined;
  const myGuess = answers.find((a) => a.round_id === round.id && a.player_id === player.id)?.payload;
  if (!partner || !theirWrite || !("lieIndex" in theirWrite)) return null;
  const lie = theirWrite.statements[theirWrite.lieIndex];
  const guessed = myGuess && "guess" in myGuess ? myGuess.guess : null;
  return (
    <p className="mt-2 text-sm">
      {partner.name}&apos;s lie: “{lie}” — {guessed === null ? "no guess" : guessed === theirWrite.lieIndex ? "caught it ✅" : "fooled 😈"}
    </p>
  );
}
