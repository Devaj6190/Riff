import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Subscribe to Postgres changes on a room-scoped table. Returns an unsubscribe function.
 *
 * Load or refresh state in `onReady`, not on the channel's SUBSCRIBED status: SUBSCRIBED arrives slightly
 * before changes actually flow, and rows written in that gap are never delivered. `onReady` also fires again
 * after a reconnect (e.g. a phone waking up), so it doubles as catch-up.
 */
export function subscribeToRoom<T extends Record<string, unknown>>(
  table: string,
  roomId: string,
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
  onReady?: () => void,
): () => void {
  const db = supabase();
  const channel = db
    .channel(`${table}:${roomId}`)
    .on<T>("postgres_changes", { event: "*", schema: "public", table, filter: `room_id=eq.${roomId}` }, onChange)
    .on("system", {}, (p: { extension?: string; status?: string }) => {
      if (p.extension === "postgres_changes" && p.status === "ok") onReady?.();
    })
    .subscribe();
  return () => {
    db.removeChannel(channel);
  };
}
