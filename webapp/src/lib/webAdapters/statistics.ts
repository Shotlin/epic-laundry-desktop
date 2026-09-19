// Overview page: counter figures from counter orders, online figures from real app orders.
import { route, rupees, listOf } from './core'
import { laundryOrder, type RealOrder } from './orders'

type Period = 'today' | 'week' | 'lifetime'
const dayKey = (value: string | Date) => new Date(value).toISOString().slice(0, 10)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000)

route('GET', '/laundry/statistics', async ({ get, query }) => {
  const period = (['today', 'week', 'lifetime'].includes(query.get('period') || '') ? query.get('period') : 'week') as Period
  const [counterRaw, onlineRaw] = await Promise.all([
    get('/vendor/counter/orders?limit=500').then((data) => listOf(data) as RealOrder[]).catch(() => [] as RealOrder[]),
    get('/vendor-orders?page=1&limit=100').then((data) => listOf(data, 'orders') as any[]).catch(() => [] as any[]),
  ])
  const now = new Date()
  const from = period === 'today' ? dayKey(now) : period === 'week' ? dayKey(addDays(now, -6)) : '1970-01-01'
  const to = dayKey(now)
  const inRange = (value: string) => { const key = dayKey(value); return key >= from && key <= to }

  const orders = counterRaw.map(laundryOrder).filter((order) => inRange(order.createdAt) && order.state !== 'Cancelled')
  const days: string[] = []
  if (period !== 'lifetime') for (let d = new Date(from); dayKey(d) <= to; d = addDays(d, 1)) days.push(dayKey(d))

  const stateCount = new Map<string, number>()
  for (const order of counterRaw.map(laundryOrder).filter((o) => inRange(o.createdAt))) stateCount.set(order.state, (stateCount.get(order.state) || 0) + 1)
  const daily = (dates: string[], pick: (key: string) => number, pickAmount: (key: string) => number) => dates.map((date) => ({ date, orders: pick(date), amount: pickAmount(date) }))
  const dateList = period === 'lifetime' ? [...new Set(orders.map((order) => dayKey(order.createdAt)))].sort() : days

  const revenue = orders.reduce((sum, order) => sum + order.grandTotal, 0)
  const collected = counterRaw.filter((o) => inRange(o.placedAt) && o.status !== 'CANCELLED').reduce((sum, o) => sum + rupees(o.amountPaidPaise), 0)
  const perCustomer = new Map<string, number>()
  for (const order of orders) perCustomer.set(order.customer.name || order.customer.phone, (perCustomer.get(order.customer.name || order.customer.phone) || 0) + 1)
  const mix = new Map<string, { quantity: number; amount: number }>()
  for (const order of orders) for (const item of order.items) { const entry = mix.get(item.serviceName) || { quantity: 0, amount: 0 }; entry.quantity += item.qty; entry.amount += item.amount; mix.set(item.serviceName, entry) }

  const online = onlineRaw.filter((order) => inRange(order.created_at) && !['VENDOR_REJECTED', 'AUTO_REJECTED', 'CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'CANCELLED'].includes(order.status))
  const garments = new Map<string, { quantity: number; amount: number }>()
  for (const order of online) for (const item of order.items || []) { const entry = garments.get(item.name) || { quantity: 0, amount: 0 }; entry.quantity += Number(item.quantity) || 0; entry.amount += rupees(item.total_paise); garments.set(item.name, entry) }

  return {
    period, from, to,
    ordersReview: {
      total: orders.length, breakdown: [...stateCount.entries()].map(([state, count]) => ({ state, count })),
      daily: daily(dateList, (key) => orders.filter((o) => dayKey(o.createdAt) === key).length, (key) => orders.filter((o) => dayKey(o.createdAt) === key).reduce((s, o) => s + o.grandTotal, 0)),
    },
    revenue: { total: revenue, averageOrderValue: orders.length ? revenue / orders.length : 0 },
    collection: { total: collected, daily: dateList.map((date) => ({ date, amount: counterRaw.filter((o) => dayKey(o.placedAt) === date && o.status !== 'CANCELLED').reduce((s, o) => s + rupees(o.amountPaidPaise), 0) })) },
    customerFrequency: { total: perCustomer.size, repeatCustomers: [...perCustomer.values()].filter((count) => count > 1).length, breakdown: [...perCustomer.entries()].map(([customer, visits]) => ({ customer, visits })).sort((a, b) => b.visits - a.visits).slice(0, 10) },
    newCustomer: { total: perCustomer.size, daily: dateList.map((date) => ({ date, count: new Set(orders.filter((o) => dayKey(o.createdAt) === date).map((o) => o.customer.id)).size })) },
    serviceMix: [...mix.entries()].map(([service, value]) => ({ service, ...value })).sort((a, b) => b.amount - a.amount),
    online: {
      count: online.length, estimatedRevenue: online.reduce((sum, order) => sum + rupees(order.estimated_amount_paise), 0),
      topGarments: [...garments.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.amount - a.amount).slice(0, 6),
    },
  }
})
