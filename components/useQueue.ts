"use client";

import { useEffect, useEffectEvent } from "react";
import type { Profile } from "@/components/Onboarding";
import { callApi } from "@/lib/api";
import { normalizeInterests } from "@/lib/interests";
import type { MatchRequest, MatchResponse, QueueMode } from "@/lib/types";

const POLL_MS = 2000;

/** Sits in the queue while `on`: polls /api/match every 2 s (SPEC §7) and hands each answer to `onPoll`, stopping
 *  once one has a code. Turning it off or unmounting stops the poll, which takes us out of the queue.
 *  Sign in before turning it on (two parallel anonymous sign-ins make two users). */
export function useQueue(profile: Profile, mode: QueueMode, on: boolean, onPoll: (res: MatchResponse) => void) {
  const name = profile.name;
  const interests = normalizeInterests(profile.interests).join("\n"); // a string, so the poll doesn't restart per render
  const handle = useEffectEvent(onPoll);

  useEffect(() => {
    if (!on) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await callApi<MatchResponse>("/api/match", { name, interests: interests.split("\n"), mode } satisfies MatchRequest);
        if (!live) return;
        handle(res);
        if (res.code) return;
      } catch {
        // ponytail: a failed poll just waits for the next one.
      }
      if (live) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [on, name, interests, mode]);
}
