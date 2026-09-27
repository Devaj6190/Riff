"use client";

import { ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, ViewTransition } from "react";
import { Avatar, stagger } from "@/components/HomeScreen";
import { flyClone, markMatched } from "@/components/motion";
import type { Profile } from "@/components/Onboarding";
import { ProfilePopup } from "@/components/ProfilePopup";
import { useQueue } from "@/components/useQueue";
import { callApi } from "@/lib/api";
import { INTEREST_CHIPS } from "@/lib/interests";
import { ensureSignedIn } from "@/lib/supabase/client";
import type { Invite, InviteRequest, InviteResponse, MatchResponse, SearchPerson, SearchRequest, SearchResponse } from "@/lib/types";

const SWIPE_PX = 110;

/** Search the live queue (SPEC §7 Discovery). While open we sit in the queue in browse mode: polling /api/match
 *  keeps us there, brings invites in and pairs us once someone says yes. Leaving the screen stops the poll. */
export function SearchScreen({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(SearchResponse & { query: string }) | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [answered, setAnswered] = useState<number[]>([]);
  const [sent, setSent] = useState<MatchResponse["sent"]>({});
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SearchPerson | null>(null); // whose profile is open
  const gone = useRef(false);
  const bar = useRef<HTMLLabelElement>(null);

  function go(code: string) {
    if (gone.current) return;
    gone.current = true;
    markMatched(code); // the chat opens with "It's a match"
    router.push(`/r/${code}`);
  }

  // One sign-in before anything calls the API; two at once would make two anonymous users.
  useEffect(() => {
    ensureSignedIn()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't connect"));
  }, []);

  useQueue(profile, "browse", ready, (res) => {
    if (res.code) return go(res.code);
    setInvites(res.invites);
    setSent(res.sent);
  });

  // Search on open ("") and on a debounced query. `live` drops answers to queries we've moved past.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const q = query.trim();
    const t = setTimeout(
      () =>
        callApi<SearchResponse>("/api/search", { query: q } satisfies SearchRequest)
          .then((res) => live && setResults({ ...res, query: q }))
          .catch((e) => live && setError(e instanceof Error ? e.message : "Search failed")),
      q ? 400 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ready, query]);

  async function tap(person: SearchPerson) {
    if (sent[person.id] || gone.current) return;
    setSent((s) => ({ ...s, [person.id]: "pending" })); // the next poll replaces this with the server's view
    try {
      const { code } = await callApi<InviteResponse>("/api/invite", { action: "send", to: person.id } satisfies InviteRequest);
      if (code) go(code); // else a browse-mode person: the invite waits, and the poll brings their answer
    } catch (e) {
      setSent((s) => {
        const next = { ...s };
        delete next[person.id];
        return next;
      });
      setError(e instanceof Error ? e.message : "Couldn't send the invite");
    }
  }

  async function answer(invite: Invite, accept: boolean) {
    setAnswered((a) => [...a, invite.id]);
    try {
      const { code } = await callApi<InviteResponse>("/api/invite", { action: "answer", id: invite.id, accept } satisfies InviteRequest);
      if (code) go(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't answer the invite");
    }
  }

  const invite = invites.find((i) => !answered.includes(i.id));
  const loading = !results || results.query !== query.trim();
  const action = (p: SearchPerson) => {
    const status = sent[p.id];
    return status === "pending" ? "Invited…" : status === "passed" ? "Passed" : p.mode === "match" ? "Chat" : "Invite";
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 pt-3 pb-8">
      <header className="flex items-center gap-1">
        <Link href="/" aria-label="Back" className="-ml-2 flex size-11 items-center justify-center text-primary">
          <ChevronLeft className="size-7" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Find people</h1>
      </header>

      {/* The Search people card on Home morphs into this bar. */}
      <ViewTransition name="search-bar" share="morph" default="none">
      <label ref={bar} className="flex h-12 items-center gap-2.5 rounded-full bg-muted px-5">
        <Search className="size-5 shrink-0 text-foreground/40" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={120}
          placeholder="Someone to debate Marvel vs DC…"
          aria-label="Search people"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-foreground/40"
        />
      </label>
      </ViewTransition>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {INTEREST_CHIPS.map((c) => {
          const on = query.trim().toLowerCase() === c;
          return (
            <button
              key={c}
              aria-pressed={on}
              onClick={(e) => {
                if (!on) flyClone(e.currentTarget, bar.current!.getBoundingClientRect()); // the chip flies into the bar
                setQuery(on ? "" : c);
              }}
              className={`h-9 shrink-0 rounded-full px-4 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {c}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {results?.noMatch && !loading && <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">No one like that is on right now</p>}

      <ul className={`flex flex-col transition-opacity ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
        {results?.people.map((p, i) => {
          const first = p.prompts?.[0];
          return (
            // Keyed by query: each new result set springs out of the search bar again.
            <li key={`${results.query}|${p.id}`} className="riff-burst-row" style={stagger(i)}>
              <button onClick={() => setViewing(p)} className="flex w-full items-center gap-3 border-b border-current/10 py-3 text-left">
                <Avatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="truncate text-sm text-foreground/60">{first ? `${first.prompt} ${first.answer}` : [p.school, p.interests.join(", ")].filter(Boolean).join(" · ")}</p>
                  {p.bio && <p className="truncate text-sm text-foreground/45">{p.bio}</p>}
                </div>
                <span className={`shrink-0 text-sm font-semibold ${sent[p.id] ? "text-foreground/45" : "text-primary"}`}>{action(p)}</span>
              </button>
            </li>
          );
        })}
        {!results && <li className="py-3 text-sm text-foreground/50">Looking for who&apos;s on…</li>}
      </ul>

      {/* Steps aside while an invite is up: the modal would make the invite card untappable. */}
      {viewing && !invite && (
        <ProfilePopup profile={{ ...viewing, from: viewing.from ?? "", prompts: viewing.prompts ?? [], favorites: viewing.favorites ?? [] }} onClose={() => setViewing(null)}>
          <button
            onClick={() => tap(viewing)}
            disabled={!!sent[viewing.id]}
            className="h-12 rounded-full bg-primary font-semibold text-primary-foreground transition-[opacity,scale] active:scale-[0.98] disabled:opacity-50"
          >
            {action(viewing)}
          </button>
        </ProfilePopup>
      )}
      {invite && <InviteCard key={invite.id} invite={invite} onAnswer={(accept) => answer(invite, accept)} />}

    </div>
  );
}

/** An incoming invite, mid-screen. Swipe (or tap) right to chat, left to pass. */
function InviteCard({ invite, onAnswer }: { invite: Invite; onAnswer: (accept: boolean) => void }) {
  const [dx, setDx] = useState(0);
  const [x0, setX0] = useState<number | null>(null); // pointer start while dragging
  const [leaving, setLeaving] = useState(false);
  const p = invite.from;

  function decide(accept: boolean) {
    setLeaving(true);
    setDx(accept ? 600 : -600);
    setTimeout(() => onAnswer(accept), 250);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-black/30 px-6 backdrop-blur-sm">
      {/* The pop lives on a wrapper: its finished transform would override the drag's inline one. */}
      <div className="riff-pop w-full max-w-sm">
      <div
        role="dialog"
        aria-label={`${p.name} wants to chat`}
        onPointerDown={(e) => {
          if (leaving) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setX0(e.clientX);
        }}
        onPointerMove={(e) => x0 !== null && setDx(e.clientX - x0)}
        onPointerUp={() => {
          setX0(null);
          if (Math.abs(dx) > SWIPE_PX) decide(dx > 0);
          else setDx(0);
        }}
        onPointerCancel={() => {
          setX0(null);
          setDx(0);
        }}
        style={{ transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition: x0 === null ? "transform 0.3s ease-out" : "none" }}
        className="relative w-full cursor-grab touch-none rounded-3xl bg-background p-6 shadow-2xl select-none active:cursor-grabbing"
      >
        <span className="absolute top-5 right-5 rounded-full bg-green-500 px-3 py-1 text-sm font-bold text-white" style={{ opacity: Math.min(1, Math.max(0, dx) / SWIPE_PX) }}>
          CHAT
        </span>
        <span className="absolute top-5 left-5 rounded-full bg-foreground/20 px-3 py-1 text-sm font-bold text-foreground" style={{ opacity: Math.min(1, Math.max(0, -dx) / SWIPE_PX) }}>
          PASS
        </span>
        <div className="flex flex-col items-center gap-2 pt-4 text-center">
          <Avatar name={p.name} className="size-20 text-3xl" />
          <p className="mt-1 text-sm text-foreground/50">wants to chat</p>
          <p className="text-2xl font-bold">{p.name}</p>
          {p.school && <p className="text-foreground/60">{p.school}</p>}
          {p.bio && <p className="text-foreground/70">{p.bio}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {p.interests.map((i) => (
              <span key={i} className="rounded-full bg-muted px-3 py-1 text-sm">
                {i}
              </span>
            ))}
          </div>
        </div>
      </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => decide(false)} disabled={leaving} className="h-12 rounded-full bg-background/90 px-6 font-semibold">
          Pass
        </button>
        <button onClick={() => decide(true)} disabled={leaving} className="h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground">
          Chat
        </button>
      </div>
    </div>
  );
}
