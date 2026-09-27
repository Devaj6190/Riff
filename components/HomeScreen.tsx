"use client";

import { ArrowRight, ChevronRight, MessagesSquare, Search, Send, UserMinus, UserRound, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Onboarding, type Profile } from "@/components/Onboarding";
import { addFriend, chatsWith, loadFriends, personaOf, removeFriend, sendFriendInvite, type Friend } from "@/components/friends";
import { useQueue } from "@/components/useQueue";
import { callApi } from "@/lib/api";
import { normalizeInterests } from "@/lib/interests";
import type { BotRequest, InviteRequest, InviteResponse } from "@/lib/types";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";

/** Apple-style contact avatar: grey gradient, white initial. */
export function Avatar({ name, className = "size-11" }: { name: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-linear-to-b from-[#a8adb8] to-[#868a94] font-semibold text-white ${className}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const heading = "text-xl font-semibold tracking-tight lg:text-2xl";
const card = "flex items-center gap-4 rounded-3xl p-5 text-left lg:gap-5 lg:p-7";
const option = "flex h-12 items-center justify-center gap-2 rounded-full font-semibold";

/** Start talking (Match me, search) and friends side by side on desktop, your profile centered below. */
export function HomeScreen({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useQueue(profile, "match", matching, (res) => res.code && router.push(`/r/${res.code}`));

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
      if (withBot) await callApi("/api/bot", { code: data } satisfies BotRequest);
      router.push(`/r/${data}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a chat");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-10 px-5 pt-6 pb-14 lg:min-h-dvh lg:max-w-5xl lg:justify-center lg:gap-12 lg:px-8 lg:py-12">
        <header>
          <h1 className="text-4xl lg:text-5xl">
            {/* A plain <a>, not <Link>: a full load counts as a fresh visit, which opens on the landing. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">
              <Logo />
            </a>
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
          <section className="flex flex-col gap-3" aria-labelledby="start">
            <h2 id="start" className={heading}>
              Start talking
            </h2>
            {matching ? (
              <div className={`${card} bg-primary text-primary-foreground`} aria-live="polite">
                <span className="flex size-12 shrink-0 items-center justify-center gap-1 rounded-full bg-primary-foreground/10 lg:size-14">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="riff-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold lg:text-xl">Finding someone…</p>
                  <p className="text-sm opacity-70 lg:text-base">You&apos;ll jump in as soon as they&apos;re there</p>
                </div>
                <button onClick={() => setMatching(false)} className="h-10 rounded-full px-3 text-sm font-semibold underline-offset-4 hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={matchMe} className={`${card} bg-primary text-primary-foreground transition-transform active:scale-[0.98]`}>
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
            <Link href="/search" className={`${card} bg-muted transition-transform active:scale-[0.98]`}>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/10 lg:size-14">
                <Search className="size-6 lg:size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold lg:text-xl">Search people</p>
                <p className="text-sm text-foreground/60 lg:text-base">Find someone into what you&apos;re into</p>
              </div>
              <ArrowRight className="size-6 shrink-0" />
            </Link>

            <div className="flex flex-wrap justify-center gap-x-5 pt-1 text-sm text-foreground/60 lg:text-base">
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

        <section className="flex w-full flex-col gap-3 lg:mx-auto lg:max-w-2xl" aria-labelledby="profile">
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
            {/* ponytail: opens the edit flow until the profile page exists. */}
            <button onClick={() => setEditing(true)} className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
              View profile
            </button>
          </div>
        </section>
      </div>
      {editing && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-background">
          <Onboarding
            initial={profile}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onDone={(p) => {
              onProfile(p);
              setEditing(false);
            }}
          />
        </div>
      )}
    </>
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
      if (code) router.push(`/r/${code}`);
    } catch {
      fail();
    }
  });

  function fail() {
    setBusy(false);
    setNote("Couldn't send the invite");
  }

  /** Opens a new chat and tells them wherever they are in the app; you wait in it until they join. */
  async function invite(f: Friend) {
    setBusy(true);
    setNote(null);
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
    <section className="flex flex-col gap-3" aria-labelledby="friends">
      <h2 id="friends" className={heading}>
        Friends
      </h2>
      <div className="flex flex-col gap-4 rounded-3xl bg-muted p-5 lg:flex-1 lg:p-7">
        {data?.requests.length === 0 && data.friends.length === 0 && (
          <p className="text-foreground/55">Add people at the end of a chat. Once they add you back, you can invite each other and keep your old chats.</p>
        )}
        {!!data?.requests.length && (
          <ul className="flex flex-col divide-y divide-current/10 border-b border-current/10 pb-2">
            {data.requests.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 py-2">
                <Avatar name={r.name} />
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
          {data?.friends.map((f) => (
            <li key={f.userId + f.name}>
              <button onClick={() => show(f)} className="flex w-full flex-col items-center gap-1.5 transition-transform active:scale-95">
                <Avatar name={f.name} className="size-14 text-xl lg:size-16 lg:text-2xl" />
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
          setBusy(false);
        }}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()} // a click on the backdrop
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl bg-background text-foreground ring-1 ring-white/10 backdrop:bg-black/60"
      >
        {open && (
          <div className="riff-pop flex flex-col gap-5 p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Avatar name={open.name} className="size-20 text-3xl" />
              <p className="text-xl font-semibold">{open.name}</p>
              {persona && <p className="text-sm text-foreground/60">{persona.school}</p>}
            </div>

            {view === "menu" && (
              <div className="flex flex-col gap-2">
                <button onClick={() => invite(open)} disabled={busy} className={`${option} bg-primary text-primary-foreground disabled:opacity-60`}>
                  <Send className="size-5" /> {busy ? "Opening a chat…" : "Invite to chat"}
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
