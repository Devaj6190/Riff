"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { subscribeToRiff } from "@/lib/supabase/realtime";
import type { Answer, Player, Riff, Round, Score } from "@/lib/types";

export type GameSnapshot = {
  riff: Riff;
  players: Player[];
  rounds: Round[];
  answers: Answer[];
  scores: Score[];
};

const LIVE_TABLES = ["players", "rounds", "answers", "scores"] as const;

/**
 * Live riff state. Child tables load in `subscribeToRiff`'s `onReady`.
 * The riff row itself is keyed by `id`, not `riff_id`, so it uses its own channel
 * with the same ready-then-load rule.
 */
export function useGameState(riffId: string, initial: { riff: Riff; players: Player[] }) {
  const [snap, setSnap] = useState<GameSnapshot>({
    riff: initial.riff,
    players: initial.players,
    rounds: [],
    answers: [],
    scores: [],
  });

  const reload = useCallback(async () => {
    const db = supabase();
    const [riffRes, playersRes, roundsRes, answersRes, scoresRes] = await Promise.all([
      db.from("riffs").select("*").eq("id", riffId).maybeSingle<Riff>(),
      db.from("players").select("*").eq("riff_id", riffId).order("seat"),
      db.from("rounds").select("*").eq("riff_id", riffId).order("number"),
      db.from("answers").select("*").eq("riff_id", riffId),
      db.from("scores").select("*").eq("riff_id", riffId),
    ]);
    if (!riffRes.data) return;
    setSnap({
      riff: riffRes.data,
      players: (playersRes.data ?? []) as Player[],
      rounds: (roundsRes.data ?? []) as Round[],
      answers: (answersRes.data ?? []) as Answer[],
      scores: (scoresRes.data ?? []) as Score[],
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
