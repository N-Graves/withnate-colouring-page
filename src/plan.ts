/**
 * Photo to colouring page: every step is a pure function over plain arrays,
 * so it is all testable without a canvas. src/render.ts only moves pixels in
 * and out.
 *
 * The line finder is a difference of Gaussians: blur the picture twice, at a
 * small and a larger radius, and subtract. Where brightness changes (an edge)
 * the two blurs disagree and the difference goes strongly negative on the
 * dark side; flat areas cancel out. It gives drawn-looking outlines rather
 * than the double, noisy edges of a plain gradient filter, and it needs no
 * model and no upload.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_MEGAPIXELS = 80;
/** The longest edge the lines are found at. Bigger is slower and no cleaner. */
export const WORK_EDGE = 1600;

export const megapixels = (s: Size): number => (s.width * s.height) / 1e6;
export const isTooLarge = (s: Size): boolean => megapixels(s) > MAX_MEGAPIXELS;

export const workSize = (s: Size): Size => {
  const long = Math.max(s.width, s.height);
  if (long <= WORK_EDGE) return { width: s.width, height: s.height };
  const k = WORK_EDGE / long;
  return { width: Math.max(1, Math.round(s.width * k)), height: Math.max(1, Math.round(s.height * k)) };
};

export type Detail = 1 | 2 | 3 | 4 | 5;

/** Settings per detail level: blur radius, line threshold, smallest speck kept. */
export const detailSettings = (d: Detail): { radius: number; threshold: number; minSpeck: number } => {
  const table = {
    1: { radius: 2, threshold: 5, minSpeck: 150 },
    2: { radius: 2, threshold: 4, minSpeck: 100 },
    3: { radius: 1, threshold: 4, minSpeck: 60 },
    4: { radius: 1, threshold: 3, minSpeck: 40 },
    5: { radius: 1, threshold: 2, minSpeck: 20 },
  } as const;
  return table[d] ?? table[3];
};

/** Luminance 0..255 from RGBA. Transparent pixels count as white paper. */
export const toGrey = (rgba: ArrayLike<number>, n: number): Float32Array => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (rgba[i * 4 + 3] ?? 255) / 255;
    const l = 0.2126 * (rgba[i * 4] ?? 0) + 0.7152 * (rgba[i * 4 + 1] ?? 0) + 0.0722 * (rgba[i * 4 + 2] ?? 0);
    out[i] = l * a + 255 * (1 - a);
  }
  return out;
};

/** Separable box blur, run three times: a cheap, close Gaussian. Edges clamp. */
export const blur = (src: Float32Array, w: number, h: number, r: number): Float32Array => {
  if (r <= 0) return src.slice();
  let a = src.slice();
  let b = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean): void => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const span = 2 * r + 1;
    for (let line = 0; line < lines; line++) {
      const at = (i: number): number => {
        const c = Math.min(len - 1, Math.max(0, i));
        return horizontal ? from[line * w + c]! : from[c * w + line]!;
      };
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += at(i);
      for (let i = 0; i < len; i++) {
        const idx = horizontal ? line * w + i : i * w + line;
        to[idx] = sum / span;
        sum += at(i + r + 1) - at(i - r);
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(a, b, true);
    pass(b, a, false);
  }
  return a;
};

/**
 * 1 where a line is drawn, 0 for paper. A pixel is a line where the small blur
 * is darker than the large blur by more than the threshold.
 */
export const findLines = (grey: Float32Array, w: number, h: number, radius: number, threshold: number): Uint8Array => {
  const small = blur(grey, w, h, radius);
  const large = blur(grey, w, h, Math.max(radius + 1, Math.ceil(radius * 1.6)));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = small[i]! - large[i]! < -threshold ? 1 : 0;
  return out;
};

/** Removes line blobs smaller than minSize pixels (8-connected). Returns how many were removed. */
export const removeSpecks = (mask: Uint8Array, w: number, h: number, minSize: number): number => {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const blob: number[] = [];
  let removed = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    blob.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      blob.push(p);
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (blob.length < minSize) {
      for (const p of blob) mask[p] = 0;
      removed++;
    }
  }
  return removed;
};

/** The whole pipeline: RGBA in, line mask out. */
export const colouringMask = (rgba: ArrayLike<number>, w: number, h: number, detail: Detail): Uint8Array => {
  const s = detailSettings(detail);
  const mask = findLines(toGrey(rgba, w * h), w, h, s.radius, s.threshold);
  removeSpecks(mask, w, h, s.minSpeck);
  return mask;
};

/** A4 at 300 dpi, turned to suit the picture. */
export const A4 = { width: 2480, height: 3508 } as const;
export const A4_MARGIN = 118; // 10 mm at 300 dpi

export const a4Page = (picture: Size): Size =>
  picture.width > picture.height ? { width: A4.height, height: A4.width } : { width: A4.width, height: A4.height };

/** Where the picture goes on the page: whole, centred, inside the margin. */
export const placeOnPage = (picture: Size, page: Size): Rect => {
  const boxW = page.width - 2 * A4_MARGIN;
  const boxH = page.height - 2 * A4_MARGIN;
  const k = Math.min(boxW / picture.width, boxH / picture.height);
  const width = Math.max(1, Math.round(picture.width * k));
  const height = Math.max(1, Math.round(picture.height * k));
  return { x: Math.round((page.width - width) / 2), y: Math.round((page.height - height) / 2), width, height };
};

export const suggestedName = (original: string, a4: boolean): string => {
  const dot = original.lastIndexOf(".");
  const base = (dot > 0 ? original.slice(0, dot) : original).trim() || "photo";
  return `${base}-colouring-page${a4 ? "-a4" : ""}.png`;
};
