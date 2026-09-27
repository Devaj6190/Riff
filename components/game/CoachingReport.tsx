"use client";

import { GraduationCap, Sparkles, TrendingUp, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { stagger } from "@/components/HomeScreen";
import { callApi } from "@/lib/api";
import type { CoachingRequest, CoachingResponse, CoachRequest, CoachResponse, Player } from "@/lib/types";

const POLL_MS = 2000;
const POLL_TRIES = 45; // ~90 s: the report lands 10-40 s after the end

/** End screen: "View coaching report" under the moment cards, opening the player's private report (SPEC §7). */
export function CoachingButton({ riffId, me }: { riffId: string; me: Player }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-full bg-muted font-semibold">
        <GraduationCap className="size-5 text-primary" aria-hidden />
        View coaching report
      </button>
      {open && <CoachingPopup riffId={riffId} me={me} onClose={() => setOpen(false)} />}
    </>
  );
}

function CoachingPopup({ riffId, me, onClose }: { riffId: string; me: Player; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [res, setRes] = useState<CoachingResponse | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  // Poll until the report is written.
  useEffect(() => {
    let live = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await callApi<CoachingResponse>("/api/coaching", { riffId } satisfies CoachingRequest);
        if (!live) return;
        setRes(r);
        if (r.ready) return;
        if (++tries < POLL_TRIES) timer = setTimeout(load, POLL_MS);
        else setGaveUp(true);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't load your report");
      }
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [riffId]);

  async function startCoach() {
    setStarting(true);
    setError(null);
    try {
      const { code } = await callApi<CoachResponse>("/api/coach", { name: me.name, interests: me.interests.slice(0, 3), riffId } satisfies CoachRequest);
      router.push(`/r/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the coach");
      setStarting(false);
    }
  }

  const report = res?.report;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()} // a click on the backdrop
      aria-label="Your coaching report"
      className="riff-dialog m-auto w-[calc(100%-1.5rem)] max-w-lg bg-transparent text-foreground backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      {/* Cards float on the dimmed chat: no panel behind them. */}
      <div className="riff-pop flex flex-col gap-3" onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
        <div className="flex items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Your coaching report</h2>
            <p className="text-xs text-white/60">Only you can see this</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="flex size-11 items-center justify-center text-white/70 hover:text-white">
            <X className="size-6" />
          </button>
        </div>

        {!report && (
          <p className={`rounded-3xl bg-background p-5 text-sm text-foreground/60 ring-1 ring-white/10 ${!res?.ready && !gaveUp && !error ? "animate-pulse" : ""}`}>
            {error ? error : res?.ready ? "No report for this chat. It was too short to learn much from." : gaveUp ? "Still writing it. Check back in a minute." : "Writing your report…"}
          </p>
        )}

        {report && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Card icon={<Sparkles className="size-4" />} tint="bg-emerald-400/15 text-emerald-300" title="Good at" text={report.good.point} delay={0} />
              <Card icon={<TriangleAlert className="size-4" />} tint="bg-amber-400/15 text-amber-300" title="Fell flat" text={report.flat.point} delay={1} />
              <Card icon={<TrendingUp className="size-4" />} tint="bg-sky-400/15 text-sky-300" title="Improve" text={report.improve.tip} delay={2} />
            </div>
            {report.coach && (
              <section className="riff-rise flex flex-col gap-3 rounded-3xl bg-primary p-4 text-primary-foreground" style={stagger(3)}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                    <GraduationCap className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{report.coach.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm opacity-80">{report.coach.why}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startCoach}
                  disabled={starting}
                  className="h-11 rounded-full bg-primary-foreground font-semibold text-primary transition-[opacity,scale] active:scale-[0.98] disabled:opacity-50"
                >
                  {starting ? "Starting…" : "Practice with the AI coach"}
                </button>
              </section>
            )}
            {error && <p className="px-1 text-sm text-red-300">{error}</p>}
          </>
        )}
      </div>
    </dialog>
  );
}

/** One of the three report cards: its own surface, lifted off the dimmed chat. */
function Card({ icon, tint, title, text, delay }: { icon: ReactNode; tint: string; title: string; text: string; delay: number }) {
  return (
    <section className="riff-rise flex min-w-0 flex-col gap-2 rounded-3xl bg-background p-3 shadow-[0_8px_30px_rgb(0_0_0/0.35)] ring-1 ring-white/10" style={stagger(delay)}>
      <span className={`flex size-8 items-center justify-center rounded-full ${tint}`} aria-hidden>
        {icon}
      </span>
      <h3 className="text-xs font-semibold tracking-wide text-foreground/55 uppercase">{title}</h3>
      <p className="line-clamp-6 text-[13px] leading-snug">{text}</p>
    </section>
  );
}
