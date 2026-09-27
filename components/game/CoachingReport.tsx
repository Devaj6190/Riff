"use client";

import { GraduationCap, Sparkles, TrendingUp, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
      className="riff-dialog m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-background text-foreground ring-1 ring-white/10 backdrop:bg-black/60"
    >
      <div className="riff-pop relative flex flex-col gap-5 p-5 pt-8">
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="absolute top-2 right-2 flex size-11 items-center justify-center text-foreground/60 hover:text-foreground">
          <X className="size-6" />
        </button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Your coaching report</h2>
          <p className="text-sm text-foreground/50">Only you can see this.</p>
        </div>

        {!res?.ready && !error && (
          <p className={`text-sm text-foreground/60 ${gaveUp ? "" : "animate-pulse"}`}>{gaveUp ? "Still writing it. Check back in a minute." : "Writing your report…"}</p>
        )}
        {res?.ready && !report && <p className="text-sm text-foreground/60">No report for this chat. It was too short to learn much from.</p>}

        {report && (
          <>
            <Section icon={<Sparkles className="size-4" />} title="What you were good at">
              <p>{report.good.point}</p>
              {report.good.quote && <Said text={report.good.quote} />}
            </Section>
            <Section icon={<TriangleAlert className="size-4" />} title="Where you fell flat">
              <p>{report.flat.point}</p>
              {report.flat.quote && <Said text={report.flat.quote} />}
            </Section>
            <Section icon={<TrendingUp className="size-4" />} title="What to improve">
              <p>{report.improve.tip}</p>
              {report.improve.said && report.improve.try && (
                <div className="mt-1 grid gap-1.5">
                  <Said text={report.improve.said} label="You said" dim />
                  <Said text={report.improve.try} label="Try" />
                </div>
              )}
            </Section>
            {report.coach && (
              <section className="rounded-3xl bg-primary/10 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <GraduationCap className="size-4" aria-hidden />
                  Practice with the AI coach
                </p>
                <p className="mt-1 text-lg font-semibold">{report.coach.title}</p>
                <p className="mt-1 text-sm text-foreground/70">{report.coach.why}</p>
                <ul className="mt-2 grid list-disc gap-0.5 pl-5 text-sm text-foreground/80">
                  {report.coach.learn.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={startCoach}
                  disabled={starting}
                  className="mt-4 h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {starting ? "Starting…" : "Start coaching chat"}
                </button>
              </section>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    </dialog>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
        {icon}
        {title}
      </h3>
      <div className="grid gap-2 text-[15px] leading-snug">{children}</div>
    </section>
  );
}

/** One of the player's own messages, as their bubble. */
function Said({ text, label, dim }: { text: string; label?: string; dim?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      {label && <span className="text-[11px] font-semibold text-foreground/45">{label}</span>}
      <p className={`max-w-[85%] rounded-[18px] px-3.5 py-2 text-sm ${dim ? "bg-muted text-foreground/60 line-through decoration-foreground/30" : "bg-primary text-primary-foreground"}`}>
        {text}
      </p>
    </div>
  );
}
