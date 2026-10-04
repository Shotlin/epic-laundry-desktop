// Website-build only. Many pages were written against the local desktop
// server's own endpoints (e.g. /laundry/dashboard), which do not exist on
// the real LNDRY backend. Each entry here answers one of those paths by
// calling the real /api/v1 endpoints and reshaping the result into what the
// page already expects — the page itself is not changed. Anything not
// listed here still calls the real backend at its original path (and will
// 404 until it gets an adapter). Electron never uses this file: api.ts only
// consults it when isWebOnly is true.
import type { LaundryDashboard } from '../laundry'
import { route, rupees, listOf, type Real } from './core'
import { laundryOrder, queueMatches, type RealOrder as RealCounterOrder } from './orders'

type Get = Real['get']

type RealOrder = { status: string; total_amount?: string | number; created_at?: string }

const CLOSED = new Set(['DELIVERED', 'CANCELLED', 'REJECTED', 'EXPIRED'])

async function dashboard(get: Get): Promise<LaundryDashboard> {
  const [pos, ordersPage, counterPage] = await Promise.all([
    get('/vendor/pos/dashboard'),
    get('/vendor-orders?page=1&limit=100').catch(() => [] as RealOrder[]),
    get('/vendor/counter/orders?limit=500').catch(() => [] as RealCounterOrder[]),
  ])
  // The headline cards link to the counter's Orders page, so they count the counter's own orders (the same queues that
  // page applies). Orders that arrive from the LNDRY app are shown in the online sections below, never mixed in.
  const counter = (listOf(counterPage) as RealCounterOrder[]).map(laundryOrder)
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const counterQueue = (queue: string) => counter.filter((order) => queueMatches(queue, order, today, soon)).length
  // The real endpoint returns the orders array directly as `data`
  // (pagination travels in the response meta), not `{orders: [...]}`.
  const orders: RealOrder[] = listOf(ordersPage, 'orders')
  const asOf: string = pos?.asOf || new Date().toISOString().slice(0, 10)
  const count = (...statuses: string[]) => orders.filter((order) => statuses.includes(order.status)).length
  const open = orders.filter((order) => !CLOSED.has(order.status))
  const counterToday = rupees(pos?.counterSalesToday?.revenuePaise)
  const awaiting = count('WAITING_VENDOR_CONFIRMATION')
  const onlineEstimate = open.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0)
  const topGarments = Array.isArray(pos?.topGarmentsLast7Days)
    ? pos.topGarmentsLast7Days.map((row: { name: string; units: number; revenuePaise: number }) => ({ name: row.name, quantity: row.units, amount: rupees(row.revenuePaise) }))
    : []

  return {
    asOf,
    kpis: {
      collection: pos?.counterSalesToday?.collectedPaise != null ? rupees(pos.counterSalesToday.collectedPaise) : counterToday,
      orderRequests: awaiting,
      pendingOrders: counterQueue('pending'),
      booking: counterQueue('booking'),
      delivery: counterQueue('delivery'),
      delivered: counterQueue('delivered'),
      todayRevenue: counterToday,
      upcomingDeliveries: counterQueue('delivery-due'),
    },
    attention: [
      { id: 'requests', label: 'Order requests', count: awaiting, tone: 'slate' },
      { id: 'pickup', label: 'Pickup to assign', count: counterQueue('pickup-unassigned'), tone: 'amber' },
      { id: 'upcoming', label: 'Upcoming delivery', count: counterQueue('delivery-due'), tone: 'blue' },
    ],
    trend: [],
    fulfillmentBreakdown: [],
    topGarments,
    topServices: [],
    recent: [],
    marketplace: {
      configured: true,
      newOrders: awaiting,
      awaitingAcceptance: awaiting,
      pickupToday: 0,
      intakePending: count('RECEIVED_AT_VENDOR'),
      customerApprovalRequired: 0,
      overdue: 0,
      productionRisk: 0,
      ready: count('PACKED'),
      deliveryToday: count('OUT_FOR_DELIVERY'),
      paymentAttention: 0,
      syncIssues: 0,
      channelBreakdown: {},
    },
    online: {
      count: open.length,
      todayCount: orders.filter((order) => String(order.created_at || '').slice(0, 10) === asOf).length,
      estimatedRevenue: onlineEstimate,
      topGarments: [],
    },
  }
}

route('GET', '/laundry/dashboard', ({ get }) => dashboard(get))
