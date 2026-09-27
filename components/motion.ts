/** Shared motion bits. The hobby cloud's feel: things burst from a center and land with a springy overshoot. */
export const SPRING = "cubic-bezier(0.2, 0.9, 0.3, 1.1)";
export const BOUNCY = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** Reduced motion: skip JS-driven animations (the CSS ones are switched off in globals.css). */
export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A chat that just paired plays the "It's a match" moment once it opens (MatchMoment). Set before navigating to it.
const MATCHED_KEY = "riff-matched";

export function markMatched(code: string) {
  try {
    sessionStorage.setItem(MATCHED_KEY, code.toUpperCase());
  } catch {
    // private mode: no moment, the chat just opens
  }
}

export function wasMatched(code: string) {
  try {
    return sessionStorage.getItem(MATCHED_KEY) === code.toUpperCase();
  } catch {
    return false;
  }
}

export function clearMatched() {
  try {
    sessionStorage.removeItem(MATCHED_KEY);
  } catch {
    // nothing kept
  }
}

/** A copy of `el` that flies from where it is to `to`, above everything, then disappears. */
export function flyClone(el: HTMLElement, to: DOMRect) {
  if (calm()) return;
  const from = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, { position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: "0", zIndex: "60", pointerEvents: "none" });
  document.body.append(ghost);
  const flight = ghost.animate([{ transform: "none" }, { transform: `translate(${to.left + 16 - from.left}px, ${to.top + (to.height - from.height) / 2 - from.top}px) scale(.85)`, opacity: 0.3 }], { duration: 420, easing: SPRING });
  flight.onfinish = flight.oncancel = () => ghost.remove();
}
