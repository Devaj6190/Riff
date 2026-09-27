"use client";

import { ArrowRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { InterestCloud } from "@/components/InterestCloud";
import { callApi } from "@/lib/api";
import { INTERESTS_REQUIRED, normalizeInterest } from "@/lib/interests";
import { ensureSignedIn } from "@/lib/supabase/client";
import type { PlaceRequest, PlaceResponse } from "@/lib/types";

/** What onboarding asks. Only first name + the first 3 interests reach a chat; the rest stays on this device until profiles have a table. */
export type Profile = {
  name: string; // first name
  lastName: string;
  age: number;
  from: string;
  interests: string[]; // at least 3, in pick order
};

const PROFILE_KEY = "riff-profile";

/** The profile saved on this device, or null. Client-only. Profiles from older onboarding (no last name) count as none. */
export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    return typeof p?.name === "string" && typeof p.lastName === "string" && typeof p.age === "number" && Array.isArray(p.interests) ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ponytail: storage blocked (private mode); the profile just won't persist.
  }
}

const MIN_AGE = 15;

// Same look as the landing: navy with grain, cream type, cream pill buttons.
const title = "text-3xl font-semibold tracking-tight";
const hint = "mt-2 text-cream/60";
const primary =
  "flex h-16 w-full items-center justify-center gap-3 rounded-full bg-cream text-xl font-medium text-navy shadow-[inset_0_0_16px_1px_rgb(0_0_0/0.12)] transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40";
const field = "h-14 min-w-0 rounded-2xl bg-white/10 px-4 text-lg text-cream outline-none placeholder:text-cream/45 focus:ring-2 focus:ring-cream/60";
const arrow = <ArrowRight className="size-6" />;

type Props = {
  submitLabel: string;
  initial?: Profile | null;
  intro?: string; // shown above the first page's title, e.g. for invite links
  onDone: (profile: Profile) => Promise<void> | void;
  onCancel?: () => void; // back from the first page; editing only
};

/** Two pages: about you (name, age, city), then interests. */
export function Onboarding({ submitLabel, initial, intro, onDone, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [age, setAge] = useState(initial ? String(initial.age) : "");
  const [from, setFrom] = useState(initial?.from ?? "");
  const [picked, setPicked] = useState<string[]>(initial?.interests ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(to: number) {
    setError(null);
    setStep(to);
  }

  const enough = picked.length >= INTERESTS_REQUIRED;
  function toggle(chip: string) {
    setPicked((prev) => (prev.includes(chip) ? prev.filter((p) => p !== chip) : [...prev, chip]));
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await onDone({ name: name.trim(), lastName: lastName.trim(), age: Number(age), from: from.trim(), interests: [...new Set(picked.map(normalizeInterest).filter(Boolean))] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const page =
    step === 0 ? (
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          // Return on a half-filled page just moves to the next empty field.
          const empty = e.currentTarget.querySelector<HTMLInputElement>(":invalid");
          if (empty) return empty.focus();
          if (Number(age) < MIN_AGE) return setError(`Riff is for ${MIN_AGE} and up for now.`);
          if (from.trim() !== initial?.from) {
            setBusy(true);
            setError(null);
            // Jev checks it's a real place (/api/place); a failed check lets them through.
            const valid = await ensureSignedIn()
              .then(() => callApi<PlaceResponse>("/api/place", { place: from } satisfies PlaceRequest))
              .then((r) => r.valid, () => true);
            setBusy(false);
            if (!valid) return setError("That doesn't look like a real city.");
          }
          go(1);
        }}
        className="my-auto flex flex-col gap-6"
      >
        <div className="text-center">
          {intro && <p className="mb-2 font-medium text-cream/70">{intro}</p>}
          <h1 className={title}>Enter your details</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="First name" aria-label="First name" autoComplete="given-name" enterKeyHint="next" className={field} />
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={24} placeholder="Last name" aria-label="Last name" autoComplete="family-name" enterKeyHint="next" className={field} />
          <input required pattern="\d+" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} maxLength={2} inputMode="numeric" placeholder="Age" aria-label="Age" autoComplete="off" enterKeyHint="next" className={field} />
          <input required value={from} onChange={(e) => setFrom(e.target.value)} maxLength={40} placeholder="City" aria-label="City" autoComplete="address-level2" enterKeyHint="done" className={field} />
        </div>
        {error && <p className="-mt-3 text-center text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "…" : <>Continue {arrow}</>}
        </button>
      </form>
    ) : (
      <>
        <div className="text-center">
          <h1 className={title}>What are you into?</h1>
          <p className={hint}>
            Pick at least {INTERESTS_REQUIRED}. Riff builds your chats around them.
          </p>
        </div>
        <div className="my-auto py-8">
          <InterestCloud picked={picked} onToggle={toggle} />
        </div>
        <div className="sticky bottom-0 pt-8 pb-2">
          {error && <p className="mb-2 text-center text-sm text-red-300">{error}</p>}
          <button onClick={finish} disabled={busy || !enough} className={primary}>
            {busy ? "…" : enough ? <>{submitLabel} {arrow}</> : `Pick ${INTERESTS_REQUIRED - picked.length} more`}
          </button>
        </div>
      </>
    );

  return (
    // overflow-clip, not hidden: hidden would make this a scroll box and break the sticky button.
    <div className="riff-grain relative min-h-dvh overflow-clip text-cream">
      <div className={`relative mx-auto flex min-h-dvh w-full flex-col px-6 pt-3 pb-6 ${step === 0 ? "max-w-md" : "max-w-2xl"}`}>
        <button
          onClick={() => (step === 0 ? onCancel?.() : go(0))}
          aria-label={step === 0 ? "Close" : "Back"}
          className={`-ml-3 flex size-11 items-center justify-center text-cream ${step === 0 && !onCancel ? "invisible" : ""}`}
        >
          <ChevronLeft className="size-7" />
        </button>
        <div key={step} className="riff-step flex flex-1 flex-col pt-4">
          {page}
        </div>
        <div className="mt-4 flex justify-center gap-1.5" aria-label={`Step ${step + 1} of 2`}>
          {[0, 1].map((s) => (
            <span key={s} className={`h-1.5 w-8 rounded-full transition-colors ${s <= step ? "bg-cream" : "bg-cream/20"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
