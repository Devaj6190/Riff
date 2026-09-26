# Riff — Build Spec
*"For everything after hello."* HackGT 13 · solo build

## 1. One-liner & entries
**Riff is an AI-hosted conversation game for two people** that turns the stalled second message into rounds of generated prompts, images and mini-games — rewarding players for being curious about each other, and teaching them to keep a conversation going.

- **Track:** Oracle of the Deep (ML/AI + visualization)
- **Challenges:** Meta "Bringing People Closer Together with AI" (primary) · Create-X Startup Launch (opt in at submission)
- **Maybe:** SpaceXAI — Grok Imagine is already in MVP; also requires **building in Cursor from the first commit**. Domain-name prize (check HackGT challenge list).

## 2. User & problem
**Who:** students and young adults who *can* find people with shared interests but whose conversations die after "hey." Launch audience: Georgia Tech students.

**Problem:** ~50% of US adults report loneliness; in-person time with friends has dropped ~20 hours/month since 2003 ([Surgeon General advisory](https://www.hhs.gov/surgeongeneral/reports-and-publications/connection/index.html)). Existing apps solve *who* you meet (Series, Pie, Bumble BFF) or write *one* AI opener (Bumble, Icebreaker AI). Nobody helps with messages 2 through 50.

**Research the design uses:**
- Asking follow-up questions increases liking (Huang et al., 2017) → the connection bonus.
- Closeness builds when questions escalate gradually (Aron et al., 1997) → the depth ladder.
- People wrongly expect deep talk with strangers to be awkward (Kardas et al., 2022) → deep prompts are included.

## 3. Core flow

**MVP**
1. **Create a riff** → share link or 4-letter code.
2. **Join:** display name + tap 3 interest chips (or type your own).
3. **Rounds, back to back:** a round card drops in with a timer; both answer; the AI scores each answer with a one-line witty reason; points animate in.
4. **Talk window:** after each round, free chat opens to react ("how dare you say that lol"); it extends while both are talking, up to a cap.
5. **Bonus Round:** when one player falls behind, Riff gives them a round on their own turf with double points.
6. **End:** first to the target score (100) finishes; end screen shows both scores, one superlative each, **Play again** / **Keep chatting**. Either player can end the game anytime or suggest ending.

**Phase 2** (spec'd now, built later): discovery search → Riff game → **Moment Card** (shared) + **private feedback** (8 sections) → **recommendations** for who to talk to next → rematch.

## 4. Game design

### 4.1 Mechanics (UI code) vs templates (data)
Each mechanic is written as UI once. Templates are JSON entries, so there can be any number of them. The AI picks a template and rewrites it for the pair.

| Mechanic | What happens | Scoring |
|---|---|---|
| **Open prompt** | Text answer; tone fun / deep / get-to-know. Improv templates ("finish the scene") use this mechanic. | AI judge |
| **Two truths and a lie** | Each writes 3 statements; partner guesses the lie. | Rules: +10 for fooling, +10 for guessing right |
| **AI image round** | Grok Imagine generates a scene from both players' interests ("your dream trip"); players react or answer. | AI judge |
| **Pick** | 4 options — generated images ("where would you sleep the hardest?") or text (this-or-that); both pick. | Rules: match = +8 each; AI comments |
| **Voice note** | Record a short answer → transcribed. | AI judge on transcript |
| **Meme audio** | CC0/royalty-free clip plays; players name it or react. | Rules for recognition + AI for the reaction |

*Stretch mechanic:* **Guess my answer** — B predicts A's answer before A replies (rewards listening).

**Template shape:** `{ id, mechanic, tone: fun|deep|know, depth: 1–3, seed, tags[] }`. Aim for 50+. The AI may remix any template freely, within content guardrails.

### 4.2 Depth ladder
- **Depth 1** (light): rounds 1–3.
- **Depth 2** (opinions, stories): from round 4, or earlier if talk windows are lively.
- **Depth 3** (deep/vulnerable): only after round 6 **and** once both players have earned connection points. Never an opener.

### 4.3 Scoring (per player, per round)
- **Speed:** 0–5, computed in code, linear over the timer.
- **Quality:** 0–10, AI — specificity, effort, creativity. Opinions are never "right" or "wrong."
- **Connection bonus:** 0–5, AI — follow-ups, callbacks to earlier messages, responding to the partner. Scored on round answers **and** talk-window messages.
- The judge also returns a **one-line witty reason** per player.
- ~20 max per round → 100 takes ~7–9 rounds.

### 4.4 Bonus Round (catch-up)
- **Trigger:** score gap ≥ **15 + random 0–5**; cooldown of 2 rounds after each Bonus Round.
- **Content:** built from the trailing player's interests (chips + things they've said in chat).
- **Label:** "🎁 Bonus Round — Sam's turf." Trailing player earns **2× points** that round.
- **The leader is never called out.** The connection bonus quietly rewards them for asking follow-ups.

### 4.5 Talk window
- Opens for **min 20 s** after each round result.
- **+8 s** per message while both players have posted within the last 10 s.
- **Max 90 s**, then "Next round in 5…".
- All numbers are placeholders to tune in playtesting.

### 4.6 Timers & ending
- **Timers:** text 30 s · two truths 45 s · pick 20 s · voice 45 s · audio 20 s. No answer = 0 for that round.
- **End:** first to target score (100; configurable; **Expo mode = 50**). **Hidden cap:** after round 12, highest score wins.
- **End / suggest end:** "End game" ends immediately; "Suggest ending" asks the partner, who can accept or decline.

### 4.7 Safety (MVP)
- **AI output:** your guardrails — no violence, no NSFW.
- **Player messages:** profanity masking (`f***`).
- **Leave & report button** (recommended; cut if you disagree): ends the game and logs the riff.

### 4.8 Mobile / web feel
- Tap targets ≥ 44 px with spacing.
- Input bar stays above the keyboard (`dvh` units / `visualViewport` API).
- No hover-only controls.
- Score-pop animations + haptics (`navigator.vibrate` on Android); match burst for Pick rounds; special entrance for the Bonus Round.

## 5. Why AI is essential
**Without AI, Riff is a card deck:** generic prompts, no way to score opinions, no catch-up.

The AI:
1. **Writes each round** from the live chat, both players' interests and the current depth level.
2. **Judges open-ended answers** for quality and connection — no rule-based system can score "Sharknado 3, unironically."
3. **Builds the Bonus Round** from what the trailing player actually said.
4. **Generates the images** for image and pick rounds.

**What's learned, honestly:** in the MVP, interests are extracted in-context from the conversation during play — not a trained model. The **Phase 2 bandit** (§7) adds real per-pair learning.

## 6. Architecture

**Stack:** Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Realtime, anonymous auth, Storage for voice notes) · Vercel + custom domain.

**Models & APIs**
| Job | Primary | Fallback |
|---|---|---|
| Round writing, talk-window scoring, superlatives | **Muse Spark 1.3** via OpenAI SDK → Meta Model API (~5–8 s; hidden by prefetch/background) | Grok, automatically on error |
| Judging (players wait on it) | **Grok** (~1 s, fits the 6 s result screen) | Muse Spark, automatically on error |
| Images | **Muse Image** (`muse-image-1.0`, $0.01/image, ~12–19 s; generated 2 rounds ahead) | Grok Imagine (~25 s), then the pre-generated tagged pool |
| Speech-to-text | Grok STT if available, else a Whisper-class model | "Type instead" button |
| Meme audio | `/public/clips` + `clips.json` (file, tags, answer, **license, source URL**) | Skip mechanic |
| Round generation when slow | — | Fill a template locally without AI |

**Data:** `riffs`, `players` (name, interests[], extracted_interests[]), `messages`, `rounds` (mechanic, payload, depth, is_bonus, ends_at), `answers`, `scores`.

**Game state:** `lobby → round_active → round_result → talk_window → countdown → round_active … → ended`
- Deadlines live in the DB (`ends_at`); each client renders its countdown from that value.
- On expiry, **whichever client notices first calls `/api/advance`**, which uses a conditional update so duplicate calls are no-ops. No client has to host the game clock.

**Routes:**
- `/api/round` — write rounds **ahead of time** into a hidden queue (`queued_rounds`): text rounds 1 ahead, image rounds 2 ahead, each written from both players' profiles + the chat so far. Advancing promotes the next queued round, so rounds start instantly; an empty queue falls back to a local template fill. The Bonus Round is written when it triggers (during result + talk window) and jumps the queue.
- `/api/judge` — score the round's answers.
- `/api/talk` — score talk-window messages for connection; runs when the window closes, non-blocking.
- `/api/image`, `/api/transcribe`, `/api/advance`.

**Known limit:** a round written ahead can't reference chat from after it was written (up to ~2 rounds for image rounds). Later fix: rewrite the head of the queue at window close if there's time.

**Judge output (JSON):**
```json
{ "A": {"quality": 8, "connection": 3, "reason": "committing to Sharknado 3 is brave"},
  "B": {"quality": 4, "connection": 0, "reason": "safe pick. why Inception?"},
  "new_interests": {"B": ["minecraft"]} }
```

`.env.example`: `META_API_KEY`, `META_BASE_URL`, `LLM_MODEL`, `XAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Scope phases (features only; no schedule)

**MVP, in priority order:**
1. Riff + join (interest chips)
2. Real-time chat
3. Open prompt round + AI judge
4. Talk window
5. Scoring + end screen
6. Bonus Round
7. Two truths and a lie
8. Pick
9. AI image round
10. Voice note
11. Meme audio
12. Profanity masking + leave & report

If time runs short, cut from the bottom of this list.

**Phase 2:**
- **Discovery:** interest / school / radius filters; no-photo profiles; seeded users for the demo.
- **Moment Creation Engine:** top 2–3 moments quoted, rated top moment, inside joke born, superlatives, next-step hook (rematch or an in-person plan), shared moments history.
- **Private feedback, 8 sections:** where you fell short · what was good · how many times you gave a better response · how quick you were · what to improve · did you get stuck on jokes · your improv · were you being real. Quotes your messages; the sections come from one editable list.
- **Recommendations:** who to talk to next, based on who you connected well with.
- **Bandit:** Thompson sampling over round types per pair; reward = talk-window length + connection points. The game learns what makes each pair click.
- **Partner double-tap reactions.**
- **Jev** for fast per-message scoring, if its API proves reliable.

**Later:** in-person voice mode — Riff hosts two people at a table.

## 8. Demo

**Video (~2:30), story order:**
1. **0:00–0:20 Hook:** "Everyone solves the first message. Nobody solves the second." Dead chat: "hey" → "hey" → silence.
2. **0:20–0:35 Find:** discovery if built; otherwise sending a riff link.
3. **0:35–1:55 Play:** two windows side by side. Open prompt → image pick match burst → talk-window argument earning connection points → **Bonus Round rescue**: Sam falls behind, Riff builds a round from something Sam said earlier, Sam catches up, Alex's follow-up earns a connection bonus.
4. **1:55–2:15 After:** end screen; feedback and recommendations **only if they're real.**
5. **2:15–2:30 Why AI + vision:** "AI isn't your friend here — it's the referee between two humans."

**Expo, live:** hand two phones to two judges, Expo mode (first to 50), let them play. Keep a backup recording.

**The one moment to remember:** the Bonus Round quoting the trailing player's own words back to them.

## 9. Risks & open questions
- **Muse Spark:** latency and JSON-schema support. It's a reasoning model and may be slow. Test first; fallback is an env-var swap.
- **Grok Imagine:** image latency isn't published. Generate ahead; keep the pool fallback.
- **Meta API credit ($20):** enough for development? Watch usage.
- **HackGT rules:** are pre-made assets (clips, templates, image pool) allowed before hacking starts?
- **Domain prize:** which challenge offers it? Ask at the opening ceremony.
- **SpaceXAI:** confirm the "built with Cursor" requirement fits your workflow.
- **CastChat:** closest existing app (matches strangers into voice chat with mini-games). Know how Riff differs.
- **AI scoring fairness:** the judge's reason must always explain the score, so a low score reads as feedback, not an insult.

## 10. Vision (Create-X / write-up)
Riff becomes **the layer for everything after hello**:
1. A standalone app for students, starting at Georgia Tech, with discovery, feedback and the Moment Card.
2. **Riff for platforms:** friend and dating apps (Bumble BFF, Timeleft, Hinge) embed Riff games in their chats — each loses users when conversations die.
3. Data advantage: per-pair learning of what makes people click, which platforms bolting on games won't have.

**North-star metric:** % of pairs who rematch or meet in person — *not* time spent in the app.

## 11. Submission checklist
- [ ] Public GitHub repo: README, `.env.example` (no secrets), `clips.json` with licenses
- [ ] Demo video, 2–3 min (YouTube, unlisted)
- [ ] Write-up: who it's for, how it strengthens connection (cite Huang, Aron, Surgeon General), why AI is essential (§5)
- [ ] Devpost: track **Oracle of the Deep**; challenges **Meta**, **Create-X** (opt in); **SpaceXAI** if eligible; domain prize if one exists
- [ ] Devpost tags: `nextjs` `supabase` `typescript` `tailwind` `muse-spark` `meta-model-api` `grok-imagine` `llm`
- [ ] Live URL on the custom domain
