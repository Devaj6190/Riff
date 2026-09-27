"use client";

import { ArrowRight } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { HomeScreen } from "@/components/HomeScreen";
import { Logo } from "@/components/Logo";
import { loadProfile, Onboarding, saveProfile, type Profile } from "@/components/Onboarding";

const never = () => () => {};

export default function Page() {
  const client = useSyncExternalStore(never, () => true, () => false);
  // Hydrating means a fresh visit: open on the landing. Already on the client means in-app navigation
  // (back from a chat): go straight Home.
  const [fresh] = useState(!client);
  const [saved, setSaved] = useState<Profile | null>();
  // "open": a saved profile, reveal Home. "setup": crossfade into onboarding on the same navy, then reveal Home.
  const [started, setStarted] = useState<"open" | "setup" | null>(null);
  const profile = saved !== undefined ? saved : client ? loadProfile() : null; // localStorage is client-only

  function keep(p: Profile) {
    saveProfile(p);
    setSaved(p);
  }

  const home = profile && <HomeScreen profile={profile} onProfile={keep} />;
  if (home && !fresh) return home;

  return (
    <>
      {/* Stays behind once started: the backdrop for onboarding and the reveal. */}
      <main inert={!!started} className="riff-grain fixed inset-0 flex items-center justify-center overflow-hidden px-6 pb-[6vh] text-cream">
        {/* relative: keeps the content above the grain layer */}
        <div className={`relative flex flex-col items-center gap-24 text-center transition-opacity duration-500 sm:gap-28 ${started === "setup" ? "opacity-0" : ""}`}>
          <div>
            <h1 className="text-8xl sm:text-9xl">
              <Logo />
            </h1>
            <p className="mt-4 text-[26px] text-balance text-cream/75 sm:text-4xl">
              For everything after <em className="riff-shimmer">hello</em>.
            </p>
          </div>
          {/* The label depends on this device's profile, so it fades in once the client knows. */}
          <button
            onClick={() => setStarted(profile ? "open" : "setup")}
            className={`group flex h-16 items-center gap-3 rounded-full bg-cream px-11 text-xl font-medium text-navy shadow-[inset_0_0_16px_1px_rgb(0_0_0/0.12)] transition-[opacity,transform] duration-500 active:scale-[0.97] ${client ? "" : "opacity-0"}`}
          >
            {profile ? "Open" : "Get Started"}
            <ArrowRight className="size-6 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </main>
      {started &&
        (home ? (
          <div className="riff-reveal relative z-10 min-h-dvh bg-background">
            <div className="riff-step">{home}</div>
          </div>
        ) : (
          <div className="riff-fade relative z-10">
            <Onboarding submitLabel="Let's go" onDone={keep} />
          </div>
        ))}
    </>
  );
}
