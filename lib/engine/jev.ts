// Jev, TypeSafe's System One model (https://docs.typesafe.ai/api.md): state + typed questions in, probabilities out,
// in one pass. Plain fetch, not @typesafe-ai/sdk: it's one POST.

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> } // up to 255 options
  | { type: "noul"; instructions: string };

export type JevAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "noul"; noul: number }; // 0-1

/** Ask Jev. Throws without TYPESAFE_API_KEY, on a non-2xx, or on timeout. */
export async function jev(state: unknown, questions: Record<string, JevQuestion>, timeoutMs: number): Promise<Record<string, JevAnswer>> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY not set");
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { answers: Record<string, JevAnswer> }).answers;
}
