/**
 * Client for the LNDRY Print Agent — a tiny helper that runs on the shop's Windows PC (see
 * webapp/print-agent/) and hands raw label commands to a printer through the Windows driver that is
 * ALREADY installed. This is how the website prints to a TSC TTP-244 / TE244 without removing the TSC
 * driver: WebUSB cannot open a printer the Windows driver owns, but the Windows print spooler can.
 *
 * The agent listens on this computer's loopback address only and accepts requests only from this website's origin.
 * Chrome shows a one-time "access other apps and services on this device" prompt the first time.
 */

export const AGENT_PORT = 9271;
const BASE = `http://localhost:${AGENT_PORT}`;

export type AgentPrinter = {
  /** Windows print queue name — what the agent prints to. */
  name: string;
  driver: string;
  port: string;
  isDefault: boolean;
  offline: boolean;
  /** Win32_Printer.PrinterStatus: 3 idle, 4 printing, 7 offline … */
  state: number;
  /** Win32_Printer.DetectedErrorState: 4 no paper, 7 door open, 8 jammed, 9 offline … */
  detectedError: number;
  likelyTsc: boolean;
  usb: boolean;
};

export type AgentUsbDevice = { name: string; vid: string; pid: string; serial: string; status: string };

export type AgentSnapshot = { version: string; machine: string; printers: AgentPrinter[]; usbDevices: AgentUsbDevice[] };

export type AgentProbe = { ok: true; snapshot: AgentSnapshot } | { ok: false; reason: string };

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal, cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    if (!response.ok || body.ok === false) throw new Error(body.error || `The print agent answered ${response.status}.`);
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Asks the agent who it is and which printers Windows has. Never throws. */
export async function probeAgent(): Promise<AgentProbe> {
  if (typeof window === "undefined") return { ok: false, reason: "Not running in a browser." };
  try {
    const [status, printers] = await Promise.all([call<{ version: string; machine: string }>("/status"), call<{ printers: AgentPrinter[]; usbDevices: AgentUsbDevice[] }>("/printers")]);
    return { ok: true, snapshot: { version: status.version, machine: status.machine, printers: printers.printers || [], usbDevices: printers.usbDevices || [] } };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === "AbortError";
    const refused = error instanceof TypeError || aborted;
    return {
      ok: false,
      reason: refused
        ? "The LNDRY Print Agent did not answer. Make sure it is installed and running on this computer, and that Chrome is allowed to reach it (click Allow on the \"access other apps and services on this device\" prompt, or lock icon → Site settings → Local network access)."
        : error instanceof Error
          ? error.message
          : "The print agent returned an error.",
    };
  }
}

/** Sends raw printer commands to a Windows print queue as a RAW job. */
export async function agentPrint(queue: string, data: Uint8Array, jobName = "LNDRY labels"): Promise<void> {
  const body = new Blob([data as unknown as BlobPart], { type: "application/octet-stream" });
  await call(`/print?printer=${encodeURIComponent(queue)}&job=${encodeURIComponent(jobName)}`, { method: "POST", body }, 30_000);
}

/** Printer problems Windows itself can report (it cannot read the label printer's own status byte). */
export function agentProblems(printer: AgentPrinter): string[] {
  const problems: string[] = [];
  if (printer.offline || printer.state === 7 || printer.detectedError === 9) problems.push("Windows shows the printer offline — check power and the USB cable");
  if (printer.detectedError === 4) problems.push("out of labels");
  if (printer.detectedError === 7) problems.push("cover is open");
  if (printer.detectedError === 8) problems.push("label jam");
  if (printer.state === 6 || printer.state === 8) problems.push("the Windows print queue is paused or stopped");
  return problems;
}
