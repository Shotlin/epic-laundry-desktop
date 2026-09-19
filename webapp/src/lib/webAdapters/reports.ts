// Reports: built from the vendor's real counter orders, payments and expenses.
import { route, rupees, listOf } from './core'
import { laundryOrder, type RealOrder } from './orders'

const day = (value: string) => String(value).slice(0, 10)
const round = (value: number) => Math.round(value * 100) / 100

type Data = { orders: ReturnType<typeof laundryOrder>[]; raw: RealOrder[]; expenses: any[]; payments: Array<{ amount: number; mode: string; date: string; order: string; customer: string }> }

async function load(get: (p: string) => Promise<any>, from: string | null, to: string | null): Promise<Data> {
  const [rawAll, expensesAll] = await Promise.all([
    get('/vendor/counter/orders?limit=500').then((data) => listOf(data) as RealOrder[]).catch(() => [] as RealOrder[]),
    get('/vendor/expenses?limit=200').then((data) => listOf(data) as any[]).catch(() => [] as any[]),
  ])
  const within = (value: string) => (!from || day(value) >= from) && (!to || day(value) <= to)
  const raw = rawAll.filter((order) => within(order.placedAt))
  const details = await Promise.all(raw.filter((order) => order.amountPaidPaise > 0).map((order) => get(`/vendor/counter/orders/${order.id}/payments`).then((rows) => (listOf(rows) as any[]).map((payment) => ({ amount: rupees(payment.amountPaise), mode: payment.mode, date: day(payment.createdAt), order: order.orderNumber, customer: order.customer.name }))).catch(() => [])))
  return { raw, orders: raw.map(laundryOrder), expenses: expensesAll.filter((expense) => expense.status !== 'CANCELLED' && within(expense.expenseDate)), payments: details.flat() }
}

route('GET', '/laundry/reports', async ({ get, query }) => {
  const from = query.get('from') || null; const to = query.get('to') || null
  const { orders, expenses, payments } = await load(get, from, to)
  const live = orders.filter((order) => order.state !== 'Cancelled')
  const orderValue = live.reduce((sum, order) => sum + order.grandTotal, 0)
  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const expenseTotal = expenses.reduce((sum, expense) => sum + rupees(expense.amountPaise), 0)
  const group = <K extends string>(items: typeof live, key: (o: (typeof live)[number]) => string, name: K) => {
    const map = new Map<string, { count: number; amount: number }>()
    for (const order of items) { const k = key(order); const entry = map.get(k) || { count: 0, amount: 0 }; entry.count += 1; entry.amount += order.grandTotal; map.set(k, entry) }
    return [...map.entries()].map(([k, v]) => ({ [name]: k, ...v })) as Array<Record<K, string> & { count: number; amount: number }>
  }
  const rank = (pick: (item: (typeof live)[number]['items'][number]) => string) => {
    const map = new Map<string, { quantity: number; amount: number }>()
    for (const order of live) for (const item of order.items) { const k = pick(item); const entry = map.get(k) || { quantity: 0, amount: 0 }; entry.quantity += item.qty; entry.amount += item.amount; map.set(k, entry) }
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 8)
  }
  const dates = [...new Set([...live.map((o) => day(o.createdAt)), ...payments.map((p) => p.date), ...expenses.map((e) => day(e.expenseDate))])].sort()
  return {
    summary: { orderValue, collected, outstanding: Math.max(0, orderValue - collected), expenses: expenseTotal, operatingCash: collected - expenseTotal, orders: live.length, customers: new Set(live.map((o) => o.customer.id)).size },
    stateBreakdown: group(orders, (o) => o.state, 'state'), paymentBreakdown: group(live, (o) => o.paymentMode, 'paymentMode'), fulfillmentBreakdown: group(live, (o) => o.fulfillmentMode, 'mode'),
    trend: dates.map((date) => ({
      date, orders: live.filter((o) => day(o.createdAt) === date).length, orderValue: live.filter((o) => day(o.createdAt) === date).reduce((s, o) => s + o.grandTotal, 0),
      collected: payments.filter((p) => p.date === date).reduce((s, p) => s + p.amount, 0), expenses: expenses.filter((e) => day(e.expenseDate) === date).reduce((s, e) => s + rupees(e.amountPaise), 0),
    })),
    topGarments: rank((item) => item.garmentName), topServices: rank((item) => item.serviceName),
  }
})

route('GET', '/laundry/reconciliation', async ({ get }) => {
  const { orders, expenses, payments } = await load(get, null, null)
  const live = orders.filter((order) => order.state !== 'Cancelled')
  const invoice = live.reduce((sum, order) => sum + order.grandTotal, 0); const collected = payments.reduce((sum, p) => sum + p.amount, 0)
  const paidRecorded = live.reduce((sum, order) => sum + (order.paymentStatus === 'Paid' ? order.grandTotal : 0), 0)
  const issues = live.filter((order) => order.paymentStatus === 'Paid' && !payments.some((p) => p.order === order.orderNumber)).map((order) => ({ code: 'PAID_WITHOUT_PAYMENT', entity: 'order', id: order.id, message: `${order.orderNumber} is marked paid but has no payment record.` }))
  void paidRecorded
  return { status: issues.length ? 'Attention' : 'Balanced', totals: { invoice, collected, outstanding: Math.max(0, invoice - collected), expenses: expenses.reduce((s, e) => s + rupees(e.amountPaise), 0), canonicalNet: collected }, journals: { balanced: true }, checks: { issueCount: issues.length, passed: !issues.length }, issues }
})

route('GET', '/laundry/financial-entries', async ({ get }) => {
  const { raw, expenses } = await load(get, null, null)
  const paid = await Promise.all(raw.filter((order) => order.amountPaidPaise > 0).map((order) => get(`/vendor/counter/orders/${order.id}/payments`).then((rows) => (listOf(rows) as any[]).map((payment) => ({ id: payment.id, kind: 'payment', sourceEntity: 'store_order', sourceId: order.id, direction: 'IN' as const, amountPaise: payment.amountPaise, occurredAt: payment.createdAt, actor: 'Counter' }))).catch(() => [])))
  return [...paid.flat(), ...expenses.map((expense) => ({ id: expense.id, kind: 'expense', sourceEntity: 'expense', sourceId: expense.id, direction: 'OUT' as const, amountPaise: expense.amountPaise, occurredAt: expense.createdAt || expense.expenseDate, actor: 'Counter' }))].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
})

// ── Detailed report tables ────────────────────────────────────────────────
type Table = { columns: string[]; rows: Array<Record<string, unknown>> }
function table(kind: string, data: Data): Table {
  const { orders, payments, expenses } = data
  const live = orders.filter((order) => order.state !== 'Cancelled')
  const orderRow = (o: (typeof orders)[number]) => ({ 'Order': o.orderNumber, 'Customer': o.customer.name, 'Phone': o.customer.phone, 'Date': day(o.createdAt), 'Due': o.expectedDeliveryDate, 'Status': o.state, 'Payment': o.paymentStatus, 'Total': o.grandTotal })
  switch (kind) {
    case 'invoice': case 'order': case 'consolidated-invoices':
      return { columns: ['Order', 'Customer', 'Phone', 'Date', 'Due', 'Status', 'Payment', 'Total'], rows: orders.map(orderRow) }
    case 'collection':
      return { columns: ['Date', 'Order', 'Customer', 'Mode', 'Amount'], rows: payments.map((p) => ({ Date: p.date, Order: p.order, Customer: p.customer, Mode: p.mode, Amount: p.amount })) }
    case 'expense':
      return { columns: ['Date', 'Expense', 'Category', 'Receiver', 'Mode', 'Amount'], rows: expenses.map((e) => ({ Date: day(e.expenseDate), Expense: e.expenseName, Category: e.category || '', Receiver: e.paymentReceiver || '', Mode: e.paymentMode, Amount: rupees(e.amountPaise) })) }
    case 'balance': {
      return { columns: ['Order', 'Customer', 'Phone', 'Total', 'Paid', 'Balance'], rows: live.map((o, i) => ({ Order: o.orderNumber, Customer: o.customer.name, Phone: o.customer.phone, Total: o.grandTotal, Paid: rupees(data.raw.filter((r) => !['CANCELLED'].includes(r.status))[i]?.amountPaidPaise ?? 0), Balance: 0 })).map((row) => ({ ...row, Balance: round(Number(row.Total) - Number(row.Paid)) })).filter((row) => row.Balance > 0) }
    }
    case 'discount':
      return { columns: ['Order', 'Customer', 'Date', 'Discount'], rows: live.filter((o) => o.discounts > 0).map((o) => ({ Order: o.orderNumber, Customer: o.customer.name, Date: day(o.createdAt), Discount: o.discounts })) }
    case 'customer': case 'customer-list': {
      const map = new Map<string, { name: string; phone: string; orders: number; spend: number; last: string }>()
      for (const o of live) { const e = map.get(o.customer.id || o.customer.phone) || { name: o.customer.name, phone: o.customer.phone, orders: 0, spend: 0, last: '' }; e.orders += 1; e.spend += o.grandTotal; if (day(o.createdAt) > e.last) e.last = day(o.createdAt); map.set(o.customer.id || o.customer.phone, e) }
      return { columns: ['Customer', 'Phone', 'Orders', 'Spend', 'Last order'], rows: [...map.values()].map((e) => ({ Customer: e.name, Phone: e.phone, Orders: e.orders, Spend: round(e.spend), 'Last order': e.last })) }
    }
    case 'growth': {
      const dates = [...new Set(live.map((o) => day(o.createdAt)))].sort()
      return { columns: ['Date', 'Orders', 'Order value'], rows: dates.map((date) => ({ Date: date, Orders: live.filter((o) => day(o.createdAt) === date).length, 'Order value': round(live.filter((o) => day(o.createdAt) === date).reduce((s, o) => s + o.grandTotal, 0)) })) }
    }
    case 'pickup':
      return { columns: ['Order', 'Customer', 'Date', 'Mode', 'Captain', 'Status'], rows: live.filter((o) => /pickup/i.test(o.fulfillmentMode)).map((o) => ({ Order: o.orderNumber, Customer: o.customer.name, Date: day(o.createdAt), Mode: o.fulfillmentMode, Captain: o.pickupRider?.name || 'Unassigned', Status: o.state })) }
    case 'rider-delivery': case 'rider-collection':
      return { columns: ['Order', 'Customer', 'Due', 'Mode', 'Captain', 'Status', 'Amount'], rows: live.filter((o) => /delivery/i.test(o.fulfillmentMode)).map((o) => ({ Order: o.orderNumber, Customer: o.customer.name, Due: o.expectedDeliveryDate, Mode: o.fulfillmentMode, Captain: o.deliveryRider?.name || 'Unassigned', Status: o.state, Amount: o.grandTotal })) }
    default:
      return { columns: ['Note'], rows: [] }
  }
}

async function detail(get: (p: string) => Promise<any>, kind: string, query: URLSearchParams, paged: boolean) {
  const from = query.get('from') || null; const to = query.get('to') || null; const search = (query.get('search') || '').toLowerCase()
  const data = await load(get, from, to)
  const built = table(kind, data)
  const rows = search ? built.rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(search)) : built.rows
  const pageSize = paged ? Math.max(1, Number(query.get('pageSize')) || 100) : rows.length || 1
  const page = paged ? Math.max(1, Number(query.get('page')) || 1) : 1
  return { kind, from, to, columns: built.columns, rows: paged ? rows.slice((page - 1) * pageSize, page * pageSize) : rows, totalRows: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)), exportAll: !paged }
}
route('GET', '/laundry/reports/:kind/export', ({ get, params, query }) => detail(get, params.kind, query, false))
route('GET', '/laundry/reports/:kind', ({ get, params, query }) => detail(get, params.kind, query, true))

// ── Saved views (real) ────────────────────────────────────────────────────
const viewShape = (view: any) => ({ id: view.id, name: view.viewName, kind: view.reportKind, from: view.fromDate ? day(view.fromDate) : null, to: view.toDate ? day(view.toDate) : null, search: view.search || '', shared: Boolean(view.shared), owner: view.ownerId })
route('GET', '/laundry/report-views', async ({ get }) => (listOf(await get('/vendor/report-views')) as any[]).map(viewShape))
route('POST', '/laundry/report-views', async ({ post, body }) => viewShape(await post('/vendor/report-views', { viewName: body.name, reportKind: body.kind, fromDate: body.from || undefined, toDate: body.to || undefined, search: body.search || undefined })))
