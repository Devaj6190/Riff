import { answerText, JUDGE_TIMEOUT_MS, type Judge } from "../judge";
import { llmJson } from "../llm";

/** Judges any text answer: open prompts, and mechanics without a bespoke judge (image reactions, voice transcripts). */
const judge: Judge = {
  judge: (ctx) =>
    llmJson(
      [
        "You are the judge in a two-player conversation game. Score each player's answer to this round's prompt.",
        "quality 0-10: specificity, effort, creativity. Opinions are never right or wrong; a bold, specific take beats a safe one.",
        "connection 0-5: engaging with the partner — referencing their interests or something they said in chat, a callback, a follow-up.",
        "Give each player a one-line witty reason (max ~15 words) that clearly explains the score. Be playful, never mean; a low score reads as friendly feedback.",
        "Also list up to 2 new interests per player revealed by their answer (short lowercase nouns), or none.",
        'JSON shape: {"A": {"quality": n, "connection": n, "reason": s}, "B": {...}, "new_interests": {"A": [s], "B": [s]}}',
        "If a player didn't answer, give them 0 and reason \"No answer this time.\"",
      ].join(" "),
      JSON.stringify({
        prompt: "prompt" in ctx.round.payload ? ctx.round.payload.prompt : null,
        mechanic: ctx.round.mechanic,
        players: ctx.players.map((p) => ({
          seat: p.seat,
          name: p.name,
          interests: [...p.interests, ...p.extracted_interests],
          answer: answerText(ctx.answers[p.seat]),
        })),
        recentChat: ctx.chat,
      }),
      JUDGE_TIMEOUT_MS,
    ),
};

export default judge;
