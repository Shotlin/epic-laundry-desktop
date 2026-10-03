// Overview figures use four independent date windows, matching the source workspace.
import { route, rupees, listOf } from './core'
import { laundryOrder, type RealOrder } from './orders'
import { localDateKey } from '@/lib/utils'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom' | 'lifetime'
type Range = { period: Period; from: string; to: string }
const dayKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : localDateKey(date)
}
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
const round = (value: number) => Math.round(value * 100) / 100

function resolveRange(query: URLSearchParams, key: string, fallback: Period, legacy?: Period, earliest?: string): Range {
  const rawPeriod = query.get(`${key}Period`)
  const period = (['today', 'yesterday', 'week', 'month', 'quarter', 'year', 'custom', 'lifetime'].includes(rawPeriod || '') ? rawPeriod : legacy || fallback) as Period
  const today = new Date()
  const to = localDateKey(today)
  if (period === 'custom') {
    const from = query.get(`${key}From`) || ''
    const customTo = query.get(`${key}To`) || ''
    if (!validDate(from) || !validDate(customTo) || from > customTo) throw new Error('Choose a valid custom start and end date.')
    return { period, from, to: customTo }
  }
  if (period === 'lifetime') return { period, from: earliest || '1970-01-01', to }
  if (period === 'today') return { period, from: to, to }
  if (period === 'yesterday') { const yesterday = localDateKey(addDays(today, -1)); return { period, from: yesterday, to: yesterday } }
  if (period === 'week') return { period, from: localDateKey(addDays(today, -6)), to }
  if (period === 'month') return { period, from: localDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to }
  if (period === 'quarter') return { period, from: localDateKey(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)), to }
  return { period, from: localDateKey(new Date(today.getFullYear(), 0, 1)), to }
}

route('GET', '/laundry/statistics', async ({ get, query }) => {
  const keys = ['ordersReview', 'collection', 'customerFrequency', 'newCustomer']
  const hasSectionFilters = keys.some((key) => query.has(`${key}Period`) || query.has(`${key}From`) || query.has(`${key}To`))
  const legacyPeriod = (['today', 'week', 'lifetime'].includes(query.get('period') || '') ? query.get('period') : undefined) as Period | undefined
  const [counterRaw, onlineRaw, customerRaw] = await Promise.all([
    get('/vendor/counter/orders?limit=500').then((data) => listOf(data) as RealOrder[]).catch(() => [] as RealOrder[]),
    get('/vendor-orders?page=1&limit=100').then((data) => listOf(data, 'orders') as any[]).catch(() => [] as any[]),
    get('/vendor/counter/customers').then((data) => listOf(data) as Array<{ id?: string; name?: string; displayName?: string; phone?: string; createdAt?: string; created_at?: string }>).catch(() => []),
  ])
  const earliestOrder = counterRaw.map((order) => dayKey(laundryOrder(order).createdAt)).filter(Boolean).sort()[0]
  const defaultFor = (key: string): Period => key === 'collection' || key === 'newCustomer' ? 'week' : 'today'
  const ranges = Object.fromEntries(keys.map((key) => [key, resolveRange(query, key, defaultFor(key), hasSectionFilters ? undefined : legacyPeriod, earliestOrder)])) as Record<typeof keys[number], Range>
  const inRange = (value: string, range: Range) => { const key = dayKey(value); return Boolean(key) && key >= range.from && key <= range.to }
  const dates = (range: Range, orders: ReturnType<typeof laundryOrder>[]) => {
    if (range.period === 'lifetime') return [...new Set(orders.map((order) => dayKey(order.createdAt)).filter(Boolean))].sort()
    const list: string[] = []
    for (let date = new Date(`${range.from}T00:00:00`); localDateKey(date) <= range.to && list.length < 3661; date = addDays(date, 1)) list.push(localDateKey(date))
    return list
  }
  const orders = counterRaw.map(laundryOrder).filter((order) => inRange(order.createdAt, ranges.ordersReview) && order.state !== 'Cancelled')
  const orderDates = dates(ranges.ordersReview, orders)
  const collectionDates = ranges.collection.period === 'lifetime'
    ? [...new Set(counterRaw.map((order) => dayKey(order.placedAt)).filter((key) => key >= ranges.collection.from && key <= ranges.collection.to))].sort()
    : dates(ranges.collection, [])
  const frequencyOrders = counterRaw.map(laundryOrder).filter((order) => inRange(order.createdAt, ranges.customerFrequency) && order.state !== 'Cancelled')
  const frequency = new Map<string, { customer: string; visits: number }>()
  for (const order of frequencyOrders) {
    const key = order.customer.id || order.customer.phone || order.customer.name || 'Unknown customer'
    const current = frequency.get(key) || { customer: order.customer.name || order.customer.phone || 'Unknown customer', visits: 0 }
    current.visits += 1
    frequency.set(key, current)
  }
  const newCustomers = customerRaw.filter((customer) => inRange(customer.createdAt || customer.created_at || '', ranges.newCustomer))
  const newCustomerDates = ranges.newCustomer.period === 'lifetime'
    ? [...new Set(newCustomers.map((customer) => dayKey(customer.createdAt || customer.created_at || '')).filter(Boolean))].sort()
    : dates(ranges.newCustomer, [])
  const stateCount = new Map<string, number>()
  for (const order of counterRaw.map(laundryOrder).filter((item) => inRange(item.createdAt, ranges.ordersReview))) stateCount.set(order.state, (stateCount.get(order.state) || 0) + 1)
  const daily = (values: string[], rows: ReturnType<typeof laundryOrder>[]) => values.map((date) => {
    const dayOrders = rows.filter((order) => dayKey(order.createdAt) === date)
    return { date, orders: dayOrders.length, amount: dayOrders.reduce((sum, order) => sum + order.grandTotal, 0) }
  })
  const collectedForDate = (date: string) => counterRaw.filter((order) => dayKey(order.placedAt) === date && order.status !== 'CANCELLED').reduce((sum, order) => sum + rupees(order.amountPaidPaise), 0)
  const mix = new Map<string, { quantity: number; amount: number }>()
  for (const order of orders) for (const item of order.items) { const entry = mix.get(item.serviceName) || { quantity: 0, amount: 0 }; entry.quantity += item.qty; entry.amount += item.amount; mix.set(item.serviceName, entry) }
  const online = onlineRaw.filter((order) => inRange(order.created_at, ranges.ordersReview) && !['VENDOR_REJECTED', 'AUTO_REJECTED', 'CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'CANCELLED'].includes(order.status))
  const garments = new Map<string, { quantity: number; amount: number }>()
  for (const order of online) for (const item of order.items || []) { const entry = garments.get(item.name) || { quantity: 0, amount: 0 }; entry.quantity += Number(item.quantity) || 0; entry.amount += rupees(item.total_paise); garments.set(item.name, entry) }
  const revenue = orders.reduce((sum, order) => sum + order.grandTotal, 0)
  const collected = collectionDates.reduce((sum, date) => sum + collectedForDate(date), 0)

  return {
    period: ranges.ordersReview.period, from: ranges.ordersReview.from, to: ranges.ordersReview.to, ranges,
    ordersReview: { total: orders.length, breakdown: [...stateCount.entries()].map(([state, count]) => ({ state, count })), daily: daily(orderDates, orders) },
    revenue: { total: revenue, averageOrderValue: orders.length ? revenue / orders.length : 0 },
    collection: { total: collected, daily: collectionDates.map((date) => ({ date, amount: collectedForDate(date) })) },
    customerFrequency: { total: frequency.size, repeatCustomers: [...frequency.values()].filter((item) => item.visits > 1).length, breakdown: [...frequency.values()].sort((a, b) => b.visits - a.visits).slice(0, 10) },
    newCustomer: { total: newCustomers.length, daily: newCustomerDates.map((date) => ({ date, count: newCustomers.filter((customer) => dayKey(customer.createdAt || customer.created_at || '') === date).length })) },
    serviceMix: [...mix.entries()].map(([service, value]) => ({ service, ...value })).sort((a, b) => b.amount - a.amount),
    online: { count: online.length, estimatedRevenue: online.reduce((sum, order) => sum + rupees(order.estimated_amount_paise), 0), topGarments: [...garments.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.amount - a.amount).slice(0, 6) },
  }
})
