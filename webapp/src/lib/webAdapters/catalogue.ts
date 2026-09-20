// The counter's own (POS) catalogue, stored per vendor on the LNDRY backend. It starts from the vendor's
// existing LNDRY services and can then be extended and re-priced freely for the store without touching
// the marketplace catalogue the customer app reads.
import type { LaundryCatalogue } from '../laundry'
import { route, rupees, toPaise, listOf } from './core'
import { forgetCatalogue } from './quote'

type Category = { id: string; parentId: string | null; name: string; color: string | null; imageUrl: string | null; sortOrder: number; active: boolean; source: 'MARKETPLACE' | 'POS' }
type Service = { id: string; name: string; description: string; imageUrl: string | null; units: string[]; active: boolean; source: 'MARKETPLACE' | 'POS' }
type Garment = { id: string; categoryId: string | null; name: string; code: string; unit: string; imageUrl: string | null; hsn: string; gstRate: number; active: boolean; source: 'MARKETPLACE' | 'POS' }
type Price = { id: string; garmentId: string; serviceId: string; customerUserId: string | null; ratePaise: number; active: boolean; source: 'MARKETPLACE' | 'POS'; marketplaceRatePaise: number | null; priceOverridden: boolean }
type TaxRule = { id: string; name: string; rateBps: number; active: boolean }
type PosCatalogue = { categories: Category[]; services: Service[]; garments: Garment[]; prices: Price[]; taxRules: TaxRule[]; lastSyncedAt: string | null }
type Rule = { id: string; name: string; type: 'FLAT' | 'PERCENTAGE'; flatAmountPaise: number | null; percentageBps: number | null; description: string | null; active: boolean }

export const unitLabel = (unit: string) => {
  const key = String(unit || '').toLowerCase()
  if (key === 'kg' || key === 'kilogram') return 'Kilogram'
  if (key === 'piece' || key === 'pc' || key === 'pcs') return 'Piece'
  if (key === 'pair') return 'Pair'
  if (key === 'sqft' || key === 'square foot') return 'Square Foot'
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Piece'
}

const ruleShape = (rule: Rule) => ({
  id: rule.id,
  name: rule.name,
  type: rule.type === 'PERCENTAGE' ? 'Percentage' as const : 'Flat' as const,
  amount: rule.type === 'PERCENTAGE' ? (rule.percentageBps || 0) / 100 : rupees(rule.flatAmountPaise),
  description: rule.description || '',
  active: rule.active,
})

/** Sub-categories read as "Household › Curtains" wherever a garment shows its category. */
const categoryLabel = (categories: Map<string, Category>, id: string | null) => {
  const own = id ? categories.get(id) : undefined
  if (!own) return ''
  const parent = own.parentId ? categories.get(own.parentId) : undefined
  return parent ? `${parent.name} › ${own.name}` : own.name
}

export async function loadCatalogue(get: (path: string) => Promise<any>): Promise<LaundryCatalogue> {
  const [pos, charges, discounts] = await Promise.all([
    get('/vendor/pos-catalogue') as Promise<PosCatalogue>,
    get('/vendor/adjustment-rules/charge').catch(() => []),
    get('/vendor/adjustment-rules/discount').catch(() => []),
  ])
  const categoryById = new Map(pos.categories.map((category) => [category.id, category]))
  const garmentById = new Map(pos.garments.map((garment) => [garment.id, garment]))
  const serviceById = new Map(pos.services.map((service) => [service.id, service]))

  return {
    categories: pos.categories.map((category) => ({
      id: category.id, name: category.name,
      color: category.color || undefined, image: category.imageUrl || undefined, sort_order: category.sortOrder, active: category.active,
      parentId: category.parentId || undefined, source: category.source,
    })),
    services: pos.services.map((service) => ({
      id: service.id, name: service.name, description: service.description, units: service.units, active: service.active,
      image: service.imageUrl || undefined, source: service.source,
    })),
    garments: pos.garments.map((garment) => ({
      id: garment.id, name: garment.name, code: garment.code || undefined, category: garment.categoryId || '', categoryName: categoryLabel(categoryById, garment.categoryId) || 'Uncategorised',
      unit: unitLabel(garment.unit), photo: garment.imageUrl || undefined, active: garment.active, hsn: garment.hsn || undefined, gst_rate: garment.gstRate, source: garment.source,
    })),
    prices: pos.prices.filter((price) => garmentById.has(price.garmentId) && serviceById.has(price.serviceId)).map((price) => ({
      id: price.id, garment: price.garmentId, service: price.serviceId, customer: price.customerUserId || undefined,
      garmentName: garmentById.get(price.garmentId)!.name, serviceName: serviceById.get(price.serviceId)!.name, rate: rupees(price.ratePaise), active: price.active,
      source: price.source, marketplaceRate: price.marketplaceRatePaise == null ? null : rupees(price.marketplaceRatePaise), overridden: price.priceOverridden,
    })),
    chargeRules: (listOf(charges) as Rule[]).map(ruleShape),
    discountRules: (listOf(discounts) as Rule[]).map(ruleShape),
    taxRules: pos.taxRules.map((rule) => ({ id: rule.id, name: rule.name, rate: rule.rateBps / 100, active: rule.active })),
    serviceUnits: ['Piece', 'Kilogram', 'Pair', 'Square Foot'],
  }
}

route('GET', '/laundry/catalogue', ({ get }) => loadCatalogue(get))

// The quote adapter keeps a short-lived copy of the catalogue; drop it after any change.
const forgetCatalogueCache = () => forgetCatalogue()

// ── Photos ────────────────────────────────────────────────────────────────
/** Counter photos are stored inline, so uploaded pictures are shrunk to a small WebP first. Links and bundled artwork pass through. */
async function compactImage(value: unknown): Promise<string | null | undefined> {
  if (value === undefined) return undefined
  if (!value) return null
  const text = String(value)
  if (!text.startsWith('data:image/')) return text
  if (text.length < 60_000) return text
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, 640 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) return reject(new Error('The image could not be prepared.'))
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/webp', 0.82))
    }
    image.onerror = () => reject(new Error('The image could not be read. Try a PNG, JPEG or WebP file.'))
    image.src = text
  })
}

// ── Writes ────────────────────────────────────────────────────────────────
type Body = Record<string, any>

async function categoryBody(body: Body) {
  return { name: body.name, color: body.color || undefined, sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0), active: body.active !== false, parentId: body.parentId ?? null, imageUrl: await compactImage(body.image ?? body.imageUrl) }
}
async function serviceBody(body: Body) {
  return { name: body.name, description: body.description ?? '', units: body.units, active: body.active !== false, imageUrl: await compactImage(body.image ?? body.imageUrl) }
}
async function garmentBody(body: Body) {
  return { name: body.name, code: body.code ?? '', categoryId: body.category || body.categoryId || null, unit: body.unit, hsn: body.hsn ?? '', gstRate: Number(body.gstRate ?? body.gst_rate ?? 0), active: body.active !== false, imageUrl: await compactImage(body.photo ?? body.imageUrl) }
}
const priceBody = (body: Body) => ({ garmentId: body.garment, serviceId: body.service, customerUserId: body.customer || null, ratePaise: toPaise(body.rate), active: body.active !== false, resetToMarketplace: Boolean(body.resetToMarketplace) })
const ruleBody = (body: Body) => {
  const percentage = body.type === 'Percentage'
  return {
    name: body.name, type: percentage ? 'PERCENTAGE' : 'FLAT', description: body.description || undefined, active: body.active !== false,
    ...(percentage ? { percentageBps: Math.round((Number(body.amount) || 0) * 100) } : { flatAmountPaise: toPaise(body.amount) }),
  }
}
const taxBody = (body: Body) => ({ name: body.name, ratePercent: Number(body.rate ?? body.amount), active: body.active !== false })

const KINDS: Record<string, { path: string; body: (body: Body) => Body | Promise<Body> }> = {
  categories: { path: 'categories', body: categoryBody },
  services: { path: 'services', body: serviceBody },
  garments: { path: 'garments', body: garmentBody },
  prices: { path: 'prices', body: priceBody },
  taxes: { path: 'taxes', body: taxBody },
}

// Reviewed JSON import: matches by id or name, updates what exists, creates what does not. Counter records only.
route('POST', '/laundry/catalogue/import', async ({ get, post, put, body }) => {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as Array<{ row: number; message: string }> }
  const current = async () => (await get('/vendor/pos-catalogue')) as PosCatalogue
  let data = await current()
  const norm = (value: unknown) => String(value ?? '').trim().toLowerCase()
  const upsert = async (list: Body[] | undefined, kind: 'categories' | 'services' | 'garments', existing: Array<{ id: string; name: string }>) => {
    for (const [index, row] of (list || []).entries()) {
      try {
        const match = existing.find((item) => item.id === row.id) || existing.find((item) => norm(item.name) === norm(row.name))
        const payload = await KINDS[kind].body(kind === 'garments' ? { ...row, category: resolveCategory(row.category ?? row.categoryId) } : row)
        if (match) { await put(`/vendor/pos-catalogue/${kind}/${match.id}`, payload); result.updated += 1 } else { await post(`/vendor/pos-catalogue/${kind}`, payload); result.created += 1 }
      } catch (error) { result.errors.push({ row: index + 1, message: `${kind}: ${error instanceof Error ? error.message : 'could not be saved'}` }); result.skipped += 1 }
    }
    data = await current()
  }
  const resolveCategory = (ref: unknown) => data.categories.find((item) => item.id === ref || norm(item.name) === norm(ref))?.id || ''
  await upsert(body.categories, 'categories', data.categories)
  await upsert(body.services, 'services', data.services)
  await upsert(body.garments, 'garments', data.garments)
  for (const [index, row] of ((body.prices || []) as Body[]).entries()) {
    try {
      const garment = data.garments.find((item) => item.id === row.garment || norm(item.name) === norm(row.garment ?? row.garmentName))
      const service = data.services.find((item) => item.id === row.service || norm(item.name) === norm(row.service ?? row.serviceName))
      if (!garment || !service) throw new Error('garment or service not found')
      const existing = data.prices.find((item) => item.garmentId === garment.id && item.serviceId === service.id && !item.customerUserId)
      const payload = { garmentId: garment.id, serviceId: service.id, ratePaise: toPaise(row.rate), active: row.active !== false }
      if (existing) { await put(`/vendor/pos-catalogue/prices/${existing.id}`, payload); result.updated += 1 } else { await post('/vendor/pos-catalogue/prices', payload); result.created += 1 }
    } catch (error) { result.errors.push({ row: index + 1, message: `prices: ${error instanceof Error ? error.message : 'could not be saved'}` }); result.skipped += 1 }
  }
  for (const [kind, list] of [['charge', body.chargeRules], ['discount', body.discountRules]] as const) {
    for (const [index, row] of ((list || []) as Body[]).entries()) {
      try { await post(`/vendor/adjustment-rules/${kind}`, ruleBody(row)); result.created += 1 } catch (error) { result.errors.push({ row: index + 1, message: `${kind}: ${error instanceof Error ? error.message : 'could not be saved'}` }); result.skipped += 1 }
    }
  }
  for (const [index, row] of ((body.taxRules || []) as Body[]).entries()) {
    try { await post('/vendor/pos-catalogue/taxes', taxBody(row)); result.created += 1 } catch (error) { result.errors.push({ row: index + 1, message: `taxes: ${error instanceof Error ? error.message : 'could not be saved'}` }); result.skipped += 1 }
  }
  forgetCatalogueCache()
  return result
})

route('POST', '/laundry/catalogue/:kind', async ({ post, params, body }) => {
  if (params.kind === 'charges' || params.kind === 'discounts') return post(`/vendor/adjustment-rules/${params.kind === 'charges' ? 'charge' : 'discount'}`, ruleBody(body))
  const kind = KINDS[params.kind]
  if (!kind) throw new Error('That catalogue record type is not supported.')
  const saved = await post(`/vendor/pos-catalogue/${kind.path}`, await kind.body(body))
  forgetCatalogueCache()
  return saved
})

route('PATCH', '/laundry/catalogue/:kind/:id', async ({ put, params, body }) => {
  if (params.kind === 'charges' || params.kind === 'discounts') return put(`/vendor/adjustment-rules/${params.kind === 'charges' ? 'charge' : 'discount'}/${params.id}`, ruleBody(body))
  const kind = KINDS[params.kind]
  if (!kind) throw new Error('That catalogue record type is not supported.')
  const saved = await put(`/vendor/pos-catalogue/${kind.path}/${params.id}`, await kind.body(body))
  forgetCatalogueCache()
  return saved
})

// Pull the latest services from the vendor's LNDRY account into the counter catalogue.
route('POST', '/marketplace/cloud/catalogue-sync', async ({ post }) => {
  const summary = await post('/vendor/pos-catalogue/sync', {})
  forgetCatalogueCache()
  return {
    categoriesSeen: summary.categories, servicesSeen: summary.services, garmentsSeen: summary.garments, created: summary.initial ? summary.prices : 0, updated: summary.initial ? 0 : summary.prices,
    imagesEmbedded: 0, pricesKept: summary.priceChangesKept, hidden: summary.removed,
  }
})
