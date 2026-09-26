"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { loadProfile, ProfileForm, saveProfile, type Profile } from "@/components/ProfileForm";
import { INTEREST_CHIPS } from "@/lib/interests";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";

// ponytail: template people until Phase 2 discovery has a backend (SPEC §7).
const PEOPLE: (Profile & { school: string })[] = [
  { name: "Maya", school: "Georgia Tech", interests: ["anime", "food", "travel"] },
  { name: "Jordan", school: "Georgia Tech", interests: ["sports", "memes", "gaming"] },
  { name: "Priya", school: "Emory", interests: ["books", "art", "music"] },
  { name: "Leo", school: "Georgia State", interests: ["fitness", "outdoors", "food"] },
  { name: "Sam", school: "Georgia Tech", interests: ["tech", "gaming", "movies"] },
  { name: "Ava", school: "SCAD Atlanta", interests: ["fashion", "art", "music"] },
];

const chip = (on: boolean) =>
  `h-9 shrink-0 rounded-full px-4 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`;

export function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Mounted only after "Get Started", so reading localStorage on first render is safe. */
export function HomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const people = PEOPLE.filter(
    (p) =>
      (!q || [p.name, p.school, ...p.interests].some((s) => s.toLowerCase().includes(q))) &&
      (filters.length === 0 || p.interests.some((i) => filters.includes(i))),
  );

  function openProfile() {
    setEditing(true);
    document.getElementById("profile")?.scrollIntoView({ behavior: "smooth" });
  }

  async function startRiff() {
    if (!profile) return openProfile();
    setBusy(true);
    setError(null);
    try {
      await ensureSignedIn();
      const { data, error } = await supabase().rpc("create_riff", { p_name: profile.name, p_interests: profile.interests });
      if (error) throw new Error(error.message);
      router.push(`/r/${data}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a chat");
      setBusy(false);
    }
  }

  async function save(name: string, interests: string[]) {
    const next = { name, interests };
    saveProfile(next);
    setProfile(next);
    setEditing(false);
  }

  return (
    <div className="riff-reveal relative z-10 min-h-dvh bg-background">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-8 md:grid-cols-2 md:gap-12 md:py-12">
        <div className="flex min-w-0 flex-col gap-8">
          <header>
            <h1 className="text-4xl font-bold tracking-tight">Riff</h1>
            <p className="opacity-60">For everything after hello.</p>
          </header>

          <section className="flex flex-col gap-3">
            <button onClick={startRiff} disabled={busy} className="h-12 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? "…" : "Start a chat"}
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/r/${code}`);
              }}
              className="flex gap-2"
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                maxLength={4}
                placeholder="Have a code? ABCD"
                autoCapitalize="characters"
                aria-label="Chat code"
                className="h-12 min-w-0 flex-1 rounded-full bg-muted px-5 font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal"
              />
              <button type="submit" disabled={code.length !== 4} className="h-12 rounded-full px-5 font-semibold text-primary disabled:opacity-40">
                Join
              </button>
            </form>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Find people</h2>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, schools, interests"
              aria-label="Search people"
              className="h-11 rounded-full bg-muted px-5"
            />
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
              {INTEREST_CHIPS.map((c) => {
                const on = filters.includes(c);
                return (
                  <button
                    key={c}
                    aria-pressed={on}
                    onClick={() => setFilters(on ? filters.filter((f) => f !== c) : [...filters, c])}
                    className={chip(on)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <ul className="flex flex-col">
              {people.map((p) => (
                <li key={p.name} className="flex items-center gap-3 border-b border-current/10 py-3 last:border-0">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="truncate text-sm opacity-60">
                      {p.school} · {p.interests.join(", ")}
                    </p>
                  </div>
                  <span className="text-sm opacity-40">Soon</span>
                </li>
              ))}
              {people.length === 0 && <li className="py-3 text-sm opacity-60">No one matches yet.</li>}
            </ul>
          </section>
        </div>

        <aside id="profile" className="flex scroll-mt-8 flex-col gap-4 md:sticky md:top-12 md:self-start md:rounded-3xl md:bg-muted/50 md:p-6">
          {profile ? (
            <div className="flex items-center gap-3">
              <Avatar name={profile.name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{profile.name}</p>
                <p className="truncate text-sm opacity-60">{profile.interests.join(", ")}</p>
              </div>
              {!editing && (
                <button onClick={() => setEditing(true)} className="h-11 px-2 font-semibold text-primary md:hidden">
                  Edit
                </button>
              )}
            </div>
          ) : (
            !editing && (
              <button onClick={openProfile} className="flex flex-col items-start rounded-3xl bg-primary/10 p-5 text-left md:hidden">
                <span className="font-semibold text-primary">Create your own profile</span>
                <span className="text-sm opacity-60">Takes 2 minutes.</span>
              </button>
            )
          )}
          <div className={editing ? "" : "hidden md:block"}>
            <h2 className="mb-3 hidden text-lg font-semibold md:block">{profile ? "Your profile" : "Create your profile"}</h2>
            <ProfileForm key={profile?.name} submitLabel="Save profile" initial={profile} onSubmit={save} />
          </div>
        </aside>
      </div>
    </div>
  );
}
