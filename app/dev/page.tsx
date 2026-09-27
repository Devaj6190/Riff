"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { callApi } from "@/lib/api";
import { DEMO_SCRIPTS } from "@/lib/engine/demo-scripts";
import { ensureSignedIn } from "@/lib/supabase/client";
import type { DemoRequest, DemoResults, DemoStartResponse } from "@/lib/types";

/**
 * Dev: play a scripted demo chat (lib/engine/demo-scripts.ts) end to end, then read what the post-chat engine made
 * of it: the post-chat summary and a coach chat on what was missed. Demos never touch your real history or profile.
 */
export default function DevPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DemoResults | null>(null);

  const refresh = useCallback(() => loadResults().then(setResults, () => setError("Couldn't load results")), []);

  useEffect(() => {
    loadResults().then(setResults, () => setError("Couldn't load results"));
  }, []);

  async function go(key: string, start: () => Promise<{ code: string }>) {
    setBusy(key);
    setError(null);
    try {
      await ensureSignedIn();
      router.push(`/r/${(await start()).code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  const run = (script: string) => go(script, () => callApi<DemoStartResponse>("/api/demo", { action: "start", script } satisfies DemoRequest));
  const coach = () => go("coach", () => callApi<DemoStartResponse>("/api/demo", { action: "coach" } satisfies DemoRequest));
  const summary = results?.summary;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center gap-2">
        <Link href="/" aria-label="Back" className="-ml-2 flex size-11 items-center justify-center text-primary">
          <ChevronLeft className="size-7" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Dev: demo chats</h1>
          <p className="text-sm opacity-60">A fixed conversation plays itself in a real chat. You&apos;re seat A. Edit them in lib/engine/demo-scripts.ts.</p>
        </div>
      </header>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <section className="flex flex-col gap-3">
        {DEMO_SCRIPTS.map((s) => (
          <article key={s.id} className="flex flex-col gap-3 rounded-3xl bg-muted/60 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold">{s.title}</h2>
                <p className="text-sm opacity-60">
                  You as {s.a.name} ({s.a.interests.join(", ")}) · {s.b.name} ({s.b.interests.join(", ")})
                </p>
              </div>
              <button onClick={() => run(s.id)} disabled={!!busy} className="h-11 shrink-0 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-40">
                {busy === s.id ? "…" : "Run"}
              </button>
            </div>
            <p className="text-sm">{s.about}</p>
            <details className="text-sm">
              <summary className="cursor-pointer py-2 font-semibold text-primary">Script ({s.lines.length} lines)</summary>
              <ol className="flex flex-col gap-1 pt-1">
                {s.lines.map((line, i) => (
                  <li key={i} className={line.startsWith("Riff:") ? "mt-2 font-semibold text-primary" : "opacity-80"}>
                    {line}
                  </li>
                ))}
              </ol>
            </details>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-current/15 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Latest demo{results?.code ? ` (${results.code})` : ""}</h2>
            <p className="text-sm opacity-60">Its post-chat summary, written 10-40 s after it ends. Not saved to your history.</p>
          </div>
          <button onClick={refresh} className="h-11 shrink-0 px-2 font-semibold text-primary">
            Refresh
          </button>
        </div>
        {summary ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>{summary.recap}</p>
            <List title="Learned about you" items={summary.learned} />
            <List title="Clicked" items={summary.clicked} />
            <List title="Died" items={summary.died} />
            <List title="Missed" items={summary.misses} />
          </div>
        ) : (
          <p className="text-sm opacity-60">{results?.code ? "No summary yet: finish the chat, then Refresh." : "No demos yet."}</p>
        )}
        <div className="flex flex-col gap-3 border-t border-current/10 pt-4">
          <button onClick={coach} disabled={!!busy || !summary?.misses.length} className="h-11 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40">
            {busy === "coach" ? "…" : "Coach me on what I missed"}
          </button>
        </div>
      </section>
    </main>
  );
}

async function loadResults() {
  await ensureSignedIn();
  return callApi<DemoResults>("/api/demo", { action: "results" } satisfies DemoRequest);
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-50">{title}</p>
      {items.length ? (
        <ul className="list-disc pl-5">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="opacity-50">none</p>
      )}
    </div>
  );
}
