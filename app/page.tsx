"use client";

import { useState, useSyncExternalStore } from "react";
import { preload } from "react-dom";
import { HomeScreen } from "@/components/HomeScreen";
import { loadProfile, Onboarding, saveProfile, type Profile } from "@/components/Onboarding";

const never = () => () => {};

export default function Page() {
  preload("/reveal-mask.png", { as: "image" }); // the reveal mask must be loaded before Get Started, or the next screen flashes hidden
  // ponytail: the server can't see localStorage, so the first paint is blank until hydration; a cookie would fix that if it shows.
  const client = useSyncExternalStore(never, () => true, () => false);
  return client ? <Entry /> : null;
}

/** Returning users (a saved profile) go straight to Home; first-timers get Get Started, then onboarding. */
function Entry() {
  const [profile, setProfile] = useState(loadProfile);
  const [started, setStarted] = useState(false);

  function keep(p: Profile) {
    saveProfile(p);
    setProfile(p);
  }

  const home = profile && <HomeScreen profile={profile} onProfile={keep} />;
  if (home && !started) return home;

  return (
    <>
      {/* Stays behind once started, so the circle reveal opens over it. */}
      <main inert={started} className="fixed inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-6xl font-bold tracking-tight">Riff</h1>
        <p className="text-lg opacity-60">For everything after hello.</p>
        <button onClick={() => setStarted(true)} className="mt-6 h-12 rounded-full bg-primary px-8 font-semibold text-primary-foreground">
          Get Started
        </button>
      </main>
      {started && (
        <div className="riff-reveal relative z-10 min-h-dvh bg-background">
          <div key={home ? "home" : "setup"} className="riff-step">
            {home || <Onboarding submitLabel="Let's go" onDone={keep} />}
          </div>
        </div>
      )}
    </>
  );
}
