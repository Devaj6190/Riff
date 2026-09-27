"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { Avatar } from "@/components/HomeScreen";
import { BOUNCY, calm } from "@/components/motion";

/**
 * "It's a match": both avatars fly in and click together, a ring pulses, then a hole opens where they met and the chat
 * underneath grows out of it. Plays over a chat that just paired; tap to skip.
 */
export function MatchMoment({ me, them, themPhoto, onDone }: { me: string; them: string; themPhoto?: string; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (calm()) {
      const t = setTimeout(done, 0);
      return () => clearTimeout(t);
    }
    const anims: Animation[] = [];
    const play = (el: HTMLElement, frames: Keyframe[], duration: number, easing: string) => anims.push(el.animate(frames, { duration, easing, fill: "both" }));
    const at = (ms: number, run: () => void) => setTimeout(run, ms);
    play(left.current!, [{ transform: "translateX(-60vw) scale(.5) rotate(-25deg)", opacity: 0 }, { transform: "translateX(-30px)", opacity: 1 }], 750, BOUNCY);
    play(right.current!, [{ transform: "translateX(60vw) scale(.5) rotate(25deg)", opacity: 0 }, { transform: "translateX(30px)", opacity: 1 }], 750, BOUNCY);
    const timers = [
      at(480, () => {
        play(ring.current!, [{ transform: "scale(.3)", opacity: 1 }, { transform: "scale(6)", opacity: 0 }], 850, "ease-out");
        play(label.current!, [{ transform: "translateY(12px)", opacity: 0 }, { transform: "none", opacity: 1 }], 450, BOUNCY);
      }),
      at(1500, () => play(root.current!, [{ "--hole": "0px" }, { "--hole": "150vmax" }], 800, "cubic-bezier(0.7, 0, 0.3, 1)")),
      // Ends on a timer, not the animation's finish event: a backgrounded tab never fires that, and the finished
      // (now invisible) overlay would still cover the chat.
      at(2350, done),
    ];
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <div ref={root} onClick={onDone} className="riff-hole fixed inset-0 z-50 cursor-pointer overflow-hidden bg-background" aria-live="polite">
      {/* 42% down: where .riff-hole's circle opens from. */}
      <div className="absolute top-[42%] left-1/2 size-24 -translate-x-1/2 -translate-y-1/2">
        <div ref={left} className="absolute inset-0 opacity-0">
          <Avatar name={me} className="size-24 text-4xl ring-4 ring-background" />
        </div>
        <div ref={right} className="absolute inset-0 opacity-0">
          <Avatar name={them} photo={themPhoto} className="size-24 text-4xl ring-4 ring-background" />
        </div>
        <span ref={ring} className="absolute inset-0 rounded-full border-2 border-cream opacity-0" />
      </div>
      <div ref={label} className="absolute inset-x-0 top-[calc(42%+80px)] text-center opacity-0">
        <p className="text-2xl font-semibold">You and {them}</p>
        <p className="text-foreground/60">Say hi</p>
      </div>
    </div>
  );
}
