import type { TagLabelLayout } from "@/lib/tagLabel";
import { LABEL_FONT_MONO, LABEL_FONT_SANS } from "@/lib/tagLabel";

/**
 * TSPL / TSPL2 — the native command language of TSC label printers (TTP-244 Pro, TE244, TDP-2xx, …).
 *
 * A tag is drawn once, in millimetres, by the layout engine (tagLabel.ts). To print it straight to the
 * printer with no Windows driver and no print dialog, that same drawing is rasterised at the printer's
 * own resolution — every barcode bar lands on a whole number of dots — packed into a 1-bit bitmap and
 * sent with the BITMAP command. What the operator sees in the preview is what the head prints.
 */

export type MediaKind = "gap" | "continuous" | "blackmark";
export type PrintMethod = "printer-default" | "thermal-transfer" | "direct-thermal";

export type TsplMedia = {
  kind: MediaKind;
  /** Gap / black-mark length between labels, mm (ignored for continuous media). */
  gapMm: number;
  /** 0 (lightest) – 15 (darkest). */
  density: number;
  /** Inches per second. */
  speed: number;
  /** DIRECTION 1 is the usual "upright as it leaves the printer"; 0 turns the label through 180°. */
  rotate180: boolean;
  /** TSC BITMAP: a 0 bit is a black dot by default; some firmware / clones expect the opposite. */
  invert: boolean;
  /** Grey level below which a pixel prints black (0-255). Higher = bolder text. */
  threshold: number;
  method: PrintMethod;
};

export const DEFAULT_MEDIA: TsplMedia = {
  kind: "gap",
  gapMm: 3,
  density: 8,
  speed: 4,
  rotate180: false,
  invert: false,
  threshold: 165,
  method: "printer-default",
};

/** TTP-244 Pro / TE244: 108 mm print width at 203 dpi = 864 dots. Wider than this cannot print. */
export const MAX_PRINT_WIDTH_MM = 108;

export type LabelRaster = {
  widthDots: number;
  heightDots: number;
  widthBytes: number;
  widthMm: number;
  heightMm: number;
  /** Packed rows, MSB = leftmost dot. A set bit is a BLACK dot already adjusted for `invert`. */
  data: Uint8Array;
};

const ascii = (text: string) => {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
  return bytes;
};

export const concatBytes = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/**
 * Packs RGBA pixels into the 1-bit bitmap TSPL wants: 8 dots per byte, MSB first, rows padded to a
 * whole byte. `invert=false` writes 0 for black and 1 for white (the TSC convention).
 */
export function packMonochrome(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: { threshold: number; invert: boolean },
): { widthBytes: number; data: Uint8Array } {
  const widthBytes = Math.ceil(width / 8);
  const data = new Uint8Array(widthBytes * height);
  const whiteBit = options.invert ? 0 : 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < widthBytes * 8; x += 1) {
      let black = false;
      if (x < width) {
        const at = (y * width + x) * 4;
        const alpha = rgba[at + 3] / 255;
        // Transparent pixels are paper; blend the rest over white so anti-aliased edges threshold sensibly.
        const lum = (0.299 * rgba[at] + 0.587 * rgba[at + 1] + 0.114 * rgba[at + 2]) * alpha + 255 * (1 - alpha);
        black = lum < options.threshold;
      }
      const bit = black ? 1 - whiteBit : whiteBit;
      if (bit) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { widthBytes, data };
}

async function loadImage(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

/** Draws one laid-out tag at `dpi` and returns the packed bitmap. Browser only (needs a canvas). */
export async function rasterizeLabel(layout: TagLabelLayout, dpi: number, media: Pick<TsplMedia, "threshold" | "invert">): Promise<LabelRaster> {
  const perMm = dpi / 25.4;
  const widthDots = Math.max(8, Math.round(layout.widthMm * perMm));
  const heightDots = Math.max(8, Math.round(layout.heightMm * perMm));
  const canvas = document.createElement("canvas");
  canvas.width = widthDots;
  canvas.height = heightDots;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot draw the label for the printer.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, widthDots, heightDots);
  context.imageSmoothingEnabled = false;
  for (const op of layout.ops) {
    if (op.t === "bars") {
      context.fillStyle = "#000";
      const top = Math.round(op.y * perMm);
      const height = Math.max(1, Math.round(op.h * perMm));
      for (const run of op.runs) {
        // Round the two edges, not the width: neighbouring bars never drift and a module stays a whole number of dots.
        const left = Math.round((op.x + run.x * op.moduleMm) * perMm);
        const right = Math.round((op.x + (run.x + run.width) * op.moduleMm) * perMm);
        context.fillRect(left, top, Math.max(1, right - left), height);
      }
    } else if (op.t === "rect") {
      if (op.fill && op.fill !== "none") {
        context.fillStyle = op.fill;
        context.fillRect(Math.round(op.x * perMm), Math.round(op.y * perMm), Math.round(op.w * perMm), Math.round(op.h * perMm));
      }
      if (op.stroke) {
        context.strokeStyle = op.stroke;
        context.lineWidth = Math.max(1, Math.round((op.strokeW || 0.2) * perMm));
        context.setLineDash(op.dash ? [op.dash[0] * perMm, op.dash[1] * perMm] : []);
        context.strokeRect(op.x * perMm, op.y * perMm, op.w * perMm, op.h * perMm);
        context.setLineDash([]);
      }
    } else if (op.t === "image") {
      try {
        const image = await loadImage(op.dataUrl);
        const scale = Math.min((op.w * perMm) / image.naturalWidth, (op.h * perMm) / image.naturalHeight);
        const w = image.naturalWidth * scale;
        const h = image.naturalHeight * scale;
        context.imageSmoothingEnabled = true;
        context.drawImage(image, op.x * perMm + (op.w * perMm - w) / 2, op.y * perMm + (op.h * perMm - h) / 2, w, h);
        context.imageSmoothingEnabled = false;
      } catch {
        /* an unreadable logo must never stop tags from printing */
      }
    } else {
      context.fillStyle = op.color;
      context.font = `${op.bold ? 700 : 400} ${op.size * perMm}px ${op.mono ? LABEL_FONT_MONO : LABEL_FONT_SANS}`;
      context.textBaseline = "alphabetic";
      context.textAlign = op.anchor === "middle" ? "center" : op.anchor === "end" ? "right" : "left";
      context.fillText(op.text, op.x * perMm, op.y * perMm);
    }
  }
  const pixels = context.getImageData(0, 0, widthDots, heightDots);
  const packed = packMonochrome(pixels.data, widthDots, heightDots, { threshold: media.threshold, invert: media.invert });
  return { widthDots, heightDots, widthBytes: packed.widthBytes, widthMm: layout.widthMm, heightMm: layout.heightMm, data: packed.data };
}

const mm = (value: number) => `${Number(value.toFixed(2))} mm`;

/** SIZE / GAP / DIRECTION / DENSITY … — everything the printer must know about the media before a label. */
export function setupCommands(widthMm: number, heightMm: number, media: TsplMedia): string {
  const lines = [`SIZE ${mm(widthMm)},${mm(heightMm)}`];
  if (media.kind === "continuous") lines.push("GAP 0,0");
  else if (media.kind === "blackmark") lines.push(`BLINE ${mm(media.gapMm)},0 mm`);
  else lines.push(`GAP ${mm(media.gapMm)},0 mm`);
  lines.push(`DIRECTION ${media.rotate180 ? 0 : 1},0`, "REFERENCE 0,0", "SET TEAR ON");
  if (media.method === "thermal-transfer") lines.push("SET RIBBON ON");
  else if (media.method === "direct-thermal") lines.push("SET RIBBON OFF");
  lines.push(`DENSITY ${Math.max(0, Math.min(15, Math.round(media.density)))}`, `SPEED ${media.speed}`);
  return `${lines.join("\r\n")}\r\n`;
}

/** One label: setup, the bitmap, then PRINT. A batch is just these jobs back to back, in order. */
export function buildLabelJob(raster: LabelRaster, media: TsplMedia, copies = 1): Uint8Array {
  return concatBytes(
    ascii(setupCommands(raster.widthMm, raster.heightMm, media)),
    ascii(`CLS\r\nBITMAP 0,0,${raster.widthBytes},${raster.heightDots},0,`),
    raster.data,
    ascii(`\r\nPRINT 1,${Math.max(1, Math.round(copies))}\r\n`),
  );
}

/** Teach the printer the label length and gap by feeding a few labels (TTP-244: same as the FEED-button calibration). */
export function buildCalibrateJob(widthMm: number, heightMm: number, media: TsplMedia): Uint8Array {
  const sensor = media.kind === "blackmark" ? "AUTODETECT" : "GAPDETECT";
  return ascii(`${setupCommands(widthMm, heightMm, media)}${sensor}\r\n`);
}

/** Printer's own self-test page (head check, settings, firmware) — proves the link without any label design. */
export const SELFTEST_JOB = ascii("SELFTEST\r\n");

/** Feeds one label to the print position without printing. */
export function buildFeedJob(widthMm: number, heightMm: number, media: TsplMedia): Uint8Array {
  return ascii(`${setupCommands(widthMm, heightMm, media)}HOME\r\n`);
}

/** `<ESC>!?` — one status byte: 0 ready, otherwise bit flags (see decodeStatus). */
export const STATUS_QUERY = new Uint8Array([0x1b, 0x21, 0x3f]);

export type PrinterCondition = { ready: boolean; printing: boolean; problems: string[] };

export function decodeStatus(byte: number): PrinterCondition {
  const problems: string[] = [];
  if (byte & 0x01) problems.push("print head is open");
  if (byte & 0x02) problems.push("label jam");
  if (byte & 0x04) problems.push("out of labels");
  if (byte & 0x08) problems.push("out of ribbon");
  if (byte & 0x10) problems.push("paused");
  if (byte & 0x40) problems.push("cover is open");
  return { ready: byte === 0, printing: Boolean(byte & 0x20), problems };
}

/** Known TSC heads: the real dot density of the machine the label is rasterised for. */
export function expectedDpiForModel(name: string): number | undefined {
  const model = name.toUpperCase();
  if (/(TTP|TDP|TE|TC|DA|TX)[ -]?(2[0-9]{2}|2410|2610|2[0-9]{3})/.test(model)) return 203;
  if (/(TTP|TDP|TE|TC|DA|TX)[ -]?(3[0-9]{2}|3[0-9]{3})/.test(model)) return 300;
  if (/(TTP|TDP|TE|TC|DA|TX)[ -]?(6[0-9]{2})/.test(model)) return 600;
  return undefined;
}

/**
 * A label that proves the whole chain on the first connect: native BAR blocks (always correct) beside a
 * BITMAP block (follows the polarity setting) and a real Code 128 test. If the BITMAP square comes out
 * white while the BAR square is black, flip "invert".
 */
export function buildTestJob(widthMm: number, heightMm: number, dpi: number, media: TsplMedia, label: string): Uint8Array {
  const perMm = dpi / 25.4;
  const widthDots = Math.round(widthMm * perMm);
  const heightDots = Math.round(heightMm * perMm);
  const block = Math.max(16, Math.round(Math.min(widthDots, heightDots) * 0.22));
  const margin = Math.round(2 * perMm);
  const bytes = Math.ceil(block / 8);
  // A solid square in the polarity the setting expects: black = 0 bits unless inverted.
  const blackByte = media.invert ? 0xff : 0x00;
  const bitmap = new Uint8Array(bytes * block).fill(blackByte);
  const safeLabel = label.replace(/["\\]/g, " ").slice(0, 28);
  return concatBytes(
    ascii(setupCommands(widthMm, heightMm, media)),
    ascii("CLS\r\n"),
    ascii(`BOX ${margin},${margin},${widthDots - margin},${heightDots - margin},2\r\n`),
    ascii(`BAR ${margin * 2},${margin * 2},${block},${block}\r\n`),
    ascii(`BITMAP ${margin * 3 + block},${margin * 2},${bytes},${block},0,`),
    bitmap,
    ascii(`\r\nTEXT ${margin * 2},${margin * 3 + block},"3",0,1,1,"${safeLabel}"\r\n`),
    ascii(`BARCODE ${margin * 2},${margin * 3 + block + 36},"128",${Math.max(24, Math.round(heightDots * 0.18))},1,0,2,2,"LNDRY-TEST"\r\n`),
    ascii("PRINT 1,1\r\n"),
  );
}
