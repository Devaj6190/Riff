// Shared contracts. Mirrors supabase/migrations. Changes only on `main`.

export type Seat = "A" | "B";

export type RiffPhase = "lobby" | "chatting" | "ended";

export type RiffKind = "game" | "coach"; // coach: a 1:1 with the AI coach on references the player missed; no nudges

export type NudgeKind = "text" | "image" | "audio" | "pick" | "truths"; // pick, truths: mini games (SPEC §4.1)

export type Tone = "fun" | "deep" | "know";

export type Depth = 1 | 2 | 3;

// DB rows ---------------------------------------------------------------------

export type Riff = {
  id: string;
  code: string;
  kind: RiffKind;
  phase: RiffPhase; // lobby until the second player joins; ended by score or by a player, chat stays open
  target_score: number;
  created_at: string;
  ended_at: string | null;
  summary: RiffSummary | null; // written by the engine when the riff ends
  reported_at: string | null;
  demo_script: string | null; // dev: a scripted demo chat (lib/engine/demo.ts); null = a normal riff
  demo_step: number; // dev: the script's next line
  demo_summary: ChatHistorySummary | null; // dev: seat A's post-chat summary of a demo (never saved to chat_histories); on a coach riff, the summary it coaches on
};

/** Moment Spotlight: `moments` is empty when the chat was too short, the model failed, or it's a coach chat. */
export type RiffSummary = { moments: Moment[] };

/** One card of the end-of-match reel: a show template and the real messages it quotes, in chat order. */
export type Moment = {
  template: string; // id from lib/engine/moments.ts TEMPLATES; style by it if you like
  title: string; // show title, e.g. "The Laugh Riot"
  lines: { seat: Seat; body: string }[]; // 1-4 consecutive messages, verbatim
  caption: string; // one hype line from the AI host
};

/** Engine-only (riff_context): what the chat has revealed so far, kept current as messages come in. */
export type ChatContext = {
  notes: Record<Seat, string[]>; // facts, opinions, stories, likes each player has shared
  thread: { topic: string; open: string[]; callbacks: string[] }; // on right now; unanswered questions; running jokes
};

/** Engine-only (chat_histories): one player's side of a finished riff, for future pairing. Never shown to users. */
export type ChatHistorySummary = {
  recap: string; // the whole chat in 2-3 sentences
  learned: string[]; // about this player
  clicked: string[]; // topics that got long, excited back-and-forths
  died: string[]; // topics that went nowhere
  misses: string[]; // references or topics this player didn't get, or checked out of
  coaching?: CoachingReport; // shown to this player only (/api/coaching); absent on older rows or if the model failed
};

/** A player's private coaching report (SPEC §7), from their own messages only. Quotes are their messages, verbatim. */
export type CoachingReport = {
  good: { point: string; quote?: string }; // what they were good at
  flat: { point: string; quote?: string }; // where they fell flat
  improve: { tip: string; said?: string; try?: string }; // one tip; `said` (theirs) rewritten as `try`
  coach: CoachFocus | null; // what one coach chat can teach them; null if nothing fell flat
};

/** What a coach chat works on, written from what fell flat in one chat. Not templated. */
export type CoachFocus = { title: string; why: string; learn: string[] }; // learn: 3-5 concrete things

/** Engine-only (user_profiles): all of a user's chat_histories rolled into one. Steers later chats; never shown. */
export type UserProfile = {
  about: string; // who they are and how they chat, 1-2 sentences
  enjoys: string[]; // topics that reliably spark them
  flat: string[]; // topics that fell flat
  misses: string[]; // references or topics they tend not to get
  chats: number; // how many chats this is built from
};

export type Player = {
  id: string;
  riff_id: string;
  user_id: string;
  seat: Seat;
  name: string;
  interests: string[];
  extracted_interests: string[];
  joined_at: string;
};

export type Message = {
  id: number;
  riff_id: string;
  player_id: string;
  body: string;
  created_at: string;
};

type NudgeBase = {
  id: string;
  riff_id: string;
  number: number; // 1, 2, 3… in the order shown
  depth: Depth;
  is_bonus: boolean;
  for_seat: Seat | null; // bonus mode: the trailing player this nudge leans toward. Null = neither.
  created_at: string; // when it popped up
  ends_at: string; // its countdown: what each player texts before this is their answer
  scored_at: string | null; // set once the answers are scored, when the timer runs out
};

/**
 * An AI pop-up at the top of the chat with a countdown. Players answer by chatting before `ends_at`.
 * Narrowing on `kind` narrows `payload`.
 */
export type Nudge = { [K in NudgeKind]: NudgeBase & { kind: K; payload: NudgePayloads[K] } }[NudgeKind];

/** A nudge written ahead of time (server-only table), shown when its number comes up. */
export type QueuedNudge = {
  [K in NudgeKind]: Omit<NudgeBase, "number" | "ends_at" | "scored_at"> & { for_number: number; kind: K; payload: NudgePayloads[K] };
}[NudgeKind];

/** One player's points for answering one nudge. Players who didn't answer get no row. */
export type Score = {
  id: string;
  riff_id: string;
  nudge_id: string;
  player_id: string;
  speed: number; // 0–5, how fast their first message came after the nudge popped up
  quality: number; // 0–10
  connection: number; // 0–5, ties to the partner and to earlier messages
  total: number; // speed + quality + connection, computed by the DB
  created_at: string;
};

export type NudgePayloads = {
  text: { prompt: string };
  image: { prompt: string; imageUrl: string };
  audio: { prompt: string; clipId: string; clipUrl: string }; // the answer lives in clips.json, looked up by clipId
  // Mini games (SPEC §4.1). `locked`: seats done with this stage. `stageAt`: when the stage began (the timer ring).
  // Plays stay server-side (nudge_plays) until the reveal.
  pick: { prompt: string; options: string[]; stage: "play" | "reveal"; stageAt: string; locked: Seat[]; reveal?: Partial<Record<Seat, PickPlay>> };
  truths: {
    prompt: string;
    stage: "write" | "guess" | "reveal";
    stageAt: string;
    locked: Seat[];
    statements?: Partial<Record<Seat, string[]>>; // from the guess stage on: who wrote what, without the lie
    reveal?: Partial<Record<Seat, TruthsPlay>>;
  };
};

/** Guess their pick: my pick and my guess of the partner's pick, as option indexes. */
export type PickPlay = { pick: number; guess: number };
/** Two truths and a lie: my 3 statements and which one is the lie (write stage), my guess at the partner's lie
 *  (guess stage). Either part can be missing: someone who didn't write can still guess. */
export type TruthsPlay = { statements?: string[]; lie?: number; guess?: number };
export type GameStage = NudgePayloads["pick" | "truths"]["stage"];

/** An entry in clips.json (SPEC §6). */
export type Clip = {
  id: string;
  file: string; // path under /public/clips
  tags: string[];
  answer: string;
  license: string;
  sourceUrl: string;
};

// API contracts ---------------------------------------------------------------
// Every route takes JSON (except /api/transcribe) plus `Authorization: Bearer <supabase access token>`.
// Call them with callApi() from lib/api.ts; guard them with requirePlayer() from lib/supabase/auth.ts.

/** POST /api/tick: call every second while chatting. Shows the next nudge if it's time. Idempotent.
 *  `typing`: either player typed in the last few seconds (the client hears the partner over a Realtime broadcast). */
export type TickRequest = { riffId: string; typing?: boolean };
/** Test mode: seat the AI as player B in the caller's riff. */
export type BotRequest = { code: string };
export type TickResponse = { phase: RiffPhase; nudged: boolean };

/** POST /api/play: a tap in a mini game (SPEC §4.1). `stage` must be the nudge's current stage, else 409.
 *  play: my pick + my guess of theirs. write: my 3 statements (each ≤ 80 chars) and which is the lie.
 *  guess: which of the partner's statements is the lie. */
export type PlayRequest = { riffId: string; nudgeId: string } & (
  | { stage: "play"; pick: number; guess: number }
  | { stage: "write"; statements: string[]; lie: number }
  | { stage: "guess"; guess: number }
);
export type PlayResponse = { ok: true };

/** POST /api/match: join the Match me queue, then poll every 2 s. `code` is the new riff once paired; stop polling
 *  to leave the queue. `name` and `interests` are the caller's profile, as for create_riff. `settle`: Match me has
 *  waited ~3 s; with nobody real to pair with, pair me with a seed now. */
export type MatchRequest = { name: string; interests: string[]; mode?: QueueMode; settle?: boolean };
/** `invites`: live ones sent to me, oldest first (pop one at a time). `sent`: my live invites by person id; a
 *  passed one stays "passed" until it expires (60 s). Both empty in match mode. `partner`: who I got, once paired. */
export type MatchResponse = { code: string | null; invites: Invite[]; sent: Record<string, "pending" | "passed">; partner?: MatchPartner | null };
export type MatchPartner = { name: string; interests: string[] };

/** match: Match me (auto-paired). browse: search (SPEC §7 Discovery), only paired by an invite or a tap. Poll
 *  /api/match every 2 s in either; stop polling to leave the queue. */
export type QueueMode = "match" | "browse";

/** Someone findable in search: a real person in the queue (id = user id) or a seeded persona (id = "seed:<n>"). */
export type SearchPerson = { id: string; name: string; interests: string[]; mode: QueueMode; seed: boolean; school?: string; bio?: string } & Partial<Pick<PublicProfile, "from" | "prompts" | "favorites">>;
export type Invite = { id: number; from: SearchPerson };

/** Public profiles (SPEC §7 Profiles; lists and shape check in lib/profile.ts). */
export type ProfilePrompt = { prompt: string; answer: string }; // prompt: one of PROMPTS; answer ≤ 80 chars
export type Favorite = { kind: string; value: string }; // kind: one of FAVORITE_KINDS, each once
/** What other people (search, your chat partner) and Jev see. */
export type PublicProfile = { name: string; from: string; interests: string[]; prompts: ProfilePrompt[]; favorites: Favorite[] };
/** Mine: also the private fields, never sent to anyone else or to Jev. */
export type MyProfile = PublicProfile & { lastName: string; age: number };
/**
 * POST /api/profile. get: mine (null until first saved). partner: the other player in `riffId` (a bot playing a seed
 * gets the seed's). save: 400 on a bad shape; `errors` by field ("from", "prompts.1", "favorites.0") when a Jev check
 * fails, and nothing is saved; else the saved (trimmed) profile. Onboarding saves too.
 */
export type ProfileRequest = { action: "get" } | { action: "partner"; riffId: string } | { action: "save"; profile: MyProfile };
export type ProfileResponse = { profile: MyProfile | PublicProfile | null; errors?: Record<string, string> };

/** Onboarding hometown check (/api/place, Jev). */
export type PlaceRequest = { place: string };
export type PlaceResponse = { valid: boolean };
/** POST /api/search, while polling /api/match in browse mode. Empty query = ranked by fit to me, real people first.
 *  `noMatch`: nobody really fits the query (still ranked, show "No one like that is on right now"). */
export type SearchRequest = { query: string };
export type SearchResponse = { people: SearchPerson[]; noMatch: boolean };

/** POST /api/invite. send: `code` right away if they're in match mode or a seed (the frontend adds the "beat"),
 *  else null and the invite waits (watch `sent` and `code` in /api/match). answer: `code` if accepted. */
export type InviteRequest = { action: "send"; to: string } | { action: "answer"; id: number; accept: boolean };
export type InviteResponse = { code: string | null };

/** POST /api/coach: start a coach riff. With `riffId`: on the focus of the caller's coaching report for that chat
 *  (SPEC §7). Without: catch up on references they missed in past chats. 404 if there's nothing to coach on yet. */
export type CoachRequest = { name: string; interests: string[]; riffId?: string };
export type CoachResponse = { code: string };

/** POST /api/demo (dev): start a scripted demo chat (lib/engine/demo-scripts.ts), read the caller's latest demo and
 *  its post-chat summary (null until written, 10-40 s after it ends), or start a coach riff on that summary's misses.
 *  Demos never touch the caller's real chat history or hidden profile. */
export type DemoRequest = { action: "start"; script: string } | { action: "results" } | { action: "coach" };
export type DemoStartResponse = { code: string };
export type DemoResults = { code: string | null; summary: ChatHistorySummary | null };

/** POST /api/coaching: the caller's own coaching report for this chat (SPEC §7). `ready` false while it's still being
 *  written (10-40 s after the end): poll. Ready with a null report: none for this chat (too short, or the model failed). */
export type CoachingRequest = { riffId: string };
export type CoachingResponse = { ready: boolean; report: CoachingReport | null };

/** POST /api/end: end the riff now, or start a new match in it (chat is kept). */
export type EndRequest = { riffId: string; action: "end" | "restart" };
export type EndResponse = { phase: RiffPhase };

/** POST /api/image: generate one image (Muse Image, then Grok Imagine), falling back to the pre-generated pool. */
export type ImageRequest = { riffId: string; prompt: string; tags: string[] };
export type ImageResponse = { url: string; fromPool: boolean };

/** POST /api/transcribe: multipart form with `riffId` and `audio` (a file). */
export type TranscribeResponse = { transcript: string };

// Game content ----------------------------------------------------------------

/** A nudge template (SPEC §4.1). The AI picks one and rewrites it for the pair. */
export type Template = {
  id: string;
  kind: NudgeKind;
  tone: Tone;
  depth: Depth;
  seed: string;
  tags: string[];
  options?: string[]; // pick: the choices for a local fill
};

/** What the scorer returns for one nudge's answers (SPEC §6). Speed is computed in code. */
export type ScoreResult = Record<Seat, { quality: number; connection: number }> & {
  new_interests: Partial<Record<Seat, string[]>>;
};
