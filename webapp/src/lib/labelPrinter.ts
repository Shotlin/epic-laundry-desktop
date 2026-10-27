import { agentPrint, agentProblems, probeAgent, type AgentPrinter, type AgentSnapshot, type AgentUsbDevice } from "@/lib/printAgent";
import { DEFAULT_MEDIA, STATUS_QUERY, decodeStatus, type PrinterCondition, type TsplMedia } from "@/lib/tspl";

/**
 * The label printer connection (TSC TTP-244 Pro / TE244 and other TSPL printers), over WebUSB.
 *
 * Why this exists: a website cannot see the Windows / macOS printer list or talk to a USB port on its own,
 * so every tag used to go through the browser print dialog — which depends on the OS driver having the
 * right label size and knows nothing about the printer. With WebUSB the browser is granted the printer
 * ONCE (a browser permission that belongs to the site, not to a login) and from then on the page can
 * reconnect by itself, send TSPL, and read the printer's real state. Nothing here is tied to a user
 * account, so signing out and in as someone else keeps the printer connected.
 *
 * Two ways in, tried in this order:
 *  1. WebUSB — straight to the USB port. Needs the printer on the WinUSB driver on Windows (Windows hands a
 *     USB printer to exactly one driver, and TSC's printer driver blocks the browser from opening it).
 *  2. The LNDRY Print Agent — a small helper on the shop PC that prints through the Windows driver that is
 *     already installed (see printAgent.ts). This is the route for a PC that keeps the TSC driver.
 * Requires Chrome / Edge / Opera over HTTPS.
 */

// ── minimal WebUSB typings (the project does not ship @types/w3c-web-usb) ─────────────────────────
type UsbEndpoint = { endpointNumber: number; direction: "in" | "out"; type: "bulk" | "interrupt" | "isochronous"; packetSize: number };
type UsbAlternate = { alternateSetting: number; interfaceClass: number; endpoints: UsbEndpoint[] };
type UsbInterface = { interfaceNumber: number; claimed: boolean; alternates: UsbAlternate[]; alternate: UsbAlternate };
type UsbDevice = {
  vendorId: number;
  productId: number;
  productName?: string | null;
  manufacturerName?: string | null;
  serialNumber?: string | null;
  opened: boolean;
  configuration: { configurationValue: number; interfaces: UsbInterface[] } | null;
  configurations: unknown[];
  open(): Promise<void>;
  close(): Promise<void>;
  reset(): Promise<void>;
  forget?(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(number: number): Promise<void>;
  releaseInterface(number: number): Promise<void>;
  selectAlternateInterface(number: number, alternate: number): Promise<void>;
  clearHalt(direction: "in" | "out", endpoint: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: "ok" | "stall" | "babble"; bytesWritten: number }>;
  transferIn(endpoint: number, length: number): Promise<{ status: "ok" | "stall" | "babble"; data?: DataView }>;
};
type UsbApi = {
  getDevices(): Promise<UsbDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId?: number; classCode?: number }> }): Promise<UsbDevice>;
  addEventListener(type: "connect" | "disconnect", listener: (event: { device: UsbDevice }) => void): void;
};

const TSC_VENDOR_ID = 0x1203;
const PRINTER_CLASS = 0x07;
const CHUNK = 16 * 1024;
const FILTERS = [{ vendorId: TSC_VENDOR_ID }, { classCode: PRINTER_CLASS }];

export type PrinterIdentity = {
  vendorId: number;
  productId: number;
  manufacturer: string;
  model: string;
  /** USB serial number the printer reports; some units report none. */
  serial: string;
  recognised: boolean;
  /** How this printer is reached: straight over USB, or through the Windows driver via the print agent. */
  via?: "usb" | "agent";
  /** Windows print queue name (agent route). */
  queue?: string;
};

export type AgentState = {
  /** unknown = not asked yet; missing = no answer; running = answered. */
  phase: "unknown" | "missing" | "running";
  version: string;
  machine: string;
  printers: AgentPrinter[];
  usbDevices: AgentUsbDevice[];
  message: string;
};

export type PrinterPhase = "unsupported" | "disconnected" | "connecting" | "connected" | "error";

export type PrinterState = {
  phase: PrinterPhase;
  /** Why it is unsupported / what went wrong, in words an operator can act on. */
  message: string;
  /** The printer opened right now (live). */
  live: PrinterIdentity | null;
  /** The printer this computer was last connected to — shown while it is unplugged or switched off. */
  remembered: (PrinterIdentity & { lastConnectedAt: string }) | null;
  condition: PrinterCondition | null;
  conditionAt: number;
  lastPrintAt: number;
  media: TsplMedia;
  agent: AgentState;
  /** The Windows print queue chosen for the agent route. */
  agentPrinter: string;
  /** "direct" sends labels straight to the printer when it is connected; "dialog" always uses the browser dialog. */
  mode: "direct" | "dialog";
};

const REMEMBER_KEY = "epic-label-printer-v1";
const PREFS_KEY = "epic-label-printer-prefs-v1";

type Prefs = { media: TsplMedia; mode: "direct" | "dialog"; agentPrinter?: string };

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the choice simply is not remembered on this computer */
  }
}

function loadPrefs(): Prefs {
  const saved = readJson<Partial<Prefs>>(PREFS_KEY);
  return { media: { ...DEFAULT_MEDIA, ...(saved?.media || {}) }, mode: saved?.mode === "dialog" ? "dialog" : "direct", agentPrinter: saved?.agentPrinter || "" };
}

export function usbSupport(): { ok: boolean; reason: string } {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { ok: false, reason: "Not running in a browser." };
  if (!window.isSecureContext) return { ok: false, reason: "USB printing needs a secure (https) page." };
  if (!(navigator as unknown as { usb?: UsbApi }).usb) {
    return { ok: false, reason: "This browser cannot talk to USB printers. Open the website in Google Chrome or Microsoft Edge on the computer the printer is plugged into." };
  }
  return { ok: true, reason: "" };
}

const usbApi = () => (navigator as unknown as { usb?: UsbApi }).usb;

export function identify(device: UsbDevice): PrinterIdentity {
  const manufacturer = (device.manufacturerName || (device.vendorId === TSC_VENDOR_ID ? "TSC Auto ID Technology" : "")).trim();
  const named = (device.productName || "").trim();
  const model = named || (device.vendorId === TSC_VENDOR_ID ? "TSC label printer" : "USB label printer");
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    manufacturer,
    model: device.vendorId === TSC_VENDOR_ID && !/^tsc\b/i.test(model) ? `TSC ${model}` : model,
    serial: (device.serialNumber || "").trim(),
    recognised: device.vendorId === TSC_VENDOR_ID || /tsc|ttp-|tdp-|te2|te3/i.test(named),
    via: "usb",
  };
}

// ── state store ──────────────────────────────────────────────────────────────────────────────────
const initialPrefs: Prefs = typeof window === "undefined" ? { media: DEFAULT_MEDIA, mode: "direct" } : loadPrefs();
const NO_AGENT: AgentState = { phase: "unknown", version: "", machine: "", printers: [], usbDevices: [], message: "" };
let state: PrinterState = {
  phase: "disconnected",
  message: "",
  live: null,
  remembered: typeof window === "undefined" ? null : readJson(REMEMBER_KEY),
  condition: null,
  conditionAt: 0,
  lastPrintAt: 0,
  media: initialPrefs.media,
  mode: initialPrefs.mode,
  agent: NO_AGENT,
  agentPrinter: initialPrefs.agentPrinter || "",
};
const listeners = new Set<() => void>();
function setState(patch: Partial<PrinterState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
export const subscribePrinter = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getPrinterState = () => state;

export function updatePrinterPrefs(patch: { media?: Partial<TsplMedia>; mode?: "direct" | "dialog" }) {
  const media = { ...state.media, ...(patch.media || {}) };
  const mode = patch.mode || state.mode;
  setState({ media, mode });
  savePrefs();
}

function savePrefs() {
  writeJson(PREFS_KEY, { media: state.media, mode: state.mode, agentPrinter: state.agentPrinter });
}

// ── the open connection ──────────────────────────────────────────────────────────────────────────
type Link = { device: UsbDevice; interfaceNumber: number; out: number; in?: number };
let link: Link | null = null;
let opening: Promise<boolean> | null = null;
let queue: Promise<unknown> = Promise.resolve();
/** The operator pressed Disconnect: stay disconnected until they press Reconnect / Connect. */
let paused = false;
/** The Windows print agent is only probed once the operator has asked for it (Chrome prompts for local access). */
let agentAsked = false;

const USB_HELD =
  "The Windows printer driver is holding the printer, so the browser cannot open it directly over USB. Use the LNDRY Print Agent below — it prints through the TSC driver you already have, nothing to remove.";

const describeUsbError = (error: unknown) => {
  const name = (error as { name?: string })?.name || "";
  const text = error instanceof Error ? error.message : String(error);
  if (name === "NotFoundError") return "No printer was chosen, or the browser sees no USB printer it can use.";
  if (name === "SecurityError" || /access denied|claim|busy/i.test(text)) return USB_HELD;
  if (name === "NetworkError" || /disconnected|no such device|lost/i.test(text)) return "The printer was unplugged or switched off.";
  return text || "The printer could not be opened.";
};

async function openDevice(device: UsbDevice): Promise<Link> {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  const interfaces = device.configuration?.interfaces || [];
  const pick = (interfaceClass?: number) => {
    for (const face of interfaces) {
      for (const alternate of face.alternates) {
        if (interfaceClass !== undefined && alternate.interfaceClass !== interfaceClass) continue;
        const out = alternate.endpoints.find((endpoint) => endpoint.direction === "out" && endpoint.type === "bulk");
        if (out) return { face, alternate, out, input: alternate.endpoints.find((endpoint) => endpoint.direction === "in" && endpoint.type === "bulk") };
      }
    }
    return null;
  };
  const chosen = pick(PRINTER_CLASS) || pick();
  if (!chosen) throw new Error("This USB device has no printer data endpoint.");
  if (!chosen.face.claimed) await device.claimInterface(chosen.face.interfaceNumber);
  if (chosen.alternate.alternateSetting !== chosen.face.alternate.alternateSetting) {
    await device.selectAlternateInterface(chosen.face.interfaceNumber, chosen.alternate.alternateSetting);
  }
  return { device, interfaceNumber: chosen.face.interfaceNumber, out: chosen.out.endpointNumber, in: chosen.input?.endpointNumber };
}

function remember(identity: PrinterIdentity) {
  const remembered = { ...identity, lastConnectedAt: new Date().toISOString() };
  writeJson(REMEMBER_KEY, remembered);
  return remembered;
}

async function adopt(device: UsbDevice): Promise<boolean> {
  setState({ phase: "connecting", message: "" });
  try {
    link = await openDevice(device);
    const identity = identify(device);
    setState({ phase: "connected", message: "", live: identity, remembered: remember(identity) });
    void refreshCondition();
    return true;
  } catch (error) {
    link = null;
    try {
      if (device.opened) await device.close();
    } catch {
      /* already gone */
    }
    setState({ phase: "error", message: describeUsbError(error), live: null });
    return false;
  }
}

/** The authorised device that is the remembered printer (same serial / ids), else the only / first TSC one. */
async function findAuthorised(): Promise<UsbDevice | null> {
  const api = usbApi();
  if (!api) return null;
  const devices = await api.getDevices();
  if (!devices.length) return null;
  const known = state.remembered?.via === "agent" ? null : state.remembered;
  const match =
    (known && devices.find((device) => device.vendorId === known.vendorId && device.productId === known.productId && (device.serialNumber || "") === known.serial)) ||
    (known && devices.find((device) => device.vendorId === known.vendorId && device.productId === known.productId)) ||
    devices.find((device) => device.vendorId === TSC_VENDOR_ID) ||
    devices[0];
  return match || null;
}

// ── the Windows print agent route ────────────────────────────────────────────────────────────────
const isAgentLive = () => state.phase === "connected" && state.live?.via === "agent";
const isLive = () => isAgentLive() || (state.phase === "connected" && Boolean(link?.device.opened));
const agentWanted = () => agentAsked || Boolean(state.agentPrinter) || state.remembered?.via === "agent";

function agentCondition(printer: AgentPrinter): PrinterCondition {
  const problems = agentProblems(printer);
  return { ready: !problems.length && printer.state !== 4, printing: printer.state === 4, problems };
}

function agentIdentity(printer: AgentPrinter, usbDevices: AgentUsbDevice[]): PrinterIdentity {
  // Windows does not link a print queue to its USB device; with exactly one TSC USB device present it is this one.
  const one = usbDevices.length === 1 ? usbDevices[0] : undefined;
  const named = /TTP|TDP|TE\d{3}|TC\d{3}/i.test(printer.driver) ? printer.driver : printer.name;
  return {
    vendorId: one ? parseInt(one.vid, 16) : 0,
    productId: one && one.pid ? parseInt(one.pid, 16) : 0,
    manufacturer: "TSC Auto ID Technology (through the Windows driver)",
    model: named,
    serial: one?.serial || "",
    recognised: printer.likelyTsc,
    via: "agent",
    queue: printer.name,
  };
}

function pickAgentPrinter(snapshot: AgentSnapshot): AgentPrinter | null {
  const byName = (name: string) => snapshot.printers.find((printer) => printer.name === name) || null;
  const saved = state.agentPrinter ? byName(state.agentPrinter) : null;
  if (saved) return saved;
  const known = state.remembered?.via === "agent" && state.remembered.queue ? byName(state.remembered.queue) : null;
  if (known) return known;
  const tsc = snapshot.printers.filter((printer) => printer.likelyTsc);
  return tsc.length === 1 ? tsc[0] : null;
}

function adoptAgent(printer: AgentPrinter, snapshot: AgentSnapshot) {
  const identity = agentIdentity(printer, snapshot.usbDevices);
  setState({
    phase: "connected",
    message: "",
    live: identity,
    remembered: remember(identity),
    condition: agentCondition(printer),
    conditionAt: Date.now(),
    agentPrinter: printer.name,
  });
  savePrefs();
}

function recordAgent(snapshot: AgentSnapshot) {
  setState({ agent: { phase: "running", version: snapshot.version, machine: snapshot.machine, printers: snapshot.printers, usbDevices: snapshot.usbDevices, message: "" } });
}

async function reconnectAgent(): Promise<boolean> {
  const probe = await probeAgent();
  if (!probe.ok) {
    setState({ agent: { ...NO_AGENT, phase: "missing", message: probe.reason } });
    return false;
  }
  recordAgent(probe.snapshot);
  const printer = pickAgentPrinter(probe.snapshot);
  if (!printer) {
    setState({
      phase: "disconnected",
      live: null,
      message: probe.snapshot.printers.length ? "The print agent is running — choose your label printer below." : "The print agent is running, but Windows has no printers installed.",
    });
    return false;
  }
  await dropLink();
  adoptAgent(printer, probe.snapshot);
  return true;
}

/** Re-checks an agent connection: still answering, queue still there, what Windows says about it. */
async function verifyAgent(): Promise<boolean> {
  const probe = await probeAgent();
  const queueName = state.live?.queue;
  const printer = probe.ok ? probe.snapshot.printers.find((item) => item.name === queueName) : undefined;
  if (!probe.ok || !printer) {
    setState({
      phase: "disconnected",
      live: null,
      condition: null,
      message: probe.ok ? `Windows no longer has a printer called "${queueName}".` : "The LNDRY Print Agent stopped answering — it starts by itself when Windows starts; run the installer again if it does not.",
      agent: probe.ok ? state.agent : { ...NO_AGENT, phase: "missing", message: probe.reason },
    });
    return false;
  }
  recordAgent(probe.snapshot);
  setState({ condition: agentCondition(printer), conditionAt: Date.now() });
  return true;
}

async function reconnectUsb(): Promise<boolean> {
  const support = usbSupport();
  if (!support.ok) {
    setState({ phase: "unsupported", message: support.reason });
    return false;
  }
  if (link?.device.opened) return true;
  try {
    const device = await findAuthorised();
    if (!device) {
      setState({ phase: "disconnected", message: state.remembered?.via === "usb" ? "The printer is not plugged in or is switched off." : "", live: null });
      return false;
    }
    return await adopt(device);
  } catch (error) {
    setState({ phase: "error", message: describeUsbError(error), live: null });
    return false;
  }
}

/**
 * Reconnects to the printer this computer already uses — no click, no picker, no login. Direct USB first,
 * then the Windows print agent (when it has been set up). Safe to call from anywhere, any number of times.
 */
export function reconnectPrinter(): Promise<boolean> {
  if (paused) return Promise.resolve(false);
  if (opening) return opening;
  opening = (async () => {
    if (isAgentLive()) return verifyAgent();
    if (link?.device.opened) return true;
    if (await reconnectUsb()) return true;
    if (agentWanted()) return reconnectAgent();
    return false;
  })().finally(() => {
    opening = null;
  });
  return opening;
}

/** The Reconnect button: undoes a Disconnect and reconnects. */
export function resumePrinter(): Promise<boolean> {
  paused = false;
  return reconnectPrinter();
}

/** Connect button. Uses the Windows print agent when it is running (no picker); otherwise the USB picker. */
export async function connectPrinter(): Promise<boolean> {
  paused = false;
  agentAsked = true;
  if (await reconnectAgent()) return true;
  // Agent is running but could not choose a printer: the operator picks one below — do not open the USB picker.
  if (state.agent.phase === "running") return false;
  return connectUsbDirect();
}

/** First-time direct USB connect (or choose another USB printer): shows the browser's device picker. Needs a click. */
export async function connectUsbDirect(): Promise<boolean> {
  paused = false;
  const support = usbSupport();
  if (!support.ok) {
    setState({ phase: "unsupported", message: support.reason });
    return false;
  }
  try {
    const device = await usbApi()!.requestDevice({ filters: FILTERS });
    await dropLink();
    return await adopt(device);
  } catch (error) {
    if ((error as { name?: string })?.name === "NotFoundError" && isLive()) return true;
    setState({ phase: isLive() ? "connected" : "error", message: describeUsbError(error) });
    return false;
  }
}

/** "Detect agent" button: asks the helper on this computer which printers Windows has. */
export async function detectAgent(): Promise<boolean> {
  paused = false;
  agentAsked = true;
  return reconnectAgent();
}

/** Use this Windows printer (agent route). */
export async function selectAgentPrinter(name: string): Promise<boolean> {
  paused = false;
  agentAsked = true;
  const probe = await probeAgent();
  if (!probe.ok) {
    setState({ agent: { ...NO_AGENT, phase: "missing", message: probe.reason } });
    return false;
  }
  recordAgent(probe.snapshot);
  const printer = probe.snapshot.printers.find((item) => item.name === name);
  if (!printer) return false;
  await dropLink();
  adoptAgent(printer, probe.snapshot);
  return true;
}

async function dropLink() {
  const current = link;
  link = null;
  if (!current) return;
  try {
    await current.device.releaseInterface(current.interfaceNumber);
  } catch {
    /* already released */
  }
  try {
    await current.device.close();
  } catch {
    /* already closed */
  }
}

/** Disconnects on this computer (and stays disconnected). Keeps the browser permission / chosen printer. */
export async function disconnectPrinter() {
  paused = true;
  await dropLink();
  setState({ phase: "disconnected", message: "Disconnected on this computer.", live: null, condition: null });
}

/** Removes the browser permission and the remembered printer entirely (the next connect starts from scratch). */
export async function forgetPrinter() {
  paused = false;
  const device = link?.device;
  await dropLink();
  try {
    await device?.forget?.();
  } catch {
    /* older Chrome: the permission can be removed from the site settings */
  }
  try {
    window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* nothing to remove */
  }
  setState({ phase: "disconnected", message: "", live: null, remembered: null, condition: null, agentPrinter: "" });
  savePrefs();
}

/** Runs one job at a time so two print requests never interleave their bytes on the wire. */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

async function write(data: Uint8Array) {
  const current = link;
  if (!current) throw new Error("The printer is not connected.");
  for (let offset = 0; offset < data.length; offset += CHUNK) {
    const part = data.subarray(offset, Math.min(data.length, offset + CHUNK));
    let result = await current.device.transferOut(current.out, part as unknown as BufferSource);
    if (result.status === "stall") {
      await current.device.clearHalt("out", current.out);
      result = await current.device.transferOut(current.out, part as unknown as BufferSource);
    }
    if (result.status !== "ok") throw new Error("The printer stopped accepting data.");
  }
}

/** One delivery over whichever route is live right now. */
async function deliver(data: Uint8Array) {
  if (isAgentLive()) {
    try {
      await agentPrint(state.live!.queue!, data);
    } catch (error) {
      const unreachable = error instanceof TypeError || (error as { name?: string })?.name === "AbortError";
      throw new Error(unreachable ? "The LNDRY Print Agent stopped answering." : error instanceof Error ? error.message : "The print agent could not print.");
    }
    return;
  }
  await write(data);
}

/** Sends raw TSPL bytes; reconnects once if the link was lost. Resolves when the printer / Windows has accepted every byte. */
export function sendToPrinter(data: Uint8Array): Promise<void> {
  return serial(async () => {
    if (!isLive() && !(await reconnectPrinter())) throw new Error(state.message || "The label printer is not connected.");
    try {
      await deliver(data);
    } catch (first) {
      // One retry on a fresh link: covers a cable that was re-plugged between two prints.
      await dropLink();
      setState({ phase: "disconnected" });
      if (!(await reconnectPrinter())) throw new Error(first instanceof Error ? first.message : describeUsbError(first));
      await deliver(data);
    }
    setState({ lastPrintAt: Date.now() });
  });
}

/** Asks the printer for its status byte (USB) or Windows for the queue's state (agent). Null when unknown. */
export async function readPrinterCondition(): Promise<PrinterCondition | null> {
  if (isAgentLive()) {
    const probe = await probeAgent();
    if (!probe.ok) return null;
    const printer = probe.snapshot.printers.find((item) => item.name === state.live?.queue);
    return printer ? agentCondition(printer) : null;
  }
  return serial(async () => {
    const current = link;
    if (!current?.in) return null;
    try {
      await write(STATUS_QUERY);
      const reply = await Promise.race([
        current.device.transferIn(current.in, 8),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1200)),
      ]);
      if (!reply || reply.status !== "ok" || !reply.data?.byteLength) return null;
      return decodeStatus(reply.data.getUint8(0));
    } catch {
      return null;
    }
  });
}

export async function refreshCondition() {
  const condition = await readPrinterCondition();
  setState({ condition, conditionAt: Date.now() });
  return condition;
}

// ── start-up: plug-and-play + survive reloads, logins and cable pulls ────────────────────────────
let started = false;
export function startLabelPrinter() {
  if (started || typeof window === "undefined") return;
  started = true;
  const support = usbSupport();
  if (!support.ok) setState({ phase: "unsupported", message: support.reason });
  void reconnectPrinter();
  if (support.ok) {
    const api = usbApi()!;
    api.addEventListener("connect", () => void reconnectPrinter());
    api.addEventListener("disconnect", (event) => {
      if (link && link.device === event.device) {
        link = null;
        setState({ phase: "disconnected", message: "The printer was unplugged or switched off — plug it back in and it reconnects by itself.", live: null, condition: null });
      }
    });
  }
  // A laptop waking up or the tab coming back is the usual moment a link has gone stale.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !isLive()) void reconnectPrinter();
  });
  let tick = 0;
  window.setInterval(() => {
    if (document.visibilityState !== "visible" || state.phase === "connecting") return;
    tick += 1;
    // Connected through the agent: refresh what Windows says every 15 s. Not connected: look again every 30 s.
    if (isAgentLive() || (tick % 2 === 0 && !isLive())) void reconnectPrinter();
  }, 15_000);
}
