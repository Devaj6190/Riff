"use client";

import { useEffect, useRef, useState } from "react";
import { callApi } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import type { EndRequest, EndResponse, Player } from "@/lib/types";

export function endRiff(riffId: string, action: EndRequest["action"]) {
  return callApi<EndResponse>("/api/end", { riffId, action } satisfies EndRequest);
}

type Signal = { event: "suggest" | "decline"; from: string };

/**
 * "End game" ends now; "Suggest ending" asks the partner over a Realtime broadcast (no DB write).
 * The partner accepts (ends the riff) or keeps playing (the suggester is told).
 */
export function EndControls({ riffId, me, partner }: { riffId: string; me: Player; partner: Player | undefined }) {
  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const channel = useRef<ReturnType<ReturnType<typeof supabase>["channel"]> | null>(null);

  useEffect(() => {
    const db = supabase();
    const ch = db
      .channel(`end:${riffId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "suggest" }, () => setIncoming(true))
      .on("broadcast", { event: "decline" }, () => setNotice(`${partner?.name ?? "Your partner"} wants to keep playing`))
      .subscribe();
    channel.current = ch;
    return () => {
      channel.current = null;
      void db.removeChannel(ch);
    };
  }, [riffId, partner?.name]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const send = (event: Signal["event"]) => channel.current?.send({ type: "broadcast", event, payload: { from: me.id } satisfies Pick<Signal, "from"> });

  async function end() {
    setBusy(true);
    try {
      await endRiff(riffId, "end");
    } catch {
      setNotice("Couldn't end the game");
    } finally {
      setBusy(false);
      setOpen(false);
      setIncoming(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="h-11 rounded-lg border border-current/20 px-3 text-sm">
        End
      </button>
      {(open || incoming || notice) && (
        <div className="fixed inset-x-0 top-16 z-10 mx-auto flex w-full max-w-md flex-col gap-2 px-4">
          {open && (
            <div className="flex gap-2 rounded-2xl border border-current/15 bg-background p-3 shadow-lg">
              <button type="button" onClick={end} disabled={busy} className="h-11 flex-1 rounded-lg bg-foreground font-semibold text-background disabled:opacity-40">
                End game now
              </button>
              <button
                type="button"
                onClick={() => {
                  void send("suggest");
                  setOpen(false);
                  setNotice(`Asked ${partner?.name ?? "your partner"} to wrap up`);
                }}
                disabled={!partner}
                className="h-11 flex-1 rounded-lg border border-current/20 disabled:opacity-40"
              >
                Suggest ending
              </button>
            </div>
          )}
          {incoming && (
            <div className="riff-pop flex flex-col gap-2 rounded-2xl border border-current/15 bg-background p-3 shadow-lg">
              <p className="font-semibold">{partner?.name ?? "Your partner"} suggests ending the game</p>
              <div className="flex gap-2">
                <button type="button" onClick={end} disabled={busy} className="h-11 flex-1 rounded-lg bg-foreground font-semibold text-background disabled:opacity-40">
                  End it
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void send("decline");
                    setIncoming(false);
                  }}
                  className="h-11 flex-1 rounded-lg border border-current/20"
                >
                  Keep playing
                </button>
              </div>
            </div>
          )}
          {notice && <p className="rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-lg">{notice}</p>}
        </div>
      )}
    </>
  );
}
