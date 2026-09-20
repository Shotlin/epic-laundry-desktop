// Settings: business profile from the real vendor record (plus print/tag preferences kept in this browser),
// staff from the real team, rack profiles from the real backend, service zones in this browser.
// Desktop-only maintenance panels (hardware, ledger normalisation, migrations) have nothing to do on the website.
import { route, listOf } from './core'
import { storedPrintSettings } from './counterDesk'

const STORE_KEY = 'epic-web-print-settings-v1'
const ZONE_KEY = 'epic-web-service-zones-v1'
const DEFAULT_TAG_TEMPLATE = { preset: 'a4-6', widthMm: 96, heightMm: 84, columns: 2, rows: 3, orientation: 'portrait', pageSize: 'A4', marginMm: 8, fontScale: 1, lineSpacing: 1, codeFormat: 'code128', printDpi: 300, showLogo: true, showGarment: true, showService: true, showInvoiceNumber: false, showPhone: false, showOrderDate: false, showTagCode: true, showStoreName: true, showCustomer: true, showOrder: true, showDueDate: true, showSequence: true, showNotes: false, showExpress: true, showSpecialCare: true }

const readJson = (key: string, fallback: any) => { try { return JSON.parse(window.localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
const writeJson = (key: string, value: unknown) => { try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode: setting just will not persist */ } }

async function storeSettings(get: (p: string) => Promise<any>) {
  const profile = await get('/vendor/profile').catch(() => ({}))
  const address = [profile.address_line1, profile.address_line2, profile.city, profile.state, profile.pincode].filter(Boolean).join(', ')
  return {
    businessName: profile.name || 'LNDRY Partner', address, phone: profile.phone || '', email: profile.email || '', upiId: '', qrOnPrint: true, logoDataUrl: '',
    taxMode: 'none', gstin: profile.gstin || '', currency: 'INR', timezone: 'Asia/Kolkata', printerProfile: 'system-default', afterBooking: 'ask', printerProfiles: [],
    tagTemplate: DEFAULT_TAG_TEMPLATE, stationCapacities: {},
    setupProgress: { business: true, owner: true, operations: true, catalogue: true, recovery: true, updatedAt: new Date().toISOString(), updatedBy: 'LNDRY vendor account' },
    ...storedPrintSettings(),
  }
}

route('GET', '/settings/store', ({ get }) => storeSettings(get))
route('POST', '/settings/store', async ({ get, body }) => {
  writeJson(STORE_KEY, { ...storedPrintSettings(), ...body })
  return storeSettings(get)
})
route('POST', '/settings/setup-progress', async ({ get }) => (await storeSettings(get)).setupProgress)

const ROLE: Record<string, string> = { VENDOR_OWNER: 'owner', VENDOR_STAFF: 'counter_staff', VENDOR_RIDER: 'rider' }
route('GET', '/settings/staff', async ({ get }) => (listOf(await get('/vendor/employees'), 'staff') as any[]).map((person) => {
  const [firstName, ...rest] = String(person.user_name || 'Team member').split(' ')
  return {
    id: person.id, username: person.user_phone || person.id, roles: [ROLE[person.role || person.shop_role] || 'counter_staff'], enabled: person.is_active !== false,
    firstName, lastName: rest.join(' '), email: person.user_email || '', phone: person.user_phone || '', description: '', riderId: person.role === 'VENDOR_RIDER' ? person.id : undefined, createdAt: person.created_at || new Date().toISOString(),
  }
}))
for (const [method, path] of [['POST', '/settings/staff'], ['PATCH', '/settings/staff/:id'], ['POST', '/settings/staff/:id/enabled'], ['POST', '/settings/staff/:id/reset-password']] as const) {
  route(method, path, async () => { throw new Error('Team members and captains are managed in the LNDRY Partner app (Team).') })
}

route('GET', '/settings/stores', async ({ get }) => {
  const profile = await get('/vendor/profile').catch(() => ({}))
  return [{ id: profile.id || 'store', name: profile.name || 'LNDRY Partner', code: profile.branch_code || 'MAIN', active: true, current: true, city: profile.city || '' }]
})
route('POST', '/settings/stores', async () => { throw new Error('Additional branches are registered through a new LNDRY vendor application.') })

// ── Rack profiles (real) ──────────────────────────────────────────────────
const rackShape = (rack: any) => ({ id: rack.id, name: rack.name, code: rack.code || '', capacity: rack.capacity, active: rack.active !== false, notes: rack.notes || '' })
route('GET', '/laundry/rack-profiles', async ({ get }) => (listOf(await get('/vendor/rack-profiles')) as any[]).map(rackShape))
route('POST', '/laundry/rack-profiles', async ({ post, body }) => rackShape(await post('/vendor/rack-profiles', { name: body.name, code: body.code || undefined, capacity: Number(body.capacity), notes: body.notes || undefined })))
route('PATCH', '/laundry/rack-profiles/:id', async ({ get, put, params, body }) => {
  const current = (listOf(await get('/vendor/rack-profiles')) as any[]).find((rack) => rack.id === params.id)
  return rackShape(await put(`/vendor/rack-profiles/${params.id}`, { name: current.name, code: current.code || undefined, capacity: current.capacity, notes: current.notes || undefined, ...body }))
})

// ── Service zones (kept in this browser) ──────────────────────────────────
type Zone = { id: string; name: string; code: string; active: boolean; pickupWindow: string; deliveryWindow: string; notes: string }
route('GET', '/laundry/service-zone-master', async () => readJson(ZONE_KEY, []) as Zone[])
route('GET', '/laundry/service-zones', async () => (readJson(ZONE_KEY, []) as Zone[]).filter((zone) => zone.active).map((zone) => zone.name))
route('POST', '/laundry/service-zone-master', async ({ body }) => {
  const zone: Zone = { id: crypto.randomUUID(), name: String(body.name || '').trim(), code: String(body.code || '').trim(), active: true, pickupWindow: body.pickupWindow || '', deliveryWindow: body.deliveryWindow || '', notes: body.notes || '' }
  if (!zone.name) throw new Error('Give the zone a name.')
  writeJson(ZONE_KEY, [...(readJson(ZONE_KEY, []) as Zone[]), zone]); return zone
})
route('PATCH', '/laundry/service-zone-master/:id', async ({ params, body }) => {
  const zones = (readJson(ZONE_KEY, []) as Zone[]).map((zone) => (zone.id === params.id ? { ...zone, ...body } : zone)); writeJson(ZONE_KEY, zones)
  return zones.find((zone) => zone.id === params.id)
})

// ── Desktop-only maintenance panels: honest "nothing to do here" ─────────
route('GET', '/ops/diagnostics', async ({ get }) => {
  const profile = await get('/vendor/profile').catch(() => ({}))
  return {
    format: 'web', version: 1, generatedAt: new Date().toISOString(), application: { name: 'Epic Laundry (website)', version: 'web', server: 'api.lndry.in' },
    runtime: { node: 'browser', platform: navigator.platform || 'web', arch: 'n/a' }, workspace: { tenant: profile.name || 'LNDRY Partner', storeId: profile.id || '', mode: 'production' },
    health: { status: 'READY' }, migrations: [], counts: { entityCounts: {}, recordCounts: {}, garmentUnits: 0, garmentUnitEvents: 0, tagReprints: 0, financialEntries: 0, identities: 0, activeSessions: 1, storeSettingsConfigured: true },
    hardware: [], redaction: {},
  }
})
route('GET', '/ops/hardware-status', async () => [])
route('GET', '/ops/financial-normalization', async () => ({
  candidates: 0, ledgerCandidates: 0, walletCandidates: 0, cashCloseCandidates: 0, missingDocuments: 0, missingEntries: 0, missingLedgerEntries: 0, missingWalletEntries: 0, missingCashCloseSnapshots: 0, missingSourceColumns: 0, invalid: 0, conflicts: 0, issues: [], conflictDetails: [],
}))
route('GET', '/ops/compatibility-audit', async () => ({ generatedAt: new Date().toISOString(), summary: { entitiesReviewed: 0, entitiesPresent: 0, compatibilityRows: 0, dualReadRows: 0, unresolvedRows: 0, retirementReady: true }, items: [] }))
route('GET', '/laundry/garment-backfill', async () => ({ candidates: 0, alreadyVisual: 0, missing: 0, items: [] }))
