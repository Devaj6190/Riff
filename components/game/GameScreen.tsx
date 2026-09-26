"use client";

import { ChevronLeft, Heart, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "@/components/Chat";
import { Avatar } from "@/components/HomeScreen";
import { callApi } from "@/lib/api";
import { PACING } from "@/lib/engine/pacing";
import { supabase } from "@/lib/supabase/client";
import type { Nudge, Player, Riff, Score, TickRequest, TickResponse } from "@/lib/types";
import { EndControls, endRiff } from "./EndControls";
import { useGameState } from "./useGameState";

type Props = { me: Player; riff: Riff; players: Player[] };

/** A riff is shown as a DM: header, the live nudge on top, the thread, and the message box. */
export function GameScreen({ me, riff, players }: Props) {
  const { snap, reload } = useGameState(riff.id, { riff, players });
  const { phase } = snap.riff;
  const partner = snap.players.find((p) => p.id !== me.id);
  const nudge = snap.nudges.at(-1);
  const totals = totalsByPlayer(snap.scores);
  const pops = useScorePops(snap.scores, snap.loaded);
  const [keptFor, setKeptFor] = useState<string | null>(null); // "Keep chatting" hides the end screen for this ending only
  const [restartError, setRestartError] = useState<string | null>(null);
  const { isTyping, onTyping } = useTyping(snap.riff.id);
  useTick(snap.riff.id, phase === "chatting", reload, isTyping);

  const nameOf = (id: string) => (id === me.id ? "You" : (snap.players.find((p) => p.id === id)?.name ?? "?"));

  async function newMatch() {
    setRestartError(null);
    try {
      await endRiff(snap.riff.id, "restart");
      await reload();
    } catch {
      setRestartError("Couldn't start a new match");
    }
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-2 border-b border-current/10 py-2 pl-1 pr-3">
        <Link href="/" aria-label="Back" className="flex size-11 shrink-0 items-center justify-center">
          <ChevronLeft className="size-6" />
        </Link>
        <Avatar name={partner?.name ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{partner?.name ?? "New chat"}</p>
          <p className="truncate text-xs opacity-60">
            {phase === "lobby" ? (
              <>
                Code <span className="font-mono tracking-widest">{snap.riff.code}</span>
              </>
            ) : (
              <>
                You <b key={totals.get(me.id) ?? 0} className="riff-pop inline-block tabular-nums">{totals.get(me.id) ?? 0}</b>
                {partner && (
                  <>
                    {" · "}
                    {partner.name}{" "}
                    <b key={totals.get(partner.id) ?? 0} className="riff-pop inline-block tabular-nums">{totals.get(partner.id) ?? 0}</b>
                  </>
                )}
                {" · first to "}
                {snap.riff.target_score}
              </>
            )}
          </p>
        </div>
        {phase === "chatting" && <EndControls riffId={snap.riff.id} me={me} partner={partner} />}
        {phase === "ended" && keptFor === snap.riff.ended_at && (
          <button onClick={newMatch} className="h-11 shrink-0 px-2 text-sm font-semibold text-primary">
            New match
          </button>
        )}
      </header>

      {phase === "lobby" ? (
        <Lobby code={snap.riff.code} />
      ) : (
        <>
          {phase === "chatting" && nudge && <NudgeBanner key={nudge.id} nudge={nudge} />}
          <Chat riffId={snap.riff.id} me={me} onTyping={onTyping} />
        </>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex flex-col items-center gap-2" aria-live="polite">
        {pops.map((s) => (
          <div key={s.id} className="riff-burst flex items-center gap-3 rounded-full bg-primary px-4 py-2 text-primary-foreground shadow-lg">
            <span className="font-bold">
              {nameOf(s.player_id)} +{s.total}
            </span>
            <span className="flex items-center gap-2 text-xs opacity-80">
              <span className="flex items-center gap-0.5" title="Speed">
                <Zap className="size-3" aria-label="speed" />
                {s.speed}
              </span>
              <span className="flex items-center gap-0.5" title="Quality">
                <Sparkles className="size-3" aria-label="quality" />
                {s.quality}
              </span>
              <span className="flex items-center gap-0.5" title="Connection">
                <Heart className="size-3" aria-label="connection" />
                {s.connection}
              </span>
            </span>
          </div>
        ))}
      </div>

      {phase === "ended" && keptFor !== snap.riff.ended_at && (
        <EndScreen
          riff={snap.riff}
          people={[me, partner].filter((p): p is Player => !!p)}
          meId={me.id}
          totals={totals}
          error={restartError}
          onNewMatch={newMatch}
          onKeepChatting={() => setKeptFor(snap.riff.ended_at)}
        />
      )}
    </main>
  );
}

function Lobby({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = location.href;
    if (navigator.share) return navigator.share({ title: "Chat with me on Riff", url }).catch(() => {});
    await navigator.clipboard?.writeText(url);
    setCopied(true);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold">Waiting for someone to join</p>
      <p className="opacity-60">Share the code or link. The chat starts as soon as they join.</p>
      <p className="pl-[0.3em] font-mono text-4xl font-bold tracking-[0.3em]">{code}</p>
      <button onClick={share} className="h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground">
        {copied ? "Link copied" : "Share link"}
      </button>
    </div>
  );
}

/** The newest nudge, with a countdown bar. Keyed by id, so each nudge mounts fresh; gone when its timer ends. */
function NudgeBanner({ nudge }: { nudge: Nudge }) {
  const left = useMsLeft(nudge.ends_at);
  const span = Date.parse(nudge.ends_at) - Date.parse(nudge.created_at);

  useEffect(() => {
    navigator.vibrate?.(40);
  }, []);

  if (left <= 0) return null;
  return (
    <section aria-live="polite" className="riff-drop mx-3 mt-3 rounded-3xl bg-primary/10 p-4">
      {nudge.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- remote generated image, no loader configured
        <img src={nudge.payload.imageUrl} alt="" className="mb-3 max-h-56 w-full rounded-2xl object-cover" />
      )}
      <p className="font-semibold">{nudge.payload.prompt}</p>
      {nudge.kind === "audio" && <audio src={nudge.payload.clipUrl} autoPlay controls className="mt-3 w-full" />}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (left / span) * 100)}%` }} />
        </div>
        <span className="w-8 text-right text-sm font-semibold tabular-nums text-primary">{Math.ceil(left / 1000)}s</span>
      </div>
    </section>
  );
}

function EndScreen({
  riff,
  people,
  meId,
  totals,
  error,
  onNewMatch,
  onKeepChatting,
}: {
  riff: Riff;
  people: Player[];
  meId: string;
  totals: Map<string, number>;
  error: string | null;
  onNewMatch: () => Promise<void>;
  onKeepChatting: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const winner = people.find((p) => (totals.get(p.id) ?? 0) >= riff.target_score);
  const title = !winner ? "Match over" : winner.id === meId ? "You won" : `${winner.name} won`;
  const superlatives = riff.summary?.superlatives;

  return (
    <div className="riff-pop absolute inset-0 z-30 flex flex-col justify-center gap-6 bg-background/95 px-6 backdrop-blur">
      <h2 className="text-center text-3xl font-bold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {people.map((p) => (
          <li key={p.id} className="rounded-3xl bg-muted p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{p.id === meId ? "You" : p.name}</span>
              <span className="text-2xl font-bold tabular-nums">{totals.get(p.id) ?? 0}</span>
            </div>
            <p className={`mt-1 ${superlatives ? "" : "animate-pulse opacity-50"}`}>{superlatives?.[p.seat] ?? "…"}</p>
          </li>
        ))}
      </ul>
      {error && <p className="text-center text-sm text-red-500">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          onClick={async () => {
            setBusy(true);
            await onNewMatch();
            setBusy(false);
          }}
          disabled={busy}
          className="h-12 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "…" : "New match"}
        </button>
        <button onClick={onKeepChatting} className="h-12 rounded-full font-semibold text-primary">
          Keep chatting
        </button>
      </div>
    </div>
  );
}

/**
 * Whether either player is typing, for pacing (the next nudge waits while someone's mid-message). My keystrokes are
 * shared over a Realtime broadcast, at most once a second; sending or clearing the message stops it straight away.
 */
function useTyping(riffId: string) {
  const mine = useRef(0); // last keystroke, ms; 0 = not typing
  const theirs = useRef(0);
  const sentAt = useRef(0);
  const channel = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const db = supabase();
    const ch = db
      .channel(`typing:${riffId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        theirs.current = payload?.typing ? Date.now() : 0;
      })
      .subscribe();
    channel.current = ch;
    return () => {
      void db.removeChannel(ch);
    };
  }, [riffId]);

  const onTyping = useCallback((typing: boolean) => {
    const now = Date.now();
    mine.current = typing ? now : 0;
    if (typing && now - sentAt.current < 1000) return;
    sentAt.current = typing ? now : 0;
    void channel.current?.send({ type: "broadcast", event: "typing", payload: { typing } });
  }, []);

  const isTyping = useCallback(() => Date.now() - Math.max(mine.current, theirs.current) < PACING.typingSeconds * 1000, []);
  return { isTyping, onTyping };
}

/** While chatting, ask the server every second whether a nudge is due. It decides; this just keeps the clock going. */
function useTick(riffId: string, active: boolean, onPhaseChange: () => Promise<void>, isTyping: () => boolean) {
  useEffect(() => {
    if (!active) return;
    const tick = () =>
      callApi<TickResponse>("/api/tick", { riffId, typing: isTyping() } satisfies TickRequest)
        .then((r) => (r.phase !== "chatting" ? onPhaseChange() : undefined))
        .catch(() => {}); // ponytail: a failed tick is simply retried on the next one
    void tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [riffId, active, onPhaseChange, isTyping]);
}

function useMsLeft(endsAt: string) {
  const [left, setLeft] = useState(() => Date.parse(endsAt) - Date.now());
  useEffect(() => {
    const id = setInterval(() => setLeft(Date.parse(endsAt) - Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

/** Score rows that arrived after the first load, shown for 3.5 s each. */
function useScorePops(scores: Score[], loaded: boolean) {
  const seen = useRef<Set<string> | null>(null);
  const [pops, setPops] = useState<Score[]>([]);
  useEffect(() => {
    if (!loaded) return;
    if (!seen.current) {
      seen.current = new Set(scores.map((s) => s.id));
      return;
    }
    const known = seen.current;
    const fresh = scores.filter((s) => !known.has(s.id));
    if (!fresh.length) return;
    fresh.forEach((s) => known.add(s.id));
    setPops((p) => [...p, ...fresh]);
    navigator.vibrate?.(30);
    setTimeout(() => setPops((p) => p.filter((s) => !fresh.includes(s))), 3500);
  }, [scores, loaded]);
  return pops;
}

function totalsByPlayer(scores: Score[]) {
  const totals = new Map<string, number>();
  for (const s of scores) totals.set(s.player_id, (totals.get(s.player_id) ?? 0) + s.total);
  return totals;
}
