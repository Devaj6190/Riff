"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GameScreen } from "@/components/game/GameScreen";
import { loadProfile, ProfileForm, saveProfile, type Profile } from "@/components/ProfileForm";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";
import type { Player, Riff } from "@/lib/types";

type View =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "join"; riff: Riff }
  | { status: "in"; riff: Riff; me: Player; players: Player[] };

const FRIENDLY: Record<string, string> = {
  "riff not found": "This chat doesn't exist",
  "riff is full": "This chat already has two people",
};

async function joinAs(code: string, profile: Profile) {
  const { error } = await supabase().rpc("join_riff", { p_code: code, p_name: profile.name, p_interests: profile.interests });
  if (error) throw new Error(FRIENDLY[error.message] ?? error.message);
}

/** Loads the chat. Opening a link with a saved profile joins straight away; only first-timers see the form. */
async function fetchView(code: string, autoJoin = true): Promise<View> {
  try {
    const user = await ensureSignedIn();
    const db = supabase();
    const { data: riff } = await db.from("riffs").select("*").eq("code", code.toUpperCase()).maybeSingle<Riff>();
    if (!riff) return { status: "error", message: FRIENDLY["riff not found"] };
    // RLS only returns players to members, so an empty list means we haven't joined yet.
    const { data } = await db.from("players").select("*").eq("riff_id", riff.id).order("seat");
    const players = (data ?? []) as Player[];
    const me = players.find((p) => p.user_id === user.id);
    if (me) return { status: "in", riff, me, players };
    const profile = loadProfile();
    if (!profile || !autoJoin) return { status: "join", riff };
    await joinAs(code, profile);
    return fetchView(code, false);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Couldn't load the chat" };
  }
}

export default function RiffPage() {
  const { code } = useParams<{ code: string }>();
  const [view, setView] = useState<View>({ status: "loading" });
  const load = useCallback(() => fetchView(code, false).then(setView), [code]);

  useEffect(() => {
    fetchView(code).then(setView);
  }, [code]);

  async function join(name: string, interests: string[]) {
    const profile = { name, interests };
    await joinAs(code, profile);
    saveProfile(profile);
    await load();
  }

  if (view.status === "loading") {
    return <main className="flex h-dvh items-center justify-center text-foreground/50">Opening chat…</main>;
  }

  if (view.status === "error") {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">{view.message}</p>
        <Link href="/" className="font-semibold text-primary">
          Go home
        </Link>
      </main>
    );
  }

  if (view.status === "join") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Join the chat</h1>
          <p className="mt-1 text-foreground/60">Pick a name and three things you&apos;re into. That&apos;s it.</p>
        </header>
        <ProfileForm submitLabel="Join chat" onSubmit={join} />
      </main>
    );
  }

  return <GameScreen me={view.me} riff={view.riff} players={view.players} />;
}
