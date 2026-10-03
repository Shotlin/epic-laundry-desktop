// Counter orders: booking, list, detail, lifecycle, payments, customers.
// Backed by the real /api/v1/vendor/counter module (store_orders work orders).
import type { LaundryOrder } from '../laundry'
import { route, rupees, toPaise, onlyDigits, listOf, breakdownOf, AdapterUnavailable } from './core'
import { unitLabel } from './catalogue'
import { forgetCatalogue } from './quote'

const STATE_LABEL: Record<string, LaundryOrder['state']> = {
  BOOKED: 'Booked', PICKED_UP: 'Picked Up', IN_PROCESS: 'In Process', READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
}
export const stateToWire = (label: string) => String(label || '').toUpperCase().replace(/\s+/g, '_')

const MODE_LABEL: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK: 'Bank', WALLET: 'LNDRY Wallet' }
const PAYMENT_LABEL: Record<string, string> = { PAID: 'Paid', PART_PAID: 'Part Paid', UNPAID: 'Unpaid' }
export const modeToWire = (label: string) => {
  const key = String(label || '').toUpperCase().replace(/\s+/g, '_')
  return key === 'LNDRY_WALLET' ? 'WALLET' : key
}

export type RealOrder = {
  id: string; orderNumber: string; customer: { id: string; name: string; phone: string }
  items: Array<{ garmentId?: string; serviceId?: string; garmentTypeId?: string | null; vendorServiceId?: string | null; name: string; serviceName: string; categoryName?: string | null; unit: string; qty: number; ratePaise: number; amountPaise: number }>
  subtotalPaise: number; chargesPaise: number; discountsPaise: number; taxRateBps: number; taxPaise: number; totalPaise: number
  priceBreakdown?: { charges?: any[]; discounts?: any[]; tax?: any } | null
  paymentMode: string | null; amountPaidPaise: number; paymentStatus: string; status: string; version: number; source: string
  orderDate: string; expectedDeliveryDate: string | null; fulfillmentMode: string | null; deliveryAddress: string | null; serviceZone: string | null
  notes: string | null; photoPath: string | null; pickupRider: { id: string; name: string; phone: string } | null
  deliveryRider: { id: string; name: string; phone: string } | null; placedAt: string; updatedAt: string
}

export function laundryOrder(order: RealOrder): LaundryOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber: order.orderNumber,
    customer: { id: order.customer.id, name: order.customer.name, phone: order.customer.phone },
    orderDate: order.orderDate,
    expectedDeliveryDate: order.expectedDeliveryDate || order.orderDate,
    fulfillmentMode: order.fulfillmentMode || 'Pickup Order',
    deliveryAddress: order.deliveryAddress || undefined,
    serviceZone: order.serviceZone || undefined,
    state: STATE_LABEL[order.status] || 'Booked',
    version: order.version,
    itemCount: order.items.length,
    subtotal: rupees(order.subtotalPaise),
    charges: rupees(order.chargesPaise),
    discounts: rupees(order.discountsPaise),
    taxRate: (order.taxRateBps || 0) / 100,
    taxAmount: rupees(order.taxPaise),
    grandTotal: rupees(order.totalPaise),
    breakdown: breakdownOf(order.priceBreakdown, order),
    paymentMode: order.paymentMode ? MODE_LABEL[order.paymentMode] || order.paymentMode : 'Pay Later',
    paymentStatus: PAYMENT_LABEL[order.paymentStatus] || 'Unpaid',
    source: 'Counter',
    pickupRider: order.pickupRider || undefined,
    deliveryRider: order.deliveryRider || undefined,
    pickupSlot: '',
    deliverySlot: '',
    items: order.items.map((item) => ({
      garment: item.garmentId || item.garmentTypeId || undefined, service: item.serviceId || item.vendorServiceId || undefined, garmentName: item.name, serviceName: item.serviceName,
      unit: unitLabel(item.unit), qty: item.qty, rate: rupees(item.ratePaise), amount: rupees(item.amountPaise),
    })),
    notes: order.notes || '',
    photoPaths: order.photoPath || '',
    createdAt: order.placedAt,
    updatedAt: order.updatedAt,
  }
}

type Detail = {
  order: RealOrder
  units: Array<{ id: string; tagCode: string; sequence: number; itemIndex: number; state: string; location: string; condition: string; garmentName: string; createdAt: string; updatedAt: string }>
  containers: Array<{ id: string; tagCode: string; sequence: number; total: number; weightKg: number | null; orderWeightKg?: number; state: string; location: string; condition: string; createdAt: string; updatedAt: string; deliveredAt?: string }>
  payments: Array<{ id: string; amountPaise: number; mode: string; reference: string | null; createdAt: string }>
  history?: Array<{ id: string; from: string | null; to: string; note: string | null; by: string | null; at: string }>
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase()

/** The customer receipt for an order: its lines and the labelled price breakdown, as calculated when it was booked. */
export function receiptOf(order: LaundryOrder) {
  return {
    orderNumber: order.orderNumber, invoiceNumber: order.orderNumber, customer: { name: order.customer.name, phone: order.customer.phone },
    orderDate: order.orderDate, expectedDeliveryDate: order.expectedDeliveryDate, fulfillmentMode: order.fulfillmentMode,
    items: order.items, subtotal: order.subtotal, charges: order.charges, discounts: order.discounts, taxAmount: order.taxAmount, taxRate: order.taxRate,
    breakdown: order.breakdown, grandTotal: order.grandTotal, paymentMode: order.paymentMode, paymentStatus: order.paymentStatus,
  }
}

function detailShape(detail: Detail) {
  const base = laundryOrder(detail.order)
  const customer = { name: detail.order.customer.name, phone: detail.order.customer.phone }
  const dueDate = base.expectedDeliveryDate
  const stage = (state: string) => String(state || '').replace(/_/g, ' ')
  const tags = detail.units.map((unit) => ({
    unitId: unit.id, state: stage(unit.state),
    tagNumber: unit.tagCode, tagKind: 'garment' as const, garment: unit.garmentName, service: detail.order.items[unit.itemIndex]?.serviceName || '', category: detail.order.items[unit.itemIndex]?.categoryName || undefined,
    sequence: unit.sequence, total: detail.order.items[unit.itemIndex]?.qty || 1, orderDate: base.orderDate, expectedDeliveryDate: dueDate,
    orderNumber: base.orderNumber, customer: customer.name,
  }))
  // Bag / container tags of the order (weight-billed lines), in the same shape a booking returns them.
  const containerTags = detail.containers.map((container) => ({
    containerId: container.id, tagNumber: container.tagCode, tagPayload: container.tagCode, tagKind: 'container' as const,
    orderNumber: base.orderNumber, customer: customer.name, garment: 'Bag', service: 'Bulk laundry', sequence: container.sequence, total: container.total,
    weightKg: container.weightKg ?? undefined, orderDate: base.orderDate, expectedDeliveryDate: dueDate, state: stage(container.state),
  }))
  return {
    ...base,
    receipt: receiptOf(base),
    containerTags,
    physicalUnits: detail.units.map((unit) => ({
      id: unit.id, code: unit.tagCode, tagCode: unit.tagCode, orderId: base.id, orderNumber: base.orderNumber, customer,
      garment: { name: unit.garmentName }, service: { name: detail.order.items[unit.itemIndex]?.serviceName || '' }, unit: 'Piece',
      sequence: unit.sequence, itemIndex: unit.itemIndex, state: titleCase(unit.state), location: unit.location, condition: unit.condition,
      expectedDeliveryDate: dueDate,
    })),
    containers: detail.containers.map((container) => ({
      id: container.id, tagCode: container.tagCode, tagPayload: container.tagCode, orderId: base.id, orderNumber: base.orderNumber, customer,
      sequence: container.sequence, total: container.total, weightKg: container.weightKg ?? undefined, state: titleCase(container.state),
      location: container.location, condition: container.condition, expectedDeliveryDate: dueDate,
      createdAt: container.createdAt, updatedAt: container.updatedAt, deliveredAt: container.deliveredAt,
    })),
    tags,
    timeline: [
      { id: `${base.id}:booked`, ts: base.createdAt, action: `Order booked at the counter` },
      // Every status change, exactly as the backend recorded it (who moved it, and any override they used).
      ...(detail.history || []).filter((event) => event.from).map((event) => ({
        id: event.id, ts: event.at,
        action: `Status changed: ${STATE_LABEL[event.from || ''] || event.from} → ${STATE_LABEL[event.to] || event.to}${event.by ? ` by ${event.by}` : ''}${event.note ? ` (${event.note})` : ''}`,
      })),
      ...detail.payments.map((payment) => ({ id: payment.id, ts: payment.createdAt, action: `${MODE_LABEL[payment.mode] || payment.mode} payment of ₹${rupees(payment.amountPaise).toFixed(2)} recorded` })),
    ].sort((a, b) => String(a.ts).localeCompare(String(b.ts))),
  }
}

function paymentSummary(order: RealOrder, payments: Detail['payments']) {
  const total = rupees(order.totalPaise)
  const paid = rupees(order.amountPaidPaise)
  return {
    orderId: order.id, invoiceId: order.id, invoiceNumber: order.orderNumber, total, paid, outstanding: Math.max(0, total - paid),
    status: (PAYMENT_LABEL[order.paymentStatus] || 'Unpaid') as 'Paid' | 'Part Paid' | 'Unpaid',
    payments: payments.map((payment) => ({
      id: payment.id, amount: rupees(payment.amountPaise), mode: MODE_LABEL[payment.mode] || payment.mode, reference: payment.reference || '',
      providerStatus: 'Manual', postingDate: payment.createdAt.slice(0, 10), remarks: '',
    })),
    provider: { mode: 'Manual', onlineConfirmation: false, note: 'Recorded at the counter.' },
  }
}

// ── Booking ───────────────────────────────────────────────────────────────
route('POST', '/laundry/orders', async ({ post, body }) => {
  const result = await post('/vendor/counter/orders', {
    customer: body.customer?.id ? { id: body.customer.id } : { name: body.customer?.name, phone: body.customer?.phone },
    items: (body.items || []).map((item: any) => ({ garmentId: item.garment, serviceId: item.service, qty: Number(item.qty) })),
    expectedDeliveryDate: body.expectedDeliveryDate, fulfillmentMode: body.fulfillmentMode, serviceZone: body.serviceZone,
    deliveryAddress: body.customer?.address || undefined, notes: body.notes, photoPath: body.photoPaths || undefined,
    paymentMode: body.paymentMode === 'Pay Later' || !body.paymentMode ? 'PAY_LATER' : modeToWire(body.paymentMode),
    paymentReference: body.paymentReference, cashRegister: body.cashRegister, containerCount: body.containerCount,
    chargesPaise: toPaise(body.charges), discountsPaise: toPaise(body.discounts), taxRatePercent: Number(body.taxRate) || 0,
    chargeRuleIds: body.chargeRuleIds || [], discountRuleIds: body.discountRuleIds || [],
    walletRedemption: body.walletRedemption, idempotencyKey: body.idempotencyKey,
  })
  forgetCatalogue()
  const order = laundryOrder(result.order)
  return {
    order: { id: order.id, orderNumber: order.orderNumber },
    receipt: receiptOf(order),
    tags: result.tags || [],
    containerTags: result.containerTags || [],
  }
})

// ── Listing and detail ────────────────────────────────────────────────────
// The Orders page sends its filters (status, phone, order no., customer, source, dashboard queue).
// The backend list takes only state/search/date, so the rest are applied here on the fetched page of orders.
const STATUS_FILTER: Record<string, (order: LaundryOrder) => boolean> = {
  booked: (o) => o.state === 'Booked',
  'in-process': (o) => o.state === 'In Process',
  delivered: (o) => o.state === 'Delivered',
  cancelled: (o) => o.state === 'Cancelled',
  done: (o) => o.state === 'Ready',
  'partially-delivered': () => false, // counter orders are delivered whole
  'pickup-assigned': (o) => o.state === 'Booked' && Boolean(o.pickupRider),
  'pickup-received': (o) => o.state === 'Picked Up',
  'out-for-delivery': (o) => o.state === 'Out for Delivery',
}
const CLOSED_STATES = new Set(['Delivered', 'Cancelled'])
const day = (value: unknown) => String(value || '').slice(0, 10)
function queueMatches(queue: string, order: LaundryOrder, today: string, soon: string): boolean {
  switch (queue) {
    case 'pending': return !CLOSED_STATES.has(order.state)
    case 'booking': return order.state === 'Booked'
    case 'delivery': return order.state === 'Out for Delivery'
    case 'delivered': return order.state === 'Delivered'
    case 'pickup-unassigned': return order.state === 'Booked' && !order.pickupRider
    case 'delivery-due': return !CLOSED_STATES.has(order.state) && day(order.expectedDeliveryDate) <= soon
    case 'delivery-unassigned': return (order.state === 'Ready' || order.state === 'Out for Delivery') && order.fulfillmentMode === 'Delivery Order' && !order.deliveryRider
    case 'express': return false // the counter has no express orders
    default: return true
  }
}
function filterOrders(all: LaundryOrder[], query: URLSearchParams): LaundryOrder[] {
  const phone = onlyDigits(query.get('phone'))
  const orderNo = String(query.get('orderNo') || '').trim().toLowerCase()
  const customer = String(query.get('customer') || '').trim().toLowerCase()
  const statuses = String(query.get('status') || '').split(',').map((value) => value.trim()).filter((value) => value in STATUS_FILTER)
  const source = query.get('source')
  const queue = query.get('queue')
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  return all.filter((order) => {
    if (phone && !onlyDigits(order.customer.phone).includes(phone)) return false
    if (orderNo && !order.orderNumber.toLowerCase().includes(orderNo)) return false
    if (customer && !String(order.customer.name || '').toLowerCase().includes(customer)) return false
    if (statuses.length && !statuses.some((status) => STATUS_FILTER[status](order))) return false
    if (source && source !== 'all' && order.source !== source) return false
    if (queue && !queueMatches(queue, order, today, soon)) return false
    return true
  })
}
route('GET', '/laundry/orders', async ({ get, query }) => {
  const params = new URLSearchParams()
  const state = query.get('state'); if (state) params.set('status', stateToWire(state))
  for (const key of ['search', 'from', 'to']) { const value = query.get(key); if (value) params.set(key, value) }
  params.set('limit', '500')
  const all = filterOrders((listOf(await get(`/vendor/counter/orders?${params}`)) as RealOrder[]).map(laundryOrder), query)
  // Callers that do not paginate (Print Centre search) expect the bare list.
  if (!query.get('page')) return all
  const pageSize = Math.max(1, Number(query.get('pageSize')) || 50)
  const page = Math.max(1, Number(query.get('page')) || 1)
  return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize, totalPages: Math.max(1, Math.ceil(all.length / pageSize)) }
})
// Must be registered before '/laundry/orders/:id', which would otherwise read "filter-options" as an order id.
route('GET', '/laundry/orders/filter-options', async () => ({ sources: ['Counter'], reporters: [] as string[] }))

route('GET', '/laundry/orders/:id', async ({ get, params }) => detailShape(await get(`/vendor/counter/orders/${params.id}`)))

route('POST', '/laundry/orders/:id/transition', async ({ post, params, body }) => {
  const result = await post(`/vendor/counter/orders/${params.id}/transition`, {
    state: stateToWire(body.state), version: body.expectedVersion,
    ...(body.allowIncomplete ? { allowIncomplete: true } : {}), ...(body.allowUnpaid ? { allowUnpaid: true } : {}),
  })
  return laundryOrder(result.order)
})

route('POST', '/laundry/orders/:id/cancel', async ({ post, params, body }) => laundryOrder((await post(`/vendor/counter/orders/${params.id}/cancel`, { reason: body.reason })).order))

route('PATCH', '/laundry/orders/:id', async ({ patch, params, body }) => {
  const result = await patch(`/vendor/counter/orders/${params.id}`, {
    notes: body.notes, expectedDeliveryDate: body.expectedDeliveryDate, deliveryAddress: body.deliveryAddress,
    serviceZone: body.serviceZone, fulfillmentMode: body.fulfillmentMode, version: body.expectedVersion,
  })
  return laundryOrder(result.order)
})

route('POST', '/laundry/orders/:id/assign', async ({ post, params, body }) => {
  const result = await post(`/vendor/counter/orders/${params.id}/assign`, { pickupRiderId: body.pickupRiderId, deliveryRiderId: body.deliveryRiderId })
  return laundryOrder(result.order)
})

route('GET', '/laundry/orders/:id/payments', async ({ get, params }) => {
  const detail = (await get(`/vendor/counter/orders/${params.id}`)) as Detail
  return paymentSummary(detail.order, detail.payments)
})

route('POST', '/laundry/orders/:id/payments', async ({ post, params, body }) => {
  const result = await post(`/vendor/counter/orders/${params.id}/payments`, {
    amountPaise: toPaise(body.amount), mode: modeToWire(body.mode), reference: body.reference, cashRegister: body.cashRegister,
  })
  return { summary: paymentSummary(result.order, result.payments) }
})

route('GET', '/laundry/orders/:id/fulfillment', async () => [])
route('POST', '/laundry/orders/:id/fulfillment', async () => { throw new AdapterUnavailable('Recording partial pickups and deliveries') })
route('POST', '/laundry/payments/:id/reverse', async () => { throw new AdapterUnavailable('Reversing a payment') })

// ── Customers ─────────────────────────────────────────────────────────────
type RealCustomer = { id: string; name: string; phone: string; lastOrderAt?: string; orderCount?: number; spentPaise?: number }

async function counterCustomers(get: (p: string) => Promise<any>, search: string) {
  const list = listOf(await get(`/vendor/counter/customers?search=${encodeURIComponent(search)}`)) as RealCustomer[]
  return list
}

route('GET', '/laundry/customers', async ({ get, query }) => {
  const search = query.get('search') || ''
  const found = new Map<string, { id: string; name: string; phone: string; email: string; address: string }>()
  for (const customer of await counterCustomers(get, search)) found.set(customer.id, { id: customer.id, name: customer.name, phone: customer.phone, email: '', address: '' })
  return [...found.values()]
})

route('GET', '/laundry/customers/remote-lookup', async ({ post, query }) => {
  const phone = onlyDigits(query.get('phone'))
  if (phone.length < 10) return { match: null }
  try {
    const found = await post('/vendor/customers/resolve-phone', { phone })
    return found?.userId ? { match: { userId: found.userId as string, name: (found.name as string) || undefined, phone } } : { match: null }
  } catch (error) {
    // Only "no LNDRY account for this number" means no match. Anything else (the vendor's type just changed, a rate
    // limit, a network blip) is an ERROR, not an answer — it must not be cached as "no such customer".
    if ((error as { code?: string })?.code === 'NOT_FOUND') return { match: null }
    throw error
  }
})

route('POST', '/laundry/customers/adopt-remote', async ({ body }) => ({ id: body.userId as string, name: (body.name as string) || '', phone: onlyDigits(body.phone), email: '', address: '' }))

route('POST', '/laundry/customers', async ({ post, body }) => {
  const result = await post('/vendor/counter/customers', { name: body.name, phone: body.phone })
  return { id: result.customer.id, name: result.customer.name || '', phone: result.customer.phone, email: '', address: '' }
})

route('GET', '/laundry/customers/online-only', async ({ get }) => {
  const [counter, online] = await Promise.all([
    counterCustomers(get, ''),
    get('/vendor-orders?page=1&limit=100').catch(() => []),
  ])
  const counterIds = new Set(counter.map((customer) => customer.id))
  const byUser = new Map<string, { name: string; phone: string; orderCount: number; lastOrderAt: string }>()
  for (const order of listOf(online, 'orders') as any[]) {
    if (!order.user_id || counterIds.has(order.user_id)) continue
    const entry = byUser.get(order.user_id) || { name: order.customer_name || '', phone: order.customer_phone || '', orderCount: 0, lastOrderAt: order.created_at || '' }
    entry.orderCount += 1
    if ((order.created_at || '') > entry.lastOrderAt) entry.lastOrderAt = order.created_at
    byUser.set(order.user_id, entry)
  }
  return [...byUser.values()]
})

route('GET', '/laundry/customer-insights', async ({ get }) => {
  const customers = await counterCustomers(get, '')
  return {
    asOf: new Date().toISOString(),
    summary: { totalCustomers: customers.length, revenue: rupees(customers.reduce((sum, c) => sum + (c.spentPaise || 0), 0)) },
    customers: customers.map((customer) => ({
      customerId: customer.id, orderCount: customer.orderCount || 0, revenue: rupees(customer.spentPaise), lastOrderDate: customer.lastOrderAt || null,
      contactEligible: true, segment: (customer.orderCount || 0) >= 2 ? 'repeat' : 'new',
    })),
  }
})


// ── Customer details saved by this store (vendor-private; the shared LNDRY account is never changed) ──
type RealAddress = { id: string; label: string; addressLine1: string; addressLine2: string; city: string; state: string; pincode: string; isDefault: boolean }
const addressOut = (a: RealAddress) => ({ id: a.id, label: a.label, line1: a.addressLine1, line2: a.addressLine2 || '', city: a.city || '', state: a.state || '', postalCode: a.pincode || '', isDefault: a.isDefault, active: true })
const addressLine = (a?: RealAddress) => (a ? [a.addressLine1, a.addressLine2, a.city, a.state, a.pincode].filter(Boolean).join(', ') : '')
const addressIn = (d: any) => ({ label: d.label, addressLine1: d.line1, addressLine2: d.line2, city: d.city, state: d.state, pincode: d.postalCode, isDefault: d.isDefault === true })

route('PATCH', '/laundry/customers/:id', async ({ patch, get, params, body }) => {
  const saved = await patch(`/vendor/customer-profiles/${params.id}`, { name: body.name, email: body.email, notes: body.notes })
  const addresses = (await get(`/vendor/customer-profiles/${params.id}/addresses`).catch(() => ({ addresses: [] }))).addresses as RealAddress[]
  const phone = onlyDigits(body.phone)
  return { id: params.id, name: saved.profile.displayName || body.name || '', phone: phone || body.phone || '', email: saved.profile.email || '', address: addressLine(addresses[0]), notes: saved.profile.notes || '' }
})
route('POST', '/laundry/customers/:id/addresses', async ({ post, params, body }) => addressOut((await post(`/vendor/customer-profiles/${params.id}/addresses`, addressIn(body))).address))
route('PATCH', '/laundry/customers/:id/addresses/:addressId', async ({ patch, params, body }) => addressOut((await patch(`/vendor/customer-profiles/${params.id}/addresses/${params.addressId}`, addressIn(body))).address))
route('POST', '/laundry/customers/:id/addresses/:addressId/archive', async ({ post, params }) => post(`/vendor/customer-profiles/${params.id}/addresses/${params.addressId}/archive`, {}))

route('GET', '/laundry/customers/:id', async ({ get, params }) => {
  const profile = await get(`/vendor/counter/customers/${params.id}`)
  const sourceOrders = Array.isArray(profile.orders) ? profile.orders as RealOrder[] : []
  const orders = sourceOrders.map((order) => {
    const shaped = laundryOrder(order)
    return {
      id: shaped.id, orderNumber: shaped.orderNumber, orderDate: shaped.orderDate, state: shaped.state, grandTotal: shaped.grandTotal, invoice: shaped.orderNumber,
      paymentStatus: shaped.paymentStatus, fulfillmentMode: shaped.fulfillmentMode, expectedDeliveryDate: shaped.expectedDeliveryDate,
      items: shaped.items.map((item) => ({ garment: item.garment, service: item.service, qty: item.qty })), serviceZone: shaped.serviceZone, deliveryAddress: shaped.deliveryAddress, notes: shaped.notes,
    }
  })
  const active = sourceOrders.filter((order) => order.status !== 'CANCELLED')
  const orderStatus = orders.reduce<Record<string, number>>((counts, order) => {
    counts[order.state] = (counts[order.state] || 0) + 1
    return counts
  }, {})
  return {
    customer: { id: profile.customer.id, name: profile.customer.name || '', phone: profile.customer.phone || '', email: profile.customer.email || '', address: addressLine(profile.addresses?.[0]), notes: profile.notes || '', preferredContact: undefined, servicePreferences: undefined, marketingConsent: undefined },
    metrics: {
      revenue: rupees(active.reduce((sum, order) => sum + order.totalPaise, 0)),
      orderBalance: rupees(active.reduce((sum, order) => sum + Math.max(0, order.totalPaise - order.amountPaidPaise), 0)),
      lastVisit: active[0]?.placedAt ? String(active[0].placedAt).slice(0, 10) : null,
      orderStatus,
    },
    addresses: (profile.addresses || []).map(addressOut),
    orders,
    consents: [],
    marketplace: { links: [], orders: [] },
    ledger: [],
    wallet: [],
    rewards: [],
    timeline: active.slice(0, 10).map((order) => ({ at: order.placedAt, type: 'order', label: `Order ${order.orderNumber} booked`, amount: rupees(order.totalPaise), reason: '' })),
    reconciliation: { note: 'This connected profile feed includes order totals, order activity and the details and addresses saved by this store. LNDRY wallet, rewards and package details are not shown here.' },
  }
})
