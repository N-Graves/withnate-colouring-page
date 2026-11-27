import { describe, expect, it } from "vitest";
import {
  A4,
  A4_MARGIN,
  WORK_EDGE,
  a4Page,
  blur,
  colouringMask,
  detailSettings,
  findLines,
  isTooLarge,
  placeOnPage,
  removeSpecks,
  suggestedName,
  toGrey,
  workSize,
} from "../src/plan.js";

const W = 80;
const H = 60;

/** RGBA image from a brightness function. */
const image = (f: (x: number, y: number) => number, w = W, h = H): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  return d;
};
const count = (m: Uint8Array): number => m.reduce((a, b) => a + b, 0);

describe("toGrey", () => {
  it("treats transparent pixels as white paper", () => {
    const g = toGrey([0, 0, 0, 0, 0, 0, 0, 255], 2);
    expect(g[0]).toBeCloseTo(255);
    expect(g[1]).toBeCloseTo(0);
  });
});

describe("blur", () => {
  it("keeps a flat image flat and the same length", () => {
    const g = new Float32Array(W * H).fill(120);
    const b = blur(g, W, H, 3);
    expect(b.length).toBe(g.length);
    for (const v of b) expect(v).toBeCloseTo(120, 3);
  });
  it("smooths a hard step", () => {
    const g = toGrey(image((x) => (x < W / 2 ? 0 : 255)), W * H);
    const b = blur(g, W, H, 2);
    const mid = b[10 * W + W / 2]!;
    expect(mid).toBeGreaterThan(20);
    expect(mid).toBeLessThan(235);
  });
});

describe("findLines", () => {
  it("draws nothing on a flat picture", () => {
    const g = toGrey(image(() => 140), W * H);
    expect(count(findLines(g, W, H, 2, 3))).toBe(0);
  });
  it("draws a line along a dark-to-light edge, and only near it", () => {
    const g = toGrey(image((x) => (x < W / 2 ? 30 : 230)), W * H);
    const m = findLines(g, W, H, 2, 3);
    expect(count(m)).toBeGreaterThan(0);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (m[y * W + x]) expect(Math.abs(x - W / 2)).toBeLessThan(16);
  });
});

describe("removeSpecks", () => {
  it("removes blobs smaller than the minimum and keeps bigger ones", () => {
    const m = new Uint8Array(W * H);
    m[5 * W + 5] = 1; // a 1-pixel speck
    for (let x = 10; x < 70; x++) m[30 * W + x] = 1; // a 60-pixel line
    const removed = removeSpecks(m, W, H, 20);
    expect(removed).toBe(1);
    expect(m[5 * W + 5]).toBe(0);
    expect(count(m)).toBe(60);
  });
  it("counts diagonal neighbours as joined", () => {
    const m = new Uint8Array(W * H);
    for (let i = 0; i < 30; i++) m[(i + 5) * W + i + 5] = 1;
    removeSpecks(m, W, H, 25);
    expect(count(m)).toBe(30);
  });
});

describe("colouringMask", () => {
  it("gives more line at higher detail on a textured picture", () => {
    const tex = image((x, y) => 128 + 60 * Math.sin(x / 2.3) * Math.cos(y / 3.1) + (x > 40 ? 50 : -50));
    const low = count(colouringMask(tex, W, H, 1));
    const high = count(colouringMask(tex, W, H, 5));
    expect(high).toBeGreaterThan(low);
  });
  it("detail settings fall back to the middle for a bad value", () => {
    expect(detailSettings(9 as never)).toEqual(detailSettings(3));
  });
});

describe("sizes and the page", () => {
  it("works at no more than WORK_EDGE on the long side", () => {
    expect(workSize({ width: 4032, height: 3024 })).toEqual({ width: WORK_EDGE, height: 1200 });
    expect(workSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });
  it("turns the page to suit the picture", () => {
    expect(a4Page({ width: 400, height: 300 })).toEqual({ width: A4.height, height: A4.width });
    expect(a4Page({ width: 300, height: 400 })).toEqual(A4);
  });
  it("keeps the whole picture inside the margins, centred", () => {
    for (const pic of [{ width: 4000, height: 300 }, { width: 300, height: 4000 }, { width: 1000, height: 1000 }]) {
      const page = a4Page(pic);
      const r = placeOnPage(pic, page);
      expect(r.x).toBeGreaterThanOrEqual(A4_MARGIN - 1);
      expect(r.y).toBeGreaterThanOrEqual(A4_MARGIN - 1);
      expect(r.x + r.width).toBeLessThanOrEqual(page.width - A4_MARGIN + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(page.height - A4_MARGIN + 1);
      expect(Math.abs(r.x - (page.width - r.x - r.width))).toBeLessThanOrEqual(1);
    }
  });
  it("refuses over 80 MP", () => {
    expect(isTooLarge({ width: 10000, height: 9000 })).toBe(true);
    expect(isTooLarge({ width: 9504, height: 6336 })).toBe(false);
  });
  it("names the downloads", () => {
    expect(suggestedName("dog.jpg", true)).toBe("dog-colouring-page-a4.png");
    expect(suggestedName("", false)).toBe("photo-colouring-page.png");
  });
});
