import type { LaundryCatalogue } from '../laundry'
import { route, rupees, listOf } from './core'

type Row = {
  garment_type_id: string; garment_name: string; unit: string; rate_paise: number
  vendor_service_id: string; service_name: string; category_id: string; category_name: string
  image_url?: string | null; garment_image_url?: string | null
}
type Category = { id: string; name: string; image_url?: string | null; sort_order?: number }
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

/** The vendor's real, approved catalogue: real categories with their real photos, real services, real per-garment photos and rates. */
export async function loadCatalogue(get: (path: string) => Promise<any>): Promise<LaundryCatalogue> {
  const [rowsData, categoriesData, charges, discounts] = await Promise.all([
    get('/vendor/services/catalogue'),
    get('/vendor/categories').catch(() => []),
    get('/vendor/adjustment-rules/charge').catch(() => []),
    get('/vendor/adjustment-rules/discount').catch(() => []),
  ])
  const rows = listOf(rowsData) as Row[]
  const realCategories = new Map((listOf(categoriesData) as Category[]).map((category) => [category.id, category]))

  const categories: LaundryCatalogue['categories'] = []
  const services: LaundryCatalogue['services'] = []
  const garments: LaundryCatalogue['garments'] = []
  const prices: LaundryCatalogue['prices'] = []
  const seen = { category: new Set<string>(), service: new Set<string>(), garment: new Set<string>() }
  const serviceUnits = new Map<string, Set<string>>()

  for (const row of rows) {
    if (!seen.category.has(row.category_id)) {
      seen.category.add(row.category_id)
      const real = realCategories.get(row.category_id)
      categories.push({ id: row.category_id, name: row.category_name, image: real?.image_url || row.image_url || undefined, sort_order: real?.sort_order ?? categories.length, active: true })
    }
    if (!seen.service.has(row.vendor_service_id)) {
      seen.service.add(row.vendor_service_id)
      serviceUnits.set(row.vendor_service_id, new Set())
      services.push({ id: row.vendor_service_id, name: row.service_name, units: [], active: true })
    }
    serviceUnits.get(row.vendor_service_id)!.add(unitLabel(row.unit))
    if (!seen.garment.has(row.garment_type_id)) {
      seen.garment.add(row.garment_type_id)
      garments.push({
        id: row.garment_type_id, name: row.garment_name, category: row.category_id, categoryName: row.category_name,
        unit: unitLabel(row.unit), photo: row.garment_image_url || row.image_url || undefined,
      })
    }
    prices.push({
      id: `${row.garment_type_id}:${row.vendor_service_id}`, garment: row.garment_type_id, service: row.vendor_service_id,
      garmentName: row.garment_name, serviceName: row.service_name, rate: rupees(row.rate_paise), active: true,
    })
  }
  for (const service of services) service.units = [...(serviceUnits.get(service.id) || [])]

  return {
    categories, services, garments, prices,
    chargeRules: (listOf(charges) as Rule[]).map(ruleShape),
    discountRules: (listOf(discounts) as Rule[]).map(ruleShape),
    taxRules: [],
    serviceUnits: ['Piece', 'Kilogram', 'Pair', 'Square Foot'],
  }
}

route('GET', '/laundry/catalogue', ({ get }) => loadCatalogue(get))
