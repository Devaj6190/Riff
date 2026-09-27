"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Onboarding, type Profile } from "@/components/Onboarding";
import { callApi } from "@/lib/api";
import { normalizeInterests } from "@/lib/interests";
import type { BotRequest, RiffPhase } from "@/lib/types";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";

/** Apple-style contact avatar: grey gradient, white initial. */
export function Avatar({ name, className = "size-11" }: { name: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-linear-to-b from-[#a8adb8] to-[#868a94] font-semibold text-white ${className}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

type ChatSummary = { code: string; phase: RiffPhase; partner: string | null; last: string | null; at: string };

/** Chats this device has been in, newest activity first, Messages-style. Signed-out visitors just get none. */
function useMyChats() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const db = supabase();
      const { data: auth } = await db.auth.getSession();
      const uid = auth.session?.user.id;
      if (!uid) return;
      const { data: mine } = await db
        .from("players")
        .select("riff_id, joined_at, riffs(code, phase)")
        .eq("user_id", uid)
        .order("joined_at", { ascending: false })
        .limit(20);
      if (!mine?.length) return;
      const ids = mine.map((p) => p.riff_id as string);
      // ponytail: the newest 200 messages across these chats cover the previews; older chats just show "Say hi".
      const [others, msgs] = await Promise.all([
        db.from("players").select("riff_id, name").in("riff_id", ids).neq("user_id", uid),
        db.from("messages").select("riff_id, body, created_at").in("riff_id", ids).order("id", { ascending: false }).limit(200),
      ]);
      const list = mine.map((p) => {
        const riff = (Array.isArray(p.riffs) ? p.riffs[0] : p.riffs) as { code: string; phase: RiffPhase };
        const last = msgs.data?.find((m) => m.riff_id === p.riff_id);
        return {
          code: riff.code,
          phase: riff.phase,
          partner: others.data?.find((o) => o.riff_id === p.riff_id)?.name ?? null,
          last: last?.body ?? null,
          at: last?.created_at ?? (p.joined_at as string),
        };
      });
      if (live) setChats(list.sort((a, b) => b.at.localeCompare(a.at)));
    })();
    return () => {
      live = false;
    };
  }, []);
  return chats;
}

function shortTime(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function HomeScreen({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chats = useMyChats();

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
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-8 md:grid-cols-2 md:gap-12 md:py-12">
        <div className="flex min-w-0 flex-col gap-8">
          <header>
            <h1 className="text-5xl">
              {/* A plain <a>, not <Link>: a full load counts as a fresh visit, which opens on the landing. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/">
                <Logo />
              </a>
            </h1>
            <p className="opacity-60">For everything after hello.</p>
          </header>

          <section className="flex flex-col gap-3">
            <button onClick={() => startRiff()} disabled={busy} className="h-12 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? "…" : "Start a chat"}
            </button>
            <button onClick={() => startRiff(true)} disabled={busy} className="h-11 rounded-full text-sm font-semibold text-primary disabled:opacity-40">
              Test with AI
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/r/${code}`);
              }}
              className="flex gap-2"
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                maxLength={4}
                placeholder="Have a code? ABCD"
                autoCapitalize="characters"
                aria-label="Chat code"
                className="h-12 min-w-0 flex-1 rounded-full bg-muted px-5 font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal"
              />
              <button type="submit" disabled={code.length !== 4} className="h-12 rounded-full px-5 font-semibold text-primary disabled:opacity-40">
                Join
              </button>
            </form>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </section>

          {chats.length > 0 && (
            <section className="flex flex-col">
              <h2 className="mb-1 text-lg font-semibold">Chats</h2>
              <ul className="flex flex-col">
                {chats.map((c) => (
                  <li key={c.code}>
                    <Link href={`/r/${c.code}`} className="flex items-center gap-3 border-b border-current/10 py-3">
                      <Avatar name={c.partner ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-semibold">{c.partner ?? "Waiting for someone…"}</p>
                          <span className="shrink-0 text-xs text-foreground/45">{shortTime(c.at)}</span>
                        </div>
                        <p className="truncate text-sm text-foreground/55">{c.last ?? (c.partner ? "Say hi" : `Code ${c.code}`)}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-foreground/30" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link href="/search" className="flex items-center gap-3 rounded-3xl bg-muted/60 p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Search className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Find people</p>
              <p className="text-sm text-foreground/55">See who&apos;s on right now and send an invite</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-foreground/30" />
          </Link>
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl bg-muted/50 p-5 md:sticky md:top-12 md:self-start md:p-6">
          <div className="flex items-center gap-3">
            <Avatar name={profile.name} className="size-14 text-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">
                {profile.name} {profile.lastName}, {profile.age}
              </p>
              <p className="truncate text-sm opacity-60">{profile.from}</p>
            </div>
            <button onClick={() => setEditing(true)} className="h-11 px-2 font-semibold text-primary">
              Edit
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.interests.map((i) => (
              <span key={i} className="rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground">
                {i}
              </span>
            ))}
          </div>
        </aside>
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
