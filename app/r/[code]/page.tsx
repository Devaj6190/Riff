"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GameScreen } from "@/components/game/GameScreen";
import { loadProfile, ProfileForm, saveProfile } from "@/components/ProfileForm";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";
import type { Player, Riff } from "@/lib/types";

type View =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "join"; riff: Riff }
  | { status: "in"; riff: Riff; me: Player; players: Player[] };

async function fetchView(code: string): Promise<View> {
  try {
    const user = await ensureSignedIn();
    const db = supabase();
    const { data: riff } = await db.from("riffs").select("*").eq("code", code.toUpperCase()).maybeSingle<Riff>();
    if (!riff) return { status: "error", message: "Riff not found" };
    // RLS only returns players to members, so an empty list means we haven't joined yet.
    const { data } = await db.from("players").select("*").eq("riff_id", riff.id).order("seat");
    const players = (data ?? []) as Player[];
    const me = players.find((p) => p.user_id === user.id);
    return me ? { status: "in", riff, me, players } : { status: "join", riff };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Couldn't load the riff" };
  }
}

export default function RiffPage() {
  const { code } = useParams<{ code: string }>();
  const [view, setView] = useState<View>({ status: "loading" });
  const load = useCallback(() => fetchView(code).then(setView), [code]);

  useEffect(() => {
    fetchView(code).then(setView);
  }, [code]);

  async function join(name: string, interests: string[]) {
    saveProfile({ name, interests });
    const { error } = await supabase().rpc("join_riff", { p_code: code, p_name: name, p_interests: interests });
    if (error) throw new Error(error.message);
    await load();
  }

  if (view.status === "loading") return <main className="p-6 opacity-70">Loading…</main>;
  if (view.status === "error") return <main className="p-6">{view.message}</main>;

  if (view.status === "join") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">Join riff {view.riff.code}</h1>
        <ProfileForm submitLabel="Join" initial={loadProfile()} onSubmit={join} />
      </main>
    );
  }

  return <GameScreen me={view.me} riff={view.riff} players={view.players} />;
}
