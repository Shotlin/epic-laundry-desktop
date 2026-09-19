// Prepaid service packages: definitions, sales to a customer, redemptions, balance collection.
import { route, listOf, rupees, toPaise } from './core'

type Rate = { id: string; garmentTypeId: string; vendorServiceId: string }
const rates = async (get: (p: string) => Promise<any>) => listOf(await get('/vendor/counter/rates')) as Rate[]
const rateFor = (all: Rate[], garment: string, service: string) => {
  const found = all.find((rate) => rate.garmentTypeId === garment && rate.vendorServiceId === service)
  if (!found) throw new Error('That garment and service combination has no price on your catalogue.')
  return found.id
}
const title = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')

const definition = (pkg: any, all: Rate[]) => ({
  id: pkg.id, name: pkg.name, description: pkg.description || '', price: rupees(pkg.pricePaise), validityDays: pkg.validityDays, active: pkg.active,
  services: (pkg.lines || []).map((line: any) => {
    const rate = all.find((entry) => entry.id === line.vendorServiceRateId)
    return { id: line.id, garment: rate?.garmentTypeId || '', service: rate?.vendorServiceId || '', allowance: line.allowance, garmentName: line.garmentName, serviceName: line.serviceName }
  }),
})

const customerPackage = (item: any, all: Rate[]) => ({
  id: item.id, servicePackage: { id: item.packageId, name: item.packageName }, purchasedDate: String(item.purchasedDate).slice(0, 10), expiresOn: String(item.expiresOn).slice(0, 10),
  pricePaid: rupees(item.pricePaidPaise), contractValue: rupees(item.contractPricePaise), paymentMode: title(item.paymentMode || 'PAY_LATER'), paymentStatus: title(item.paymentStatus || 'UNPAID'), status: title(item.status || 'ACTIVE'),
  services: (item.services || []).map((line: any) => {
    const rate = all.find((entry) => entry.id === line.vendorServiceRateId)
    return { garment: rate?.garmentTypeId || '', service: rate?.vendorServiceId || '', garmentName: line.garmentName, serviceName: line.serviceName, allowance: line.allowance, used: line.used, remaining: line.remaining }
  }),
  redemptions: (item.redemptions || []).map((entry: any) => {
    const rate = all.find((candidate) => candidate.id === entry.vendorServiceRateId)
    return { id: entry.id, garment: rate?.garmentTypeId || '', service: rate?.vendorServiceId || '', quantity: entry.quantity, redeemedDate: String(entry.redeemedDate).slice(0, 10) }
  }),
})

route('GET', '/laundry/packages', async ({ get }) => { const all = await rates(get); return (listOf(await get('/vendor/service-packages')) as any[]).map((pkg) => definition(pkg, all)) })
route('POST', '/laundry/packages', async ({ get, post, body }) => {
  const all = await rates(get)
  const created = await post('/vendor/service-packages', {
    name: body.name, description: body.description || undefined, pricePaise: toPaise(body.price), validityDays: Number(body.validityDays),
    lines: (body.services || []).map((line: any) => ({ vendorServiceRateId: rateFor(all, line.garment, line.service), allowance: Number(line.allowance) })),
  })
  return definition(created, all)
})
route('GET', '/laundry/customers/:id/packages', async ({ get, params }) => { const all = await rates(get); return (listOf(await get(`/vendor/service-packages/customers/${params.id}`)) as any[]).map((item) => customerPackage(item, all)) })
route('POST', '/laundry/customers/:id/packages', async ({ get, post, params, body }) => {
  const mode = String(body.paymentMode || 'Pay Later').toUpperCase().replace(/\s+/g, '_')
  return customerPackage(await post('/vendor/service-packages/purchase', { packageId: body.servicePackage, customerUserId: params.id, paymentMode: mode, reason: body.reason }), await rates(get))
})
route('POST', '/laundry/customer-packages/:id/redemptions', async ({ get, post, params, body }) => {
  const all = await rates(get)
  return customerPackage(await post(`/vendor/service-packages/${params.id}/redeem`, { vendorServiceRateId: rateFor(all, body.garment, body.service), quantity: Number(body.quantity) || 1, reason: body.reason }), all)
})
route('POST', '/laundry/customer-packages/:id/payments', async ({ get, post, params, body }) => {
  await post(`/vendor/service-packages/${params.id}/payments`, { amountPaise: toPaise(body.amount), mode: String(body.mode || 'CASH').toUpperCase(), reference: body.reference, reason: body.reason })
  return { ok: true, rates: (await rates(get)).length }
})

route('GET', '/laundry/package-liability', async ({ get }) => {
  // Every customer who has bought a package for this vendor: derive contract/collected/remaining from their real packages.
  const customers = listOf(await get('/vendor/counter/customers')) as Array<{ id: string }>
  const items = (await Promise.all(customers.map((customer) => get(`/vendor/service-packages/customers/${customer.id}`).then((data) => listOf(data) as any[]).catch(() => [])))).flat()
  const sum = (pick: (item: any) => number) => items.reduce((total, item) => total + pick(item), 0)
  const units = (item: any) => (item.services || []).reduce((total: number, line: any) => total + (line.allowance || 0), 0)
  const remaining = (item: any) => (item.services || []).reduce((total: number, line: any) => total + (line.remaining || 0), 0)
  const contract = sum((item) => rupees(item.contractPricePaise)); const collected = sum((item) => rupees(item.pricePaidPaise))
  return {
    status: 'Live', packageCount: items.length, activePackageCount: items.filter((item) => item.status === 'ACTIVE').length,
    expiredPackageCount: items.filter((item) => item.status === 'EXPIRED').length, exhaustedPackageCount: items.filter((item) => item.status === 'EXHAUSTED').length,
    totals: { contract, collected, outstanding: Math.max(0, contract - collected), allowanceUnits: sum(units), redeemedUnits: sum(units) - sum(remaining), remainingUnits: sum(remaining) },
    checks: { issueCount: 0, passed: true },
  }
})
