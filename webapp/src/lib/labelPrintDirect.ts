import type { PrintSettings } from "@/lib/laundryPrint";
import {
  getPrinterState,
  readPrinterCondition,
  reconnectPrinter,
  sendToPrinter,
} from "@/lib/labelPrinter";
import { layoutTags, type LabelTag } from "@/lib/tagLabel";
import {
  MAX_PRINT_WIDTH_MM,
  buildCalibrateJob,
  buildFeedJob,
  buildLabelJob,
  buildTestJob,
  concatBytes,
  expectedDpiForModel,
  rasterizeLabel,
  SELFTEST_JOB,
} from "@/lib/tspl";

export type DirectOutcome =
  | { handled: true; ok: boolean; evidence: string }
  /** Not sent directly; `reason` is shown with the browser-dialog fallback so the operator knows why. */
  | { handled: false; reason: string };

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The dot density to draw at: the head's real one when the model is known, else the saved printer resolution. */
function printDpi(fallback: number) {
  const live = getPrinterState().live;
  return (live && expectedDpiForModel(live.model)) || fallback;
}

/**
 * Prints a batch of tags straight to the connected TSC printer, label after label in order, as one job.
 * Returns `handled: false` (with the reason) whenever the browser print dialog should be used instead.
 */
export async function printTagsDirect(tags: LabelTag[], settings: PrintSettings | undefined, logoDataUrl: string | undefined): Promise<DirectOutcome> {
  const before = getPrinterState();
  if (before.mode === "dialog") return { handled: false, reason: "" };
  if (before.phase === "unsupported") return { handled: false, reason: "" };
  if (!before.remembered && before.phase !== "connected") return { handled: false, reason: "" };
  const { format, layouts } = layoutTags(tags, settings, logoDataUrl);
  if (format.kind === "a4") return { handled: false, reason: "An A4 sheet size is selected, so the browser print dialog was used. Pick a label size to print straight to the label printer." };
  if (format.widthMm > MAX_PRINT_WIDTH_MM) return { handled: false, reason: `A ${format.widthMm} mm wide label is wider than this printer prints (${MAX_PRINT_WIDTH_MM} mm).` };
  if (!(await reconnectPrinter())) {
    return { handled: false, reason: `The label printer is not connected${getPrinterState().message ? ` (${getPrinterState().message})` : ""} — the browser print dialog was used instead.` };
  }
  const { media, live } = getPrinterState();
  const dpi = printDpi(format.dpi);
  try {
    const jobs: Uint8Array[] = [];
    for (const layout of layouts) jobs.push(buildLabelJob(await rasterizeLabel(layout, dpi, media), media));
    await sendToPrinter(concatBytes(...jobs));
  } catch (error) {
    return { handled: false, reason: `Could not send to the label printer (${error instanceof Error ? error.message : "unknown error"}) — the browser print dialog was used instead.` };
  }
  // Give the head a moment to react, then ask how it is: paper out / head open must not read as "printed".
  await sleep(700);
  const condition = await readPrinterCondition();
  const where = `${live?.model || "label printer"}${live?.serial ? ` (S/N ${live.serial})` : ""}`;
  const sent = `${layouts.length} label${layouts.length === 1 ? "" : "s"} sent straight to ${where} over USB at ${dpi} dpi`;
  if (condition && condition.problems.length) {
    return { handled: true, ok: false, evidence: `${sent}, but the printer reports: ${condition.problems.join(", ")}. Fix that and print again.` };
  }
  return {
    handled: true,
    ok: true,
    evidence: `${sent}${condition ? "; printer status OK" : "; the printer did not report a status"}`,
  };
}

/** Test / maintenance actions used by the printer panel. Each resolves with a sentence for the operator. */
export async function printTestLabel(widthMm: number, heightMm: number, dpiFallback: number): Promise<string> {
  const { media, live } = getPrinterState();
  const dpi = printDpi(dpiFallback);
  await sendToPrinter(buildTestJob(widthMm, heightMm, dpi, media, live?.model || "LNDRY label test"));
  return "Test label sent. Check: the outer frame, the solid square from the printer's own BAR command (always correct) and the second square from the image path. If the second square is white while the first is black, turn on \"Flip image polarity\".";
}

export async function calibrateSensor(widthMm: number, heightMm: number): Promise<string> {
  const { media } = getPrinterState();
  await sendToPrinter(buildCalibrateJob(widthMm, heightMm, media));
  return "Calibration started — the printer feeds a few labels to measure the label length and gap. Wait for it to stop, then print a test label.";
}

export async function feedOneLabel(widthMm: number, heightMm: number): Promise<string> {
  const { media } = getPrinterState();
  await sendToPrinter(buildFeedJob(widthMm, heightMm, media));
  return "Fed to the next label.";
}

export async function printSelfTest(): Promise<string> {
  await sendToPrinter(SELFTEST_JOB);
  return "Self-test page sent — the printer prints its own settings (model, firmware, sensor, speed).";
}
