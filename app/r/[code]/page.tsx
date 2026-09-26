"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Chat } from "@/components/Chat";
import { ProfileForm } from "@/components/ProfileForm";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";
import type { Player, Room } from "@/lib/types";

type View =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "join"; room: Room }
  | { status: "in"; room: Room; me: Player; players: Player[] };

async function fetchView(code: string): Promise<View> {
  try {
    const user = await ensureSignedIn();
    const db = supabase();
    const { data: room } = await db.from("rooms").select("*").eq("code", code.toUpperCase()).maybeSingle<Room>();
    if (!room) return { status: "error", message: "Room not found" };
    // RLS only returns players to members, so an empty list means we haven't joined yet.
    const { data } = await db.from("players").select("*").eq("room_id", room.id).order("seat");
    const players = (data ?? []) as Player[];
    const me = players.find((p) => p.user_id === user.id);
    return me ? { status: "in", room, me, players } : { status: "join", room };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Couldn't load the room" };
  }
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const [view, setView] = useState<View>({ status: "loading" });
  const load = useCallback(() => fetchView(code).then(setView), [code]);

  useEffect(() => {
    fetchView(code).then(setView);
  }, [code]);

  // Refresh the player list when the partner joins.
  const roomId = view.status === "in" ? view.room.id : null;
  useEffect(() => {
    if (!roomId) return;
    const db = supabase();
    const channel = db
      .channel(`players:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, () => load())
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [roomId, load]);

  async function join(name: string, interests: string[]) {
    const { error } = await supabase().rpc("join_room", { p_code: code, p_name: name, p_interests: interests });
    if (error) throw new Error(error.message);
    await load();
  }

  if (view.status === "loading") return <main className="p-6 opacity-70">Loading…</main>;
  if (view.status === "error") return <main className="p-6">{view.message}</main>;

  if (view.status === "join") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">Join room {view.room.code}</h1>
        <ProfileForm submitLabel="Join" onSubmit={join} />
      </main>
    );
  }

  const partner = view.players.find((p) => p.id !== view.me.id);
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-current/10 p-4">
        <div>
          <div className="font-semibold">{partner ? `You & ${partner.name}` : "Waiting for someone to join…"}</div>
          <div className="text-sm opacity-60">
            Room <span className="font-mono tracking-widest">{view.room.code}</span>
          </div>
        </div>
        {!partner && (
          <button
            onClick={() => navigator.clipboard?.writeText(location.href)}
            className="h-11 rounded-lg border border-current/20 px-4 text-sm"
          >
            Copy link
          </button>
        )}
      </header>
      <Chat roomId={view.room.id} me={view.me} players={view.players} />
    </main>
  );
}
