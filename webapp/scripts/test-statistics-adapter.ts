import assert from 'node:assert/strict'
import { localDateKey } from '../src/lib/utils'
import { matchAdapter } from '../src/lib/webAdapters/core'
import '../src/lib/webAdapters/statistics'

const toDate = (date: Date) => localDateKey(date)
const today = toDate(new Date())
const yesterdayDate = new Date()
yesterdayDate.setDate(yesterdayDate.getDate() - 1)
const yesterday = toDate(yesterdayDate)

function order(id: string, date: string, customerId: string, customer: string, totalPaise: number, paidPaise: number) {
  return {
    id, orderNumber: `INV-${id}`, customer: { id: customerId, name: customer, phone: '9000000000' }, items: [],
    subtotalPaise: totalPaise, chargesPaise: 0, discountsPaise: 0, taxRateBps: 0, taxPaise: 0, totalPaise,
    paymentMode: 'CASH', amountPaidPaise: paidPaise, paymentStatus: 'PAID', status: 'BOOKED', version: 1, source: 'COUNTER',
    orderDate: date, expectedDeliveryDate: date, fulfillmentMode: 'Pickup Order', deliveryAddress: null, serviceZone: null,
    notes: null, photoPath: null, pickupRider: null, deliveryRider: null,
    placedAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
  }
}

const sourceOrders = [
  order('today', today, 'customer-today', 'Today Customer', 10000, 4000),
  order('yesterday', yesterday, 'customer-yesterday', 'Yesterday Customer', 5000, 2500),
]
const sourceCustomers = [
  { id: 'customer-today', name: 'Today Customer', phone: '9000000000', createdAt: `${today}T10:00:00.000Z` },
  { id: 'customer-yesterday', name: 'Yesterday Customer', phone: '9000000001', createdAt: `${yesterday}T10:00:00.000Z` },
]

async function get(path: string): Promise<any> {
  if (path === '/vendor/counter/orders?limit=500') return sourceOrders
  if (path === '/vendor-orders?page=1&limit=100') return { orders: [] }
  if (path === '/vendor/counter/customers') return sourceCustomers
  throw new Error(`Unexpected adapter request: ${path}`)
}

async function invoke(path: string) {
  const matched = matchAdapter('GET', path)
  assert.ok(matched, `No GET adapter matched ${path}`)
  return matched.fn({
    get, post: async () => { throw new Error('Unexpected POST') }, put: async () => { throw new Error('Unexpected PUT') },
    patch: async () => { throw new Error('Unexpected PATCH') }, del: async () => { throw new Error('Unexpected DELETE') },
    params: matched.params, query: matched.query, body: undefined,
  }) as Promise<any>
}

const result = await invoke(`/laundry/statistics?ordersReviewPeriod=today&collectionPeriod=custom&collectionFrom=${yesterday}&collectionTo=${yesterday}&customerFrequencyPeriod=yesterday&newCustomerPeriod=today`)
assert.deepEqual(Object.fromEntries(Object.entries(result.ranges).map(([key, range]: [string, any]) => [key, range.period])), {
  ordersReview: 'today', collection: 'custom', customerFrequency: 'yesterday', newCustomer: 'today',
})
assert.equal(result.ordersReview.total, 1, 'Orders Review applies its own Today window')
assert.equal(result.revenue.total, 100, 'Revenue follows Orders Review')
assert.equal(result.collection.total, 25, 'Collection follows the independent custom window')
assert.equal(result.collection.daily.length, 1, 'Custom Collection returns its selected days')
assert.equal(result.customerFrequency.total, 1, 'Customer Frequency follows its own Yesterday window')
assert.equal(result.newCustomer.total, 1, 'New Customer counts customer profiles created in its own window')
await assert.rejects(() => invoke('/laundry/statistics?collectionPeriod=custom&collectionFrom=bad&collectionTo=2026-09-30'), /valid custom start and end date/)

console.log('PASS  independent website Overview adapter self-test complete')
