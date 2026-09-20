import type { PrintSettings, PrintTag } from "@/lib/laundryPrint";
import { barRuns, code128Modules, fitBarcode, type BarcodeFit, type BarRun } from "@/lib/tagBarcode";
import { resolveTagFormat, type ResolvedTagFormat } from "@/lib/tagFormats";

/**
 * One layout engine for every garment / bag tag output.
 *
 * A tag is laid out ONCE, in millimetres, as a short list of drawing operations. The on-screen preview
 * and the print page draw that list as SVG, and the PDF draws the very same list with jsPDF — so what
 * the operator sees is what prints, and the barcode is identical in all three (real Code 128, bars an
 * exact number of printer dots wide).
 */

export type LabelOp =
  | { t: "text"; x: number; y: number; size: number; bold?: boolean; mono?: boolean; anchor: "start" | "middle" | "end"; text: string; color: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; strokeW?: number; dash?: [number, number] }
  | { t: "bars"; x: number; y: number; h: number; moduleMm: number; runs: BarRun[] }
  | { t: "image"; x: number; y: number; w: number; h: number; dataUrl: string };

export type TagLabelLayout = {
  widthMm: number;
  heightMm: number;
  ops: LabelOp[];
  barcode: BarcodeFit & { text: string; heightMm: number };
  /** Optional lines that did not fit on this label size (never the barcode, code, garment, order or due date). */
  dropped: string[];
};

export type LabelContext = {
  brand: string;
  template?: PrintSettings["tagTemplate"];
  logoDataUrl?: string;
  format?: ResolvedTagFormat;
};

export type LabelTag = PrintTag & { category?: string };

const SANS = 'Arial, Helvetica, sans-serif';
const MONO = '"Courier New", Courier, monospace';
export const LABEL_FONT_SANS = SANS;
export const LABEL_FONT_MONO = MONO;

// ── text measuring ───────────────────────────────────────────────────────────

type Measurer = (text: string, sizeMm: number, bold: boolean, mono: boolean) => number;
let injectedMeasurer: Measurer | null = null;
let measureContext: CanvasRenderingContext2D | null = null;

/** Lets tests (no DOM) supply their own font metrics. */
export function setTextMeasurer(measurer: Measurer | null) {
  injectedMeasurer = measurer;
}

/** Width in mm; 2 % is added so a slightly wider fallback font never overflows the label edge. */
function measure(text: string, sizeMm: number, bold = false, mono = false) {
  if (!text) return 0;
  if (injectedMeasurer) return injectedMeasurer(text, sizeMm, bold, mono);
  if (!measureContext) measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * sizeMm * 0.55;
  measureContext.font = `${bold ? 700 : 400} 100px ${mono ? MONO : SANS}`;
  return (measureContext.measureText(text).width * sizeMm * 1.02) / 100;
}

function ellipsize(text: string, maxWidth: number, size: number, bold = false, mono = false) {
  if (measure(text, size, bold, mono) <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && measure(`${trimmed}...`, size, bold, mono) > maxWidth) trimmed = trimmed.slice(0, -1);
  return `${trimmed.trimEnd()}...`;
}

/** Greedy word wrap into at most `maxLines`; the last line is ellipsized if the text still does not fit. */
function wrap(text: string, maxWidth: number, size: number, bold: boolean, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size, bold) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const kept = lines.slice(0, maxLines);
  if (lines.length > maxLines) kept[maxLines - 1] = ellipsize(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, maxWidth, size, bold);
  return kept.map((line) => ellipsize(line, maxWidth, size, bold));
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function formatDate(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(parsed.getDate()).padStart(2, "0")} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

// ── layout ───────────────────────────────────────────────────────────────────

type Block = { id: string; height: number; draw: (top: number) => LabelOp[] };

export function layoutTagLabel(tag: LabelTag, context: LabelContext): TagLabelLayout {
  const template = context.template || {};
  const format = context.format || resolveTagFormat(template);
  const { widthMm: W, heightMm: H } = format;
  const a4 = format.kind === "a4";
  const ink = a4 ? "#123039" : "#000000";
  const soft = a4 ? "#40565a" : "#000000";
  const pad = a4 ? 4 : clamp(Math.min(W, H) * 0.06, 1.6, 2.4);
  const inner = W - 2 * pad;
  const modules = code128Modules(tag.tagNumber);
  // 0.4 mm of safety each side; the quiet zones themselves are counted inside the fit.
  const fit = fitBarcode(modules.length, W - 0.8, format.dpi);
  const container = tag.tagKind === "container";

  const show = (key: keyof NonNullable<PrintSettings["tagTemplate"]>, fallback = true) => {
    const value = template[key];
    return value === undefined ? fallback : Boolean(value);
  };

  const build = (factor: number, compact: boolean) => {
    const base = clamp(Math.min(H / 40, W / 60), 0.62, a4 ? 1.5 : 1.25) * format.fontScale * factor;
    const sz = (nominal: number, floor: number) => Math.max(floor * Math.min(1, format.fontScale), nominal * base);
    const line = format.lineSpacing;
    const sizes = {
      brand: sz(2.1, 1.9), seq: sz(3.1, 2.6), garment: sz(4.6, 3.4), sub: sz(2.8, 2.1),
      ref: sz(2.7, 2.1), due: sz(3.0, 2.3), code: sz(2.9, 2.2), extra: sz(2.5, 2.0),
    };
    const gap = 0.45 * base;
    const blocks: Record<string, Block> = {};

    // Compact mode (tiny labels): no brand/sequence row — the sequence moves onto the garment line.
    const seqText = show("showSequence") ? `${tag.sequence} / ${tag.total}` : "";
    if (!compact && (show("showStoreName") || show("showSequence"))) {
      const showLogo = show("showLogo") && Boolean(context.logoDataUrl) && H >= 45;
      const logo = showLogo ? Math.min(7, H * 0.09) : 0;
      const h = Math.max(sizes.brand, sizes.seq, logo) * 1.1 + gap;
      blocks.header = {
        id: "header", height: h,
        draw: (top) => {
          const ops: LabelOp[] = [];
          const baseline = top + Math.max(sizes.brand, sizes.seq) * 0.86;
          const seqWidth = seqText ? measure(seqText, sizes.seq, true) : 0;
          if (logo) ops.push({ t: "image", x: pad, y: top, w: logo, h: logo, dataUrl: context.logoDataUrl! });
          if (show("showStoreName")) {
            const brand = `${context.brand}${container ? " · CONTAINER" : ""}`.toUpperCase();
            const brandX = pad + (logo ? logo + 1.5 : 0);
            ops.push({ t: "text", x: brandX, y: baseline, size: sizes.brand, bold: true, anchor: "start", text: ellipsize(brand, inner - (logo ? logo + 1.5 : 0) - seqWidth - 2, sizes.brand, true), color: soft });
          }
          if (seqText) ops.push({ t: "text", x: W - pad, y: baseline, size: sizes.seq, bold: true, anchor: "end", text: seqText, color: ink });
          return ops;
        },
      };
    }

    // A long garment name shrinks onto one line by default; a second line is a bonus when there is room.
    let garmentTwoLines: { lines: string[]; extra: number } | null = null;
    if (show("showGarment")) {
      const lineHeight = sizes.garment * 1.14 * line;
      const drawLines = (lines: string[], top: number): LabelOp[] =>
        lines.map((text, index) => ({ t: "text" as const, x: pad, y: top + sizes.garment * 0.86 + index * lineHeight, size: sizes.garment, bold: true, anchor: "start" as const, text, color: ink }));
      const seqWidth = compact && seqText ? measure(seqText, sizes.seq, true) + 2 : 0;
      const one = wrap(tag.garment || "", inner - seqWidth, sizes.garment, true, 1);
      blocks.garment = {
        id: "garment", height: lineHeight + gap,
        draw: (top) => [
          ...drawLines(one, top),
          ...(compact && seqText ? [{ t: "text" as const, x: W - pad, y: top + sizes.garment * 0.86, size: sizes.seq, bold: true, anchor: "end" as const, text: seqText, color: ink }] : []),
        ],
      };
      const two = wrap(tag.garment || "", inner, sizes.garment, true, 2);
      if (two.length > 1 && !compact) garmentTwoLines = { lines: two, extra: lineHeight };
    }

    const refParts = [show("showOrder") ? tag.orderNumber : "", show("showCustomer") ? tag.customer : ""].filter(Boolean);
    if (refParts.length) {
      blocks.ref = {
        id: "ref", height: sizes.ref * 1.18 * line + gap,
        draw: (top) => [{ t: "text", x: pad, y: top + sizes.ref * 0.86, size: sizes.ref, anchor: "start", text: ellipsize(refParts.join(" · "), inner, sizes.ref), color: soft }],
      };
    }

    const dueText = show("showDueDate") ? `DUE ${formatDate(tag.expectedDeliveryDate)}` : "";
    const flags = [show("showExpress") && tag.express ? "EXPRESS" : "", show("showSpecialCare") && tag.specialCare ? "SPECIAL CARE" : ""].filter(Boolean).join("  ·  ");
    const stateText = (tag.state || "INTAKE").toUpperCase();
    blocks.due = {
      id: "due", height: sizes.due * 1.18 * line + gap,
      draw: (top) => {
        const baseline = top + sizes.due * 0.86;
        const ops: LabelOp[] = [];
        const stateWidth = measure(stateText, sizes.ref, true);
        if (dueText) ops.push({ t: "text", x: pad, y: baseline, size: sizes.due, bold: true, anchor: "start", text: ellipsize(dueText, inner - stateWidth - 2, sizes.due, true), color: ink });
        ops.push({ t: "text", x: W - pad, y: baseline, size: sizes.ref, bold: true, anchor: "end", text: stateText, color: soft });
        return ops;
      },
    };
    // EXPRESS / SPECIAL CARE are operational, so they are never truncated: a solid marker on its own line.
    if (flags) {
      const flagSize = sizes.due;
      const markerWidth = Math.min(inner, measure(flags, flagSize, true) + 2.4);
      blocks.flags = {
        id: "flags", height: flagSize * 1.35 + gap,
        draw: (top) => [
          { t: "rect", x: pad, y: top, w: markerWidth, h: flagSize * 1.3, fill: ink },
          { t: "text", x: pad + 1.2, y: top + flagSize * 1.02, size: flagSize, bold: true, anchor: "start", text: ellipsize(flags, inner - 2.4, flagSize, true), color: "#ffffff" },
        ],
      };
    }

    const subText = [tag.category, tag.service].filter((value, index, all) => value && all.indexOf(value) === index).join(" · ");
    if (show("showService") && subText) {
      blocks.sub = {
        id: "sub", height: sizes.sub * 1.18 * line + gap,
        draw: (top) => [{ t: "text", x: pad, y: top + sizes.sub * 0.86, size: sizes.sub, anchor: "start", text: ellipsize(subText, inner, sizes.sub), color: soft }],
      };
    }

    const extras: string[] = [];
    if (show("showInvoiceNumber", false) && tag.invoiceNumber) extras.push(`Invoice ${tag.invoiceNumber}`);
    if (show("showPhone", false) && tag.customerPhone) extras.push(tag.customerPhone);
    if (show("showOrderDate", false) && tag.orderDate) extras.push(`Booked ${formatDate(tag.orderDate)}`);
    if (show("showNotes", false) && tag.notes) extras.push(tag.notes);
    if (extras.length) {
      blocks.extras = {
        id: "extras", height: sizes.extra * 1.18 * line + gap,
        draw: (top) => [{ t: "text", x: pad, y: top + sizes.extra * 0.86, size: sizes.extra, anchor: "start", text: ellipsize(extras.join(" · "), inner, sizes.extra), color: soft }],
      };
    }
    return { blocks, sizes, gap, garmentTwoLines };
  };

  // Try the natural size first; only if even the essentials cannot share the label with a barcode of
  // usable height is the text scaled down.
  const barMin = 5.5;
  // 6.5 mm+ bars scan from any angle with handheld and phone scanners; the height beyond that is
  // only spent once the text lines above it have been placed.
  const barPreferred = clamp(H * 0.21, 6.5, a4 ? 20 : 11);
  const essentialOrder = ["header", "garment", "flags", "ref", "due"];
  const essentialsOf = (p: ReturnType<typeof build>) => essentialOrder.filter((id) => p.blocks[id]);
  const need = (p: ReturnType<typeof build>) => essentialsOf(p).reduce((sum, id) => sum + p.blocks[id].height, 0);
  const codeRow = (p: ReturnType<typeof build>) => p.sizes.code * 1.15 + 0.9;
  const room = (p: ReturnType<typeof build>) => H - 2 * pad - 1.1 - codeRow(p);
  // Natural size first; then smaller text; then compact mode (brand row dropped, sequence beside the
  // garment name) — the first arrangement that leaves the barcode its minimum height wins.
  const ladder: Array<[number, boolean]> = [[1, false], [0.92, false], [0.85, false], [0.78, false], [0.7, false], [0.9, true], [0.8, true], [0.7, true]];
  let plan = build(1, false);
  for (const [factor, compact] of ladder) {
    plan = build(factor, compact);
    if (room(plan) - need(plan) >= barMin) break;
  }
  const dropped: string[] = [];
  if (show("showStoreName") && !plan.blocks.header) dropped.push("brand name");
  const chosen = new Set(essentialsOf(plan));
  // Last resort (custom labels far too small): drop the order/customer line rather than let text touch the barcode.
  if (room(plan) - need(plan) < barMin && chosen.has("ref")) {
    chosen.delete("ref");
    dropped.push("order / customer line");
  }
  const chosenHeight = [...chosen].reduce((sum, id) => sum + plan.blocks[id].height, 0);
  let free = room(plan) - chosenHeight - barPreferred;
  let garmentLines: string[] | null = null;
  // Optional lines, most useful first; each is added only if it fits without shrinking the barcode.
  const optional: Array<{ id: string; label: string; cost: number }> = [
    { id: "sub", label: "category / service", cost: plan.blocks.sub?.height || 0 },
    { id: "garment2", label: "second garment line", cost: plan.garmentTwoLines?.extra || 0 },
    { id: "extras", label: "extra details", cost: plan.blocks.extras?.height || 0 },
  ];
  for (const item of optional) {
    const exists = item.id === "garment2" ? Boolean(plan.garmentTwoLines) : Boolean(plan.blocks[item.id]);
    if (!exists) continue;
    if (item.cost <= free) {
      free -= item.cost;
      if (item.id === "garment2") garmentLines = plan.garmentTwoLines!.lines;
      else chosen.add(item.id);
    } else dropped.push(item.label);
  }
  const barHeight = clamp(barPreferred + Math.max(0, free), barMin, a4 ? 20 : 11);

  const ops: LabelOp[] = [];
  if (a4) ops.push({ t: "rect", x: 0.35, y: 0.35, w: W - 0.7, h: H - 0.7, stroke: "#78998f", strokeW: 0.25, dash: [1.4, 1.2] });
  let top = pad;
  const order = ["header", "garment", "flags", "ref", "sub", "due", "extras"];
  for (const id of order) {
    if (!chosen.has(id)) continue;
    const block = plan.blocks[id];
    if (id === "garment" && garmentLines) {
      const size = plan.sizes.garment;
      const lineHeight = size * 1.14 * format.lineSpacing;
      garmentLines.forEach((text, index) => ops.push({ t: "text", x: pad, y: top + size * 0.86 + index * lineHeight, size, bold: true, anchor: "start", text, color: ink }));
      top += garmentLines.length * lineHeight + plan.gap;
      continue;
    }
    ops.push(...block.draw(top));
    top += block.height;
  }

  // Barcode + human-readable code, anchored to the bottom of the label.
  const codeText = tag.tagNumber;
  const codeWidth = measure(codeText, plan.sizes.code, false, true);
  const codeSize = codeWidth > inner ? plan.sizes.code * (inner / codeWidth) : plan.sizes.code;
  const codeTop = H - pad - codeSize * 1.15;
  const barTop = codeTop - 0.9 - barHeight;
  ops.push({ t: "bars", x: (W - fit.barsMm) / 2, y: barTop, h: barHeight, moduleMm: fit.moduleMm, runs: barRuns(modules) });
  ops.push({ t: "text", x: W / 2, y: codeTop + codeSize * 0.9, size: codeSize, mono: true, anchor: "middle", text: codeText, color: "#000000" });

  return { widthMm: W, heightMm: H, ops, barcode: { ...fit, text: codeText, heightMm: barHeight }, dropped };
}

// ── SVG ──────────────────────────────────────────────────────────────────────

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
const n = (value: number) => Number(value.toFixed(4));

/** The label as one self-contained SVG in millimetres (viewBox = the label), pure black on white. */
export function labelToSvg(layout: TagLabelLayout, options: { sizeInMm?: boolean } = {}) {
  const { widthMm: W, heightMm: H } = layout;
  const parts: string[] = [];
  for (const op of layout.ops) {
    if (op.t === "text") {
      parts.push(`<text x="${n(op.x)}" y="${n(op.y)}" font-size="${n(op.size)}" font-family='${op.mono ? LABEL_FONT_MONO : LABEL_FONT_SANS}'${op.bold ? ' font-weight="700"' : ""} text-anchor="${op.anchor}" fill="${op.color}">${escapeXml(op.text)}</text>`);
    } else if (op.t === "rect") {
      parts.push(`<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" fill="${op.fill || "none"}"${op.stroke ? ` stroke="${op.stroke}" stroke-width="${n(op.strokeW || 0.2)}"` : ""}${op.dash ? ` stroke-dasharray="${op.dash[0]} ${op.dash[1]}"` : ""}/>`);
    } else if (op.t === "image") {
      parts.push(`<image x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" href="${op.dataUrl}" preserveAspectRatio="xMidYMid meet"/>`);
    } else {
      const path = op.runs.map((run) => `M${n(op.x + run.x * op.moduleMm)} ${n(op.y)}h${n(run.width * op.moduleMm)}v${n(op.h)}h${n(-run.width * op.moduleMm)}z`).join("");
      parts.push(`<path d="${path}" fill="#000" shape-rendering="crispEdges"/>`);
    }
  }
  const size = options.sizeInMm ? ` width="${n(W)}mm" height="${n(H)}mm"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}"${size} role="img" aria-label="Tag ${escapeXml(layout.barcode.text)}"><rect width="${n(W)}" height="${n(H)}" fill="#fff"/>${parts.join("")}</svg>`;
}

// ── convenience ──────────────────────────────────────────────────────────────

export function tagLabelContext(settings?: PrintSettings, logoDataUrl?: string): LabelContext {
  return {
    brand: settings?.businessName?.trim() || "Epic Laundry",
    template: settings?.tagTemplate,
    logoDataUrl,
    format: resolveTagFormat(settings?.tagTemplate),
  };
}

export function layoutTags(tags: LabelTag[], settings?: PrintSettings, logoDataUrl?: string) {
  const context = tagLabelContext(settings, logoDataUrl);
  return { format: context.format!, layouts: tags.map((tag) => layoutTagLabel(tag, context)) };
}
