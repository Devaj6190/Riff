// When a nudge pops up (SPEC §4.5). Pure: /api/tick loads the chat's timing and asks shouldNudge().
// All numbers are placeholders to tune in playtesting.
export const PACING = {
  quietSeconds: 15, // a lull this long after someone spoke earns a nudge…
  cooldownSeconds: 30, // …but never sooner than this after the last one
  maxGapSeconds: 90, // busy or silent, a nudge at least this often
  firstMaxSeconds: 30, // the first one comes sooner: "hey" → "hey" → silence is the problem Riff solves
};

export type PaceState = {
  since: number; // ms: last nudge, or when the chat started if there hasn't been one
  first: boolean; // no nudge yet
  messagesSince: number;
  lastMessageAt: number | null; // ms
};

export function shouldNudge(s: PaceState, now: number): boolean {
  const gap = (now - s.since) / 1000;
  if (gap >= (s.first ? PACING.firstMaxSeconds : PACING.maxGapSeconds)) return true;
  if (!s.first && gap < PACING.cooldownSeconds) return false;
  return s.messagesSince > 0 && s.lastMessageAt !== null && (now - s.lastMessageAt) / 1000 >= PACING.quietSeconds;
}
