// Settings: business profile from the real vendor record (plus print/tag preferences saved on the server),
// staff from the real team, rack profiles from the real backend, service zones saved on the server.
// Desktop-only maintenance panels (hardware, ledger normalisation, migrations) have nothing to do on the website.
import { route, listOf } from './core'
import { storedPrintSettings, storedUpiQrSettings } from './counterDesk'
import { ensureServerSettings, saveSetting, settingValue } from './serverSettings'

export type StoredServiceUnit = { id: string; value: string; fullName: string; shortName: string; active: boolean; builtIn: boolean; usageCount: number }
const DEFAULT_SERVICE_UNITS: StoredServiceUnit[] = [
  { id: 'builtin:Piece', value: 'Piece', fullName: 'Quantity', shortName: 'Qty', active: true, builtIn: true, usageCount: 0 },
  { id: 'builtin:Kilogram', value: 'Kilogram', fullName: 'Kilogram', shortName: 'Kg', active: true, builtIn: true, usageCount: 0 },
  { id: 'builtin:Square Foot', value: 'Square Foot', fullName: 'Sq.Ft', shortName: 'Sq.Ft', active: true, builtIn: true, usageCount: 0 },
  { id: 'builtin:Pair', value: 'Pair', fullName: 'Pair', shortName: 'Pair', active: true, builtIn: true, usageCount: 0 },
]
const DEFAULT_TAG_TEMPLATE = { preset: 'a4-6', widthMm: 96, heightMm: 84, columns: 2, rows: 3, orientation: 'portrait', pageSize: 'A4', marginMm: 8, fontScale: 1, lineSpacing: 1, codeFormat: 'code128', printDpi: 300, showLogo: true, showGarment: true, showService: true, showInvoiceNumber: false, showPhone: false, showOrderDate: false, showTagCode: true, showStoreName: true, showCustomer: true, showOrder: true, showDueDate: true, showSequence: true, showNotes: false, showExpress: true, showSpecialCare: true }
const DEFAULT_MESSAGE_TEMPLATES = [
  { key: 'order-booked', label: 'Order Booked', active: true, body: 'Hello {CustomerName}, your {Brand} order #{OrderNo} has been booked.\n\nItems: {TotalGarments}\nAmount: {TotalAmount}\nExpected delivery: {DeliveryDate}\n\nWe will keep you updated as your order moves through the laundry.' },
  { key: 'order-processing', label: 'Order Processing', active: true, body: 'Hello {CustomerName}, we have started processing your {Brand} order #{OrderNo}. We will message you when it is ready.' },
  { key: 'order-done', label: 'Order Done', active: true, body: 'Hello {CustomerName}, your {Brand} order #{OrderNo} is ready for collection.\n\nItems: {TotalGarments}\nBalance due: {Balance}\n\nThank you for choosing {Brand}.' },
  { key: 'order-delivered', label: 'Order Delivered', active: true, body: 'Hello {CustomerName}, your {Brand} order #{OrderNo} has been delivered. Thank you for choosing {Brand}.' },
]
const MESSAGE_PLACEHOLDERS = new Set(['Brand', 'CustomerName', 'CustomerPhone', 'OrderNo', 'InvoiceNo', 'OrderDate', 'DeliveryDate', 'TotalGarments', 'TotalAmount', 'Paid', 'Balance', 'OverallPendingAmount', 'Remarks', 'StainDetails', 'PackageDetails', 'InvoiceUrl', 'ImageDownloadPage', 'TrackOrderUrl', 'ReviewSection', 'TeamName'])

// Settings live on the server (see serverSettings.ts). Every handler loads them first.
export function storedServiceUnitRecords(_branchId?: unknown): StoredServiceUnit[] {
  const saved = settingValue<StoredServiceUnit[]>('service-units', DEFAULT_SERVICE_UNITS)
  const rows = Array.isArray(saved) ? saved : DEFAULT_SERVICE_UNITS
  return DEFAULT_SERVICE_UNITS.map((standard) => ({ ...standard, ...(rows.find((unit) => unit.id === standard.id) || {}) }))
    .concat(rows.filter((unit) => !DEFAULT_SERVICE_UNITS.some((standard) => standard.id === unit.id)))
}
async function serviceUnitState(get: (path: string) => Promise<any>) {
  await ensureServerSettings(get)
  const units = storedServiceUnitRecords()
  const pos = await get('/vendor/pos-catalogue').catch(() => null)
  return { units: units.map((unit) => ({
    ...unit,
    usageCount: ((pos?.garments || []).filter((garment: any) => String(garment.unit || '').toLowerCase() === unit.value.toLowerCase()).length + (pos?.services || []).filter((service: any) => Array.isArray(service.units) && service.units.some((value: unknown) => String(value).toLowerCase() === unit.value.toLowerCase())).length),
  })) }
}

async function storeSettings(get: (p: string) => Promise<any>) {
  await ensureServerSettings(get)
  const profile = await get('/vendor/profile').catch(() => ({}))
  const upiQr = storedUpiQrSettings()
  const storePackages = settingValue<unknown[]>('store-packages', [])
  const address = [profile.address_line1, profile.address_line2, profile.city, profile.state, profile.pincode].filter(Boolean).join(', ')
  return {
    businessName: profile.name || 'LNDRY Partner', address,
    addressLine1: profile.address_line1 || '', addressLine2: profile.address_line2 || '', city: profile.city || '', state: profile.state || '', postalCode: profile.pincode || '', landmark: '',
    description: profile.description || '', googleReviewUrl: '', termsAndConditions: '',
    phone: profile.phone || '', email: profile.email || '', upiId: '', qrOnPrint: true, logoDataUrl: '',
    taxMode: 'none', taxSameAsCompany: false, gstin: profile.gstin || '', currency: 'INR', timezone: 'Asia/Kolkata', printerProfile: 'system-default', afterBooking: 'ask', printerProfiles: [], orderNoSeries: [], storePackages,
    tagTemplate: DEFAULT_TAG_TEMPLATE, stationCapacities: {},
    setupProgress: { business: true, owner: true, operations: true, catalogue: true, recovery: true, updatedAt: new Date().toISOString(), updatedBy: 'LNDRY vendor account' },
    ...storedPrintSettings(),
    ...(upiQr || {}),
  }
}

route('GET', '/settings/store', ({ get }) => storeSettings(get))
route('POST', '/settings/store', async ({ get, put, body }) => {
  await ensureServerSettings(get)
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const { upiId, qrOnPrint, ...otherSettings } = input
  const printSettings = { ...storedPrintSettings(), ...otherSettings }
  delete printSettings.upiId
  delete printSettings.qrOnPrint
  await saveSetting({ put }, 'print-settings', printSettings)
  if (Object.prototype.hasOwnProperty.call(input, 'upiId') || Object.prototype.hasOwnProperty.call(input, 'qrOnPrint')) {
    const currentQr = storedUpiQrSettings() || { upiId: '', qrOnPrint: true }
    await saveSetting({ put }, 'upi-qr', {
      upiId: Object.prototype.hasOwnProperty.call(input, 'upiId') ? String(upiId || '').trim() : currentQr.upiId,
      qrOnPrint: typeof qrOnPrint === 'boolean' ? qrOnPrint : currentQr.qrOnPrint,
    })
  }
  return storeSettings(get)
})

route('GET', '/settings/order-no-series', async ({ get }) => { await ensureServerSettings(get); return settingValue<unknown[]>('order-no-series', []) })
route('POST', '/settings/order-no-series', async ({ get, put, body }) => {
  const name = String(body?.name ?? '').trim()
  const prefix = String(body?.prefix ?? '').trim()
  if (!name) throw new Error('Series name is required')
  if (!prefix) throw new Error('Prefix is required')
  if (name.length > 100) throw new Error('Series name must be 100 characters or fewer')
  if (prefix.length > 20) throw new Error('Prefix must be 20 characters or fewer')
  await ensureServerSettings(get)
  const current = settingValue<Array<{ id: string; name: string; prefix: string; createdAt: string }>>('order-no-series', [])
  if (current.some((series) => series.prefix.toLocaleLowerCase('en') === prefix.toLocaleLowerCase('en'))) throw new Error('This prefix is already used by another order number series')
  const series = { id: `ons_${crypto.randomUUID()}`, name, prefix, createdAt: new Date().toISOString() }
  await saveSetting({ put }, 'order-no-series', [...current, series])
  return series
})

type StoredStorePackage = {
  id: string
  name: string
  amount: number
  services: Array<{ id: string; name: string }>
  limitsEnabled: boolean
  serviceLimits: Array<{ serviceId: string; quantityLimit: number; amountLimit: number }>
  createdAt: string
}
async function storePackageState(get: (path: string) => Promise<any>) {
  await ensureServerSettings(get)
  return { packages: settingValue<StoredStorePackage[]>('store-packages', []) }
}
function strictNonNegativeMoney(value: unknown, label: string) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value.toString() : String(value ?? '').trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) throw new Error(`${label} must be a valid amount with at most two decimal places`)
  const number = Number(raw)
  if (!Number.isSafeInteger(Math.round(number * 100))) throw new Error(`${label} is outside the supported amount range`)
  return Math.round(number * 100) / 100
}
route('GET', '/settings/store-packages', async ({ get }) => {
  const { packages } = await storePackageState(get)
  return (Array.isArray(packages) ? packages : []).sort((a, b) => a.name.localeCompare(b.name) || a.createdAt.localeCompare(b.createdAt))
})
route('POST', '/settings/store-packages', async ({ get, put, body }) => {
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Package Name is required')
  if (name.length > 100) throw new Error('Package Name must be 100 characters or fewer')
  const amount = strictNonNegativeMoney(body?.amount, 'Amount')
  if (!Array.isArray(body?.serviceIds)) throw new Error('Select package services using the service list')
  const serviceIds = body.serviceIds.map((value: unknown) => String(value ?? '').trim())
  if (serviceIds.some((id: string) => !id) || new Set(serviceIds).size !== serviceIds.length) throw new Error('Select each package service only once')
  const catalogue = await get('/vendor/pos-catalogue').catch(() => ({ services: [] }))
  const activeServices = new Map((Array.isArray(catalogue?.services) ? catalogue.services : [])
    .filter((service: any) => service?.active !== false)
    .map((service: any) => [String(service.id), String(service.name || '').trim()]))
  const services = serviceIds.map((serviceId: string) => {
    const serviceName = activeServices.get(serviceId)
    if (!serviceName) throw new Error('One or more selected services are no longer available. Refresh the service list and try again.')
    return { id: serviceId, name: serviceName }
  })
  const limitsEnabled = body?.limitsEnabled === true
  if (body?.serviceLimits !== undefined && !Array.isArray(body.serviceLimits)) throw new Error('Service-wise limits must be a list')
  const limits = (Array.isArray(body?.serviceLimits) ? body.serviceLimits : []).map((limit: any) => {
    const serviceId = String(limit?.serviceId ?? '').trim()
    if (!limitsEnabled || !serviceIds.includes(serviceId)) throw new Error('Service-wise limits must match selected package services')
    const rawQuantityLimit = typeof limit?.quantityLimit === 'number' && Number.isFinite(limit.quantityLimit) ? limit.quantityLimit.toString() : String(limit?.quantityLimit ?? '').trim()
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(rawQuantityLimit)) throw new Error('Quantity Limit must be a non-negative number with at most three decimal places')
    const quantityLimit = Number(rawQuantityLimit)
    if (!Number.isSafeInteger(Math.round(quantityLimit * 1000))) throw new Error('Quantity Limit is outside the supported range')
    return { serviceId, quantityLimit: Math.round(quantityLimit * 1000) / 1000, amountLimit: strictNonNegativeMoney(limit?.amountLimit, 'Amount Limit') }
  })
  if (limitsEnabled && limits.length !== services.length) throw new Error('Add a Quantity Limit and Amount Limit for every selected service')
  if (!limitsEnabled && limits.length) throw new Error('Service-wise limits must be enabled before they can be saved')
  if (new Set(limits.map((limit: StoredStorePackage['serviceLimits'][number]) => limit.serviceId)).size !== limits.length) throw new Error('Each service can have only one limit group')
  const { packages: current } = await storePackageState(get)
  if (!Array.isArray(current) || current.length >= 500) throw new Error('This branch already has the maximum of 500 Store Packages')
  const created: StoredStorePackage = { id: `sp_${crypto.randomUUID()}`, name, amount, services, limitsEnabled, serviceLimits: limits, createdAt: new Date().toISOString() }
  await saveSetting({ put }, 'store-packages', [...current, created])
  return created
})

// The page asks for the /laundry/settings/... path; the shorter /settings/... path is kept for older callers.
for (const base of ['/settings/service-units', '/laundry/settings/service-units']) {
  route('GET', base, async ({ get }) => (await serviceUnitState(get)).units)
  route('POST', base, async ({ get, put, body }) => {
    const fullName = String(body?.fullName ?? '').trim().replace(/\s+/g, ' ')
    const shortName = String(body?.shortName ?? '').trim().replace(/\s+/g, ' ')
    if (!fullName || fullName.length > 100) throw new Error('Full Unit Name is required and must be 100 characters or fewer')
    if (!shortName || shortName.length > 10) throw new Error('Short Unit Name is required and must be 10 characters or fewer')
    const { units } = await serviceUnitState(get)
    if (units.some((unit) => unit.fullName.toLowerCase() === fullName.toLowerCase())) throw new Error('a service unit with this name already exists')
    const created = { id: `unit_${crypto.randomUUID()}`, value: fullName, fullName, shortName, active: true, builtIn: false, usageCount: 0 }
    await saveSetting({ put }, 'service-units', [...units, created])
    return created
  })
  route('PATCH', `${base}/:id`, async ({ get, put, params, body }) => {
    const { units } = await serviceUnitState(get)
    const current = units.find((unit) => unit.id === params.id)
    if (!current) throw new Error('service unit not found')
    if (current.builtIn && body?.active === false) throw new Error('standard service units cannot be archived')
    if (!current.builtIn && typeof body?.active === 'boolean' && !body.active && current.usageCount > 0) throw new Error('remove this unit from active garments and services before archiving it')
    const fullName = body?.fullName === undefined ? current.fullName : String(body.fullName).trim().replace(/\s+/g, ' ')
    const shortName = body?.shortName === undefined ? current.shortName : String(body.shortName).trim().replace(/\s+/g, ' ')
    if (!fullName || fullName.length > 100) throw new Error('Full Unit Name is required and must be 100 characters or fewer')
    if (!shortName || shortName.length > 10) throw new Error('Short Unit Name is required and must be 10 characters or fewer')
    if (units.some((unit) => unit.id !== params.id && unit.fullName.toLowerCase() === fullName.toLowerCase())) throw new Error('a service unit with this name already exists')
    if (!current.builtIn && fullName !== current.fullName && current.usageCount > 0) throw new Error('remove this unit from active garments and services before renaming it')
    const updated = { ...current, value: current.builtIn ? current.value : fullName, fullName, shortName, active: typeof body?.active === 'boolean' ? body.active : current.active }
    const records = storedServiceUnitRecords().map((unit) => unit.id === params.id ? updated : unit)
    await saveSetting({ put }, 'service-units', records)
    return updated
  })
  for (const [action, active] of [['archive', false], ['restore', true]] as const) {
    route('POST', `${base}/:id/${action}`, async ({ get, put, params }) => {
      const { units } = await serviceUnitState(get)
      const unit = units.find((row) => row.id === params.id)
      if (!unit) throw new Error('service unit not found')
      if (unit.builtIn) throw new Error('standard service units cannot be archived')
      if (!active && unit.usageCount > 0) throw new Error('remove this unit from active garments and services before archiving it')
      const updated = { ...unit, active }
      await saveSetting({ put }, 'service-units', units.map((row) => row.id === params.id ? updated : row))
      return updated
    })
  }
}

async function messageTemplateStore(get: (path: string) => Promise<any>) {
  await ensureServerSettings(get)
  return { templates: settingValue<typeof DEFAULT_MESSAGE_TEMPLATES>('message-templates', DEFAULT_MESSAGE_TEMPLATES) }
}

route('GET', '/laundry/message-templates', async ({ get }) => (await messageTemplateStore(get)).templates)
route('PATCH', '/laundry/message-templates/:key', async ({ get, put, params, body }) => {
  const { templates } = await messageTemplateStore(get)
  const current = templates.find((template) => template.key === params.key)
  if (!current) throw new Error('MESSAGE_TEMPLATE_UNKNOWN')
  const nextBody = String(body?.body ?? '').trim()
  if (!nextBody) throw new Error('MESSAGE_TEMPLATE_REQUIRED')
  if (nextBody.length > 4000) throw new Error('MESSAGE_TEMPLATE_TOO_LONG')
  const unsupported = [...new Set(Array.from(nextBody.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g), (match) => match[1]))].filter((name) => !MESSAGE_PLACEHOLDERS.has(name))
  if (unsupported.length) throw new Error(`MESSAGE_TEMPLATE_PLACEHOLDER_UNKNOWN: ${unsupported.join(', ')}`)
  const updated = { ...current, body: nextBody, active: true, updatedAt: new Date().toISOString() }
  await saveSetting({ put }, 'message-templates', templates.map((template) => template.key === params.key ? updated : template))
  return updated
})
for (const [action, active] of [['archive', false], ['restore', true]] as const) {
  route('POST', `/laundry/message-templates/:key/${action}`, async ({ get, put, params }) => {
    const { templates } = await messageTemplateStore(get)
    if (!templates.some((template) => template.key === params.key)) throw new Error('MESSAGE_TEMPLATE_UNKNOWN')
    const updated = { ...templates.find((template) => template.key === params.key)!, active, updatedAt: new Date().toISOString() }
    await saveSetting({ put }, 'message-templates', templates.map((template) => template.key === params.key ? updated : template))
    return updated
  })
}
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

// ── Service zones (saved on the server) ──────────────────────────────────
type Zone = { id: string; name: string; code: string; active: boolean; pickupWindow: string; deliveryWindow: string; notes: string }
const zonesOf = async (get: (path: string) => Promise<any>) => { await ensureServerSettings(get); return settingValue<Zone[]>('service-zones', []) }
route('GET', '/laundry/service-zone-master', async ({ get }) => zonesOf(get))
route('GET', '/laundry/service-zones', async ({ get }) => (await zonesOf(get)).filter((zone) => zone.active).map((zone) => zone.name))
route('POST', '/laundry/service-zone-master', async ({ get, put, body }) => {
  const zone: Zone = { id: crypto.randomUUID(), name: String(body.name || '').trim(), code: String(body.code || '').trim(), active: true, pickupWindow: body.pickupWindow || '', deliveryWindow: body.deliveryWindow || '', notes: body.notes || '' }
  if (!zone.name) throw new Error('Give the zone a name.')
  await saveSetting({ put }, 'service-zones', [...(await zonesOf(get)), zone]); return zone
})
route('PATCH', '/laundry/service-zone-master/:id', async ({ get, put, params, body }) => {
  const zones = (await zonesOf(get)).map((zone) => (zone.id === params.id ? { ...zone, ...body } : zone)); await saveSetting({ put }, 'service-zones', zones)
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
