"use client";

import { useEffect } from "react";

const KEYBOARD_PX = 120; // the visible part is this much shorter than it's been: a keyboard is up (a URL bar is ~60)

/**
 * Mobile keyboards (SPEC §4.8). interactiveWidget (layout.tsx) makes Android shrink the page for the keyboard; iOS
 * ignores it and slides the keyboard over the page. So both get the part of the screen actually visible, from
 * window.visualViewport, as CSS vars on <html>: --vvh (its height) and --vv-top (how far the browser scrolled the
 * page to show a focused box). `kb-open` is on while a keyboard is up. The chat screen and every <dialog> size to
 * these (globals.css, GameScreen). A tapped box in a popup or the nudge card then scrolls into view inside it.
 */
export function ViewportVars() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    // Tallest visible height at this width. Android shrinks the window itself for the keyboard, so compare to this.
    let tallest = 0;
    let width = 0;
    const update = () => {
      const zoomed = vv.scale > 1.01; // pinch zoom also shrinks the visible part: keep the full height then
      if (window.innerWidth !== width) [tallest, width] = [0, window.innerWidth]; // rotated
      tallest = Math.max(tallest, window.innerHeight, vv.height);
      root.style.setProperty("--vvh", `${zoomed ? window.innerHeight : vv.height}px`);
      root.style.setProperty("--vv-top", `${zoomed ? 0 : vv.offsetTop}px`);
      root.classList.toggle("kb-open", !zoomed && tallest - vv.height > KEYBOARD_PX);
    };
    let timer: ReturnType<typeof setTimeout>;
    const onFocus = (e: FocusEvent) => {
      const box = e.target;
      if (!(box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) || !box.closest("dialog, [data-keep-visible]")) return;
      clearTimeout(timer);
      timer = setTimeout(() => box.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350); // once the keyboard is up
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocus);
    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);
  return null;
}
