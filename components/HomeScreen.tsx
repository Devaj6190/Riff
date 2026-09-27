"use client";

import { ArrowRight, Check, ChevronRight, MessagesSquare, Search, Send, UserMinus, UserRound, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, ViewTransition, type CSSProperties } from "react";
import { Logo } from "@/components/Logo";
import type { Profile } from "@/components/Onboarding";
import { ProfilePopup } from "@/components/ProfilePopup";
import { addFriend, chatsWith, loadFriends, personaOf, photoOf, removeFriend, sendFriendInvite, type Friend } from "@/components/friends";
import { BOUNCY, calm, markMatched } from "@/components/motion";
import { useQueue } from "@/components/useQueue";
import { callApi } from "@/lib/api";
import { normalizeInterests, overlap } from "@/lib/interests";
import type { BotRequest, InviteRequest, InviteResponse, MatchPartner, ProfileRequest, ProfileResponse } from "@/lib/types";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";

/** Apple-style contact avatar: grey gradient, white initial. The AI's people have a photo (photos.ts) instead. */
export function Avatar({ name, photo, className = "size-11" }: { name: string; photo?: string; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null); // a photo that didn't load: show the initial
  if (photo && photo !== broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- pre-sized 256 px WebPs in public/, nothing to optimize
      <img
        src={photo}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(photo)}
        ref={(el) => {
          if (el?.complete && !el.naturalWidth) setBroken(photo); // failed before hydration, when onError can't fire
        }}
        className={`shrink-0 rounded-full bg-[#868a94] object-cover ${className}`}
      />
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-linear-to-b from-[#a8adb8] to-[#868a94] font-semibold text-white ${className}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Delay for the nth sibling's .riff-rise (capped, so long lists don't drag). */
export const stagger = (i: number) => ({ "--i": Math.min(i, 10) }) as CSSProperties;

const heading = "text-xl font-semibold tracking-tight lg:text-2xl";
const card = "flex items-center gap-4 rounded-3xl p-5 text-left lg:gap-5 lg:p-7";
const lift = "transition-[translate,scale,opacity] duration-200 hover:-translate-y-0.5 active:scale-[0.98]"; // cards rise under the pointer, sink when pressed
const dimmed = "opacity-35"; // the rest of Start talking while Match me searches
const option = "flex h-12 items-center justify-center gap-2 rounded-full font-semibold";
/** Match me's reveal, in ms after pairing: their interests fly in, then it all springs into the card, then the chat. */
const REVEAL = { collapse: 1100, open: 1750 };

/** Start talking (Match me, search) and friends side by side on desktop, your profile centered below. */
export function HomeScreen({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [found, setFound] = useState<MatchPartner | null>(null);
  const matchCard = useRef<HTMLDivElement>(null);

  // The server's copy of my profile wins. None yet: this device's profile moves up (people from before profiles).
  const syncProfile = useEffectEvent(async () => {
    try {
      await ensureSignedIn();
      const { profile: server } = await callApi<ProfileResponse>("/api/profile", { action: "get" } satisfies ProfileRequest);
      if (server) return onProfile(server as Profile);
      const { profile: saved } = await callApi<ProfileResponse>("/api/profile", { action: "save", profile: { ...profile, prompts: [], favorites: [] } } satisfies ProfileRequest);
      if (saved) onProfile(saved as Profile);
    } catch {
      // offline, or an old profile the server won't take: keep this device's and try again next visit
    }
  });
  useEffect(() => {
    void syncProfile();
  }, []);

  // Paired (a real person, or a seed after ~3 s): their interests fly into the orbit, it pulls in and bursts, the card
  // bumps, then the chat opens (and plays "It's a match").
  useQueue(profile, "match", matching && !found, (res) => {
    if (!res.code) return;
    const code = res.code;
    setFound(res.partner ?? { name: "", interests: [] });
    markMatched(code);
    matchCard.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: 500, delay: REVEAL.collapse + 300, easing: BOUNCY });
    setTimeout(() => router.push(`/r/${code}`), calm() ? 0 : REVEAL.open);
  });

  async function matchMe() {
    setError(null);
    try {
      await ensureSignedIn(); // before the poll starts: two parallel sign-ins would make two users
      setMatching(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect");
    }
  }

  /** A chat to share by link, or one with the AI as the other player. */
  async function startRiff(withBot = false) {
    setBusy(true);
    setError(null);
    try {
      await ensureSignedIn();
      const { data, error } = await supabase().rpc("create_riff", { p_name: profile.name, p_interests: normalizeInterests(profile.interests) }); // a chat takes 3 (DB check)
      if (error) throw new Error(error.message);
      if (withBot) {
        await callApi("/api/bot", { code: data } satisfies BotRequest);
        markMatched(data);
      }
      router.push(`/r/${data}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a chat");
      setBusy(false);
    }
  }

  return (
    <>
      {/* overflow-x-clip: the Match me orbit can't push the page sideways. */}
      <div className="mx-auto flex w-full max-w-lg flex-col gap-10 overflow-x-clip px-5 pt-6 pb-14 lg:min-h-dvh lg:max-w-5xl lg:justify-center lg:gap-12 lg:px-8 lg:py-12">
        <header className="riff-rise">
          <h1 className="text-4xl lg:text-5xl">
            {/* A plain <a>, not <Link>: a full load counts as a fresh visit, which opens on the landing. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">
              <Logo />
            </a>
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
          <section className="riff-rise flex flex-col gap-3" style={stagger(1)} aria-labelledby="start">
            <h2 id="start" className={heading}>
              Start talking
            </h2>
            {matching ? (
              <div className="relative">
                <Orbit interests={profile.interests} partner={found} />
                <div ref={matchCard} className={`${card} relative z-[1] bg-primary text-primary-foreground`} aria-live="polite">
                  <span className="relative flex size-12 shrink-0 items-center justify-center gap-1 rounded-full bg-primary-foreground/10 lg:size-14">
                    {found ? (
                      <Check className="riff-pop size-6 lg:size-7" />
                    ) : (
                      [0, 1, 2].map((i) => <span key={i} className="riff-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />)
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold lg:text-xl">{found ? (found.name ? `Matched with ${found.name}` : "Matched") : "Finding someone…"}</p>
                    <p className="text-sm opacity-70 lg:text-base">{found ? "Opening your chat" : "You'll jump in as soon as they're there"}</p>
                  </div>
                  {!found && (
                    <button onClick={() => setMatching(false)} className="h-10 rounded-full px-3 text-sm font-semibold underline-offset-4 hover:underline">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button onClick={matchMe} className={`${card} ${lift} bg-primary text-primary-foreground`}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10 lg:size-14">
                  <Zap className="size-6 lg:size-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold lg:text-xl">Match me</p>
                  <p className="text-sm opacity-70 lg:text-base">Get paired with someone right now</p>
                </div>
                <ArrowRight className="size-6 shrink-0" />
              </button>
            )}
            {/* Morphs into the search bar on /search (SearchScreen). */}
            <ViewTransition name="search-bar" share="morph" default="none">
              <Link href="/search" className={`${card} ${lift} bg-muted ${matching ? dimmed : ""}`}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/10 lg:size-14">
                  <Search className="size-6 lg:size-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold lg:text-xl">Search people</p>
                  <p className="text-sm text-foreground/60 lg:text-base">Find someone into what you&apos;re into</p>
                </div>
                <ArrowRight className="size-6 shrink-0" />
              </Link>
            </ViewTransition>

            <div className={`flex flex-wrap justify-center gap-x-5 pt-1 text-sm text-foreground/60 transition-opacity duration-300 lg:text-base ${matching ? dimmed : ""}`}>
              <button onClick={() => startRiff(true)} disabled={busy} className="h-10 hover:text-foreground disabled:opacity-40">
                Test with AI
              </button>
              <button onClick={() => startRiff()} disabled={busy} className="h-10 hover:text-foreground disabled:opacity-40">
                Invite by link
              </button>
              <button onClick={() => setJoining(!joining)} aria-expanded={joining} className="h-10 hover:text-foreground">
                Have a code?
              </button>
            </div>
            {joining && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  router.push(`/r/${code}`);
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  maxLength={4}
                  placeholder="ABCD"
                  autoCapitalize="characters"
                  aria-label="Chat code"
                  className="h-12 min-w-0 flex-1 rounded-full bg-muted px-5 font-mono tracking-widest placeholder:text-foreground/40"
                />
                <button type="submit" disabled={code.length !== 4} className="h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-40">
                  Join
                </button>
              </form>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
          </section>

          <FriendsSection profile={profile} />
        </div>

        <section className="riff-rise flex w-full flex-col gap-3 lg:mx-auto lg:max-w-2xl" style={stagger(3)} aria-labelledby="profile">
          <h2 id="profile" className={heading}>
            Profile
          </h2>
          <div className={`${card} bg-muted`}>
            <Avatar name={profile.name} className="size-14 text-xl lg:size-16 lg:text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold lg:text-xl">
                {profile.name} {profile.lastName}
              </p>
              <p className="truncate text-sm text-foreground/60 lg:text-base">{profile.from}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {profile.interests.slice(0, 8).map((i) => (
                  <li key={i} className="rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs lg:text-sm">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={() => setEditing(true)} className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
              View profile
            </button>
          </div>
        </section>
      </div>
      {editing && <ProfilePopup profile={profile} onSaved={onProfile} onClose={() => setEditing(false)} />}
    </>
  );
}

/**
 * Match me's search: your interests orbit the card on a flat ellipse that stays inside its width (the front half passes
 * over the card, the back half behind it). Paired: their interests fly in from the right, one after another, in
 * lavender. One you share lands on yours, which pops and glows; a new one takes a spot between yours. Then everything
 * springs into the middle and a ring bursts out.
 */
function Orbit({ interests, partner }: { interests: string[]; partner: MatchPartner | null }) {
  const layer = useRef<HTMLDivElement>(null);
  const pills = useRef<(HTMLSpanElement | null)[]>([]);
  const theirs = useRef<(HTMLSpanElement | null)[]>([]);
  const ring = useRef<HTMLSpanElement>(null);
  const sim = useRef({ r: 0, v: 0, a: 0 }); // radius 0..1 (a spring, so it overshoots), angle
  const shown = interests.slice(0, 6);
  const incoming = partner?.interests.slice(0, 3) ?? [];

  useEffect(() => {
    if (calm()) return;
    const shown = interests.slice(0, 6);
    const box = layer.current!.getBoundingClientRect();
    const rx = Math.max(60, box.width / 2 - 24); // pills stay inside the card's width: nothing sticks out past the page
    const ry = box.height / 2 + 22;
    const step = (Math.PI * 2) / Math.max(1, shown.length);

    // Where each of theirs lands, as an orbit slot (mine sit on 0, 1, 2…): on mine if we share a word, else in a gap.
    const sharedWith = (t: string) => shown.findIndex((m) => overlap([m])([t]) > 0);
    const landing = (partner?.interests.slice(0, 3) ?? []).map(sharedWith);
    const gaps = landing.filter((mine) => mine < 0).length;
    let k = 0;
    const flights = landing.map((mine) => {
      const n = shown.length;
      const slot = mine >= 0 ? mine : n >= gaps ? Math.floor((k * n) / gaps) + 0.5 : ((k + 0.5) * n) / gaps;
      if (mine < 0) k++;
      return { mine, slot, p: 0, v: 0, landed: false };
    });
    const pop = shown.map(() => ({ s: 0, v: 0 })); // a shared pill's springy pop when theirs lands on it

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      const s = sim.current;
      const target = partner && t >= REVEAL.collapse ? 0 : 1;
      s.v = (s.v + (target - s.r) * 0.06) * 0.82;
      s.r += s.v;
      s.a += 0.01;
      const size = 0.4 + 0.6 * Math.max(0, s.r);
      const fade = String(Math.min(1, Math.max(0, s.r * 1.5)));
      const place = (el: HTMLElement, slot: number, offset = "", scale = size) => {
        const ang = s.a + slot * step;
        el.style.transform = `translate(-50%, -50%) translate(${Math.cos(ang) * s.r * rx}px, ${Math.sin(ang) * s.r * ry}px)${offset} scale(${scale})`;
        el.style.zIndex = Math.sin(ang) > 0 ? "2" : "0"; // the card is z-1
      };
      pills.current.forEach((p, i) => {
        if (!p) return;
        const b = pop[i];
        b.v = (b.v - b.s * 0.12) * 0.8;
        b.s += b.v;
        place(p, i, "", size * (1 + b.s));
        p.style.opacity = fade;
      });
      theirs.current.forEach((p, j) => {
        const f = flights[j];
        if (!p || !f || t < j * 140) return; // one after another
        f.v = (f.v + (1 - f.p) * 0.07) * 0.8;
        f.p += f.v;
        // From off the card's top right to its slot: an offset that shrinks to 0 as the spring lands (and overshoots).
        const off = 1 - f.p;
        place(p, f.slot, ` translate(${off * (rx + 160)}px, ${off * -ry}px) rotate(${off * 30}deg)`);
        if (f.mine >= 0 && !f.landed && f.p > 0.92) {
          f.landed = true;
          pop[f.mine].v += 0.12;
          pills.current[f.mine]?.animate(
            [{ boxShadow: "0 0 0 0 rgb(201 184 255 / 0)" }, { boxShadow: "0 0 0 2px #c9b8ff, 0 0 22px 6px rgb(201 184 255 / .7)" }, { boxShadow: "0 0 0 2px #c9b8ff, 0 0 12px 2px rgb(201 184 255 / .35)" }],
            { duration: 650, easing: "ease-out", fill: "forwards" },
          );
        }
        p.style.opacity = f.landed ? "0" : f.mine >= 0 ? "1" : String(Math.min(1, f.p * 3, Math.max(0, s.r * 1.5)));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const burst = partner ? setTimeout(() => ring.current?.animate([{ transform: "translate(-50%,-50%) scale(.5)", opacity: 0.9 }, { transform: "translate(-50%,-50%) scale(5)", opacity: 0 }], { duration: 700, easing: "ease-out" }), REVEAL.collapse + 250) : undefined;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(burst);
    };
  }, [partner, interests]);

  return (
    <div ref={layer} aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute top-1/2 left-1/2">
        {shown.map((t, i) => (
          <span
            key={t}
            ref={(el) => {
              pills.current[i] = el;
            }}
            className="absolute top-0 left-0 rounded-full bg-[#2a3456] px-3 py-1 text-sm whitespace-nowrap text-foreground opacity-0"
          >
            {t}
          </span>
        ))}
        {incoming.map((t, j) => (
          <span
            key={t}
            ref={(el) => {
              theirs.current[j] = el;
            }}
            className="absolute top-0 left-0 rounded-full bg-[#c9b8ff] px-3 py-1 text-sm font-semibold whitespace-nowrap text-navy opacity-0"
          >
            {t}
          </span>
        ))}
        <span ref={ring} className="absolute top-0 left-0 z-[2] size-16 rounded-full border-2 border-cream opacity-0" />
      </div>
    </div>
  );
}

/** Your friends, and people who added you (add them back). Tap a friend for: invite to chat, profile, old chats, remove. */
function FriendsSection({ profile }: { profile: Profile }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadFriends>> | null>(null);
  const [open, setOpen] = useState<Friend | null>(null);
  const [view, setView] = useState<"menu" | "profile" | "chats">("menu");
  const [chats, setChats] = useState<{ code: string; at: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [personaInvite, setPersonaInvite] = useState(false);
  const sendIcon = useRef<HTMLSpanElement>(null);
  const sending = useRef(false);
  const persona = open ? personaOf(open) : undefined;

  const reload = () => loadFriends().then(setData);
  useEffect(() => {
    let live = true;
    loadFriends().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);

  // An AI persona is invited like a tap in Search: join the queue, then /api/invite seats the bot as them.
  useQueue(profile, "browse", personaInvite, async () => {
    setPersonaInvite(false);
    try {
      const { code } = await callApi<InviteResponse>("/api/invite", { action: "send", to: persona!.id } satisfies InviteRequest);
      if (!code) return;
      markMatched(code);
      router.push(`/r/${code}`);
    } catch {
      fail();
    }
  });

  function fail() {
    sending.current = false;
    setBusy(false);
    setNote("Couldn't send the invite");
  }

  /** Opens a new chat and tells them wherever they are in the app; you wait in it until they join. */
  async function invite(f: Friend) {
    if (sending.current) return; // a second tap while the plane is still flying
    sending.current = true;
    setNote(null);
    // The paper plane takes off first, then the button turns into "Opening a chat…".
    await sendIcon.current?.animate([{ transform: "none", opacity: 1 }, { transform: "translate(90px, -50px) rotate(25deg) scale(.5)", opacity: 0 }], { duration: calm() ? 0 : 380, easing: "cubic-bezier(0.5, 0, 0.8, 0.3)" }).finished;
    setBusy(true);
    try {
      const me = await ensureSignedIn(); // before any poll starts
      if (persona) return setPersonaInvite(true);
      const { data: code, error } = await supabase().rpc("create_riff", { p_name: profile.name, p_interests: normalizeInterests(profile.interests) });
      if (error) throw error;
      await sendFriendInvite(f.userId, { from: me.id, name: profile.name, code });
      router.push(`/r/${code}`);
    } catch {
      fail();
    }
  }

  function show(f: Friend) {
    setOpen(f);
    setView("menu");
    setNote(null);
    dialog.current?.showModal();
  }

  async function showChats(f: Friend) {
    setView("chats");
    setChats(null);
    setChats(await chatsWith(f));
  }

  return (
    <section className="riff-rise flex flex-col gap-3" style={stagger(2)} aria-labelledby="friends">
      <h2 id="friends" className={heading}>
        Friends
      </h2>
      <div className="flex flex-col gap-4 rounded-3xl bg-muted p-5 lg:flex-1 lg:p-7">
        {data?.requests.length === 0 && data.friends.length === 0 && (
          <p className="text-foreground/55">Add people at the end of a chat. Once they add you back, you can invite each other and keep your old chats.</p>
        )}
        {!!data?.requests.length && (
          <ul className="flex flex-col divide-y divide-current/10 border-b border-current/10 pb-2">
            {data.requests.map((r, i) => (
              <li key={r.userId} className="riff-rise flex items-center gap-3 py-2" style={stagger(3 + i)}>
                <Avatar name={r.name} photo={photoOf(r)} />
                <p className="min-w-0 flex-1 truncate">
                  <b>{r.name}</b> added you
                </p>
                <button onClick={() => addFriend(r).then(reload)} className="h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  Add back
                </button>
                <button onClick={() => removeFriend(r).then(reload)} aria-label={`Ignore ${r.name}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/50 hover:text-foreground">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {data?.friends.map((f, i) => (
            <li key={f.userId + f.name} className="riff-rise" style={stagger(3 + i)}>
              <button onClick={() => show(f)} className="flex w-full flex-col items-center gap-1.5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-95">
                <Avatar name={f.name} photo={photoOf(f)} className="size-14 text-xl lg:size-16 lg:text-2xl" />
                <span className="max-w-full truncate text-xs font-semibold lg:text-sm">{f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <dialog
        ref={dialog}
        onClose={() => {
          if (dialog.current?.open) return; // the close event is async: another friend's menu already opened
          setPersonaInvite(false);
          sending.current = false;
          setBusy(false);
        }}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()} // a click on the backdrop
        className="riff-dialog m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl bg-background text-foreground ring-1 ring-white/10 backdrop:bg-black/60"
      >
        {open && (
          <div className="riff-pop flex flex-col gap-5 p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Avatar name={open.name} photo={photoOf(open)} className="size-20 text-3xl" />
              <p className="text-xl font-semibold">{open.name}</p>
              {persona && <p className="text-sm text-foreground/60">{persona.school}</p>}
            </div>

            {view === "menu" && (
              <div className="flex flex-col gap-2">
                <button onClick={() => invite(open)} disabled={busy} className={`${option} bg-primary text-primary-foreground disabled:opacity-60`}>
                  {busy ? (
                    <svg viewBox="0 0 24 24" className="riff-pop size-5 animate-spin" aria-hidden>
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="40 60" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span ref={sendIcon}>
                      <Send className="size-5" />
                    </span>
                  )}
                  {busy ? "Opening a chat…" : "Invite to chat"}
                </button>
                {note && <p className="text-center text-sm text-red-300">{note}</p>}
                <button onClick={() => setView("profile")} className={`${option} bg-muted`}>
                  <UserRound className="size-5" /> View profile
                </button>
                <button onClick={() => showChats(open)} className={`${option} bg-muted`}>
                  <MessagesSquare className="size-5" /> Previous chats
                </button>
                <button
                  onClick={async () => {
                    await removeFriend(open);
                    await reload();
                    dialog.current?.close();
                  }}
                  className={`${option} text-red-300`}
                >
                  <UserMinus className="size-5" /> Remove friend
                </button>
              </div>
            )}

            {view === "profile" && (
              <div className="flex flex-col items-center gap-3 text-center">
                {persona && <p className="text-foreground/75">{persona.bio}</p>}
                <ul className="flex flex-wrap justify-center gap-1.5">
                  {(persona?.interests ?? open.interests).map((i) => (
                    <li key={i} className="rounded-full bg-foreground/10 px-3 py-1 text-sm">
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {view === "chats" && (
              <ul className="flex max-h-72 flex-col divide-y divide-current/10 overflow-y-auto">
                {chats === null && <li className="py-3 text-center text-foreground/50">Loading…</li>}
                {chats?.length === 0 && <li className="py-3 text-center text-foreground/55">No chats yet</li>}
                {chats?.map((c) => (
                  <li key={c.code}>
                    <Link href={`/r/${c.code}`} className="flex items-center justify-between py-3">
                      {new Date(c.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      <ChevronRight className="size-4 text-foreground/40" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {view !== "menu" && (
              <button onClick={() => setView("menu")} className="h-10 text-sm font-semibold text-foreground/60 hover:text-foreground">
                Back
              </button>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
