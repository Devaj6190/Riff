"use client";

import { useState } from "react";
import { INTEREST_CHIPS, INTERESTS_REQUIRED, normalizeInterest, normalizeInterests } from "@/lib/interests";

export type Profile = { name: string; interests: string[] };

const PROFILE_KEY = "riff-profile";

/** The profile saved on this device, or null. Client-only. */
export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    return typeof p?.name === "string" && Array.isArray(p.interests) ? p : null;
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

type Props = {
  submitLabel: string;
  initial?: Profile | null;
  onSubmit: (name: string, interests: string[]) => Promise<void>;
};

/** Display name + pick 3 interest chips (or type your own). Used for the home profile and to join a riff. */
export function ProfileForm({ submitLabel, initial, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [picked, setPicked] = useState<string[]>(initial?.interests ?? []);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chips = [...INTEREST_CHIPS, ...picked.filter((p) => !INTEREST_CHIPS.includes(p))];
  const full = picked.length >= INTERESTS_REQUIRED;

  function toggle(chip: string) {
    setPicked((prev) => (prev.includes(chip) ? prev.filter((p) => p !== chip) : full ? prev : [...prev, chip]));
  }

  function addCustom() {
    const chip = normalizeInterest(custom);
    if (chip && !picked.includes(chip) && !full) setPicked([...picked, chip]);
    setCustom("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim(), normalizeInterests(picked));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        required
        placeholder="Your name"
        aria-label="Your name"
        className="h-12 rounded-2xl bg-muted px-4 text-lg"
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm text-foreground/60">
          Pick {INTERESTS_REQUIRED} things you&apos;re into · {picked.length}/{INTERESTS_REQUIRED}
        </span>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const on = picked.includes(chip);
            return (
              <button
                key={chip}
                type="button"
                onClick={() => toggle(chip)}
                aria-pressed={on}
                disabled={!on && full}
                className={`h-11 rounded-full px-4 transition-colors disabled:opacity-40 ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {chip}
              </button>
            );
          })}
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
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={busy || !name.trim() || picked.length < INTERESTS_REQUIRED}
        className="h-12 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
      >
        {busy ? "…" : submitLabel}
      </button>
    </form>
  );
}
