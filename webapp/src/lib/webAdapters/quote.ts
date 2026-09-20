import type { LaundryCatalogue, LaundryQuote } from '../laundry'
import { loadCatalogue } from './catalogue'
import { route } from './core'

const round = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

let cached: { at: number; catalogue: LaundryCatalogue } | null = null
export async function cachedCatalogue(get: (path: string) => Promise<any>) {
  if (cached && Date.now() - cached.at < 20_000) return cached.catalogue
  const catalogue = await loadCatalogue(get)
  cached = { at: Date.now(), catalogue }
  return catalogue
}
export const forgetCatalogue = () => { cached = null }

type Rule = LaundryCatalogue['chargeRules'][number]
const ruleAmount = (rule: Rule, base: number) => (rule.type === 'Percentage' ? round(base * rule.amount / 100) : rule.amount)

/** Same arithmetic as the desktop's quoteLaundryOrder: rules on the subtotal, discounts on subtotal+charges, tax on what remains. */
export function priceOrder(catalogue: LaundryCatalogue, input: any): LaundryQuote & { items: Array<any> } {
  const lines = Array.isArray(input?.items) ? input.items : []
  if (!lines.length) throw new Error('Select at least one garment.')
  const seen = new Set<string>()
  const items = lines.map((line: { garment: string; service: string; qty: number }) => {
    const qty = Number(line.qty)
    if (!line.garment || !line.service || !Number.isFinite(qty) || qty <= 0) throw new Error('Each garment line needs a service and a positive quantity.')
    const key = `${line.garment}:${line.service}`
    if (seen.has(key)) throw new Error('Duplicate garment and service lines must be combined.')
    seen.add(key)
    // A price set for this customer wins over the general one; switched-off garments/services/prices cannot be quoted.
    const candidates = catalogue.prices.filter((entry) => entry.garment === line.garment && entry.service === line.service && entry.active !== false)
    const price = candidates.find((entry) => entry.customer && entry.customer === input.customerId) || candidates.find((entry) => !entry.customer)
    const garment = catalogue.garments.find((entry) => entry.id === line.garment && entry.active !== false)
    if (catalogue.services.find((entry) => entry.id === line.service)?.active === false) throw new Error('No active price exists for this garment and service.')
    if (!price || !garment) throw new Error('No active price exists for this garment and service.')
    if (['Piece', 'Pair'].includes(garment.unit) && !Number.isInteger(qty)) throw new Error(`${garment.unit} quantities must be whole numbers.`)
    return { garment: garment.id, garmentName: garment.name, service: price.service, serviceName: price.serviceName, unit: garment.unit, qty: round(qty), rate: price.rate, amount: round(qty * price.rate) }
  })
  const subtotal = round(items.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0))
  const chosen = (rules: Rule[], ids: unknown) => (Array.isArray(ids) ? ids : []).map((id) => rules.find((rule) => rule.id === id)).filter((rule): rule is Rule => Boolean(rule))
  const configuredCharges = chosen(catalogue.chargeRules, input.chargeRuleIds).reduce((sum, rule) => round(sum + ruleAmount(rule, subtotal)), 0)
  const charges = Math.max(0, round(configuredCharges + (Number(input.charges) || 0)))
  const configuredDiscounts = chosen(catalogue.discountRules, input.discountRuleIds).reduce((sum, rule) => round(sum + ruleAmount(rule, subtotal + charges)), 0)
  const discounts = Math.min(round(configuredDiscounts + (Number(input.discounts) || 0)), subtotal + charges)
  const taxable = round(subtotal + charges - discounts)
  const taxRate = Math.max(0, Math.min(100, round(Number(input.taxRate) || 0)))
  const taxAmount = round(taxable * taxRate / 100)
  return { items, subtotal, charges, discounts, taxable, taxRate, taxAmount, grandTotal: round(taxable + taxAmount) }
}

route('POST', '/laundry/quote', async ({ get, body }) => priceOrder(await cachedCatalogue(get), body))
