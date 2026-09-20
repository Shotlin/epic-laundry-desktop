import { AlertTriangle, Check, Printer } from "lucide-react";
import { useMemo } from "react";
import type { PrintSettings, PrintTag } from "@/lib/laundryPrint";
import {
  PRINTER_DPI_OPTIONS,
  TAG_FORMATS,
  findTagFormat,
  resolveTagFormat,
  type TagFormatOverride,
} from "@/lib/tagFormats";
import { labelToSvg, layoutTagLabel, tagLabelContext, type LabelTag } from "@/lib/tagLabel";

/**
 * A tag drawn exactly as it will print (same layout engine as the print page and the PDF), as a
 * selectable card. The barcode is a real Code 128 — nothing here is a placeholder.
 */
export function TagLabelPreview({
  tag,
  settings,
  selected,
  onToggle,
}: {
  tag: PrintTag;
  settings?: PrintSettings;
  selected: boolean;
  onToggle: () => void;
}) {
  const svg = useMemo(() => {
    try {
      return labelToSvg(layoutTagLabel(tag as LabelTag, tagLabelContext(settings)));
    } catch {
      return "";
    }
  }, [tag, settings]);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${selected ? "Deselect" : "Select"} tag ${tag.tagNumber}`}
      className={`relative rounded-[18px] border bg-[#f4f6f1] p-3 text-left transition hover:-translate-y-0.5 ${selected ? "border-[#3a7d78] ring-2 ring-[#b9ded6]" : "border-[#263f44]/10"}`}
    >
      <span
        className={`absolute right-2.5 top-2.5 z-10 grid h-5 w-5 place-items-center rounded-md border ${selected ? "border-[#3a7d78] bg-[#3a7d78] text-white" : "border-[#b8c9c1] bg-white"}`}
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      {svg ? (
        <div
          className="mx-auto overflow-hidden rounded-md border border-[#263f44]/15 bg-white shadow-[0_6px_18px_rgba(37,48,43,.08)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          style={{ maxWidth: "26rem" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="grid h-32 place-items-center text-xs text-[#a04b32]">This code cannot be drawn as a barcode.</div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 px-1 font-mono text-[10px] text-[#617178]">
        <span className="truncate">{tag.tagNumber}</span>
        <span className="shrink-0 font-sans font-bold uppercase tracking-[.08em]">{tag.tagKind === "container" ? "Bag" : "Garment"}</span>
      </div>
    </button>
  );
}

/**
 * Label size + printer resolution for THIS computer's printer, and an honest read-out of what the
 * barcode will be like at that size (bar width in mm) so a label that cannot scan reliably is
 * flagged before anything is printed.
 */
export function TagFormatBar({
  settings,
  override,
  onChange,
  sampleTag,
}: {
  settings?: PrintSettings;
  override: TagFormatOverride | null;
  onChange: (next: TagFormatOverride) => void;
  sampleTag?: PrintTag;
}) {
  const format = resolveTagFormat(settings?.tagTemplate);
  const known = findTagFormat(format.id);
  const info = useMemo(() => {
    if (!sampleTag) return null;
    try {
      const layout = layoutTagLabel(sampleTag as LabelTag, tagLabelContext(settings));
      return { barcode: layout.barcode, dropped: layout.dropped };
    } catch {
      return null;
    }
  }, [sampleTag, settings]);
  const mini = format.kind !== "a4";
  const groups = ["Mini & thermal labels", "A4 sheets"] as const;
  const quality = info?.barcode.quality;
  return (
    <div className="mt-5 rounded-2xl border border-[#263f44]/10 bg-[#fbfcf9] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-xs font-semibold text-[#526368]">
          <span className="mb-1 flex items-center gap-1.5">
            <Printer className="h-3.5 w-3.5 text-[#39786f]" />
            Label size · print format
          </span>
          <select
            value={known ? format.id : "custom"}
            onChange={(event) => {
              const next = findTagFormat(event.target.value);
              if (!next) return;
              // Keep this printer's resolution when moving between label sizes (a 300 dpi printer stays 300).
              const sameFamily = (format.kind === "a4") === (next.kind === "a4");
              onChange({ preset: next.id, printDpi: sameFamily ? format.dpi : next.dpi });
            }}
            className="h-10 w-full rounded-xl border border-[#17363e]/15 bg-white px-3 text-sm font-semibold text-[#17353c] outline-none focus:ring-2 focus:ring-[#3a7d78]"
          >
            {!known ? <option value="custom">Custom (from Settings)</option> : null}
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {TAG_FORMATS.filter((item) => item.group === group).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="w-40 text-xs font-semibold text-[#526368]">
          <span className="mb-1 block">Printer resolution</span>
          <select
            value={format.dpi}
            onChange={(event) => onChange({ preset: known?.id, printDpi: Number(event.target.value) })}
            className="h-10 w-full rounded-xl border border-[#17363e]/15 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#3a7d78]"
          >
            {PRINTER_DPI_OPTIONS.map((dpi) => (
              <option key={dpi} value={dpi}>
                {dpi} dpi{dpi === 203 ? " (typical thermal)" : ""}
              </option>
            ))}
          </select>
        </label>
        {info ? (
          <div
            className={`flex min-h-10 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold sm:min-w-[16rem] ${quality === "good" ? "bg-[#eaf3ef] text-[#2e6a60]" : quality === "tight" ? "bg-[#fff6e1] text-[#855815]" : "bg-[#fdeceb] text-[#a04b32]"}`}
            role={quality === "good" ? undefined : "alert"}
          >
            {quality === "good" ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>
              Code 128 · bars {info.barcode.moduleMm.toFixed(2)} mm ({info.barcode.dots} dot{info.barcode.dots === 1 ? "" : "s"}) ·{" "}
              {quality === "good"
                ? "scan-ready"
                : quality === "tight"
                  ? "scans with laser / imager scanners; phone cameras may struggle"
                  : "too thin to scan dependably — use a wider label or a 300 dpi printer"}
            </span>
          </div>
        ) : null}
      </div>
      <p className="mt-2.5 text-[11px] leading-4 text-[#718087]">
        {mini
          ? "Each tag prints as its own label, in order — press Print once and the whole batch runs. In the print dialog choose your label printer and this paper size, at 100% scale."
          : `Tags print ${format.columns * format.rows} to an A4 sheet. In the print dialog use 100% / actual size so the barcode keeps its exact width.`}
        {known?.hint ? ` ${known.hint}` : ""}
        {info && info.dropped.length ? ` Not shown at this size: ${info.dropped.join(", ")}.` : ""}
      </p>
    </div>
  );
}
