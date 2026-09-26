"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { subscribeToRiff } from "@/lib/supabase/realtime";
import type { Nudge, Player, Riff, Score } from "@/lib/types";

export type GameSnapshot = {
  riff: Riff;
  players: Player[];
  nudges: Nudge[]; // by number
  scores: Score[];
  loaded: boolean; // false until the first full load, so existing scores don't pop in as new
};

const LIVE_TABLES = ["players", "nudges", "scores"] as const;

/**
 * Live riff state. Child tables load in `subscribeToRiff`'s `onReady`.
 * The riff row itself is keyed by `id`, not `riff_id`, so it uses its own channel
 * with the same ready-then-load rule.
 */
export function useGameState(riffId: string, initial: { riff: Riff; players: Player[] }) {
  const [snap, setSnap] = useState<GameSnapshot>({ ...initial, nudges: [], scores: [], loaded: false });

  const reload = useCallback(async () => {
    const db = supabase();
    const [riffRes, playersRes, nudgesRes, scoresRes] = await Promise.all([
      db.from("riffs").select("*").eq("id", riffId).maybeSingle<Riff>(),
      db.from("players").select("*").eq("riff_id", riffId).order("seat"),
      db.from("nudges").select("*").eq("riff_id", riffId).order("number"),
      db.from("scores").select("*").eq("riff_id", riffId).order("created_at"),
    ]);
    if (!riffRes.data) return;
    setSnap({
      riff: riffRes.data,
      players: (playersRes.data ?? []) as Player[],
      nudges: (nudgesRes.data ?? []) as Nudge[],
      scores: (scoresRes.data ?? []) as Score[],
      loaded: true,
    });
  }, [riffId]);

  useEffect(() => {
    const unsubs = LIVE_TABLES.map((table) => subscribeToRiff(table, riffId, () => void reload(), () => void reload()));

    const db = supabase();
    const channel = db
      .channel(`riffs:${riffId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "riffs", filter: `id=eq.${riffId}` }, () => void reload())
      .on("system", {}, (p: { extension?: string; status?: string }) => {
        if (p.extension === "postgres_changes" && p.status === "ok") void reload();
      })
      .subscribe();

    return () => {
      unsubs.forEach((unsub) => unsub());
      void db.removeChannel(channel);
    };
  }, [riffId, reload]);

  return { snap, reload };
}
