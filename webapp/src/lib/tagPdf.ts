import type { jsPDF } from "jspdf";
import type { PrintSettings } from "@/lib/laundryPrint";
import { layoutTags, LABEL_FONT_MONO, LABEL_FONT_SANS, type LabelOp, type LabelTag, type TagLabelLayout } from "@/lib/tagLabel";

/**
 * Tag PDF — the same layout the preview and the print page use, drawn as vector: the barcode is
 * filled rectangles whose widths are an exact number of printer dots, and text is real text. The
 * file prints identically from any viewer at 100 % ("actual size"), and stays scannable.
 *
 * Mini / thermal formats: one page per label, page = label size. A4: labels in a grid.
 */

const PT_PER_MM = 72 / 25.4;
// Standard PDF fonts only cover Latin-1; anything else (e.g. a Devanagari customer name) is drawn
// as a small picture of the text so it never turns into garbage.
const LATIN1 = /^[ -~ -ÿ]*$/;

function textAsImage(doc: jsPDF, op: Extract<LabelOp, { t: "text" }>, ox: number, oy: number) {
  const pxPerMm = 16;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  const font = `${op.bold ? 700 : 400} ${op.size * pxPerMm}px ${op.mono ? LABEL_FONT_MONO : LABEL_FONT_SANS}`;
  context.font = font;
  const width = Math.ceil(context.measureText(op.text).width) + 4;
  const height = Math.ceil(op.size * 1.4 * pxPerMm);
  canvas.width = width;
  canvas.height = height;
  context.font = font;
  context.fillStyle = op.color;
  context.textBaseline = "alphabetic";
  context.fillText(op.text, 2, op.size * 1.05 * pxPerMm);
  const widthMm = width / pxPerMm;
  const left = op.anchor === "start" ? op.x : op.anchor === "middle" ? op.x - widthMm / 2 : op.x - widthMm;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", ox + left, oy + op.y - op.size * 1.05, widthMm, height / pxPerMm);
}

function drawLabel(doc: jsPDF, layout: TagLabelLayout, ox: number, oy: number) {
  for (const op of layout.ops) {
    if (op.t === "bars") {
      doc.setFillColor(0, 0, 0);
      for (const run of op.runs) {
        doc.rect(ox + op.x + run.x * op.moduleMm, oy + op.y, run.width * op.moduleMm, op.h, "F");
      }
    } else if (op.t === "rect") {
      if (op.fill) {
        doc.setFillColor(op.fill);
        doc.rect(ox + op.x, oy + op.y, op.w, op.h, "F");
      }
      if (op.stroke) {
        doc.setDrawColor(op.stroke);
        doc.setLineWidth(op.strokeW || 0.2);
        if (op.dash) doc.setLineDashPattern(op.dash, 0);
        doc.rect(ox + op.x, oy + op.y, op.w, op.h, "S");
        doc.setLineDashPattern([], 0);
      }
    } else if (op.t === "image") {
      const format = /^data:image\/(png|jpe?g|webp)/i.exec(op.dataUrl)?.[1]?.toUpperCase().replace("JPG", "JPEG");
      if (format) {
        try {
          doc.addImage(op.dataUrl, format, ox + op.x, oy + op.y, op.w, op.h);
        } catch {
          /* an unreadable logo must never stop tags from printing */
        }
      }
    } else if (!LATIN1.test(op.text)) {
      textAsImage(doc, op, ox, oy);
    } else {
      doc.setFont(op.mono ? "courier" : "helvetica", op.bold ? "bold" : "normal");
      doc.setFontSize(op.size * PT_PER_MM);
      doc.setTextColor(op.color);
      doc.text(op.text, ox + op.x, oy + op.y, { align: op.anchor === "middle" ? "center" : op.anchor === "end" ? "right" : "left" });
    }
  }
}

/** Builds the PDF document for a batch of tags (used by the download button and by tests). */
export async function buildTagsPdf(tags: LabelTag[], settings?: PrintSettings, logoDataUrl?: string, title = "Garment tags") {
  const { jsPDF: PDF } = await import("jspdf");
  const { format, layouts } = layoutTags(tags, settings, logoDataUrl);
  const { widthMm: W, heightMm: H } = format;
  let doc: jsPDF;
  if (format.kind === "a4") {
    doc = new PDF({ unit: "mm", format: "a4", orientation: format.orientation, compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = (pageWidth - format.columns * W) / 2;
    const perSheet = format.columns * format.rows;
    layouts.forEach((layout, index) => {
      const slot = index % perSheet;
      if (index > 0 && slot === 0) doc.addPage("a4", format.orientation);
      drawLabel(doc, layout, left + (slot % format.columns) * W, format.marginMm + Math.floor(slot / format.columns) * H);
    });
  } else {
    const orientation = W > H ? "landscape" : "portrait";
    doc = new PDF({ unit: "mm", format: [W, H], orientation, compress: true });
    layouts.forEach((layout, index) => {
      if (index > 0) doc.addPage([W, H], orientation);
      drawLabel(doc, layout, 0, 0);
    });
  }
  doc.setProperties({ title, subject: `${layouts.length} tag${layouts.length === 1 ? "" : "s"} · Code 128`, creator: "Epic Laundry" });
  return doc;
}

export async function downloadTagsPdf(tags: LabelTag[], settings: PrintSettings | undefined, logoDataUrl: string | undefined, filename: string) {
  const doc = await buildTagsPdf(tags, settings, logoDataUrl, filename);
  doc.save(`${filename.replace(/[^\w.-]+/g, "-")}.pdf`);
}
