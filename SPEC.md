# Riff — Build Spec
*"For everything after hello."* HackGT 13 · solo build

## 1. One-liner & entries
**Riff is an AI-hosted conversation game for two people** that turns the stalled second message into a normal chat where the AI drops in prompts, images and audio whenever it stalls — rewarding players for being curious about each other, and teaching them to keep a conversation going.

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
1. **Create a riff** → share link or 4-letter code. In the UI a riff is a **chat**.
2. **Join:** display name + tap 3 interest chips (or type your own). The chat starts when the second player joins.
3. **Chat like any messaging app** (think Instagram DMs): either person sends anytime. No rounds, no timers, no result screens.
4. **Nudges:** the AI pops a **nudge** into the top of the screen with a **countdown**: a text prompt, an image or an audio clip, written for this pair from what they're talking about. Players answer by just texting before the timer runs out.
5. **Points:** when a nudge's timer runs out, each player's answer is scored (speed + quality + connection) and the points pop in. Ordinary chat earns no points.
6. **Bonus mode:** when one player falls behind, the conversation shifts toward their interests: the next nudges are about things they know, so they can answer better.
7. **End:** first to the target score (100; **Expo mode = 50**), or either player taps End. End screen shows superlatives; they can **keep chatting** (nudges stop) or start a **new match** in the same chat.

**Phase 2** (spec'd now, built later): discovery search → Riff chat → **Moment Card** (shared) + **private feedback** (8 sections) → **recommendations** for who to talk to next → rematch.

## 4. Game design

### 4.1 Nudge kinds (UI code) vs templates (data)
Each nudge kind is written as UI once. Templates are JSON entries, so there can be any number of them. The AI picks a template and rewrites it for the pair.

| Kind | What pops up |
|---|---|
| **Text** | A prompt: fun / deep / get-to-know. Improv ("finish the scene") too. |
| **Image** | Muse Image generates a scene from both players' interests or the chat, with a prompt about it ("you have one hour here, what first?"). |
| **Audio** | A CC0/royalty-free meme clip plays with a prompt ("name it, or react"). Enabled once the clips library exists. |

Voice notes are ordinary chat messages: record → transcribe → send.

**Template shape:** `{ id, kind, tone: fun|deep|know, depth: 1–3, seed, tags[] }`. Aim for 50+. The AI may remix any template freely, within content guardrails.

### 4.2 Intro, then a depth arc
- **Intro (nudges 1–2):** nudge 1 pops up the moment the chat starts: say hi, your name, where you're from. Nudge 2 is another easy intro ("what are you into lately?").
- **Then an arc, not a ladder:** light → light → opinions → light → opinions → deep → light → opinions → deep, repeating. It climbs toward a deeper connection and drops back to fun in between, e.g. "favorite movie?" … "favorite childhood memory?".
- **Deep (3)** only once both players have earned connection points; until then it stays at opinions. Never an opener.
- The writer reads the live chat: if it's stalling, the nudge is easy and fun to answer.

### 4.3 Scoring (per player, per nudge)
Points come **only from answering nudges**. A player's answer is what they text while the nudge's timer runs. It's scored once, when the timer runs out:
- **Speed:** 0–5, computed in code, linear from the pop-up to the buzzer (first message counts).
- **Quality:** 0–10, AI: specificity, effort, creativity, being real. Opinions are never "right" or "wrong."
- **Connection:** 0–5, AI: tying the answer to the partner or earlier messages: callbacks, follow-ups, responding to the partner.
- ~20 max per nudge → 100 takes ~7–9 nudges. No answer = no points.

### 4.4 Bonus mode (catch-up)
- **Trigger:** one player trails by **25+** points.
- **What happens:** the conversation shifts toward the trailing player. Nudges are written around their interests and things they've said. Example: Sam likes gaming, Alex likes movies, Alex is winning → the nudges turn game-heavy, so Sam can answer better and is encouraged to.
- **Lasts 2 or 3 nudges**, whatever the scores do meanwhile. Then at least one normal nudge before it can switch on again.
- Both players still answer every nudge, and scoring is unchanged.
- **Nobody is called out.** Nudges never mention scores or who the topic is for.

### 4.5 Pacing (follow the flow)
- **Intro nudge** right away when the chat starts.
- **No new nudge while a timer runs.**
- **Closes when answered:** once each player has said something and nobody is typing, Grok judges live whether both answered the nudge. If they did, the countdown drops to 2 s and the nudge closes smoothly.
- **Then a short buffer:** after the timer, the next nudge pops once there's 5 s with no message and nobody typing. It never waits more than 15 s after the timer, however lively the chat.
- **Nobody answered:** the next nudge pops the moment the timer runs out.
- **Typing** is shared between the clients over a Realtime broadcast, and each tick reports it.
- All numbers are placeholders to tune in playtesting (`lib/engine/pacing.ts`).

### 4.6 Timers & ending
- **Timers:** text 30 s · image 30 s · audio 20 s · intro nudges 45 s, or 2 s after both answered (§4.5). Speed points still run over the full timer. The client renders the countdown from `nudges.ends_at`.
- **End:** first to the target score (100; configurable; **Expo mode = 50**), checked when a nudge is scored. Or either player taps **End**.
- After the end the chat stays open: **keep chatting** (no more nudges) or **new match** (nudges and scores reset, chat kept).

### 4.7 Safety (MVP)
- **AI output:** your guardrails — no violence, no NSFW.
- **Player messages:** profanity masking (`f***`).
- **Leave & report button** (recommended; cut if you disagree): ends the game and logs the riff.

### 4.8 Mobile / web feel
- Tap targets ≥ 44 px with spacing.
- Input bar stays above the keyboard (`dvh` units / `visualViewport` API).
- No hover-only controls.
- Nudge pop-in animation + haptics (`navigator.vibrate` on Android). Bonus mode has no special look: nobody is called out.

## 5. Why AI is essential
**Without AI, Riff is a card deck:** generic prompts, no way to score opinions, no catch-up.

The AI:
1. **Writes each nudge** from the live chat, both players' interests and the current depth level.
2. **Scores the conversation** for quality and connection — no rule-based system can score "Sharknado 3, unironically."
3. **Shifts the conversation in bonus mode** toward the trailing player's interests and what they've said.
4. **Generates the images** for image nudges.

**What's learned, honestly:** in the MVP, interests are extracted in-context from the conversation during the chat — not a trained model. The **Phase 2 bandit** (§7) adds real per-pair learning.

## 6. Architecture

**Stack:** Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Realtime, anonymous auth, Storage for voice notes) · Vercel + custom domain.

**Models & APIs**
| Job | Primary | Fallback |
|---|---|---|
| Nudge writing, superlatives | **Muse Spark 1.3** via OpenAI SDK → Meta Model API (~5–8 s; hidden by writing ahead) | Grok, automatically on error |
| Scoring answers (time-boxed) | **Grok** (~1 s) | Muse Spark, automatically on error |
| Images | **Muse Image** (`muse-image-1.0`, $0.01/image, ~12–19 s; written 2 nudges ahead) | Grok Imagine (~25 s), then the pre-generated tagged pool |
| Speech-to-text (voice messages) | Grok STT | Type instead |
| Meme audio | `/public/clips` + `clips.json` (file, tags, answer, **license, source URL**) | Skip the kind |
| Nudge writing when slow | — | Fill a template locally without AI |

**Data:** `riffs` (phase `lobby → chatting → ended`), `players` (name, interests[], extracted_interests[]), `messages`, `nudges` (number, kind, payload, depth, is_bonus, for_seat, ends_at, scored_at), `queued_nudges` (server-only), `scores` (speed, quality, connection per nudge per player).

**Nudge clock:** there's no server clock. While chatting, **both clients call `/api/tick` every second** (with whether anyone's typing); it closes the timer early once both answered, scores the last nudge once its timer has run out (compare-and-set on `scored_at`), and asks `shouldNudge()` (§4.5) whether to show the next one (`unique (riff_id, number)` on `nudges`). Concurrent ticks are no-ops.

**Routes:**
- `/api/tick` — when a timer runs out, in the background: score the answers, end the game if someone reached the target, and rewrite the next queued nudge if bonus mode switched on, off or to the other player. When the next nudge is due: promote it from `queued_nudges` (text 1 ahead, image 2 ahead) or fill a template locally, so it never waits on a model, stamp its timer, and write the next ones ahead.
- `/api/end` — end now, or start a new match (chat kept).
- `/api/image`, `/api/transcribe`.

**Known limit:** a nudge written ahead can't reference chat from after it was written (up to 2 nudges for images).

**Scorer output (JSON):**
```json
{ "A": {"quality": 8, "connection": 3},
  "B": {"quality": 4, "connection": 0},
  "new_interests": {"B": ["minecraft"]} }
```

`.env.example`: `META_API_KEY`, `META_BASE_URL`, `LLM_MODEL`, `XAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Scope phases (features only; no schedule)

**MVP, in priority order:**
1. Riff + join (interest chips)
2. Real-time chat (Instagram-DM feel)
3. Intro nudges, text nudges + flow-aware pacing
4. Nudge timers + answer scoring + points pop + ending + end screen (keep chatting / new match)
5. Bonus mode
6. Image nudges
7. Voice messages
8. Audio nudges (meme clips)
9. Profanity masking + leave & report

If time runs short, cut from the bottom of this list.

**Phase 2:**
- **Discovery (search the live queue, ranked by Jev):**
  - **The queue:** starting a chat or Match me puts you in the queue in *match* mode, which auto-pairs you as today. Opening search puts you in it in *browse* mode: you're never auto-paired, only pulled into a chat by an invite. On Home you're in neither, so you get no invites.
  - **Who's findable:** everyone in the queue (both modes), plus 300 seeded personas (name, school, 3 interests, one-line bio) that are always in it, in browse mode.
  - **Ranking (Jev, TypeSafe's System One model):** with an empty box, the queue is ranked by fit to you (interests + hidden profile), real people above seeds. Plain-English queries ("someone to debate Marvel vs DC") re-rank it by vibe, not keywords ("elden ring" finds gamers). Jev scores every person with its own yes/no (one call), so the whole list is ranked, and when nobody's above 0.5 the screen says nobody really matches. Interest chips just fill in the query. If Jev fails, fall back to word overlap.
  - **Tap a person:** match mode → paired instantly, no invite. Browse mode → invite. A seed → the invite is auto-accepted after a beat, and the bot plays that persona.
  - **Invites:** send as many as you like. Each lasts 60 s or until either person leaves the queue. The first yes starts the chat and cancels the rest. Received invites pop one at a time mid-screen: swipe right to accept, left to pass (the sender sees "passed").
- **Profiles (public, user-edited; separate from the hidden `user_profiles` rollup):**
  - **Fields:** onboarding sets the basics (first name, last name, age, hometown, interests). Only in the profile popup, optionally: up to 3 **prompts** (pick from a fixed list, answer ≤ 80 chars) and up to 3 **favorites** (search and pick a category from a fixed list, then type the favorite; each category once).
  - **Prompts:** Currently obsessed with… · My hot take… · Ask me about… · Don't get me started on… · The way to win me over… · I'll never shut up about… · My most controversial opinion… · A random fact I love… · My comfort rewatch… · I'm weirdly good at… · Two truths and a lie… · Perfect weekend…
  - **Favorite categories:** game, movie, show, anime, artist, song, album, book, podcast, youtuber, sports team, athlete, food, restaurant, place.
  - **Public:** first name, hometown, interests, prompts, favorites. Shown to other people and used by Jev and nudges. **Private:** last name and age: stored, never sent to anyone else or to Jev.
  - **Profile popup (one centered component):** yours opens from Home (the profile card's Edit), laid out by section and editable in place, basics included (interests use the interest picker). Someone else's is read-only: from a search card (with Invite; tapping a card opens the popup instead of inviting) or from your chat partner's avatar.
  - **Checks on Save:** one Jev call, a yes/no per field: each prompt answer is appropriate, with no contact info or handles; each favorite is a real thing of its category; the hometown is a real place. A failed field shows an inline "try another" and blocks Save. If Jev is down, Save goes through.
  - **Used by:** search (a real person is described to Jev like a seed: name · hometown · interests · prompts · favorites; the card's second line is their first prompt), nudges (the writer sees both people's prompts and favorites), and the bot (when it plays a seed, it gets the seed's prompts and favorites).
  - **Seeds:** a one-off script writes 1–2 prompts and 2 favorites per seed from its interests and bio, committed with the personas.
- **Moment Creation Engine:** top 2–3 moments quoted, rated top moment, inside joke born, superlatives, next-step hook (rematch or an in-person plan), shared moments history.
- **Private feedback, 8 sections:** where you fell short · what was good · how many times you gave a better response · how quick you were · what to improve · did you get stuck on jokes · your improv · were you being real. Quotes your messages; the sections come from one editable list.
- **Recommendations:** who to talk to next, based on who you connected well with.
- **Bandit:** Thompson sampling over nudge kinds per pair; reward = messages after the nudge + connection points. The game learns what makes each pair click.
- **Partner double-tap reactions.**
- **Jev** for fast per-message scoring, if its API proves reliable.

**Later:** in-person voice mode — Riff hosts two people at a table.

## 8. Demo

**Video (~2:30), story order:**
1. **0:00–0:20 Hook:** "Everyone solves the first message. Nobody solves the second." Dead chat: "hey" → "hey" → silence.
2. **0:20–0:35 Find:** discovery if built; otherwise sending a riff link.
3. **0:35–1:55 Play:** two phones side by side, chatting normally. The chat stalls → a text nudge pops in → an image nudge sparks an argument → **Bonus mode rescue**: Sam (gaming) falls behind Alex (movies), the nudges turn to games, Sam catches up, Alex's follow-up earns connection points.
4. **1:55–2:15 After:** end screen; feedback and recommendations **only if they're real.**
5. **2:15–2:30 Why AI + vision:** "AI isn't your friend here — it's the referee between two humans."

**Expo, live:** hand two phones to two judges, Expo mode (first to 50), let them chat. Keep a backup recording.

**The one moment to remember:** the conversation quietly shifting onto the trailing player's turf, and them catching up.

## 9. Risks & open questions
- **Muse Spark:** latency and JSON-schema support. It's a reasoning model and may be slow. Test first; fallback is an env-var swap.
- **Grok Imagine:** image latency isn't published. Generate ahead; keep the pool fallback.
- **Meta API credit ($20):** enough for development? Watch usage.
- **HackGT rules:** are pre-made assets (clips, templates, image pool) allowed before hacking starts?
- **Domain prize:** which challenge offers it? Ask at the opening ceremony.
- **SpaceXAI:** confirm the "built with Cursor" requirement fits your workflow.
- **CastChat:** closest existing app (matches strangers into voice chat with mini-games). Know how Riff differs.
- **AI scoring fairness:** scores come without explanations, so they must feel consistent; playtest the scorer.

## 10. Vision (Create-X / write-up)
Riff becomes **the layer for everything after hello**:
1. A standalone app for students, starting at Georgia Tech, with discovery, feedback and the Moment Card.
2. **Riff for platforms:** friend and dating apps (Bumble BFF, Timeleft, Hinge) embed Riff nudges in their chats — each loses users when conversations die.
3. Data advantage: per-pair learning of what makes people click, which platforms bolting on games won't have.

**North-star metric:** % of pairs who rematch or meet in person — *not* time spent in the app.

## 11. Submission checklist
- [ ] Public GitHub repo: README, `.env.example` (no secrets), `clips.json` with licenses
- [ ] Demo video, 2–3 min (YouTube, unlisted)
- [ ] Write-up: who it's for, how it strengthens connection (cite Huang, Aron, Surgeon General), why AI is essential (§5)
- [ ] Devpost: track **Oracle of the Deep**; challenges **Meta**, **Create-X** (opt in); **SpaceXAI** if eligible; domain prize if one exists
- [ ] Devpost tags: `nextjs` `supabase` `typescript` `tailwind` `muse-spark` `meta-model-api` `grok-imagine` `llm`
- [ ] Live URL on the custom domain
