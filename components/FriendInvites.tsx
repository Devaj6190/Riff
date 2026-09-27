"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/HomeScreen";
import { friendState, inviteTopic, type FriendInvite } from "@/components/friends";
import { markMatched } from "@/components/motion";
import { supabase } from "@/lib/supabase/client";

/** Invites from friends, dropped in over whatever screen you're on. Anyone who isn't a friend is ignored. */
export function FriendInvites() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [invite, setInvite] = useState<FriendInvite | null>(null);

  useEffect(() => {
    // The session can start after this mounts (first sign-in happens on the first chat).
    const { data } = supabase().auth.onAuthStateChange((_event, session) => setUid(session?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const db = supabase();
    const ch = db
      .channel(inviteTopic(uid))
      .on("broadcast", { event: "invite" }, async ({ payload }) => {
        const p = payload as FriendInvite;
        if ((await friendState({ userId: p.from, name: p.name })) === "friends") setInvite(p);
      })
      .subscribe();
    return () => {
      void db.removeChannel(ch);
    };
  }, [uid]);

  if (!invite) return null;
  return (
    <div role="alert" className="riff-drop fixed inset-x-0 top-3 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center gap-3 rounded-3xl bg-cream p-4 text-navy shadow-[0_8px_40px_rgb(0_0_0/0.45)]">
      {/* Rings pulse out of their avatar like an incoming call. */}
      <span className="relative">
        <span className="riff-call" />
        <span className="riff-call" />
        <Avatar name={invite.name} className="relative size-11" />
      </span>
      <p className="min-w-0 flex-1 font-semibold">{invite.name} wants to chat</p>
      <button onClick={() => setInvite(null)} className="h-10 px-2 text-sm font-semibold opacity-60 hover:opacity-100">
        Not now
      </button>
      <button
        onClick={() => {
          setInvite(null);
          markMatched(invite.code);
          router.push(`/r/${invite.code}`);
        }}
        className="h-10 rounded-full bg-navy px-4 text-sm font-semibold text-cream"
      >
        Join
      </button>
    </div>
  );
}
