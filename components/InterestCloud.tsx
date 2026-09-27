"use client";

import { Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { INTERESTS, normalizeInterest } from "../lib/interests"; // relative: Vitest has no @/ alias

const SHOWN = 36; // phones fit ~20, desktop ~36

// Pill size by popularity rank: [rank below, classes].
const SIZES: [number, string][] = [
  [6, "h-12 px-5 text-lg font-semibold"],
  [15, "h-11 px-4.5 text-[17px] font-medium"],
  [26, "h-10 px-4"],
  [Infinity, "h-10 px-4 text-[15px]"],
];
const size = (interest: string) => {
  const rank = INTERESTS.indexOf(interest);
  return SIZES.find(([below]) => (rank < 0 ? 15 : rank) < below)![1];
};

type Box = { w: number; h: number };

type Point = { x: number; y: number };

/** Packs boxes into rows around the center hole, `gap` apart so they nearly touch, with `pad` of air around the hole:
 *  first beside the hole, then rows alternating above and below. Row widths follow a circle, wobbled and nudged
 *  sideways per row so the outline is ragged, not perfect; the circle grows until everything fits or the height cap
 *  stops it. Rows take the earliest boxes that fit, so earlier (more popular) boxes sit closer in and small ones fill
 *  the ends. Null = didn't fit. */
export function placeCloud(boxes: Box[], box: Box, width: number, halfHeight: number, gap = 2, pad = 10) {
  const hole = { w: box.w + 2 * (pad - gap), h: box.h + 2 * (pad - gap) }; // the rows keep `gap` from this
  const area = boxes.reduce((sum, b) => sum + (b.w + gap) * (b.h + gap), (hole.w + gap) * (hole.h + gap));
  let r = Math.sqrt(area / Math.PI);
  let spots = packRows(boxes, hole, width, halfHeight, gap, r);
  while (spots.includes(null) && r < Math.hypot(width, halfHeight)) spots = packRows(boxes, hole, width, halfHeight, gap, (r *= 1.1));
  return spots;
}

// Fixed 0..1 noise per row, so the ragged outline stays put between renders.
const noise = (k: number) => {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function packRows(boxes: Box[], hole: Box, width: number, halfHeight: number, gap: number, r: number) {
  const spots: (Point | null)[] = boxes.map(() => null);
  const left = boxes.map((_, i) => i); // unplaced, most popular first
  const halfAt = (y: number) => Math.min(width / 2, Math.sqrt(Math.max(0, r * r - y * y)));
  const rowWidth = (row: number[]) => row.reduce((sum, i) => sum + boxes[i].w, 0) + gap * Math.max(0, row.length - 1);
  // The earliest unplaced boxes that fit in `room` px, in order.
  const take = (room: number) => {
    const row: number[] = [];
    for (const i of [...left]) {
      const need = boxes[i].w + (row.length ? gap : 0);
      if (need > room) continue;
      row.push(i);
      room -= need;
      left.splice(left.indexOf(i), 1);
    }
    return row;
  };
  const place = (row: number[], x: number, y: number) => {
    for (const i of row) {
      spots[i] = { x: x + boxes[i].w / 2, y };
      x += boxes[i].w + gap;
    }
  };

  const side = halfAt(0) - hole.w / 2 - gap; // beside the hole
  const west = take(side);
  place(west, -hole.w / 2 - gap - rowWidth(west), 0);
  place(take(side), hole.w / 2 + gap, 0);

  let top = -hole.h / 2;
  let bottom = hole.h / 2;
  const done = { up: false, down: false };
  const rows = { up: 0, down: 0 };
  for (let up = true; left.length && !(done.up && done.down); up = !up) {
    if (done[up ? "up" : "down"]) continue;
    const k = up ? -++rows.up : ++rows.down; // row id for its wobble
    const h = boxes[left[0]].h;
    const y = up ? top - gap - h / 2 : bottom + gap + h / 2;
    // Wobble the row's width, except where the screen's width is the limit (phones): there it would just lose pills,
    // and the sideways nudge below keeps the edge ragged.
    const wobble = halfAt(Math.abs(y)) >= width / 2 ? 0 : 0.3 * noise(k);
    const row = Math.abs(y) + h / 2 <= halfHeight ? take(2 * halfAt(Math.abs(y)) * (1 - wobble)) : [];
    if (!row.length) {
      done[up ? "up" : "down"] = true;
      continue;
    }
    const rowH = Math.max(...row.map((i) => boxes[i].h));
    const cy = up ? top - gap - rowH / 2 : bottom + gap + rowH / 2;
    const slack = 2 * halfAt(Math.abs(cy)) - rowWidth(row); // room left in the circle: slide the row within it
    place(row, -rowWidth(row) / 2 + (noise(k + 0.5) - 0.5) * Math.max(0, slack), cy);
    if (up) top = cy - rowH / 2;
    else bottom = cy + rowH / 2;
  }
  return spots;
}

/** Measures the rendered pills, places them, and moves them there. New pills burst out of the search bar. */
function layoutCloud(el: HTMLElement) {
  const width = el.clientWidth;
  const hole = el.querySelector<HTMLElement>("[data-hole]")!;
  const pills = [...el.querySelectorAll<HTMLElement>("[data-pill]")];
  const holeBox = { w: hole.offsetWidth, h: hole.offsetHeight };
  const boxes = pills.map((p) => ({ w: p.offsetWidth, h: p.offsetHeight }));
  const key = `${width}|${pills.map((p, i) => `${p.textContent}:${boxes[i].w}`).join()}`;
  if (el.dataset.layout === key) return; // a tap only recolors; skip the spiral
  el.dataset.layout = key;
  // ponytail: pills past the height cap are hidden; the most popular come first, so it's the tail that goes.
  const spots = placeCloud(boxes, holeBox, width, Math.max(width / 2, 260));

  const ys = spots.flatMap((s, i) => (s ? [s.y - boxes[i].h / 2, s.y + boxes[i].h / 2] : []));
  const top = Math.min(-holeBox.h / 2, ...ys);
  el.style.height = `${Math.max(holeBox.h / 2, ...ys) - top}px`;
  const at = (x: number, y: number, b: Box) => `translate(${width / 2 + x - b.w / 2}px, ${y - top - b.h / 2}px)`;

  hole.style.transform = at(0, 0, holeBox);
  pills.forEach((p, i) => {
    const s = spots[i];
    const fresh = !p.dataset.placed;
    if (fresh) {
      p.style.transition = "none";
      p.style.transform = `${at(0, 0, boxes[i])} scale(0.4)`;
      void p.offsetWidth; // commit the start position so the move animates
      p.style.transition = "";
      p.dataset.placed = "1";
    }
    p.style.transitionDelay = fresh ? `${i * 12}ms` : "";
    p.style.transform = s ? at(s.x, s.y, boxes[i]) : `${at(0, 0, boxes[i])} scale(0.4)`;
    p.style.opacity = s ? "1" : "0";
    p.inert = !s;
  });
}

type Props = { picked: string[]; onToggle: (interest: string) => void };

/** Interest pills in a cloud around a search bar. Search reaches the full list; Return picks the top match, or adds what was typed. */
export function InterestCloud({ picked, onToggle }: Props) {
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  const q = normalizeInterest(query);
  const extra = picked.filter((p) => !INTERESTS.slice(0, SHOWN).includes(p)); // picked from search or typed in
  const shown = q
    ? [...new Set([...picked, ...INTERESTS])].filter((i) => i.includes(q)).sort((a, b) => Number(b === q) - Number(a === q))
    : [...extra, ...INTERESTS.slice(0, SHOWN)];
  const addable = q && !shown.includes(q) ? q : null;
  const pills = shown.slice(0, SHOWN);
  const first = pills[0] ?? addable;

  useLayoutEffect(() => layoutCloud(box.current!)); // every render: search and picks both change what's shown
  useEffect(() => {
    const relayout = () => layoutCloud(box.current!);
    window.addEventListener("resize", relayout);
    return () => window.removeEventListener("resize", relayout);
  }, []);

  function pick(interest: string) {
    onToggle(interest);
    setQuery("");
  }

  const pill = "absolute top-0 left-0 whitespace-nowrap rounded-full opacity-0 transition-[transform,opacity,background-color,color] duration-500 ease-[cubic-bezier(0.2,0.9,0.3,1.1)] motion-reduce:transition-none";

  return (
    <div ref={box} className="relative w-full">
      <label data-hole className="absolute top-0 left-0 z-10 flex h-14 w-72 items-center gap-2.5 rounded-full bg-white/10 px-5 text-lg text-cream ring-1 ring-cream/30 backdrop-blur-md">
        <Search className="size-5 shrink-0 text-cream/50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && first) {
              e.preventDefault();
              pick(first);
            }
          }}
          maxLength={24}
          placeholder="Search or add"
          aria-label="Search interests or add your own"
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-cream/45"
        />
      </label>
      {pills.map((i) => {
        const on = picked.includes(i);
        return (
          <button
            data-pill
            key={i}
            type="button"
            aria-pressed={on}
            onClick={() => (q ? pick(i) : onToggle(i))}
            className={`${pill} ${size(i)} ${on ? "bg-cream text-navy" : "bg-white/10 text-cream"}`}
          >
            {i}
          </button>
        );
      })}
      {addable && (
        <button data-pill key="+" type="button" onClick={() => pick(addable)} className={`${pill} ${size(addable)} border border-dashed border-cream/60 text-cream`}>
          + {addable}
        </button>
      )}
    </div>
  );
}
