"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Message, Player } from "@/lib/types";

type Props = { roomId: string; me: Player; players: Player[] };

/** Real-time room chat. Subscribes first, then loads history, so nothing sent in between is lost. */
export function Chat({ roomId, me, players }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const db = supabase();
    const merge = (incoming: Message[]) =>
      setMessages((prev) => {
        const byId = new Map([...prev, ...incoming].map((m) => [m.id, m]));
        return [...byId.values()].sort((a, b) => a.id - b.id);
      });

    const channel = db
      .channel(`messages:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, (payload) =>
        merge([payload.new as Message]),
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const { data } = await db.from("messages").select("*").eq("room_id", roomId).order("id");
        merge((data ?? []) as Message[]);
      });

    return () => {
      db.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const { error } = await supabase().from("messages").insert({ room_id: roomId, player_id: me.id, body });
    setError(error ? "Message didn't send" : null);
    if (error) setDraft(body);
  }

  const nameOf = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? "?";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.player_id === me.id;
          return (
            <li key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "self-end bg-foreground text-background" : "self-start bg-current/10"}`}>
              {!mine && <div className="text-xs opacity-60">{nameOf(m.player_id)}</div>}
              {m.body}
            </li>
          );
        })}
        <div ref={bottom} />
      </ul>
      {error && <p className="px-4 text-sm text-red-500">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-current/10 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Say something…"
          className="h-11 flex-1 rounded-full border border-current/20 bg-transparent px-4"
        />
        <button type="submit" disabled={!draft.trim()} className="h-11 rounded-full bg-foreground px-5 font-semibold text-background disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  );
}
