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
 * Requires Chrome / Edge / Opera (WebUSB) over HTTPS. On Windows the printer must use the WinUSB driver
 * instead of TSC's printer driver (see the setup guide in the panel) — Windows hands a USB printer to
 * exactly one driver and the print-spooler driver blocks the browser from opening it.
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
  /** Raw model name when the printer did not give one. */
  recognised: boolean;
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
  /** "direct" sends labels straight to the printer when it is connected; "dialog" always uses the browser dialog. */
  mode: "direct" | "dialog";
};

const REMEMBER_KEY = "epic-label-printer-v1";
const PREFS_KEY = "epic-label-printer-prefs-v1";

type Prefs = { media: TsplMedia; mode: "direct" | "dialog" };

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
  return { media: { ...DEFAULT_MEDIA, ...(saved?.media || {}) }, mode: saved?.mode === "dialog" ? "dialog" : "direct" };
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
  };
}

// ── state store ──────────────────────────────────────────────────────────────────────────────────
const initialPrefs = typeof window === "undefined" ? { media: DEFAULT_MEDIA, mode: "direct" as const } : loadPrefs();
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
  writeJson(PREFS_KEY, { media, mode });
  setState({ media, mode });
}

// ── the open connection ──────────────────────────────────────────────────────────────────────────
type Link = { device: UsbDevice; interfaceNumber: number; out: number; in?: number };
let link: Link | null = null;
let opening: Promise<boolean> | null = null;
let queue: Promise<unknown> = Promise.resolve();

const describeUsbError = (error: unknown) => {
  const name = (error as { name?: string })?.name || "";
  const text = error instanceof Error ? error.message : String(error);
  if (name === "NotFoundError") return "No printer was chosen, or the browser sees no USB printer it can use. On Windows the printer must be switched to the WinUSB driver first (see the setup guide).";
  if (name === "SecurityError" || /access denied|claim|busy/i.test(text)) {
    return "Another program or the Windows printer driver is holding the printer. Close other label software, or switch the printer to the WinUSB driver (see the setup guide), then connect again.";
  }
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
  const known = state.remembered;
  const match =
    (known && devices.find((device) => device.vendorId === known.vendorId && device.productId === known.productId && (device.serialNumber || "") === known.serial)) ||
    (known && devices.find((device) => device.vendorId === known.vendorId && device.productId === known.productId)) ||
    devices.find((device) => device.vendorId === TSC_VENDOR_ID) ||
    devices[0];
  return match || null;
}

/**
 * Reconnects to a printer this browser was already allowed to use — no click, no picker, no login.
 * Safe to call from anywhere, any number of times.
 */
export function reconnectPrinter(): Promise<boolean> {
  const support = usbSupport();
  if (!support.ok) {
    setState({ phase: "unsupported", message: support.reason });
    return Promise.resolve(false);
  }
  if (link?.device.opened) return Promise.resolve(true);
  if (opening) return opening;
  opening = (async () => {
    try {
      const device = await findAuthorised();
      if (!device) {
        setState({ phase: "disconnected", message: state.remembered ? "The printer is not plugged in or is switched off." : "", live: null });
        return false;
      }
      return await adopt(device);
    } catch (error) {
      setState({ phase: "error", message: describeUsbError(error), live: null });
      return false;
    }
  })().finally(() => {
    opening = null;
  });
  return opening;
}

/** First-time connect (or choose another printer): shows the browser's own device picker. Needs a click. */
export async function connectPrinter(): Promise<boolean> {
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
    if ((error as { name?: string })?.name === "NotFoundError" && state.phase === "connected") return true;
    setState({ phase: state.live ? "connected" : "error", message: describeUsbError(error) });
    return false;
  }
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

/** Closes the link but keeps the browser permission, so Reconnect needs no picker. */
export async function disconnectPrinter() {
  await dropLink();
  setState({ phase: "disconnected", message: "Disconnected on this computer.", live: null, condition: null });
}

/** Removes the browser permission and the remembered printer entirely (the next connect shows the picker again). */
export async function forgetPrinter() {
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
  setState({ phase: "disconnected", message: "", live: null, remembered: null, condition: null });
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

/** Sends raw TSPL bytes; reconnects once if the link was lost. Resolves when the printer has accepted every byte. */
export function sendToPrinter(data: Uint8Array): Promise<void> {
  return serial(async () => {
    if (!link?.device.opened && !(await reconnectPrinter())) throw new Error(state.message || "The label printer is not connected.");
    try {
      await write(data);
    } catch (first) {
      // One retry on a fresh link: covers a cable that was re-plugged between two prints.
      await dropLink();
      if (!(await reconnectPrinter())) throw new Error(describeUsbError(first));
      await write(data);
    }
    setState({ lastPrintAt: Date.now() });
  });
}

/** Asks the printer for its status byte. Null when it does not answer (some firmware / interface setups). */
export function readPrinterCondition(): Promise<PrinterCondition | null> {
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
  if (!support.ok) {
    setState({ phase: "unsupported", message: support.reason });
    return;
  }
  const api = usbApi()!;
  void reconnectPrinter();
  api.addEventListener("connect", () => void reconnectPrinter());
  api.addEventListener("disconnect", (event) => {
    if (link && link.device === event.device) {
      link = null;
      setState({ phase: "disconnected", message: "The printer was unplugged or switched off — plug it back in and it reconnects by itself.", live: null, condition: null });
    }
  });
  // A laptop waking up or the tab coming back is the usual moment a link has gone stale.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !link?.device.opened) void reconnectPrinter();
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible" && !link?.device.opened && state.phase !== "connecting") void reconnectPrinter();
  }, 15_000);
}
