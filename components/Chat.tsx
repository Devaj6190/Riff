"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceButton } from "@/components/VoiceButton";
import { supabase } from "@/lib/supabase/client";
import { subscribeToRiff } from "@/lib/supabase/realtime";
import type { Message, Player } from "@/lib/types";

type Props = { riffId: string; me: Player };

/** Real-time DM thread. History loads once the subscription is live, so nothing sent in between is lost. */
export function Chat({ riffId, me }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const merge = (incoming: Message[]) =>
      setMessages((prev) => {
        const byId = new Map([...prev, ...incoming].map((m) => [m.id, m]));
        return [...byId.values()].sort((a, b) => a.id - b.id);
      });

    return subscribeToRiff<Message>(
      "messages",
      riffId,
      (payload) => {
        if (payload.eventType === "INSERT") merge([payload.new]);
      },
      async () => {
        const { data } = await supabase().from("messages").select("*").eq("riff_id", riffId).order("id");
        merge((data ?? []) as Message[]);
      },
    );
  }, [riffId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" }); // returns a Promise in newer browsers; must not be the cleanup
  }, [messages]);

  async function post(body: string) {
    const { error } = await supabase().from("messages").insert({ riff_id: riffId, player_id: me.id, body });
    if (error) throw new Error("Message didn't send");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await post(body);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setDraft(body);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
        {messages.map((m, i) => {
          const mine = m.player_id === me.id;
          const grouped = messages[i - 1]?.player_id === m.player_id;
          return (
            <li
              key={m.id}
              className={`max-w-[75%] break-words rounded-3xl px-4 py-2 ${grouped ? "mt-0.5" : "mt-3"} ${mine ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted"}`}
            >
              {m.body}
            </li>
          );
        })}
        <div ref={bottom} />
      </ul>
      {error && <p className="px-4 pb-1 text-sm text-red-500">{error}</p>}
      <form onSubmit={send} className="p-3">
        <div className="flex h-12 items-center gap-1 rounded-full border border-current/15 pl-4 pr-1 focus-within:border-primary">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Message…"
            aria-label="Message"
            className="h-full min-w-0 flex-1 bg-transparent outline-none"
          />
          {draft.trim() ? (
            <button type="submit" className="h-11 px-3 font-semibold text-primary">
              Send
            </button>
          ) : (
            <VoiceButton riffId={riffId} onTranscript={post} onError={setError} />
          )}
        </div>
      </form>
    </div>
  );
}
