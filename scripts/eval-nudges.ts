// Compare prompt changes on real output (SPEC §4.1): for a few fixed sample chats, print the kind Jev picks, then
// every draft the text, Guess-their-pick and Two-truths writers make and the one Jev keeps. No DB; needs the model
// keys (TYPESAFE_API_KEY, XAI_API_KEY and/or META_*). Images are skipped (slow, and they cost per image).
//   node --env-file=.env.local node_modules/jiti/lib/jiti-cli.mjs scripts/eval-nudges.ts
import { allowedKinds, bestDraft, chooseKind, depthFor, pickTemplates, type NudgeContext } from "../lib/engine/nudges";
import { EMPTY_CONTEXT } from "../lib/engine/reader";
import templates from "../lib/engine/templates.json";
import { draftPick } from "../lib/engine/writers/pick";
import { draftText } from "../lib/engine/writers/text";
import { draftTruths } from "../lib/engine/writers/truths";
import type { ChatContext, Player, Template } from "../lib/types";

const player = (seat: "A" | "B", name: string, interests: string[]) =>
  ({ id: seat, riff_id: "eval", user_id: seat, seat, name, interests, extracted_interests: [], joined_at: "" }) as Player;
const sam = player("A", "Sam", ["climbing", "anime", "coffee"]);
const alex = player("B", "Alex", ["film", "cooking", "travel"]);

type Sample = { name: string; number: number; chat: string[]; known?: ChatContext; earlier?: string[] };
const SAMPLES: Sample[] = [
  {
    name: "second intro, just said hi",
    number: 2,
    chat: ["Sam: heyy im sam, from atlanta", "Alex: hi! alex, savannah originally but atl now", "Sam: ooh savannah is so pretty", "Alex: it's very hot and very haunted lol"],
    earlier: ["Say hi! Tell each other your name and where you're from."],
  },
  {
    name: "deep in a movie argument",
    number: 6,
    chat: [
      "Alex: ok dune 2 was the best movie of the decade and i will not be taking questions",
      "Sam: the decade?? it's been like 5 years",
      "Alex: and nothing has touched it",
      "Sam: spider-verse would like a word",
      "Alex: animated is a different category",
      "Sam: that's such a cop out lmao",
      "Alex: the sandworm scene tho. i saw it in imax twice",
    ],
    known: {
      notes: { A: ["from Atlanta", "thinks Spider-Verse beats Dune 2"], B: ["from Savannah", "saw Dune 2 in IMAX twice", "thinks Dune 2 is the best movie of the decade"] },
      thread: { topic: "Dune 2 vs Spider-Verse", open: ["is animation its own category?"], callbacks: ["the decade"] },
    },
    earlier: ["Say hi! Tell each other your name and where you're from.", "What's a small W you had this week?", "Rank these, no ties: film, sleep, food, your group chat."],
  },
  {
    name: "stalling, one-word replies",
    number: 5,
    chat: ["Sam: lol", "Alex: yeah", "Sam: so", "Alex: ya", "Sam: haha"],
    earlier: ["Say hi! Tell each other your name and where you're from.", "What's been living rent-free in your head lately?", "Best life hack nobody asked for. Go."],
  },
];

for (const s of SAMPLES) {
  const depth = depthFor(s.number, true);
  const known = s.known ?? EMPTY_CONTEXT;
  const recent = s.earlier?.map(() => "text" as const).reverse() ?? [];
  const allowed = allowedKinds(["text", "image", "pick", "truths"], recent, s.number);
  const kind = await chooseKind(allowed, { recentNudges: s.earlier?.slice(-4).reverse().map((prompt) => ({ kind: "text", prompt })), thread: known.thread, recentChat: s.chat }, "eval", s.number);
  console.log(`\n=== ${s.name} (nudge ${s.number}, depth ${depth}) ===\nkind: allowed ${allowed.join("/")} → Jev picks ${kind}`);

  const ctx = (k: Template["kind"]): NudgeContext => ({
    number: s.number,
    depth,
    players: [sam, alex],
    chat: s.chat,
    known,
    earlier: (s.earlier ?? []).map((prompt) => ({ prompt, quality: {} })),
    past: {},
    shown: { A: { from: "Atlanta, GA", prompts: [{ prompt: "I'm weirdly good at…", answer: "parallel parking" }], favorites: [] }, B: { from: "Savannah, GA", prompts: [], favorites: [{ kind: "movie", value: "Dune: Part Two" }] } },
    templates: pickTemplates(templates as Template[], "eval", s.number, depth, k),
    turf: null,
  });

  const text = ctx("text");
  const drafts = await draftText(text);
  const best = await bestDraft(text, drafts.map((d) => d.prompt));
  drafts.forEach((d, i) => console.log(`${i === best ? "→" : " "} text: ${d.prompt}\n      hook: ${d.hook}`));
  if (s.number <= 2) continue; // intros are text only

  const pick = ctx("pick");
  const picks = await draftPick(pick);
  const bestPick = await bestDraft(pick, picks.map((d) => `${d.prompt} ${d.options.join(" / ")}`));
  picks.forEach((d, i) => console.log(`${i === bestPick ? "→" : " "} pick: ${d.prompt} [${d.options.join(" / ")}]`));

  const truths = ctx("truths");
  const titles = await draftTruths(truths);
  const bestTitle = await bestDraft(truths, titles);
  titles.forEach((t, i) => console.log(`${i === bestTitle ? "→" : " "} truths: ${t}`));
}
