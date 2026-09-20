import type { PrintSettings } from "@/lib/laundryPrint";
import { labelToSvg, layoutTags, type LabelTag } from "@/lib/tagLabel";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);

/**
 * The tag document. Mini / thermal formats: ONE label per page, each page exactly the label size with
 * no margin — so a batch is a single print job that feeds label after label, in order, with no
 * re-selection. A4 formats: labels in a grid, a new sheet every columns × rows tags.
 */
export function buildTagsHtml(
  tags: LabelTag[],
  settings: PrintSettings | undefined,
  logoDataUrl: string | undefined,
  title = "Garment tags",
) {
  const { format, layouts } = layoutTags(tags, settings, logoDataUrl);
  const cells = layouts.map((layout) => `<div class="label">${labelToSvg(layout)}</div>`);
  const { widthMm: W, heightMm: H } = format;
  let body: string;
  let pageCss: string;
  if (format.kind === "a4") {
    const perSheet = format.columns * format.rows;
    const sheets: string[] = [];
    for (let index = 0; index < cells.length; index += perSheet) {
      sheets.push(`<section class="sheet">${cells.slice(index, index + perSheet).join("")}</section>`);
    }
    body = sheets.join("");
    pageCss = `@page{size:A4 ${format.orientation};margin:${format.marginMm}mm}.sheet{display:grid;grid-template-columns:repeat(${format.columns},${W}mm);grid-auto-rows:${H}mm;justify-content:center;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}`;
  } else {
    body = cells.join("");
    pageCss = `@page{size:${W}mm ${H}mm;margin:0}.label{break-after:page;page-break-after:always}.label:last-child{break-after:auto;page-break-after:auto}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}.label{width:${W}mm;height:${H}mm;overflow:hidden;background:#fff}.label svg{display:block;width:100%;height:100%}${pageCss}@media print{html,body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body>${body}</body></html>`;
}

/**
 * Prints an HTML document from the browser without a pop-up window (pop-ups are blocked once any
 * async work has run after the click, which is exactly when tags are built).
 */
export function printHtmlDocument(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden";
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(() => frame.remove(), 1000);
    };
    frame.onload = () => {
      const target = frame.contentWindow;
      if (!target) {
        cleanup();
        resolve(false);
        return;
      }
      target.addEventListener("afterprint", cleanup);
      window.setTimeout(() => {
        try {
          target.focus();
          target.print();
          resolve(true);
        } catch {
          cleanup();
          resolve(false);
        }
      }, 200);
      window.setTimeout(cleanup, 5 * 60_000);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

export type DocumentOutcome = { ok: boolean; evidence: string };

/**
 * Sends a finished document to paper or to a PDF file.
 * - Desktop shell (window.epic present): its own print / printToPDF bridge, exactly as before.
 * - Website: tags → a real PDF generated in the browser and downloaded; anything else, or a print,
 *   → the browser's print dialog.
 */
export async function deliverDocument(options: {
  html: string;
  pdf: boolean;
  filename: string;
  tags?: LabelTag[];
  settings?: PrintSettings;
  logoDataUrl?: string;
}): Promise<DocumentOutcome> {
  const { html, pdf, filename } = options;
  const bridge = typeof window !== "undefined" ? window.epic : undefined;
  const bridged = bridge ? (pdf ? await bridge.exportHtmlPdf?.(html, filename) : await bridge.printHtml?.(html)) : undefined;
  if (bridged) {
    return {
      ok: Boolean(bridged.ok),
      evidence: pdf ? "Electron printToPDF completed" : "Native print command accepted; physical output not independently verified",
    };
  }
  if (pdf && options.tags) {
    const { downloadTagsPdf } = await import("@/lib/tagPdf");
    await downloadTagsPdf(options.tags, options.settings, options.logoDataUrl, filename);
    return { ok: true, evidence: "PDF generated in the browser with a vector Code 128 barcode and downloaded" };
  }
  const ok = await printHtmlDocument(html);
  return {
    ok,
    evidence: ok
      ? pdf
        ? "Browser print dialog opened (choose Save as PDF); output not independently verified"
        : "Browser print dialog opened; physical output not independently verified"
      : "The print dialog could not be opened",
  };
}
