import { attachIntake, formatBytes, h, measureImage, mount, readHeaderBytes } from "@nasdigitaluk/withnate-tool-core";
import { decode, lineArt, onA4, readPixels, toPng } from "./render.js";
import { MAX_MEGAPIXELS, isTooLarge, megapixels, suggestedName, type Detail } from "./plan.js";

const q = <T extends HTMLElement>(root: HTMLElement, sel: string): T | null => root.querySelector<T>(sel);

mount("[data-cp]", ({ root }) => {
  const drop = q<HTMLElement>(root, "[data-cp-drop]");
  if (!drop) return;
  const statusOut = q<HTMLElement>(root, "[data-cp-status]");
  const controls = q<HTMLElement>(root, "[data-cp-controls]");
  const detailIn = q<HTMLInputElement>(root, "[data-cp-detail]");
  const detailLabel = q<HTMLElement>(root, "[data-cp-detail-label]");
  const preview = q<HTMLElement>(root, "[data-cp-preview]");
  const dlA4 = q<HTMLAnchorElement>(root, "[data-cp-download-a4]");
  const dlPng = q<HTMLAnchorElement>(root, "[data-cp-download]");
  const resetBtn = q<HTMLButtonElement>(root, "[data-cp-reset]");

  let pixels: ImageData | null = null;
  let name = "photo";
  let urls: string[] = [];
  let request = 0;
  let debounce = 0;

  const setStatus = (text: string, kind: "info" | "error" | "" = ""): void => {
    if (!statusOut) return;
    statusOut.textContent = text;
    statusOut.className = kind ? `cp-status is-${kind}` : "cp-status";
    statusOut.hidden = text.length === 0;
  };
  const release = (): void => {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  };
  const show = (on: boolean): void => {
    if (controls) controls.hidden = !on;
    for (const el of [dlA4, dlPng, resetBtn]) if (el) el.hidden = !on;
    if (!on) {
      release();
      preview?.replaceChildren();
    }
  };
  const detail = (): Detail => {
    const v = Math.round(Number(detailIn?.value ?? 3));
    return (v >= 1 && v <= 5 ? v : 3) as Detail;
  };
  const LABELS = ["", "Bold outlines only", "Fewer lines", "Balanced", "More detail", "Lots of detail"];

  const run = async (): Promise<void> => {
    if (!pixels) return;
    const ticket = ++request;
    const d = detail();
    if (detailLabel) detailLabel.textContent = `Detail: ${LABELS[d]}`;
    setStatus("Drawing the lines…", "info");
    await new Promise((r) => setTimeout(r, 20));
    if (ticket !== request) return;
    try {
      const art = lineArt(pixels, d);
      const page = onA4(art);
      const [pageBlob, artBlob] = await Promise.all([toPng(page), toPng(art)]);
      if (ticket !== request) return;
      release();
      const pageUrl = URL.createObjectURL(pageBlob);
      const artUrl = URL.createObjectURL(artBlob);
      urls = [pageUrl, artUrl];
      art.className = "cp-art";
      art.setAttribute("role", "img");
      art.setAttribute("aria-label", "Your photo as a colouring page");
      preview?.replaceChildren(art);
      if (dlA4) {
        dlA4.href = pageUrl;
        dlA4.download = suggestedName(name, true);
        dlA4.textContent = `Download for printing on A4 (${formatBytes(pageBlob.size)})`;
      }
      if (dlPng) {
        dlPng.href = artUrl;
        dlPng.download = suggestedName(name, false);
        dlPng.textContent = `Download just the picture (${formatBytes(artBlob.size)})`;
      }
      setStatus("");
    } catch (err) {
      if (ticket !== request) return;
      setStatus(err instanceof Error ? err.message : "That photo could not be turned into lines.", "error");
    }
  };

  const load = async (file: File): Promise<void> => {
    const ticket = ++request;
    setStatus("Reading…", "info");
    try {
      const measured = measureImage(await readHeaderBytes(file));
      if (measured && isTooLarge(measured)) {
        setStatus(
          `That image is ${Math.round(megapixels(measured))} megapixels (${measured.width} × ${measured.height}). The limit here is ${MAX_MEGAPIXELS}, because opening it would use more memory than a browser tab can spare.`,
          "error",
        );
        show(false);
        return;
      }
      const bitmap = await decode(file);
      if (ticket !== request) {
        bitmap.close();
        return;
      }
      pixels = readPixels(bitmap);
      bitmap.close();
      name = file.name;
      show(true);
      await run();
    } catch {
      if (ticket !== request) return;
      setStatus("That file could not be read as an image this browser understands.", "error");
      show(false);
    }
  };

  attachIntake(drop, {
    onFile: (f) => void load(f),
    onReject: (reason) => setStatus(reason, "error"),
    draggingClass: "is-dragging",
  });
  detailIn?.addEventListener("input", () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void run(), 200);
  });
  resetBtn?.addEventListener("click", () => {
    request += 1;
    pixels = null;
    show(false);
    setStatus("");
  });
  show(false);
});
