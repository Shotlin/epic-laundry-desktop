// Website build only. Counter settings (service units, order series, message templates, zones,
// store packages, print/UPI preferences, route runs) are saved on the LNDRY server so every
// computer and staff member of a shop sees the same values. Before this they were kept only in
// the browser. Reads are synchronous from an in-memory copy that `ensureServerSettings` fills
// (adapters call it first); saves go to the server with the version last read, so two computers
// saving at once are detected instead of one silently overwriting the other.
//
// Anything a browser saved under the old local keys is still shown until the first server save
// of that setting, so nothing an operator already set up disappears on upgrade.
import type { Real } from './core'

export type SettingKey = 'print-settings' | 'upi-qr' | 'service-zones' | 'message-templates' | 'order-no-series' | 'store-packages' | 'service-units' | 'route-runs'

const LEGACY_KEY: Record<SettingKey, (branch: string) => string> = {
  'print-settings': () => 'epic-web-print-settings-v1',
  'upi-qr': (branch) => `epic-web-upi-qr-settings-v1:${encodeURIComponent(branch)}`,
  'service-zones': () => 'epic-web-service-zones-v1',
  'message-templates': (branch) => `epic-web-message-templates-v1:${branch}`,
  'order-no-series': (branch) => `epic-web-order-no-series-v1:${branch}`,
  'store-packages': (branch) => `epic-web-store-packages-v1:${encodeURIComponent(branch)}`,
  'service-units': (branch) => `epic-web-service-units-v1:${encodeURIComponent(branch)}`,
  'route-runs': () => 'epic-web-routes-v1',
}

type Entry = { value: unknown; version: number }
const REFRESH_AFTER_MS = 30_000

let cache: Record<string, Entry> = {}
let loadedAt = 0
let branch = 'store'
let inflight: Promise<void> | null = null

function readLegacy(key: SettingKey): unknown {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY[key](branch))
    if (raw) return JSON.parse(raw)
    // The first UPI id was stored inside the shared print settings before it got its own key.
    if (key === 'upi-qr') {
      const shared = JSON.parse(window.localStorage.getItem(LEGACY_KEY['print-settings'](branch)) || '{}') as Record<string, unknown>
      if (typeof shared.upiId === 'string' || typeof shared.qrOnPrint === 'boolean') return { upiId: String(shared.upiId || ''), qrOnPrint: shared.qrOnPrint !== false }
    }
  } catch { /* private/locked storage: nothing to carry over */ }
  return undefined
}

/** Load (or refresh, at most every 30 s) the shop's saved settings. Safe to call from every handler. */
export function ensureServerSettings(get: Real['get'], options: { force?: boolean } = {}): Promise<void> {
  if (!options.force && loadedAt && Date.now() - loadedAt < REFRESH_AFTER_MS) return Promise.resolve()
  if (inflight) return inflight
  inflight = (async () => {
    const [profile, data] = await Promise.all([
      get('/vendor/profile').catch(() => ({})),
      get('/vendor/pos-settings'),
    ])
    branch = String(profile?.id || profile?.branch_code || 'store')
    const settings = (data?.settings || {}) as Record<string, { value: unknown; version: number }>
    cache = Object.fromEntries(Object.entries(settings).map(([key, entry]) => [key, { value: entry.value, version: Number(entry.version) || 0 }]))
    loadedAt = Date.now()
  })().finally(() => { inflight = null })
  return inflight
}

/** Forget the in-memory copy (after sign-out, or after a save conflict). */
export function resetServerSettings() { cache = {}; loadedAt = 0 }

/** The saved value, else what this browser used to hold, else `fallback`. Call `ensureServerSettings` first. */
export function settingValue<T>(key: SettingKey, fallback: T): T {
  const saved = cache[key]
  if (saved && saved.value !== null && saved.value !== undefined) return saved.value as T
  const legacy = readLegacy(key)
  return (legacy === undefined || legacy === null ? fallback : legacy) as T
}

/** Save to the server. A "changed on another computer" refusal reloads the copy and tells the operator. */
export async function saveSetting(real: Pick<Real, 'put'>, key: SettingKey, value: unknown): Promise<void> {
  const version = cache[key]?.version ?? 0
  try {
    const saved = await real.put(`/vendor/pos-settings/${key}`, { value, version })
    const entry = saved?.setting
    cache[key] = { value: entry?.value ?? value, version: Number(entry?.version) || version + 1 }
  } catch (error) {
    if ((error as { code?: string })?.code === 'VERSION_CONFLICT') resetServerSettings()
    throw error
  }
}
