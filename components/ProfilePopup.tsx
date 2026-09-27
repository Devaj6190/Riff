"use client";

import { MapPin, Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/HomeScreen";
import { InterestCloud } from "@/components/InterestCloud";
import { callApi } from "@/lib/api";
import { INTERESTS_REQUIRED } from "@/lib/interests";
import { FAVORITE_KINDS, FAVORITE_MAX, MAX_FAVORITES, MAX_PROMPTS, MIN_AGE, PROMPT_ANSWER_MAX, PROMPTS } from "@/lib/profile";
import type { MyProfile, ProfileRequest, ProfileResponse, PublicProfile } from "@/lib/types";

type Section = "basics" | "interests" | "prompts" | "favorites";
type Errors = Record<string, string>; // by field, the way /api/profile sends them: "from", "prompts.1", "favorites.0"

type Props = {
  profile: PublicProfile & Partial<Pick<MyProfile, "lastName" | "age">> & { school?: string; bio?: string }; // a seed's extras
  photo?: string; // the AI's people only (photos.ts)
  onSaved?: (profile: MyProfile) => void; // given: it's mine, editable in place
  onClose: () => void;
  children?: ReactNode; // actions under someone else's, e.g. Invite
};

const sectionOf = (field: string): Section => {
  const s = field.split(".")[0];
  return s === "interests" || s === "prompts" || s === "favorites" ? s : "basics";
};

/** What Save would be refused for, by field (the server's own checks come back in the same shape). */
function problems(d: MyProfile): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = "Add your first name";
  if (!(d.age >= MIN_AGE)) e.age = `Riff is for ${MIN_AGE} and up for now`;
  if (!d.from.trim()) e.from = "Add your city";
  if (d.interests.length < INTERESTS_REQUIRED) e.interests = `Pick at least ${INTERESTS_REQUIRED}`;
  d.prompts.forEach((p, i) => !p.answer.trim() && (e[`prompts.${i}`] = "Answer it or remove it"));
  d.favorites.forEach((f, i) => !f.value.trim() && (e[`favorites.${i}`] = "Fill it in or remove it"));
  return e;
}

const field = "h-12 min-w-0 rounded-2xl bg-muted px-4 outline-none placeholder:text-foreground/45 focus:ring-2 focus:ring-foreground/40";
const chip = "rounded-full bg-foreground/10 px-3 py-1 text-sm";
const item = "rounded-2xl bg-muted px-4 py-3";

/** One profile, laid out by section (SPEC §7 Profiles). Mine: tap a section to edit it, then Save. Theirs: read-only. */
export function ProfilePopup({ profile, photo, onSaved, onClose, children }: Props) {
  const mine = !!onSaved;
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(profile as MyProfile); // only used when mine
  const [editing, setEditing] = useState<Section | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = mine ? draft : profile; // theirs can change under us (the partner's full profile arriving)
  const dirty = mine && JSON.stringify(draft) !== JSON.stringify(profile);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  function edit(section: Section, patch: Partial<MyProfile>) {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => sectionOf(k) !== section)));
  }

  async function save() {
    const local = problems(draft);
    const shown = (e: Errors) => {
      setErrors(e);
      setEditing(sectionOf(Object.keys(e)[0]));
    };
    if (Object.keys(local).length) return shown(local);
    if (!dirty) return setEditing(null);
    setBusy(true);
    setFailed(null);
    try {
      const res = await callApi<ProfileResponse>("/api/profile", { action: "save", profile: draft } satisfies ProfileRequest);
      if (res.errors && Object.keys(res.errors).length) return shown(res.errors); // nothing was saved
      const saved = res.profile as MyProfile;
      setDraft(saved);
      setEditing(null);
      onSaved?.(saved);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-sm text-red-300">{errors[k]}</p>;
  const open = (s: Section) => editing === s;
  const remove = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`} className="-my-2 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/50 hover:text-foreground">
      <X className="size-4" />
    </button>
  );
  const unusedKinds = FAVORITE_KINDS.filter((k) => !draft.favorites.some((f) => f.kind === k));
  const where = [p.from, profile.school].filter(Boolean).join(" · ");

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()} // a click on the backdrop
      aria-label={`${p.name}'s profile`}
      className="riff-dialog m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-background text-foreground ring-1 ring-white/10 backdrop:bg-black/60"
    >
      <div className="riff-pop relative flex flex-col gap-6 p-5 pt-8">
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="absolute top-2 right-2 flex size-11 items-center justify-center text-foreground/60 hover:text-foreground">
          <X className="size-6" />
        </button>

        <div className="flex flex-col items-center gap-3">
          <Avatar name={p.name || "?"} photo={photo} className="size-20 text-3xl" />
          <Part mine={mine} open={open("basics")} onOpen={() => setEditing("basics")}>
            {open("basics") ? (
              <div className="grid grid-cols-2 gap-2">
                <input autoFocus value={draft.name} onChange={(e) => edit("basics", { name: e.target.value })} maxLength={24} placeholder="First name" aria-label="First name" autoComplete="given-name" className={field} />
                <input value={draft.lastName} onChange={(e) => edit("basics", { lastName: e.target.value })} maxLength={24} placeholder="Last name" aria-label="Last name" autoComplete="family-name" className={field} />
                <input value={draft.age || ""} onChange={(e) => edit("basics", { age: Number(e.target.value.replace(/\D/g, "")) })} maxLength={2} inputMode="numeric" placeholder="Age" aria-label="Age" className={field} />
                <input value={draft.from} onChange={(e) => edit("basics", { from: e.target.value })} maxLength={40} placeholder="City" aria-label="City" autoComplete="address-level2" className={field} />
                <div className="col-span-2">
                  {err("name")}
                  {err("age")}
                  {err("from")}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-2xl font-semibold tracking-tight">
                  {/* Last name and age are private: only ever shown on your own. */}
                  {mine ? `${p.name} ${draft.lastName}, ${draft.age}` : p.name}
                </p>
                {where && (
                  <p className="mt-1 flex items-center justify-center gap-1 text-foreground/60">
                    <MapPin className="size-4 shrink-0" />
                    {where}
                  </p>
                )}
                {profile.bio && <p className="mt-2 text-foreground/75">{profile.bio}</p>}
                {err("name")}
                {err("age")}
                {err("from")}
              </div>
            )}
          </Part>
        </div>

        <Part title="Interests" mine={mine} open={open("interests")} onOpen={() => setEditing("interests")}>
          {open("interests") ? (
            <InterestCloud
              picked={draft.interests}
              onToggle={(i) => edit("interests", { interests: draft.interests.includes(i) ? draft.interests.filter((x) => x !== i) : [...draft.interests, i] })}
            />
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {p.interests.map((i) => (
                <li key={i} className={chip}>
                  {i}
                </li>
              ))}
            </ul>
          )}
          {err("interests")}
        </Part>

        {(mine || p.prompts.length > 0) && (
          <Part title="Prompts" mine={mine} open={open("prompts")} onOpen={() => setEditing("prompts")}>
            <ul className="flex flex-col gap-2">
              {p.prompts.map((x, i) => (
                <li key={x.prompt} className={item}>
                  <p className="flex items-center justify-between gap-2 text-sm text-foreground/60">
                    {x.prompt}
                    {open("prompts") && remove(x.prompt, () => edit("prompts", { prompts: draft.prompts.filter((_, j) => j !== i) }))}
                  </p>
                  {open("prompts") ? (
                    <>
                      <input
                        autoFocus={!x.answer}
                        value={x.answer}
                        onChange={(e) => edit("prompts", { prompts: draft.prompts.map((y, j) => (j === i ? { ...y, answer: e.target.value } : y)) })}
                        maxLength={PROMPT_ANSWER_MAX}
                        placeholder="Your answer"
                        aria-label={x.prompt}
                        className="mt-1 w-full bg-transparent text-lg font-medium outline-none placeholder:text-foreground/35"
                      />
                      <p className="text-right text-xs text-foreground/45 tabular-nums">
                        {x.answer.length}/{PROMPT_ANSWER_MAX}
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-lg leading-snug font-medium break-words">{x.answer}</p>
                  )}
                  {err(`prompts.${i}`)}
                </li>
              ))}
              {mine && !open("prompts") && !p.prompts.length && <li className={`${item} text-foreground/50`}>Add up to {MAX_PROMPTS} prompts</li>}
            </ul>
            {open("prompts") && draft.prompts.length < MAX_PROMPTS && (
              <Picker
                options={PROMPTS.filter((q) => !draft.prompts.some((x) => x.prompt === q))}
                placeholder="Add a prompt"
                onPick={(prompt) => edit("prompts", { prompts: [...draft.prompts, { prompt, answer: "" }] })}
              />
            )}
          </Part>
        )}

        {(mine || p.favorites.length > 0) && (
          <Part title="Favorites" mine={mine} open={open("favorites")} onOpen={() => setEditing("favorites")}>
            <ul className="flex flex-col gap-2">
              {p.favorites.map((f, i) => (
                <li key={f.kind} className={item}>
                  <p className="flex items-center justify-between gap-2 text-sm text-foreground/60">
                    Favorite {f.kind}
                    {open("favorites") && remove(f.kind, () => edit("favorites", { favorites: draft.favorites.filter((_, j) => j !== i) }))}
                  </p>
                  {open("favorites") ? (
                    <input
                      autoFocus={!f.value}
                      value={f.value}
                      onChange={(e) => edit("favorites", { favorites: draft.favorites.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })}
                      maxLength={FAVORITE_MAX}
                      placeholder={`Your favorite ${f.kind}`}
                      aria-label={`Favorite ${f.kind}`}
                      className="mt-1 w-full bg-transparent text-lg font-medium outline-none placeholder:text-foreground/35"
                    />
                  ) : (
                    <p className="mt-0.5 text-lg leading-snug font-medium break-words">{f.value}</p>
                  )}
                  {err(`favorites.${i}`)}
                </li>
              ))}
              {mine && !open("favorites") && !p.favorites.length && <li className={`${item} text-foreground/50`}>Add up to {MAX_FAVORITES} favorites</li>}
            </ul>
            {open("favorites") && draft.favorites.length < MAX_FAVORITES && (
              <Picker
                options={unusedKinds}
                placeholder={`Favorite ${unusedKinds.slice(0, 3).join("/")}/etc.`}
                onPick={(kind) => edit("favorites", { favorites: [...draft.favorites, { kind, value: "" }] })}
              />
            )}
          </Part>
        )}

        {mine && (editing || dirty) && (
          <div className="sticky bottom-0 -mx-5 -mb-5 bg-background/95 px-5 pt-3 pb-5 backdrop-blur">
            {failed && <p className="mb-2 text-center text-sm text-red-300">{failed}</p>}
            <button type="button" onClick={save} disabled={busy} className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground transition-[opacity,scale] active:scale-[0.98] disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}

/** A section. On your own profile, tapping it (while not being edited) opens it for editing. */
function Part({ title, mine, open, onOpen, children }: { title?: string; mine: boolean; open: boolean; onOpen: () => void; children: ReactNode }) {
  const heading = title && (
    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground/50">
      {title}
      {mine && !open && <Pencil className="size-3.5" />}
    </h3>
  );
  if (!mine || open) {
    return (
      <section className="w-full">
        {heading}
        {children}
      </section>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="-m-2 w-[calc(100%+1rem)] rounded-2xl p-2 text-left transition-colors hover:bg-white/5">
      {heading}
      {children}
    </button>
  );
}

/** A box that, tapped, lists `options` to search and pick from (Enter picks the first match). */
function Picker({ options, placeholder, onPick }: { options: string[]; placeholder: string; onPick: (option: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const shown = options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));

  function pick(option: string) {
    onPick(option);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="mt-2">
      <label className={`${field} flex items-center gap-2 border border-dashed border-foreground/25 bg-transparent`}>
        <Plus className="size-5 shrink-0 text-foreground/50" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              e.preventDefault();
              pick(shown[0]);
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-foreground/55"
        />
      </label>
      {open && (
        // mousedown would blur the box (closing the list) before the click lands
        <ul onMouseDown={(e) => e.preventDefault()} className="riff-pop mt-1.5 max-h-56 overflow-y-auto overscroll-contain rounded-2xl bg-white/5 py-1">
          {shown.map((o) => (
            <li key={o}>
              <button type="button" onClick={() => pick(o)} className="w-full px-4 py-2.5 text-left first-letter:uppercase hover:bg-white/10">
                {o}
              </button>
            </li>
          ))}
          {!shown.length && <li className="px-4 py-2.5 text-foreground/45">Nothing like that</li>}
        </ul>
      )}
    </div>
  );
}
