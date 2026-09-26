"use client";

import { useState } from "react";
import { INTEREST_CHIPS, INTERESTS_REQUIRED, normalizeInterest, normalizeInterests } from "@/lib/interests";

type Props = {
  submitLabel: string;
  onSubmit: (name: string, interests: string[]) => Promise<void>;
};

/** Display name + pick 3 interest chips (or type your own). Used to create and to join a room. */
export function ProfileForm({ submitLabel, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
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
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm opacity-70">Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          required
          className="h-11 rounded-lg border border-current/20 bg-transparent px-3"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm opacity-70">
          Pick {INTERESTS_REQUIRED} interests ({picked.length}/{INTERESTS_REQUIRED})
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
                className={`h-11 rounded-full border px-4 disabled:opacity-40 ${on ? "border-transparent bg-foreground text-background" : "border-current/20"}`}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Or type your own"
            maxLength={24}
            disabled={full}
            className="h-11 flex-1 rounded-lg border border-current/20 bg-transparent px-3 disabled:opacity-40"
          />
          <button type="button" onClick={addCustom} disabled={full || !custom.trim()} className="h-11 rounded-lg border border-current/20 px-4 disabled:opacity-40">
            Add
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={busy || !name.trim() || picked.length < INTERESTS_REQUIRED}
        className="h-12 rounded-lg bg-foreground font-semibold text-background disabled:opacity-40"
      >
        {busy ? "…" : submitLabel}
      </button>
    </form>
  );
}
