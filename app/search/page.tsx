"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { loadProfile } from "@/components/Onboarding";
import { SearchScreen } from "@/components/SearchScreen";

const never = () => () => {};

/** Search (SPEC §7 Discovery). The profile lives in localStorage, so this renders client-only; no profile → onboarding. */
export default function SearchPage() {
  const router = useRouter();
  const client = useSyncExternalStore(never, () => true, () => false);
  const profile = client ? loadProfile() : null;

  useEffect(() => {
    if (client && !profile) router.replace("/");
  }, [client, profile, router]);

  return profile ? <SearchScreen profile={profile} /> : null;
}
