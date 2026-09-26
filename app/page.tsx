"use client";

import { useState } from "react";
import { preload } from "react-dom";
import { HomeScreen } from "@/components/HomeScreen";

export default function Landing() {
  const [started, setStarted] = useState(false);
  preload("/reveal-mask.png", { as: "image" }); // the reveal mask must be loaded before Get Started, or Home flashes hidden

  return (
    <>
      {/* Stays behind Home once started, so the circle reveal opens over it. */}
      <main inert={started} className="fixed inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-6xl font-bold tracking-tight">Riff</h1>
        <p className="text-lg opacity-60">For everything after hello.</p>
        <button onClick={() => setStarted(true)} className="mt-6 h-12 rounded-full bg-primary px-8 font-semibold text-primary-foreground">
          Get Started
        </button>
      </main>
      {started && <HomeScreen />}
    </>
  );
}
