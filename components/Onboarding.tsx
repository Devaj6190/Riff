"use client";

import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { INTERESTS_REQUIRED, normalizeInterest, normalizeInterests } from "@/lib/interests";

/** What onboarding asks. Only name + interests reach a chat; the rest stays on this device until profiles have a table. */
export type Profile = {
  name: string;
  age: number;
  from: string;
  goal: string;
  vibe: string[]; // one answer per VIBES question
  interests: string[]; // top 3
};

const PROFILE_KEY = "riff-profile";

/** The profile saved on this device, or null. Client-only. Pre-onboarding profiles (no age) count as none. */
export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    return typeof p?.name === "string" && typeof p.age === "number" && Array.isArray(p.interests) ? p : null;
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

const GOALS = [
  ["👋", "Make new friends"],
  ["🎓", "Meet people at my school"],
  ["💬", "Get better at conversations"],
  ["✨", "Just here for fun"],
];

const VIBES: [question: string, a: string[], b: string[]][] = [
  ["Friday night?", ["🎉", "Out with people"], ["🛋️", "In with a show"]],
  ["Plans?", ["🗓️", "Planned out"], ["🎲", "Wing it"]],
  ["You text in…", ["📜", "Paragraphs"], ["⚡", "One-liners"]],
  ["Morning or night?", ["🌅", "Early bird"], ["🦉", "Night owl"]],
  ["Best hangs are…", ["🎊", "Big groups"], ["☕", "One-on-one"]],
];

const INTEREST_GROUPS: [string, string[]][] = [
  ["Music", ["music", "hip-hop", "pop", "indie", "k-pop", "r&b", "edm", "concerts"]],
  ["Watching", ["movies", "anime", "tv shows", "youtube", "reality tv", "horror"]],
  ["Games", ["gaming", "nintendo", "valorant", "minecraft", "board games", "chess"]],
  ["Active", ["sports", "fitness", "basketball", "soccer", "running", "hiking", "outdoors"]],
  ["Food", ["food", "cooking", "baking", "coffee", "boba", "new restaurants"]],
  ["Creative", ["art", "photography", "writing", "fashion", "design", "making music"]],
  ["Curious", ["books", "tech", "startups", "science", "history", "psychology"]],
  ["Life", ["travel", "memes", "pets", "cars", "thrifting", "astrology"]],
];
const LISTED = INTEREST_GROUPS.flatMap(([, chips]) => chips);

// Steps: 0 name, 1 age, 2 from, 3 goal, one per vibe, then interests.
const VIBE_AT = 4;
const LAST = VIBE_AT + VIBES.length;

const title = "text-3xl font-bold tracking-tight";
const hint = "mt-2 text-foreground/60";
const primary = "h-14 w-full rounded-full bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-40";

type Props = {
  submitLabel: string;
  initial?: Profile | null;
  intro?: string; // shown above the first question, e.g. for invite links
  onDone: (profile: Profile) => Promise<void> | void;
  onCancel?: () => void; // back from the first step; editing only
};

/** One question per screen. Taps advance on their own; typed answers take Return or Continue. */
export function Onboarding({ submitLabel, initial, intro, onDone, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? "");
  const [age, setAge] = useState(initial ? String(initial.age) : "");
  const [from, setFrom] = useState(initial?.from ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [vibe, setVibe] = useState<string[]>(initial?.vibe ?? []);
  const [picked, setPicked] = useState<string[]>(initial?.interests ?? []);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(to: number) {
    setError(null);
    setStep(to);
  }

  const full = picked.length >= INTERESTS_REQUIRED;
  function toggle(chip: string) {
    setPicked((prev) => (prev.includes(chip) ? prev.filter((p) => p !== chip) : full ? prev : [...prev, chip]));
  }
  function addCustom() {
    const chip = normalizeInterest(custom);
    if (chip && !picked.includes(chip) && !full) setPicked([...picked, chip]);
    setCustom("");
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await onDone({ name: name.trim(), age: Number(age), from: from.trim(), goal, vibe, interests: normalizeInterests(picked) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    { q: "What should people call you?", h: "Your first name is perfect.", value: name, set: setName, placeholder: "Your name", maxLength: 24, autoComplete: "given-name" },
    { q: `Nice to meet you, ${name.trim()}. How old are you?`, h: null, value: age, set: (v: string) => setAge(v.replace(/\D/g, "")), placeholder: "Age", maxLength: 2, autoComplete: "off" },
    { q: "Where are you from?", h: "City, school, wherever feels like home.", value: from, set: setFrom, placeholder: "Atlanta, GA", maxLength: 40, autoComplete: "address-level2" },
  ];

  let body: React.ReactNode;
  if (step < fields.length) {
    const f = fields[step];
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 1 && Number(age) < MIN_AGE) return setError(`Riff is for ${MIN_AGE} and up for now.`);
          go(step + 1);
        }}
        className="flex flex-col gap-6"
      >
        <div>
          {step === 0 && intro && <p className="mb-2 font-semibold text-primary">{intro}</p>}
          <h1 className={title}>{f.q}</h1>
          {f.h && <p className={hint}>{f.h}</p>}
        </div>
        <input
          key={step}
          autoFocus
          value={f.value}
          onChange={(e) => f.set(e.target.value)}
          placeholder={f.placeholder}
          aria-label={f.placeholder}
          maxLength={f.maxLength}
          autoComplete={f.autoComplete}
          inputMode={step === 1 ? "numeric" : "text"}
          enterKeyHint="next"
          className="h-14 rounded-2xl bg-muted px-5 text-xl"
        />
        {error && <p className="-mt-3 text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={!f.value.trim()} className={primary}>
          Continue
        </button>
      </form>
    );
  } else if (step === 3) {
    body = (
      <>
        <h1 className={title}>What brings you to Riff?</h1>
        <div className="mt-8 flex flex-col gap-3">
          {GOALS.map(([emoji, label]) => (
            <button
              key={label}
              onClick={() => {
                setGoal(label);
                go(step + 1);
              }}
              aria-pressed={goal === label}
              className={`flex h-16 items-center gap-4 rounded-2xl px-5 text-left text-lg font-medium ${goal === label ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <span className="text-2xl">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      </>
    );
  } else if (step < LAST) {
    const i = step - VIBE_AT;
    const [question, ...options] = VIBES[i];
    body = (
      <>
        <p className="mb-2 font-semibold text-primary">
          This or that · {i + 1} of {VIBES.length}
        </p>
        <h1 className={title}>{question}</h1>
        <div className="mt-8 grid grid-cols-2 gap-3">
          {options.map(([emoji, label]) => (
            <button
              key={label}
              onClick={() => {
                const next = [...vibe];
                next[i] = label;
                setVibe(next);
                go(step + 1);
              }}
              aria-pressed={vibe[i] === label}
              className={`flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl p-3 text-lg font-semibold ${vibe[i] === label ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <span className="text-5xl">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      </>
    );
  } else {
    const chip = (c: string) => {
      const on = picked.includes(c);
      return (
        <button
          key={c}
          type="button"
          onClick={() => toggle(c)}
          aria-pressed={on}
          disabled={!on && full}
          className={`h-11 rounded-full px-4 transition-colors disabled:opacity-40 ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          {c}
        </button>
      );
    };
    body = (
      <>
        <h1 className={title}>What are you into?</h1>
        <p className={hint}>Pick your top {INTERESTS_REQUIRED}. Riff builds your chats around them.</p>
        <div className="mt-6 flex flex-col gap-5">
          {INTEREST_GROUPS.map(([group, chips]) => (
            <section key={group}>
              <h2 className="mb-2 text-sm font-semibold text-foreground/50">{group}</h2>
              <div className="flex flex-wrap gap-2">{chips.map(chip)}</div>
            </section>
          ))}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground/50">Something else</h2>
            <div className="flex flex-wrap gap-2">
              {picked.filter((p) => !LISTED.includes(p)).map(chip)}
              {!full && (
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                  onBlur={addCustom}
                  placeholder="+ your own"
                  aria-label="Add your own interest"
                  maxLength={24}
                  className="h-11 w-32 rounded-full border border-dashed border-current/25 bg-transparent px-4 placeholder:text-foreground/50 focus:border-primary"
                />
              )}
            </div>
          </section>
        </div>
        <div className="sticky bottom-0 -mx-6 mt-auto bg-linear-to-t from-background from-60% to-transparent px-6 pt-8 pb-2">
          {error && <p className="mb-2 text-center text-sm text-red-500">{error}</p>}
          <button onClick={finish} disabled={busy || !full} className={primary}>
            {busy ? "…" : full ? submitLabel : `Pick ${INTERESTS_REQUIRED - picked.length} more`}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-3 pb-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (step === 0 ? onCancel?.() : go(step - 1))}
          aria-label={step === 0 ? "Close" : "Back"}
          className={`-ml-3 flex size-11 items-center justify-center text-primary ${step === 0 && !onCancel ? "invisible" : ""}`}
        >
          <ChevronLeft className="size-7" />
        </button>
        <div className="mr-8 h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((step + 1) / (LAST + 1)) * 100}%` }} />
        </div>
      </div>
      <div key={step} className="riff-step flex flex-1 flex-col pt-10">
        {body}
      </div>
    </div>
  );
}
