import type { PrintSettings } from "@/lib/laundryPrint";

/**
 * Label formats a garment / bag tag can be printed in. "mini", "thermal" formats put ONE tag on each
 * page/label (a batch prints label after label with no re-selection); "a4" formats put several tags
 * on a sheet.
 */
export type TagFormatKind = "mini" | "thermal" | "a4";

export type TagFormat = {
  id: string;
  label: string;
  group: "Mini & thermal labels" | "A4 sheets";
  kind: TagFormatKind;
  widthMm: number;
  heightMm: number;
  columns: number;
  rows: number;
  /** Printer resolution the barcode is sized for (a thermal head is usually 203 dpi, a laser 300+). */
  dpi: number;
  hint: string;
};

export const TAG_FORMATS: TagFormat[] = [
  { id: "mini-50x30", label: "Small mini tag · 50 × 30 mm", group: "Mini & thermal labels", kind: "mini", widthMm: 50, heightMm: 30, columns: 1, rows: 1, dpi: 203, hint: "Compact. At 203 dpi the bars are thin — best on a 300 dpi printer." },
  { id: "mini-60x40", label: "Mini tag · 60 × 40 mm", group: "Mini & thermal labels", kind: "mini", widthMm: 60, heightMm: 40, columns: 1, rows: 1, dpi: 203, hint: "Recommended for a 203 dpi mini printer." },
  { id: "thermal-50x25", label: "Thermal label · 50 × 25 mm", group: "Mini & thermal labels", kind: "thermal", widthMm: 50, heightMm: 25, columns: 1, rows: 1, dpi: 203, hint: "Smallest. Needs a 300 dpi printer for a dependable scan." },
  { id: "thermal-50.8x51.4", label: "Thermal label · 50.8 × 51.4 mm", group: "Mini & thermal labels", kind: "thermal", widthMm: 50.8, heightMm: 51.4, columns: 1, rows: 1, dpi: 203, hint: "Square label. At 203 dpi the bars are thin." },
  { id: "thermal-76x51", label: "Medium tag · 76 × 51 mm", group: "Mini & thermal labels", kind: "thermal", widthMm: 76, heightMm: 51, columns: 1, rows: 1, dpi: 203, hint: "Roomy — large, easy-to-scan bars on a 203 dpi printer." },
  { id: "a4-4", label: "A4 sheet · 4 tags", group: "A4 sheets", kind: "a4", widthMm: 96, heightMm: 130, columns: 2, rows: 2, dpi: 300, hint: "" },
  { id: "a4-6", label: "A4 sheet · 6 tags", group: "A4 sheets", kind: "a4", widthMm: 96, heightMm: 84, columns: 2, rows: 3, dpi: 300, hint: "" },
  { id: "a4-8", label: "A4 sheet · 8 tags", group: "A4 sheets", kind: "a4", widthMm: 96, heightMm: 63, columns: 2, rows: 4, dpi: 300, hint: "" },
  { id: "a4-10", label: "A4 sheet · 10 tags", group: "A4 sheets", kind: "a4", widthMm: 88, heightMm: 52, columns: 2, rows: 5, dpi: 300, hint: "" },
];

export const PRINTER_DPI_OPTIONS = [203, 300, 600] as const;

export function findTagFormat(id?: string) {
  return TAG_FORMATS.find((format) => format.id === id);
}

export function isThermalFormat(id?: string) {
  const kind = findTagFormat(id)?.kind;
  return kind === "mini" || kind === "thermal";
}

export type ResolvedTagFormat = {
  id: string;
  kind: TagFormatKind;
  widthMm: number;
  heightMm: number;
  columns: number;
  rows: number;
  /** Page margin — only used on A4 sheets; labels are printed edge to edge. */
  marginMm: number;
  orientation: "portrait" | "landscape";
  dpi: number;
  fontScale: number;
  lineSpacing: number;
};

type Template = NonNullable<PrintSettings["tagTemplate"]>;

const number = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Everything the layout / print / PDF code needs, from a saved template (any era of it). */
export function resolveTagFormat(template?: Template): ResolvedTagFormat {
  // No template saved yet (a fresh store) = the recommended A4 6-up sheet.
  const known = findTagFormat(template?.preset) || (!template?.preset && !template?.widthMm ? findTagFormat("a4-6") : undefined);
  const custom = !known;
  const kind: TagFormatKind = known
    ? known.kind
    : template?.pageSize === "thermal" || template?.preset?.startsWith("thermal")
      ? "thermal"
      : "a4";
  const widthMm = known ? known.widthMm : number(template?.widthMm, 96);
  const heightMm = known ? known.heightMm : number(template?.heightMm, 84);
  return {
    id: known?.id || "custom",
    kind,
    widthMm,
    heightMm,
    columns: custom ? Math.max(1, Math.min(6, Math.round(number(template?.columns, 2)))) : known.columns,
    rows: custom ? Math.max(1, Math.min(12, Math.round(number(template?.rows, 3)))) : known.rows,
    marginMm: kind === "a4" ? Math.max(0, Math.min(30, Number(template?.marginMm ?? 8))) : 0,
    orientation: template?.orientation === "landscape" ? "landscape" : "portrait",
    dpi: number(template?.printDpi, known?.dpi || (kind === "a4" ? 300 : 203)),
    fontScale: Math.max(0.6, Math.min(2, number(template?.fontScale, 1))),
    lineSpacing: Math.max(0.8, Math.min(2, number(template?.lineSpacing, 1))),
  };
}

// The label size belongs to the printer on this computer, so the Print Centre remembers it here
// (per browser) and every place that prints tags — Print Centre, after-booking, single tag — agrees.
const OVERRIDE_KEY = "epic-tag-format-v1";

export type TagFormatOverride = { preset?: string; printDpi?: number };

export function readTagFormatOverride(): TagFormatOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OVERRIDE_KEY) || "null");
    if (!parsed) return null;
    const preset = findTagFormat(parsed.preset)?.id;
    const printDpi = PRINTER_DPI_OPTIONS.includes(parsed.printDpi) ? parsed.printDpi : undefined;
    return preset || printDpi ? { preset, printDpi } : null;
  } catch {
    return null;
  }
}

export function writeTagFormatOverride(override: TagFormatOverride | null) {
  if (typeof window === "undefined") return;
  try {
    if (override) window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(override));
    else window.localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    /* private mode: the choice simply is not remembered */
  }
}

/** Saved template with this computer's label size / printer resolution applied on top. */
export function applyTagFormatOverride(
  template: Template | undefined,
  override: TagFormatOverride | null,
): Template {
  const base: Template = { ...(template || {}) };
  if (!override) return base;
  const format = findTagFormat(override.preset);
  if (!format) return override.printDpi ? { ...base, printDpi: override.printDpi } : base;
  return {
    ...base,
    preset: format.id,
    widthMm: format.widthMm,
    heightMm: format.heightMm,
    columns: format.columns,
    rows: format.rows,
    pageSize: format.kind === "a4" ? "A4" : "thermal",
    printDpi: override.printDpi || format.dpi,
  };
}

export function withTagFormatOverride(settings?: PrintSettings): PrintSettings {
  const next: PrintSettings = { ...(settings || {}) };
  next.tagTemplate = applyTagFormatOverride(next.tagTemplate, readTagFormatOverride());
  return next;
}
