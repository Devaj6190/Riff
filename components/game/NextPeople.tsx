"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, stagger } from "@/components/HomeScreen";
import { markMatched } from "@/components/motion";
import type { Profile } from "@/components/Onboarding";
import { seedPhoto } from "@/components/photos";
import { useQueue } from "@/components/useQueue";
import { callApi } from "@/lib/api";
import type { InviteRequest, InviteResponse, Player, SearchPerson, SearchRequest, SearchResponse } from "@/lib/types";

const EXPIRED_AFTER_MS = 6000; // an invite missing from `sent` this long after sending has expired (60 s) or gone

/**
 * End screen: who's live in the queue to talk to next, best fit first (/api/search with no query), as avatars like
 * Friends on Home. A tap invites them: invites need us in the queue, so it joins in browse mode (like a persona
 * invite on Home), sends on the first poll, and opens the chat once they say yes (seeds and Match me people at once).
 */
export function NextPeople({ me, partner }: { me: Player; partner?: Player }) {
  const router = useRouter();
  const [people, setPeople] = useState<SearchPerson[] | null>(null);
  const [pending, setPending] = useState<SearchPerson | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const sentAt = useRef(0);
  const gone = useRef(false);
  const profile: Profile = { name: me.name, interests: me.interests, from: "", prompts: [], favorites: [], lastName: "", age: 0 };

  useEffect(() => {
    let live = true;
    callApi<SearchResponse>("/api/search", { query: "" } satisfies SearchRequest)
      .then((r) => live && setPeople(r.people.filter((p) => p.id !== partner?.user_id && p.name !== partner?.name).slice(0, 8)))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [partner?.user_id, partner?.name]);

  function go(code: string) {
    if (gone.current) return;
    gone.current = true;
    markMatched(code); // the chat opens with "It's a match"
    router.push(`/r/${code}`);
  }

  function reset(message: string) {
    setPending(null);
    setNote(message);
    sentAt.current = 0;
  }

  useQueue(profile, "browse", !!pending, async (res) => {
    if (res.code) return go(res.code);
    if (!pending) return;
    const status = res.sent[pending.id];
    if (status === "passed") return reset(`${pending.name} passed`);
    if (sentAt.current) {
      if (!status && Date.now() - sentAt.current > EXPIRED_AFTER_MS) reset(`${pending.name} didn't answer`);
      return;
    }
    sentAt.current = Date.now();
    try {
      const { code } = await callApi<InviteResponse>("/api/invite", { action: "send", to: pending.id } satisfies InviteRequest);
      if (code) go(code);
    } catch (e) {
      reset(e instanceof Error ? e.message : "Couldn't send the invite");
    }
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="truncate text-xs font-semibold text-foreground/55">{pending ? `Inviting ${pending.name}…` : (note ?? "Talk to next")}</p>
      {people && !people.length ? (
        <p className="text-sm text-foreground/45">Nobody else is on right now</p>
      ) : (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {(people ?? Array.from({ length: 4 }, () => null)).map((p, i) => (
            <li key={p?.id ?? i} className="riff-rise shrink-0" style={stagger(i)}>
              {p ? (
                <button
                  type="button"
                  onClick={() => {
                    setNote(null);
                    setPending(p);
                  }}
                  disabled={!!pending}
                  aria-label={`Chat with ${p.name}`}
                  className={`flex w-12 flex-col items-center gap-1 transition-[opacity,scale] active:scale-95 ${pending && pending.id !== p.id ? "opacity-40" : ""}`}
                >
                  <Avatar name={p.name} photo={seedPhoto(p.id)} className={`size-11 text-base ${pending?.id === p.id ? "animate-pulse ring-2 ring-primary" : ""}`} />
                  <span className="max-w-full truncate text-[11px] font-semibold">{p.name}</span>
                </button>
              ) : (
                <span className="block size-11 animate-pulse rounded-full bg-muted" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
