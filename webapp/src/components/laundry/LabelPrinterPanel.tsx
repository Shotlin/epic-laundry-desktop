import { AlertTriangle, CheckCircle2, Download, Loader2, Plug, Printer, RefreshCw, Unplug, Usb } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLabelPrinter } from "@/hooks/useLabelPrinter";
import {
  connectPrinter,
  connectUsbDirect,
  detectAgent,
  disconnectPrinter,
  forgetPrinter,
  refreshCondition,
  resumePrinter,
  selectAgentPrinter,
  updatePrinterPrefs,
} from "@/lib/labelPrinter";
import { calibrateSensor, feedOneLabel, printSelfTest, printTestLabel } from "@/lib/labelPrintDirect";
import { expectedDpiForModel, type MediaKind, type PrintMethod } from "@/lib/tspl";

const hex = (value: number) => value.toString(16).toUpperCase().padStart(4, "0");
const isWindows = () => typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#263f44]/8 bg-[#fafbf8] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#819095]">{label}</p>
      <p className="mt-0.5 break-words text-sm font-semibold text-[#17353c]">{children}</p>
    </div>
  );
}

/**
 * The label printer on THIS computer: is it connected, which model, which serial number, what the printer
 * itself says (ready / out of labels / head open), the one-time connect, and the maintenance actions.
 * The connection is a browser permission for the site — it survives reloads, sign-out and a different login.
 */
export function LabelPrinterPanel({
  labelSize,
  defaultOpen = true,
}: {
  /** The label the Print Centre is set to — used by the test, calibrate and feed actions. */
  labelSize?: { widthMm: number; heightMm: number; dpi: number; thermal: boolean };
  defaultOpen?: boolean;
}) {
  const printer = useLabelPrinter();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(defaultOpen);
  const size = labelSize?.thermal ? labelSize : { widthMm: 60, heightMm: 40, dpi: 203, thermal: true };
  const shown = printer.live || printer.remembered;
  const connected = printer.phase === "connected";
  const problems = printer.condition?.problems || [];
  const modelDpi = shown ? expectedDpiForModel(shown.model) : undefined;
  const windows = isWindows();

  async function run(name: string, work: () => Promise<string | boolean | void>) {
    setBusy(name);
    setNote("");
    try {
      const result = await work();
      if (typeof result === "string") setNote(result);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy("");
    }
  }

  const pill = connected
    ? problems.length
      ? { tone: "bg-[#fff6e1] text-[#855815]", text: "Connected · needs attention" }
      : { tone: "bg-[#eaf3ef] text-[#2e6a60]", text: "Connected" }
    : printer.phase === "connecting"
      ? { tone: "bg-[#eef3f6] text-[#315d57]", text: "Connecting…" }
      : printer.phase === "unsupported"
        ? { tone: "bg-[#fdeceb] text-[#a04b32]", text: "Browser not supported" }
        : printer.phase === "error"
          ? { tone: "bg-[#fdeceb] text-[#a04b32]", text: "Not connected · action needed" }
          : { tone: "bg-[#f3f5f1] text-[#617178]", text: printer.remembered ? "Not connected" : "No printer set up" };

  const media = printer.media;
  const field = "h-9 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-semibold text-[#17353c] outline-none focus:ring-2 focus:ring-[#3a7d78]";

  return (
    <section className="rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]" aria-label="Label printer connection">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-start gap-3 text-left" aria-expanded={open}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#123039] text-[#f2c66d]">
            <Printer className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-[.15em] text-[#4d8982]">Label printer · this computer</span>
            <span className="mt-0.5 block font-serif text-lg text-[#17353c]">{shown ? shown.model : "TSC TTP-244 Pro / TE244"}</span>
            <span className="block text-xs text-[#718087]">
              {connected ? "Tags print straight to the printer — no print dialog." : printer.message || "Connect it once and it reconnects by itself."}
            </span>
          </span>
        </button>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${pill.tone}`} role="status">
          {printer.phase === "connecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connected && !problems.length ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {pill.text}
        </span>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          {printer.phase === "unsupported" ? (
            <p className="rounded-xl bg-[#fdeceb] p-3 text-xs font-semibold leading-5 text-[#a04b32]" role="alert">
              {printer.message} Tags still print through the browser print dialog.
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Row label="Printer model">{shown?.model || "—"}</Row>
            <Row label="Serial number">{shown ? shown.serial || "Not reported by the printer" : "—"}</Row>
            <Row label="Connection">
              <span className="inline-flex items-center gap-1.5">
                <Usb className="h-3.5 w-3.5 text-[#39786f]" />
                {connected ? (printer.live?.via === "agent" ? "Windows driver · print agent" : "USB · direct") : "Not connected"}
              </span>
            </Row>
            <Row label="Printer says">
              {!connected ? "—" : printer.condition ? (problems.length ? problems.join(", ") : printer.condition.printing ? "Printing…" : "Ready") : "Connected (status not reported)"}
            </Row>
            <Row label="USB ID">{shown && shown.vendorId ? `${hex(shown.vendorId)}:${hex(shown.productId)}` : "—"}</Row>
            <Row label="Maker / Windows printer">{shown ? [shown.manufacturer, shown.queue && shown.queue !== shown.model ? `queue “${shown.queue}”` : ""].filter(Boolean).join(" · ") || "—" : "—"}</Row>
            <Row label="Print resolution">{modelDpi ? `${modelDpi} dpi (from model)` : `${size.dpi} dpi (Printer resolution setting)`}</Row>
            <Row label="Last connected">{printer.remembered ? new Date(printer.remembered.lastConnectedAt).toLocaleString("en-IN") : "Never"}</Row>
          </div>

          {shown && !shown.recognised ? (
            <p className="rounded-xl bg-[#fff6e1] p-3 text-xs leading-5 text-[#855815]">
              This does not look like a TSC printer, so label commands may not be understood. TSC TTP-244 Pro, TE244 and other TSPL printers are supported.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <>
                {printer.remembered ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run("reconnect", async () => {
                    const ok = await resumePrinter();
                    return ok ? "Reconnected." : "Not found — check the cable and power, or use Connect printer.";
                  })} className="inline-flex items-center gap-1.5 rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5" /> Reconnect
                  </button>
                ) : null}
                <button type="button" disabled={Boolean(busy) || printer.phase === "unsupported"} onClick={() => void run("connect", async () => ((await connectPrinter()) ? "Printer connected. It will reconnect by itself next time — even after signing out and in." : undefined))} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${printer.remembered ? "border border-[#263f44]/15 bg-white text-[#17353c]" : "bg-[#123039] text-white"}`}>
                  <Plug className="h-3.5 w-3.5" /> {printer.remembered ? "Choose a printer" : "Connect printer"}
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={Boolean(busy) || !size.thermal} onClick={() => void run("test", () => printTestLabel(size.widthMm, size.heightMm, size.dpi))} className="inline-flex items-center gap-1.5 rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  <Printer className="h-3.5 w-3.5" /> Print test label
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run("status", async () => ((await refreshCondition()) ? "Status updated." : "The printer did not answer the status request (printing still works)."))} className="inline-flex items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#17353c] disabled:opacity-50">
                  <RefreshCw className="h-3.5 w-3.5" /> Check status
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run("calibrate", () => calibrateSensor(size.widthMm, size.heightMm))} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#17353c] disabled:opacity-50">
                  Calibrate label sensor
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run("feed", () => feedOneLabel(size.widthMm, size.heightMm))} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#17353c] disabled:opacity-50">
                  Feed one label
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run("selftest", printSelfTest)} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#17353c] disabled:opacity-50">
                  Printer self-test
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run("disconnect", async () => { await disconnectPrinter(); })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#617178] disabled:opacity-50">
                  <Unplug className="h-3.5 w-3.5" /> Disconnect
                </button>
              </>
            )}
            {printer.remembered ? (
              <button type="button" disabled={Boolean(busy)} onClick={() => void run("forget", async () => { await forgetPrinter(); return "Printer removed from this browser. Use Connect printer to set it up again."; })} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">
                Forget printer
              </button>
            ) : null}
          </div>
          {!size.thermal && connected ? <p className="text-[11px] text-[#855815]">An A4 sheet size is selected — pick a label size (for example 60 × 40 mm) to use the test, calibrate and feed buttons.</p> : null}
          {busy ? <p className="flex items-center gap-1.5 text-xs text-[#617178]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</p> : null}
          {note ? <p className="rounded-xl bg-[#eef3f6] p-3 text-xs leading-5 text-[#315d57]" role="status">{note}</p> : null}
          {printer.phase === "error" && printer.message ? <p className="rounded-xl bg-[#fdeceb] p-3 text-xs leading-5 text-[#a04b32]" role="alert">{printer.message}</p> : null}

          <fieldset className="rounded-xl border border-[#263f44]/10 p-3">
            <legend className="px-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#4d8982]">How tags are printed on this computer</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["direct", "Straight to the label printer", "No print dialog, no driver size to match. Falls back to the dialog if the printer is not connected."],
                ["dialog", "Browser print dialog", "Always use the operating-system dialog (needs the label size set in the printer driver)."],
              ] as const).map(([value, title, detail]) => (
                <label key={value} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-xs ${printer.mode === value ? "border-[#3a7d78] bg-[#f1f7f4]" : "border-[#263f44]/10"}`}>
                  <input type="radio" name="label-print-mode" checked={printer.mode === value} onChange={() => updatePrinterPrefs({ mode: value })} className="mt-0.5 accent-[#3a7d78]" />
                  <span><strong className="block text-[#17353c]">{title}</strong><span className="text-[#718087]">{detail}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          <details className="rounded-xl border border-[#263f44]/10 p-3">
            <summary className="cursor-pointer text-xs font-bold text-[#315d57]">Label &amp; print settings for this printer</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-[11px] font-semibold text-[#526368]">Label stock
                <select className={`${field} mt-1`} value={media.kind} onChange={(event) => updatePrinterPrefs({ media: { kind: event.target.value as MediaKind } })}>
                  <option value="gap">Die-cut labels (gap)</option>
                  <option value="blackmark">Black-mark labels</option>
                  <option value="continuous">Continuous roll</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#526368]">Gap between labels (mm)
                <input className={`${field} mt-1`} type="number" min="0" max="25" step="0.5" value={media.gapMm} disabled={media.kind === "continuous"} onChange={(event) => updatePrinterPrefs({ media: { gapMm: Math.max(0, Math.min(25, Number(event.target.value) || 0)) } })} />
              </label>
              <label className="text-[11px] font-semibold text-[#526368]">Ribbon / print method
                <select className={`${field} mt-1`} value={media.method} onChange={(event) => updatePrinterPrefs({ media: { method: event.target.value as PrintMethod } })}>
                  <option value="printer-default">Keep the printer's own setting</option>
                  <option value="thermal-transfer">Thermal transfer (ribbon)</option>
                  <option value="direct-thermal">Direct thermal (no ribbon)</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#526368]">Darkness (0–15)
                <input className={`${field} mt-1`} type="number" min="0" max="15" value={media.density} onChange={(event) => updatePrinterPrefs({ media: { density: Math.max(0, Math.min(15, Number(event.target.value) || 0)) } })} />
              </label>
              <label className="text-[11px] font-semibold text-[#526368]">Speed (inches / second)
                <select className={`${field} mt-1`} value={media.speed} onChange={(event) => updatePrinterPrefs({ media: { speed: Number(event.target.value) } })}>
                  {[2, 3, 4, 5].map((speed) => <option key={speed} value={speed}>{speed}{speed === 4 ? " (recommended)" : ""}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#526368]">Text boldness
                <select className={`${field} mt-1`} value={media.threshold} onChange={(event) => updatePrinterPrefs({ media: { threshold: Number(event.target.value) } })}>
                  <option value={140}>Lighter</option>
                  <option value={165}>Normal</option>
                  <option value={190}>Bolder</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pt-5 text-[11px] font-semibold text-[#526368]">
                <input type="checkbox" checked={media.rotate180} onChange={(event) => updatePrinterPrefs({ media: { rotate180: event.target.checked } })} className="accent-[#3a7d78]" />
                Turn labels upside-down (180°)
              </label>
              <label className="flex items-center gap-2 pt-5 text-[11px] font-semibold text-[#526368]">
                <input type="checkbox" checked={media.invert} onChange={(event) => updatePrinterPrefs({ media: { invert: event.target.checked } })} className="accent-[#3a7d78]" />
                Flip image polarity (only if the test label's 2nd square is white)
              </label>
            </div>
          </details>

          <details className="rounded-xl border border-[#263f44]/10 p-3" open={!connected && (printer.phase === "error" || printer.phase === "unsupported" || windows)}>
            <summary className="cursor-pointer text-xs font-bold text-[#315d57]">
              Print through the Windows driver (LNDRY Print Agent){windows ? " — recommended on this PC" : ""}
            </summary>
            <div className="mt-3 space-y-3 text-xs leading-5 text-[#526368]">
              <p>
                If the TSC printer driver is installed on this PC (the normal case), the browser is not allowed to open the printer by itself. The print agent is a tiny helper that runs on this PC and hands labels to the printer <strong>through that same driver</strong> — nothing to remove or replace. Install it once; it starts by itself with Windows.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${printer.agent.phase === "running" ? "bg-[#eaf3ef] text-[#2e6a60]" : "bg-[#f3f5f1] text-[#617178]"}`}>
                  {printer.agent.phase === "running" ? `Agent running · v${printer.agent.version}` : printer.agent.phase === "missing" ? "Agent not detected" : "Agent not checked yet"}
                </span>
                <a href={`${import.meta.env.BASE_URL}print-agent/Install-LndryPrintAgent.cmd`} download className="inline-flex items-center gap-1.5 rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white">
                  <Download className="h-3.5 w-3.5" /> Download installer
                </a>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run("detect", async () => ((await detectAgent()) ? "Print agent found and connected." : undefined))} className="inline-flex items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#17353c] disabled:opacity-50">
                  <RefreshCw className="h-3.5 w-3.5" /> Detect agent
                </button>
              </div>
              {printer.agent.phase === "missing" && printer.agent.message ? <p className="rounded-lg bg-[#fff6e1] p-2.5 text-[#855815]">{printer.agent.message}</p> : null}
              {printer.agent.phase === "running" ? (
                <label className="block text-[11px] font-semibold text-[#526368]">
                  Windows printer to use for labels
                  <select
                    className={`${field} mt-1`}
                    value={printer.live?.via === "agent" ? printer.live.queue || "" : printer.agentPrinter}
                    onChange={(event) => event.target.value && void run("pick", async () => ((await selectAgentPrinter(event.target.value)) ? `Using “${event.target.value}”.` : "That printer is no longer in Windows."))}
                  >
                    <option value="">Choose the TSC label printer…</option>
                    {printer.agent.printers.map((item) => (
                      <option key={item.name} value={item.name}>{item.name}{item.likelyTsc ? " — label printer" : ""}{item.offline ? " (offline)" : ""}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <ol className="list-decimal space-y-1 pl-5">
                <li>Press <strong>Download installer</strong> and open the file (Chrome may ask you to keep it; Windows may say “protected your PC” — choose <em>More info → Run anyway</em>).</li>
                <li>A black window shows the printers Windows has and says the agent is running.</li>
                <li>Come back here, press <strong>Detect agent</strong>, and click <strong>Allow</strong> when Chrome asks to let this site reach apps on this device.</li>
                <li>Pick the TSC printer above (or it picks it by itself when it is the only one), then <strong>Print test label</strong>.</li>
              </ol>
              <p className="text-[11px] text-[#718087]">Safe by design: it listens only on this PC, accepts requests only from this website, and cannot be used from other computers. To remove it, run the installer again from a command line with the word <code>uninstall</code>.</p>
            </div>
          </details>

          <details className="rounded-xl border border-[#263f44]/10 p-3">
            <summary className="cursor-pointer text-xs font-bold text-[#315d57]">Advanced — connect directly over USB (WinUSB driver)</summary>
            <div className="mt-3 space-y-2 text-xs leading-5 text-[#526368]">
              <p>Only if you do <strong>not</strong> need the TSC Windows driver for this printer. Windows gives a USB printer to one driver; with the TSC driver installed the browser cannot open it (you will see “Another program or the Windows printer driver is holding the printer”).</p>
              <p>On Windows, switch this printer to the <strong>WinUSB</strong> driver once with the free <em>Zadig</em> tool (zadig.akeo.ie → Options → List all devices → pick the TSC printer → WinUSB → Replace Driver). The TSC driver then no longer works for it. Mac, Linux and Chromebook need nothing.</p>
              <button type="button" disabled={Boolean(busy) || printer.phase === "unsupported"} onClick={() => void run("usb", async () => ((await connectUsbDirect()) ? "Printer connected over USB." : undefined))} className="inline-flex items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#17353c] disabled:opacity-50">
                <Usb className="h-3.5 w-3.5" /> Connect directly over USB
              </button>
            </div>
          </details>

          <details className="rounded-xl border border-[#263f44]/10 p-3">
            <summary className="cursor-pointer text-xs font-bold text-[#315d57]">Prefer the browser print dialog?</summary>
            <p className="mt-3 text-xs leading-5 text-[#526368]">
              Choose <em>Browser print dialog</em> under “How tags are printed” above, create the label size in the TSC driver (Printing Preferences → Stocks → User defined: width, height, gap), pick “Actual size / 100 %” with no headers in the browser dialog, and calibrate the sensor. For no dialog at all, start Chrome with <code>--kiosk-printing</code> and set the TSC printer as the Windows default.
            </p>
          </details>
        </div>
      ) : null}
    </section>
  );
}
