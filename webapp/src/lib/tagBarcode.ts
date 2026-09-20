import JsBarcode from "jsbarcode";

/**
 * Code 128 for garment / bag tags.
 *
 * The bar pattern comes from JsBarcode (auto subset selection, so digit runs such as the date in
 * ELT-20260920-ABC123 are packed into subset C). What this module adds is the part that decides
 * whether a label scans after it is printed: every bar is snapped to a WHOLE number of printer
 * dots. A thermal head cannot print a bar 1.6 dots wide — it prints 1 or 2 and the widths come out
 * uneven, which is what makes a barcode unreadable. So the module width is always n / dpi inches.
 */

/** Raw module sequence: "1" = bar, "0" = space, including start, check digit and stop pattern. */
export function code128Modules(text: string): string {
  const target: { encodings?: Array<{ data: string }> } = {};
  JsBarcode(target, text, { format: "CODE128" });
  const data = (target.encodings || []).map((part) => part.data).join("");
  if (!data) throw new Error("This tag code cannot be encoded as Code 128.");
  return data;
}

export type BarcodeQuality = "good" | "tight" | "poor";

export type BarcodeFit = {
  /** Printer dots per module (bar width). */
  dots: number;
  moduleMm: number;
  /** Modules of blank space kept on each side. */
  quietModules: number;
  /** Bars plus both quiet zones. */
  totalMm: number;
  barsMm: number;
  quality: BarcodeQuality;
  dpi: number;
};

const MM_PER_INCH = 25.4;

/**
 * good  ≥ 0.24 mm bars: any handheld or camera scanner reads it.
 * tight ≥ 0.165 mm: fine for a laser / imager scanner, marginal for a phone camera.
 * poor  below that: prints, but is not dependable — use a wider label or a 300 dpi printer.
 */
export function classifyModule(moduleMm: number): BarcodeQuality {
  if (moduleMm >= 0.24) return "good";
  if (moduleMm >= 0.165) return "tight";
  return "poor";
}

/**
 * Widest whole-dot bar width that lets `moduleCount` modules plus quiet zones fit in `availableMm`.
 * The 10-module quiet zone of the standard is used when it fits at 2+ dots per module, otherwise
 * it is trimmed to 6 (still well inside what scanners accept) before giving up on the second dot.
 */
export function fitBarcode(
  moduleCount: number,
  availableMm: number,
  dpi: number,
  maxModuleMm = 0.42,
): BarcodeFit {
  const availableDots = Math.max(1, Math.floor((availableMm * dpi) / MM_PER_INCH));
  const maxDots = Math.max(1, Math.floor((maxModuleMm * dpi) / MM_PER_INCH));
  let quietModules = 10;
  let dots = Math.floor(availableDots / (moduleCount + 2 * quietModules));
  if (dots < 2) {
    quietModules = 6;
    dots = Math.floor(availableDots / (moduleCount + 2 * quietModules));
  }
  dots = Math.min(maxDots, Math.max(1, dots));
  const moduleMm = (dots * MM_PER_INCH) / dpi;
  return {
    dots,
    moduleMm,
    quietModules,
    totalMm: moduleMm * (moduleCount + 2 * quietModules),
    barsMm: moduleMm * moduleCount,
    quality: classifyModule(moduleMm),
    dpi,
  };
}

export type BarRun = { x: number; width: number };

/** Adjacent bar modules merged into runs, positions in modules from the start of the pattern. */
export function barRuns(modules: string): BarRun[] {
  const runs: BarRun[] = [];
  let start = -1;
  for (let index = 0; index <= modules.length; index += 1) {
    const isBar = modules[index] === "1";
    if (isBar && start < 0) start = index;
    if (!isBar && start >= 0) {
      runs.push({ x: start, width: index - start });
      start = -1;
    }
  }
  return runs;
}
