import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Subscribe to Postgres changes on a riff-scoped table. Returns an unsubscribe function.
 *
 * Load or refresh state in `onReady`, not on the channel's SUBSCRIBED status: SUBSCRIBED arrives slightly
 * before changes actually flow, and rows written in that gap are never delivered. `onReady` also fires again
 * after a reconnect (e.g. a phone waking up), so it doubles as catch-up.
 */
export function subscribeToRiff<T extends Record<string, unknown>>(
  table: string,
  riffId: string,
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
  onReady?: () => void,
): () => void {
  const db = supabase();
  const channel = db
    .channel(`${table}:${riffId}`)
    .on<T>("postgres_changes", { event: "*", schema: "public", table, filter: `riff_id=eq.${riffId}` }, onChange)
    .on("system", {}, (p: { extension?: string; status?: string }) => {
      if (p.extension === "postgres_changes" && p.status === "ok") onReady?.();
    })
    .subscribe();
  return () => {
    db.removeChannel(channel);
  };
}
