"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { VoiceButton } from "@/components/VoiceButton";
import { supabase } from "@/lib/supabase/client";
import { subscribeToRiff } from "@/lib/supabase/realtime";
import type { Message, Nudge, Player } from "@/lib/types";

type Props = {
  riffId: string;
  me: Player;
  pastNudges?: Nudge[]; // shown inline where they popped up, once their timer is over
  onTyping?: (typing: boolean) => void;
  partnerTyping?: boolean;
};

/** A message as shown. `key` survives the swap from my optimistic copy to the saved row, so it doesn't re-animate. */
type Row = Message & { key: string; pending?: boolean; quiet?: boolean }; // quiet: from the first load, no pop-in

type Item = { at: number; row: Row; nudge?: never } | { at: number; nudge: Nudge; row?: never };

const TIME_GAP_MS = 10 * 60_000;

/**
 * Real-time thread, Apple Messages style: bottom-anchored, tails on the last bubble of a run, new bubbles spring in,
 * my messages show instantly. History loads once the subscription is live, so nothing sent in between is lost.
 */
export function Chat({ riffId, me, pastNudges = [], onTyping, partnerTyping }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tmp = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let first = true;
    return subscribeToRiff<Message>(
      "messages",
      riffId,
      (payload) => {
        if (payload.eventType === "INSERT") setRows((prev) => mergeRows(prev, [payload.new]));
      },
      async () => {
        const { data } = await supabase().from("messages").select("*").eq("riff_id", riffId).order("id");
        const quiet = first;
        first = false;
        setRows((prev) => mergeRows(prev, (data ?? []) as Message[], quiet));
      },
    );
  }, [riffId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" }); // returns a Promise in newer browsers; must not be the cleanup
  }, [rows, partnerTyping, pastNudges.length]);

  async function post(body: string) {
    const key = `tmp-${++tmp.current}`;
    const draftRow: Row = { id: -1, riff_id: riffId, player_id: me.id, body, created_at: new Date().toISOString(), key, pending: true };
    setRows((prev) => [...prev, draftRow]);
    const { data, error } = await supabase().from("messages").insert({ riff_id: riffId, player_id: me.id, body }).select().single<Message>();
    if (error || !data) {
      setRows((prev) => prev.filter((r) => r.key !== key));
      throw new Error("Message didn't send");
    }
    setRows((prev) => mergeRows(prev, [data]));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    onTyping?.(false);
    try {
      await post(body);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setDraft(body);
    }
  }

  const items: Item[] = [
    ...rows.map((row) => ({ at: row.pending ? Infinity : Date.parse(row.created_at), row })),
    ...pastNudges.map((nudge) => ({ at: Date.parse(nudge.created_at), nudge })),
  ].sort((a, b) => (a.at === b.at ? 0 : a.at - b.at));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        <li aria-hidden className="mt-auto" />
        {items.map((item, i) => {
          const prev = items[i - 1];
          const next = items[i + 1];
          const stamp = Number.isFinite(item.at) && (!prev || item.at - prev.at > TIME_GAP_MS) && (
            <li className="mb-1 mt-4 text-center text-xs text-foreground/45">{timeLabel(item.at)}</li>
          );
          if (item.nudge) {
            const n = item.nudge;
            return (
              <Fragment key={n.id}>
                {stamp}
                <li className="mx-auto my-3 flex max-w-[85%] flex-col items-center gap-2 text-center">
                  {n.kind === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element -- remote generated image, no loader configured
                    <img src={n.payload.imageUrl} alt="" className="max-h-36 rounded-2xl object-cover" />
                  )}
                  <p className="text-xs font-medium text-foreground/50">
                    <Sparkles className="mr-1 inline size-3 text-primary" aria-hidden />
                    {n.payload.prompt}
                  </p>
                </li>
              </Fragment>
            );
          }
          const m = item.row;
          const mine = m.player_id === me.id;
          const sameAsPrev = !stamp && prev?.row?.player_id === m.player_id;
          const lastInRun = next?.row?.player_id !== m.player_id || (Number.isFinite(next.at) && next.at - item.at > TIME_GAP_MS);
          return (
            <Fragment key={m.key}>
              {stamp}
              <li
                className={[
                  "bubble max-w-[75%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 leading-snug",
                  sameAsPrev ? "mt-0.5" : "mt-2.5",
                  mine ? "bubble-mine self-end bg-primary text-primary-foreground" : "bubble-theirs self-start bg-[#242d47]",
                  lastInRun && !(partnerTyping && !mine && !next) ? "bubble-tail" : "",
                  m.quiet ? "" : "riff-bubble",
                ].join(" ")}
              >
                {m.body}
              </li>
            </Fragment>
          );
        })}
        {partnerTyping && (
          <li aria-label="typing" className="bubble bubble-theirs bubble-tail riff-bubble mt-2.5 flex gap-1 self-start rounded-[18px] bg-[#242d47] px-4 py-3.5">
            {[0, 0.15, 0.3].map((delay) => (
              <span key={delay} className="riff-dot size-2 rounded-full bg-foreground/60" style={{ animationDelay: `${delay}s` }} />
            ))}
          </li>
        )}
        <div ref={bottom} />
      </ul>
      {error && <p className="px-4 pb-1 text-sm text-red-300">{error}</p>}
      <form onSubmit={send} className="px-3 pb-3 pt-1">
        <div className="flex items-center rounded-full border border-current/15 pl-4 focus-within:border-primary/60">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onTyping?.(!!e.target.value.trim());
            }}
            maxLength={500}
            placeholder="Message"
            aria-label="Message"
            className="h-11 min-w-0 flex-1 bg-transparent outline-none"
          />
          {draft.trim() ? (
            <button type="submit" aria-label="Send" className="flex size-11 shrink-0 items-center justify-center">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ArrowUp className="size-5" strokeWidth={2.5} />
              </span>
            </button>
          ) : (
            <VoiceButton riffId={riffId} onTranscript={post} onError={setError} />
          )}
        </div>
      </form>
    </div>
  );
}

/** Add saved rows, replacing my optimistic copy of the same message (same key) rather than duplicating it. */
function mergeRows(prev: Row[], incoming: Message[], quiet = false): Row[] {
  let next = prev;
  for (const m of incoming) {
    if (next.some((r) => !r.pending && r.id === m.id)) continue;
    const draft = next.find((r) => r.pending && r.player_id === m.player_id && r.body === m.body);
    next = draft ? next.map((r) => (r === draft ? { ...m, key: r.key } : r)) : [...next, { ...m, key: String(m.id), quiet }];
  }
  return next === prev ? prev : [...next].sort((a, b) => Number(!!a.pending) - Number(!!b.pending) || a.id - b.id);
}

function timeLabel(at: number) {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `Today ${time}` : `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}
