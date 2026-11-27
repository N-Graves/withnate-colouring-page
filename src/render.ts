import { A4, a4Page, colouringMask, placeOnPage, workSize, type Detail, type Size } from "./plan.js";

export const decode = async (file: File): Promise<ImageBitmap> =>
  createImageBitmap(file, { imageOrientation: "from-image" });

const canvasOf = (s: Size): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = s.width;
  c.height = s.height;
  return c;
};

const ctx2d = (c: HTMLCanvasElement, read = false): CanvasRenderingContext2D => {
  const ctx = c.getContext("2d", { willReadFrequently: read });
  if (!ctx) throw new Error("This browser would not give us a 2D canvas to draw on.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
};

/** The picture's pixels at working size. Read once, then reused for every detail level. */
export const readPixels = (source: ImageBitmap): ImageData => {
  const size = workSize(source);
  const c = canvasOf(size);
  const ctx = ctx2d(c, true);
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return ctx.getImageData(0, 0, size.width, size.height);
};

/** Black lines on white paper, at working size. */
export const lineArt = (pixels: ImageData, detail: Detail): HTMLCanvasElement => {
  const { width, height } = pixels;
  const mask = colouringMask(pixels.data, width, height, detail);
  const out = new ImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 0 : 255;
    out.data[i * 4] = v;
    out.data[i * 4 + 1] = v;
    out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  const c = canvasOf({ width, height });
  ctx2d(c).putImageData(out, 0, 0);
  return c;
};

/** The line art centred on an A4 page at 300 dpi, ready to print. */
export const onA4 = (art: HTMLCanvasElement): HTMLCanvasElement => {
  const page = a4Page(art);
  const c = canvasOf(page);
  const ctx = ctx2d(c);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.width, page.height);
  const r = placeOnPage(art, page);
  ctx.drawImage(art, r.x, r.y, r.width, r.height);
  return c;
};

export const toPng = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser could not save that image."))), "image/png"),
  );

export { A4 };
