import { expect, test } from "vitest";
import { placeCloud } from "./InterestCloud";

test("placeCloud: no overlaps, inside the width, earlier boxes closer to the center", () => {
  const hole = { w: 192, h: 48 };
  const boxes = Array.from({ length: 26 }, (_, i) => ({ w: 60 + ((i * 37) % 70), h: i < 6 ? 48 : 40 }));
  const spots = placeCloud(boxes, hole, 343, 230);
  const rects = [{ x: 0, y: 0, ...hole }, ...spots.flatMap((s, i) => (s ? [{ ...s, ...boxes[i] }] : []))];

  expect(rects.length).toBeGreaterThan(15);
  for (const [i, a] of rects.entries()) {
    expect(Math.abs(a.x) + a.w / 2).toBeLessThanOrEqual(343 / 2);
    for (const b of rects.slice(i + 1)) {
      const apart = Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.y - b.y) * 2 >= a.h + b.h;
      expect(apart).toBe(true);
    }
  }
  const dist = (s: { x: number; y: number } | null) => (s ? Math.hypot(s.x, s.y) : Infinity);
  expect(dist(spots[0])).toBeLessThan(dist(spots[25]));
});
