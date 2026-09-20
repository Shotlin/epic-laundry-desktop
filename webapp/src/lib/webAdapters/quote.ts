import type { LaundryCatalogue, LaundryQuote } from '../laundry'
import { loadCatalogue, unitLabel } from './catalogue'
import { route, rupees, toPaise, breakdownOf } from './core'

let cached: { at: number; catalogue: LaundryCatalogue } | null = null
export async function cachedCatalogue(get: (path: string) => Promise<any>) {
  if (cached && Date.now() - cached.at < 20_000) return cached.catalogue
  const catalogue = await loadCatalogue(get)
  cached = { at: Date.now(), catalogue }
  return catalogue
}
export const forgetCatalogue = () => { cached = null }

/**
 * The POS total is the BACKEND's quote — the same function that prices the order when it is booked and
 * stores its breakdown — so the tray, the payment, the receipt and the invoice can never disagree.
 * (There used to be a second copy of this arithmetic in the browser; it is gone on purpose.)
 */
route('POST', '/laundry/quote', async ({ post, body }): Promise<LaundryQuote> => {
  const lines = Array.isArray(body?.items) ? body.items : []
  if (!lines.length) throw new Error('Select at least one garment.')
  const result = await post('/vendor/counter/orders/quote', {
    items: lines.map((line: { garment: string; service: string; qty: number }) => ({ garmentId: line.garment, serviceId: line.service, qty: Number(line.qty) })),
    customerId: body.customerId || undefined,
    chargesPaise: toPaise(body.charges),
    discountsPaise: toPaise(body.discounts),
    taxRatePercent: Number(body.taxRate) || 0,
    chargeRuleIds: Array.isArray(body.chargeRuleIds) ? body.chargeRuleIds : [],
    discountRuleIds: Array.isArray(body.discountRuleIds) ? body.discountRuleIds : [],
  })
  const quote = result.quote
  return {
    items: (quote.items as Array<any>).map((item) => ({
      garment: item.garmentId, garmentName: item.name, service: item.serviceId, serviceName: item.serviceName,
      unit: unitLabel(item.unit), qty: item.qty, rate: rupees(item.ratePaise), amount: rupees(item.amountPaise),
    })),
    subtotal: rupees(quote.subtotalPaise),
    charges: rupees(quote.chargesPaise),
    discounts: rupees(quote.discountsPaise),
    taxable: rupees(quote.taxablePaise),
    taxRate: (quote.taxRateBps || 0) / 100,
    taxAmount: rupees(quote.taxPaise),
    grandTotal: rupees(quote.totalPaise),
    breakdown: breakdownOf(quote.breakdown, { chargesPaise: quote.chargesPaise, discountsPaise: quote.discountsPaise, taxPaise: quote.taxPaise, taxRateBps: quote.taxRateBps }),
  };
})
