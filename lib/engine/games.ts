// Mini games (SPEC §4.1, §4.3), server side. A mini game is a nudge with stages: Guess their pick (play → reveal),
// Two truths and a lie (write → guess → reveal). Taps (/api/play) land in the server-only nudge_plays table and reach
// the nudge's payload only at the reveal. A stage ends once everyone who plays it has locked in (submitPlay), or when
// its timer runs out (/api/tick calls advanceGame). After the reveal, /api/tick scores it by rules (scoreGame).
import { isGame, other, pickPoints, playsStage, STATEMENT_MAX, truthsPoints, type GameNudge, type GamePayload } from "../games";
import { supabaseAdmin } from "../supabase/admin";
import type { Nudge, PickPlay, Player, PlayRequest, Seat, TruthsPlay } from "../types";
import { GAME_SECONDS, timerSeconds } from "./pacing";
import { speedPoints } from "./score";

type Play = PickPlay | TruthsPlay;
type Played = { play: Play; created_at: string };

async function loadPlays(riffId: string, nudgeId: string): Promise<Partial<Record<Seat, Played>>> {
  const db = supabaseAdmin();
  const [{ data: rows }, { data: players }] = await Promise.all([
    db.from("nudge_plays").select("player_id, play, created_at").eq("nudge_id", nudgeId),
    db.from("players").select("id, seat").eq("riff_id", riffId),
  ]);
  const seat = new Map((players ?? []).map((p) => [p.id, p.seat as Seat]));
  return Object.fromEntries((rows ?? []).filter((r) => seat.has(r.player_id)).map((r) => [seat.get(r.player_id)!, { play: r.play, created_at: r.created_at }]));
}

const bad = (msg: string, status = 400) => new Response(msg, { status });

/** Check a tap against the nudge's current stage; the play to store (merged with this player's earlier one). */
export function nextPlay(p: GamePayload, seat: Seat, req: PlayRequest, prev: Play | undefined): Play {
  if (req.stage !== p.stage) throw bad("That part of the game is over", 409);
  if (p.locked.includes(seat)) throw bad("Already locked in", 409);
  const index = (v: unknown, n: number) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n;
  if (req.stage === "play" && "options" in p) {
    if (!index(req.pick, p.options.length) || !index(req.guess, p.options.length)) throw bad("Pick one of the options");
    return { pick: req.pick, guess: req.guess };
  }
  if (req.stage === "write") {
    const statements = Array.isArray(req.statements) ? req.statements.map((s) => (typeof s === "string" ? s.trim() : "")) : [];
    if (statements.length !== 3 || statements.some((s) => !s || s.length > STATEMENT_MAX)) throw bad(`Write 3 statements, up to ${STATEMENT_MAX} characters each`);
    if (!index(req.lie, 3)) throw bad("Mark which one is the lie");
    return { ...prev, statements, lie: req.lie };
  }
  if (req.stage === "guess" && "statements" in p) {
    if (!p.statements?.[other(seat)]?.length) throw bad("Nothing to guess: they didn't write any", 409);
    if (!index(req.guess, 3)) throw bad("Pick one of their statements");
    return { ...prev, guess: req.guess };
  }
  throw bad("Wrong kind of play for this game");
}

/** A tap in a mini game (/api/play). Locks the player in for this stage; ends the stage once everyone has. */
export async function submitPlay(riffId: string, player: Pick<Player, "id" | "seat">, req: PlayRequest): Promise<void> {
  const db = supabaseAdmin();
  const { data: nudge } = await db.from("nudges").select("*").eq("id", req.nudgeId).eq("riff_id", riffId).maybeSingle<Nudge>();
  if (!nudge || !isGame(nudge) || nudge.scored_at) throw bad("No game running", 404);
  if (Date.now() > Date.parse(nudge.ends_at) + 1500) throw bad("Time's up", 409); // grace for the round trip
  const { data: row } = await db.from("nudge_plays").select("play").eq("nudge_id", nudge.id).eq("player_id", player.id).maybeSingle();
  const play = nextPlay(nudge.payload, player.seat, req, row?.play as Play | undefined);
  const saved = await db
    .from("nudge_plays")
    .upsert({ nudge_id: nudge.id, player_id: player.id, riff_id: riffId, play, updated_at: new Date().toISOString() }, { onConflict: "nudge_id,player_id" });
  if (saved.error) throw saved.error;

  const { data: seats } = await db.from("players").select("seat").eq("riff_id", riffId);
  const locked = [...new Set([...nudge.payload.locked, player.seat])];
  // ponytail: two taps landing together can each write a `locked` without the other's; the stage still ends, since
  // the one that sees both plays advances it, and the CAS on stage drops the stale write.
  const { data: updated } = await db
    .from("nudges")
    .update({ payload: { ...nudge.payload, locked } })
    .eq("id", nudge.id)
    .eq("payload->>stage", nudge.payload.stage)
    .is("scored_at", null)
    .select("*")
    .maybeSingle<Nudge>();
  if (!updated || !isGame(updated)) return;
  const plays = await loadPlays(riffId, nudge.id);
  const due = playsStage(updated.payload, (seats ?? []).map((s) => s.seat as Seat));
  if (due.every((s) => stagePlayed(updated.payload, plays[s]?.play))) await advanceGame(updated);
}

/** Has this play done the stage `p` is in? */
function stagePlayed(p: GamePayload, play: Play | undefined): boolean {
  if (!play) return false;
  if (p.stage === "play") return "pick" in play;
  if (p.stage === "write") return "statements" in play && !!play.statements;
  return "guess" in play && play.guess !== undefined;
}

/**
 * Move a mini game to its next stage: truths write → guess (both sets of statements, no lies), else → reveal (all
 * plays). Nobody played at all: straight to a reveal that ends now, so it's scored (no rows) and the chat moves on.
 * Compare-and-set on the stage, so racing ticks and taps advance it once.
 */
export async function advanceGame(nudge: GameNudge): Promise<void> {
  const plays = await loadPlays(nudge.riff_id, nudge.id);
  const p = nudge.payload;
  const now = new Date();
  const played = Object.keys(plays).length > 0;
  let payload: GamePayload;
  let seconds: number;
  if (nudge.kind === "truths" && p.stage === "write") {
    const statements = Object.fromEntries(
      Object.entries(plays).flatMap(([seat, x]) => ("statements" in x.play && x.play.statements ? [[seat, x.play.statements]] : [])),
    );
    const wrote = Object.keys(statements).length > 0;
    payload = { ...nudge.payload, stage: wrote ? "guess" : "reveal", stageAt: now.toISOString(), locked: [], statements, reveal: wrote ? undefined : {} };
    seconds = wrote ? GAME_SECONDS.guess : 0;
  } else {
    const reveal = Object.fromEntries(Object.entries(plays).map(([seat, x]) => [seat, x.play]));
    payload = { ...p, stage: "reveal", stageAt: now.toISOString(), reveal } as GamePayload;
    seconds = played ? GAME_SECONDS.reveal : 0;
  }
  const { error } = await supabaseAdmin()
    .from("nudges")
    .update({ payload, ends_at: new Date(now.getTime() + seconds * 1000).toISOString() })
    .eq("id", nudge.id)
    .eq("payload->>stage", p.stage)
    .is("scored_at", null);
  if (error) throw error;
}

/** Score a revealed mini game by its rules (SPEC §4.3). Speed runs from the pop-up over the first stage's timer. */
export async function scoreGame(riffId: string, nudge: GameNudge): Promise<void> {
  const played = await loadPlays(riffId, nudge.id);
  const plays = Object.fromEntries(Object.entries(played).map(([seat, x]) => [seat, x.play]));
  const points = nudge.kind === "pick" ? pickPoints(plays as Partial<Record<Seat, PickPlay>>) : truthsPoints(plays as Partial<Record<Seat, TruthsPlay>>);
  const db = supabaseAdmin();
  const { data: players } = await db.from("players").select("id, seat").eq("riff_id", riffId);
  const firstEnd = new Date(Date.parse(nudge.created_at) + timerSeconds(nudge.kind, nudge.number) * 1000).toISOString();
  const rows = (players ?? []).flatMap((p) => {
    const got = points[p.seat as Seat];
    const at = played[p.seat as Seat]?.created_at;
    if (!got || !at) return [];
    return [{ riff_id: riffId, nudge_id: nudge.id, player_id: p.id, speed: speedPoints(nudge.created_at, at, firstEnd), ...got }];
  });
  if (!rows.length) return;
  const { error } = await db.from("scores").upsert(rows, { onConflict: "nudge_id,player_id", ignoreDuplicates: true });
  if (error) throw error;
}
