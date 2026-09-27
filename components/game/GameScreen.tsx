"use client";

import { ChevronLeft, Heart, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";
import { Chat } from "@/components/Chat";
import { Avatar, stagger } from "@/components/HomeScreen";
import { addFriend, friendState, type FriendState } from "@/components/friends";
import { MatchMoment } from "@/components/MatchMoment";
import { ProfilePopup } from "@/components/ProfilePopup";
import { BOUNCY, calm, clearMatched, SPRING, wasMatched } from "@/components/motion";
import { callApi } from "@/lib/api";
import { PACING } from "@/lib/engine/pacing";
import { supabase } from "@/lib/supabase/client";
import type { Moment, Nudge, Player, ProfileRequest, ProfileResponse, PublicProfile, Riff, Score, TickRequest, TickResponse } from "@/lib/types";
import { EndControls, endRiff } from "./EndControls";
import { useGameState } from "./useGameState";

type Props = { me: Player; riff: Riff; players: Player[] };

/** A riff is shown as a DM: header, the live nudge on top, the thread, and the message box. */
export function GameScreen({ me, riff, players }: Props) {
  const { snap, reload } = useGameState(riff.id, { riff, players });
  const { phase } = snap.riff;
  const partner = snap.players.find((p) => p.id !== me.id);
  const [expired, setExpired] = useState<string | null>(null); // id of the latest nudge once its countdown hits zero
  const latest = snap.nudges.at(-1);
  // The newest nudge sits pinned on top while its timer runs, then joins the thread with the others.
  const liveNudge = phase === "chatting" && latest && !latest.scored_at && latest.id !== expired ? latest : undefined;
  const totals = totalsByPlayer(snap.scores);
  const pops = useScorePops(snap.scores, snap.loaded);
  const [keptFor, setKeptFor] = useState<string | null>(null); // "Keep chatting" hides the end screen for this ending only
  const [restartError, setRestartError] = useState<string | null>(null);
  const { isTyping, onTyping, partnerTyping, partnerSent } = useTyping(snap.riff.id);
  useTick(snap.riff.id, phase === "chatting", reload, isTyping);
  // "It's a match" plays once when this chat pairs: it opened in the lobby, or we navigated here right after pairing.
  const [fresh] = useState(() => riff.phase === "lobby" || wasMatched(riff.code));
  const [matchShown, setMatchShown] = useState(false);
  const [partnerCard, setPartnerCard] = useState<PublicProfile | null>(null); // their profile, while open

  function showPartner() {
    if (!partner) return;
    setPartnerCard({ name: partner.name, from: "", interests: partner.interests, prompts: [], favorites: [] }); // until the full one arrives
    callApi<ProfileResponse>("/api/profile", { action: "partner", riffId: snap.riff.id } satisfies ProfileRequest)
      .then((r) => r.profile && setPartnerCard((open) => open && r.profile))
      .catch(() => {}); // keep showing what the chat already knows
  }

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
    <div className="md:flex md:h-dvh md:items-center md:py-6">
      {/* On wide screens the chat sits in a window-like card; on phones it's the whole screen. */}
      <main className="riff-rise relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background md:h-full md:max-h-[56rem] md:rounded-3xl md:shadow-[0_8px_40px_rgb(0_0_0/0.45)] md:ring-1 md:ring-white/10">
        <header className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center border-b border-current/10 px-1 py-1.5">
          <Link href="/" aria-label="Back" className="flex size-11 items-center justify-center text-primary">
            <ChevronLeft className="size-7" />
          </Link>
          <div className="flex min-w-0 flex-col items-center">
            <button type="button" onClick={showPartner} disabled={!partner} aria-label={partner ? `${partner.name}'s profile` : undefined} className="flex max-w-full flex-col items-center transition-transform active:scale-95">
              <Avatar name={partner?.name ?? "?"} className="size-9 text-sm" />
              <p className="mt-0.5 max-w-full truncate text-xs font-semibold">{partner?.name ?? "New chat"}</p>
            </button>
            {partner && phase !== "lobby" && (
              <p className="text-[11px] tabular-nums text-foreground/50">
                You <b data-score={me.id} className="inline-block text-foreground">{snap.loaded ? <CountUp value={totals.get(me.id) ?? 0} /> : 0}</b>
                {" · "}
                <b data-score={partner.id} className="inline-block text-foreground">{snap.loaded ? <CountUp value={totals.get(partner.id) ?? 0} /> : 0}</b> {partner.name}
              </p>
            )}
          </div>
          <div className="flex justify-end">
            {phase === "chatting" && <EndControls riffId={snap.riff.id} me={me} partner={partner} />}
            {phase === "ended" && keptFor === snap.riff.ended_at && (
              <button onClick={newMatch} className="h-11 whitespace-nowrap px-2 text-sm font-semibold text-primary">
                New match
              </button>
            )}
          </div>
        </header>

        {phase === "lobby" ? (
          <Lobby code={snap.riff.code} />
        ) : (
          <>
            {liveNudge && <NudgeBanner key={liveNudge.id} nudge={liveNudge} onExpire={() => setExpired(liveNudge.id)} />}
            <Chat
              riffId={snap.riff.id}
              me={me}
              pastNudges={snap.nudges.filter((n) => n !== liveNudge)}
              onTyping={onTyping}
              partnerTyping={partnerTyping}
              onPartnerMessage={partnerSent}
            />
          </>
        )}

        {pops.map((s) => (
          <FlyingScore key={s.id} score={s} mine={s.player_id === me.id} />
        ))}

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
      {partnerCard && <ProfilePopup profile={partnerCard} onClose={() => setPartnerCard(null)} />}
      {fresh && !matchShown && phase !== "lobby" && partner && (
        <MatchMoment
          me={me.name}
          them={partner.name}
          onDone={() => {
            clearMatched();
            setMatchShown(true);
          }}
        />
      )}
    </div>
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

const RING = 2 * Math.PI * 21; // the timer ring's circumference (r = 21 in a 48 box)

/**
 * The newest nudge. Its timer is a ring around the Riff sparkle: gold and pulsing (with a tap) for the last 5 s, then
 * the card drops into the chat, where the prompt shows as a line. Keyed by id, so each nudge mounts fresh.
 */
function NudgeBanner({ nudge, onExpire }: { nudge: Nudge; onExpire: () => void }) {
  const left = useMsLeft(nudge.ends_at);
  const span = Date.parse(nudge.ends_at) - Date.parse(nudge.created_at);
  const card = useRef<HTMLElement>(null);
  const expire = useEffectEvent(onExpire);
  const over = left <= 0;
  const hurry = left <= 5000 && !over;

  useEffect(() => {
    buzz(40);
  }, []);

  useEffect(() => {
    if (hurry) buzz(15);
  }, [hurry]);

  useEffect(() => {
    if (!over) return;
    if (calm()) return expire();
    const drop = card.current!.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: "scale(1.04)", opacity: 1, offset: 0.2 },
        { transform: "translateY(40vh) scale(.3)", opacity: 0 },
      ],
      { duration: 650, easing: "cubic-bezier(0.5, 0, 0.3, 1)", fill: "forwards" },
    );
    const t = setTimeout(expire, 650); // a timer, not onfinish: a backgrounded tab never fires that
    return () => {
      clearTimeout(t);
      drop.cancel();
    };
  }, [over]);

  return (
    <section ref={card} aria-live="polite" className="riff-drop relative z-10 mx-3 mt-3 rounded-3xl bg-primary/10 p-4">
      {nudge.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- remote generated image, no loader configured
        <img src={nudge.payload.imageUrl} alt="" className="mb-3 max-h-56 w-full rounded-2xl object-cover" />
      )}
      <div className="flex items-center gap-3">
        <span className={`relative flex size-12 shrink-0 items-center justify-center text-primary ${hurry ? "riff-pulse" : ""}`}>
          <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="3" />
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              stroke={hurry ? "#f5c451" : "currentColor"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - Math.max(0, left) / span)}
              className="transition-[stroke-dashoffset,stroke] duration-300 ease-linear"
            />
          </svg>
          <Sparkles className="size-5" aria-hidden />
          <span className="sr-only">{Math.max(0, Math.ceil(left / 1000))} seconds left</span>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">Riff</p>
          <p className="font-semibold">{nudge.payload.prompt}</p>
        </div>
      </div>
      {nudge.kind === "audio" && <audio src={nudge.payload.clipUrl} autoPlay controls className="mt-3 w-full" />}
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
  const moments = riff.summary?.moments; // undefined while the AI is still picking them
  const nameOf = (seat: string) => (people.find((p) => p.seat === seat)?.id === meId ? "You" : people.find((p) => p.seat === seat)?.name);
  const partner = people.find((p) => p.id !== meId);

  return (
    <div className="riff-pop absolute inset-0 z-30 flex flex-col gap-6 overflow-x-hidden overflow-y-auto bg-background/95 px-6 py-10 backdrop-blur">
      <h2 className="text-center text-3xl font-bold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {people.map((p, i) => (
          <li key={p.id} className="riff-rise rounded-3xl bg-muted p-4" style={stagger(i + 1)}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{p.id === meId ? "You" : p.name}</span>
              <span className="text-2xl font-bold tabular-nums">{totals.get(p.id) ?? 0}</span>
            </div>
          </li>
        ))}
      </ul>
      {!moments && <p className="animate-pulse text-center text-sm opacity-50">Picking your best moments…</p>}
      {!!moments?.length && <MomentsDeck moments={moments} nameOf={nameOf} />}
      {error && <p className="text-center text-sm text-red-300">{error}</p>}
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
        {partner && <FriendButton me={people.find((p) => p.id === meId)!} partner={partner} />}
        <button onClick={onKeepChatting} className="h-12 rounded-full font-semibold text-primary">
          Keep chatting
        </button>
      </div>
    </div>
  );
}

const DECK_COLORS = ["bg-cream", "bg-[#f5c451]", "bg-[#c9b8ff]"];

/** The best moments as a Wrapped-style deck: dealt in from below, tap to send the front card to the back. */
export function MomentsDeck({ moments, nameOf }: { moments: Moment[]; nameOf: (seat: string) => string | undefined }) {
  const [order, setOrder] = useState(() => moments.map((_, i) => i)); // card indexes, front first
  const [turning, setTurning] = useState(false);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);

  async function next() {
    if (turning || moments.length < 2) return;
    setTurning(true);
    const out = cards.current[order[0]]?.animate([{ transform: "translateX(-130%) rotate(-16deg)", opacity: 0 }], { duration: calm() ? 0 : 320, easing: "ease-in", fill: "forwards" });
    await out?.finished;
    flushSync(() => setOrder(([first, ...rest]) => [...rest, first]));
    out?.cancel(); // it's at the back now, behind the others
    setTurning(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto h-80 w-full max-w-xs">
        {moments.map((m, i) => {
          const depth = order.indexOf(i);
          return (
            <button
              key={i}
              ref={(el) => {
                cards.current[i] = el;
              }}
              onClick={next}
              aria-label={`${m.title}. Next moment`}
              className={`riff-deal absolute inset-0 flex flex-col rounded-[28px] p-6 text-left text-navy shadow-[0_10px_30px_rgb(0_0_0/0.35)] ${DECK_COLORS[i % DECK_COLORS.length]}`}
              style={{ "--i": moments.length - 1 - i, zIndex: moments.length - depth, transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.06}) rotate(${depth === 0 ? 0 : depth % 2 ? 4 : -4}deg)`, transition: `transform .5s ${SPRING}` } as CSSProperties}
            >
              <p className="text-xs font-bold tracking-[0.15em] uppercase opacity-70">{m.title}</p>
              <div className="mt-4 flex flex-1 flex-col gap-2 overflow-hidden text-lg leading-snug font-semibold">
                {m.lines.map((l, j) => (
                  <p key={j}>
                    <span className="opacity-55">{nameOf(l.seat)}:</span> {l.body}
                  </p>
                ))}
              </div>
              <p className="mt-3 text-sm italic opacity-75">{m.caption}</p>
            </button>
          );
        })}
      </div>
      {moments.length > 1 && (
        <div className="flex justify-center gap-1.5" aria-hidden>
          {moments.map((_, i) => (
            <span key={i} className={`h-1 w-6 rounded-full transition-colors ${order[0] === i ? "bg-cream" : "bg-foreground/20"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Add the person you just chatted with. Both avatars slide together in the button; a dashed ring marches around them
 * while the request waits, then draws closed and they hop once it's mutual. The AI's personas say yes straight away.
 */
function FriendButton({ me, partner }: { me: Player; partner: Player }) {
  const [state, setState] = useState<FriendState | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [busy, setBusy] = useState(false);
  const last = useRef<FriendState | null>(null);
  const { user_id: userId, name, interests } = partner;

  const land = useCallback((s: FriendState) => {
    if (s === "friends" && last.current && last.current !== "friends") setCelebrate(true);
    last.current = s;
    setState(s);
  }, []);

  // ponytail: polls every 3 s until you're friends, so their add-back shows up live; Realtime on friend_requests if it matters.
  useEffect(() => {
    let live = true;
    const check = () => friendState({ userId, name }).then((s) => live && land(s));
    void check();
    const id = setInterval(() => last.current !== "friends" && void check(), 3000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [userId, name, land]);

  const together = state === "sent" || state === "friends";
  const label = { none: `Add ${name} as a friend`, received: `${name} added you: add back`, sent: "Request sent", friends: `You and ${name} are friends` };
  const slide = (x: number) => ({ translate: `${together ? x / 2 : x}px`, transition: `translate .6s ${BOUNCY}` });
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          land(await addFriend({ userId, name, interests }));
        } catch {
          // ponytail: a failed add leaves the button as it was; tap again
        }
        setBusy(false);
      }}
      disabled={busy || !state || together}
      className="flex h-14 items-center justify-center gap-3 rounded-full bg-muted px-5 font-semibold"
    >
      <span className="relative h-9 w-16 shrink-0">
        <svg viewBox="0 0 64 36" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {state === "sent" && <rect x="-2" y="-2" width="68" height="40" rx="20" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="4 5" className="riff-march" />}
          {state === "friends" && <rect x="-2" y="-2" width="68" height="40" rx="20" fill="none" stroke="var(--color-cream)" strokeWidth="2" className={celebrate ? "riff-draw" : ""} style={{ "--len": 180 } as CSSProperties} />}
        </svg>
        {[me.name, name].map((n, i) => (
          <span key={i} className="absolute top-0.5 left-1/2 -ml-4" style={slide(i ? 13 : -13)}>
            <span key={String(celebrate)} className={`block ${celebrate ? "riff-hop" : ""}`} style={{ "--i": i } as CSSProperties}>
              <Avatar name={n} className="size-8 text-sm ring-2 ring-background" />
            </span>
          </span>
        ))}
      </span>
      <span key={state} className="riff-pop">
        {state ? label[state] : ""}
      </span>
    </button>
  );
}

/** A score pops up by the message that earned it, holds long enough to read, then flies into that player's header score. */
function FlyingScore({ score, mine }: { score: Score; mine: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const chip = el.current!;
    const bubbles = document.querySelectorAll(mine ? ".bubble-mine" : ".bubble-theirs");
    const from = bubbles[bubbles.length - 1]?.getBoundingClientRect();
    const to = document.querySelector(`[data-score="${score.player_id}"]`)?.getBoundingClientRect();
    const w = chip.offsetWidth;
    const h = chip.offsetHeight;
    const x0 = from ? Math.max(8, Math.min(innerWidth - w - 8, mine ? from.right - w : from.left)) : innerWidth / 2 - w / 2;
    const y0 = from ? Math.max(8, from.top - h - 6) : innerHeight / 2;
    const x1 = to ? to.left + to.width / 2 - w / 2 : x0;
    const y1 = to ? to.top + to.height / 2 - h / 2 : 0;
    const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) scale(${s})`;
    const hold = calm() ? [] : [{ transform: at(x0, y0, 1.12), opacity: 1, offset: 0.1 }, { transform: at(x0, y0, 1), opacity: 1, offset: 0.5 }, { transform: at((x0 + x1) / 2 - 24, (y0 + y1) / 2, 0.8), opacity: 1, offset: 0.75 }];
    const flight = chip.animate([{ transform: at(x0, y0, 0.4), opacity: 0 }, ...hold, { transform: at(x1, y1, 0.25), opacity: 0 }], { duration: calm() ? 1 : 1900, easing: "cubic-bezier(0.5, 0, 0.3, 1)", fill: "both" });
    return () => flight.cancel();
  }, [mine, score.player_id]);

  return createPortal(
    <div ref={el} aria-live="polite" className="pointer-events-none fixed top-0 left-0 z-40 flex items-center gap-3 rounded-full bg-primary px-4 py-2 text-primary-foreground opacity-0 shadow-lg">
      <span className="font-bold">+{score.total}</span>
      <span className="flex items-center gap-2 text-xs opacity-80">
        <span className="flex items-center gap-0.5" title="Speed">
          <Zap className="size-3" aria-label="speed" />
          {score.speed}
        </span>
        <span className="flex items-center gap-0.5" title="Quality">
          <Sparkles className="size-3" aria-label="quality" />
          {score.quality}
        </span>
        <span className="flex items-center gap-0.5" title="Connection">
          <Heart className="size-3" aria-label="connection" />
          {score.connection}
        </span>
      </span>
    </div>,
    document.body,
  );
}

/** A header score: counts up to a new total, with a bump, once the flying score (above) lands. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const start = from.current;
    if (value === start) return;
    from.current = value;
    let raf = 0;
    const t = setTimeout(
      () => {
        el.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.7)" }, { transform: "scale(1)" }], { duration: 500, easing: BOUNCY });
        const t0 = performance.now();
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / 500);
          setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      calm() ? 0 : 1800,
    );
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={el} className="inline-block">
      {shown}
    </span>
  );
}

/**
 * Whether either player is typing, for pacing (the next nudge waits while someone's mid-message). My keystrokes are
 * shared over a Realtime broadcast, at most once a second; sending or clearing the message stops it straight away.
 * `partnerTyping` drives the "typing…" bubble; it wears off if their keystrokes stop without a send.
 */
function useTyping(riffId: string) {
  const mine = useRef(0); // last keystroke, ms; 0 = not typing
  const theirs = useRef(0);
  const sentAt = useRef(0);
  const channel = useRef<RealtimeChannel | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const wearOff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const db = supabase();
    const ch = db
      .channel(`typing:${riffId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const typing = !!payload?.typing;
        theirs.current = typing ? Date.now() : 0;
        clearTimeout(wearOff.current);
        if (typing) setPartnerTyping(true);
        // Stopping lingers a second: their message usually lands right after, and the bubble grows into it (Chat).
        wearOff.current = setTimeout(() => setPartnerTyping(false), typing ? PACING.typingSeconds * 1000 : 1000);
      })
      .subscribe();
    channel.current = ch;
    return () => {
      clearTimeout(wearOff.current);
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

  /** Their message arrived: drop the typing bubble in the same update, so Chat can grow the message out of it. */
  const partnerSent = useCallback(() => {
    clearTimeout(wearOff.current);
    setPartnerTyping(false);
  }, []);

  const isTyping = useCallback(() => Date.now() - Math.max(mine.current, theirs.current) < PACING.typingSeconds * 1000, []);
  return { isTyping, onTyping, partnerTyping, partnerSent };
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
    buzz(30);
    setTimeout(() => setPops((p) => p.filter((s) => !fresh.includes(s))), 3500);
  }, [scores, loaded]);
  return pops;
}

function totalsByPlayer(scores: Score[]) {
  const totals = new Map<string, number>();
  for (const s of scores) totals.set(s.player_id, (totals.get(s.player_id) ?? 0) + s.total);
  return totals;
}

/** Haptics, once the page may vibrate (browsers refuse before the first tap and log an error). */
function buzz(pattern: number | number[]) {
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pattern);
}
