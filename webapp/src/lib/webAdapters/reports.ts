// Reports: built from the vendor's real counter orders, payments and expenses.
import { route, rupees, listOf } from './core'
import { laundryOrder, type RealOrder } from './orders'
import { localDateKey } from '@/lib/utils'

const day = (value: string) => String(value).slice(0, 10)
const round = (value: number) => Math.round(value * 100) / 100

type Data = { orders: ReturnType<typeof laundryOrder>[]; raw: RealOrder[]; expenses: any[]; packages: Array<{ id: string; customerId: string; customer: string; phone: string; packageName: string; packageAmount: number; contractAmount: number; paidAmount: number; balanceAmount: number; status: string; assigned: string; expires: string }>; customers?: Array<{ customer: string; phone: string; createdAt: string }>; payments: Array<{ amount: number; mode: string; date: string; order: string; orderId: string; invoice: string; customerId: string; customer: string; phone: string }> }

async function loadCustomerPackages(get: (path: string) => Promise<any>, from: string | null, to: string | null) {
  const customers = listOf(await get('/vendor/counter/customers')) as Array<{ id: string; name?: string; displayName?: string; phone?: string }>
  const within = (value: string) => (!from || day(value) >= from) && (!to || day(value) <= to)
  const grouped: Data['packages'] = []
  for (let offset = 0; offset < customers.length; offset += 8) {
    const batch = await Promise.all(customers.slice(offset, offset + 8).map(async (customer) => {
      const records = await get(`/vendor/service-packages/customers/${customer.id}`).then((data) => listOf(data) as any[]).catch(() => [])
      return records.map((item) => ({
        id: String(item.id || ''),
        customerId: customer.id,
        customer: customer.name || customer.displayName || 'Unknown customer',
        phone: customer.phone || '',
        packageName: item.packageName || 'Package unavailable',
        packageAmount: rupees(item.contractPricePaise),
        contractAmount: rupees(item.contractPricePaise),
        paidAmount: rupees(item.pricePaidPaise),
        balanceAmount: round(Math.max(0, rupees(item.contractPricePaise) - rupees(item.pricePaidPaise))),
        status: String(item.status || '').toLowerCase().replace(/(^|[_\s])\w/g, (letter: string) => letter.toUpperCase()),
        assigned: day(item.purchasedDate || ''),
        expires: day(item.expiresOn || ''),
      }))
    }))
    grouped.push(...batch.flat())
  }
  return grouped.filter((item) => item.status !== 'Cancelled' && within(item.assigned))
}

async function loadCustomerList(get: (path: string) => Promise<any>, from: string | null, to: string | null): Promise<Data> {
  const records = listOf(await get('/vendor/counter/customers')) as Array<{ name?: string; displayName?: string; phone?: string; createdAt?: string; created_at?: string }>
  const customers = records.map((record) => ({
    customer: record.name || record.displayName || 'Unknown customer',
    phone: record.phone || '',
    createdAt: day(record.createdAt || record.created_at || ''),
  })).filter((customer) => {
    if (!from && !to) return true
    // Bounded reports require a source creation date; unknown dates must not
    // be silently assigned to an arbitrary period.
    return Boolean(customer.createdAt) && (!from || customer.createdAt >= from) && (!to || customer.createdAt <= to)
  })
  return { orders: [], raw: [], expenses: [], packages: [], customers, payments: [] }
}

async function load(get: (p: string) => Promise<any>, from: string | null, to: string | null, collectionByPaymentDate = false, includeCustomerPackages = false, includePaymentDetails = true): Promise<Data> {
  const [rawAll, expensesAll, packages] = await Promise.all([
    get('/vendor/counter/orders?limit=500').then((data) => listOf(data) as RealOrder[]).catch(() => [] as RealOrder[]),
    get('/vendor/expenses?limit=200').then((data) => listOf(data) as any[]).catch(() => [] as any[]),
    includeCustomerPackages ? loadCustomerPackages(get, from, to) : Promise.resolve([] as Data['packages']),
  ])
  const within = (value: string) => (!from || day(value) >= from) && (!to || day(value) <= to)
  const raw = rawAll.filter((order) => within(order.placedAt))
  const paymentOrders = includePaymentDetails ? (collectionByPaymentDate ? rawAll : raw).filter((order) => order.amountPaidPaise > 0) : []
  const details = await Promise.all(paymentOrders.map((order) => get(`/vendor/counter/orders/${order.id}/payments`).then((rows) => (listOf(rows) as any[]).map((payment) => ({ amount: rupees(payment.amountPaise), mode: payment.mode, date: day(payment.createdAt), order: order.orderNumber, orderId: order.id, invoice: order.orderNumber, customerId: order.customer.id, customer: order.customer.name, phone: order.customer.phone }))).catch(() => [])))
  const paymentRows = details.flat().filter((payment) => !collectionByPaymentDate || within(payment.date))
  return { raw, orders: raw.map(laundryOrder), expenses: expensesAll.filter((expense) => expense.status !== 'CANCELLED' && within(expense.expenseDate)), packages, payments: paymentRows }
}

function balanceEntries(data: Data) {
  const rawById = new Map(data.raw.map((order) => [order.id, order]))
  const balances: Array<{ customer: string; phone: string; customerId: string; invoiceNumber: string; orderNumber: string; invoiceAmount: number; balanceAmount: number; date: string }> = []
  for (const order of data.orders.filter((item) => item.state !== 'Cancelled')) {
    const raw = rawById.get(order.id)
    const receiptPayments = data.payments.filter((payment) => payment.orderId === order.id)
    const paidRecorded = receiptPayments.length ? receiptPayments.reduce((sum, payment) => sum + payment.amount, 0) : rupees(raw?.amountPaidPaise || 0)
    const paidAmount = order.paymentStatus === 'Paid' ? order.grandTotal : Math.min(order.grandTotal, paidRecorded)
    const balanceAmount = round(Math.max(0, order.grandTotal - paidAmount))
    if (balanceAmount > 0) balances.push({ customer: order.customer.name, phone: order.customer.phone, customerId: order.customer.id || '', invoiceNumber: order.invoiceNumber || '', orderNumber: order.orderNumber, invoiceAmount: order.grandTotal, balanceAmount, date: day(order.orderDate || order.createdAt) })
  }
  for (const item of data.packages) {
    if (item.balanceAmount <= 0) continue
    balances.push({ customer: item.customer, phone: item.phone, customerId: item.customerId, invoiceNumber: 'Package Payment', orderNumber: '-', invoiceAmount: item.contractAmount, balanceAmount: item.balanceAmount, date: item.assigned })
  }
  return balances
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
function table(kind: string, data: Data, collectionView: 'invoice' | 'customer' = 'invoice', orderView: 'service' | 'invoice' = 'service', reportTo = localDateKey(), search = '', reportFrom: string | null = null, balanceView: 'invoice' | 'customer' = 'invoice'): Table {
  const { orders, payments, expenses } = data
  const live = orders.filter((order) => order.state !== 'Cancelled')
  const orderRow = (o: (typeof orders)[number]) => ({ 'Order': o.orderNumber, 'Customer': o.customer.name, 'Phone': o.customer.phone, 'Date': day(o.createdAt), 'Due': o.expectedDeliveryDate, 'Status': o.state, 'Payment': o.paymentStatus, 'Total': o.grandTotal })
  switch (kind) {
    case 'invoice':
      return { columns: ['invoiceNumber', 'amount', 'status', 'tax'], rows: orders.map((o) => ({ invoiceNumber: o.invoiceNumber, amount: o.grandTotal, status: o.state, tax: o.taxAmount })) }
    case 'order':
      if (orderView === 'invoice') return { columns: ['orderDate', 'customerName', 'orderNumber', 'invoiceNumber', 'totalGarments', 'garmentSummary'], rows: orders.map((o) => {
        const garments = new Map<string, number>()
        for (const item of o.items) garments.set(item.garmentName, (garments.get(item.garmentName) || 0) + item.qty)
        return { orderDate: o.orderDate, customerName: o.customer.name, orderNumber: o.orderNumber, invoiceNumber: o.invoiceNumber, totalGarments: o.items.reduce((sum, item) => sum + item.qty, 0), garmentSummary: [...garments].map(([name, quantity]) => `${name} (${quantity})`).join(' ') }
      }) }
      else {
        const services = new Map<string, { totalGarments: number; garments: Map<string, number> }>()
        for (const order of orders) for (const item of order.items) {
          const service = services.get(item.serviceName) || { totalGarments: 0, garments: new Map<string, number>() }
          service.totalGarments += item.qty
          service.garments.set(item.garmentName, (service.garments.get(item.garmentName) || 0) + item.qty)
          services.set(item.serviceName, service)
        }
        return { columns: ['serviceName', 'totalGarments', 'garmentSummary'], rows: [...services].map(([serviceName, value]) => ({ serviceName, totalGarments: value.totalGarments, garmentSummary: [...value.garments].map(([name, quantity]) => `${name} (${quantity})`).join(' ') })) }
      }
    case 'consolidated-invoices':
      return { columns: ['Order', 'Customer', 'Phone', 'Date', 'Due', 'Status', 'Payment', 'Total'], rows: orders.map(orderRow) }
    case 'collection':
      if (collectionView === 'customer') {
        const grouped = new Map<string, { customerName: string; phone: string; invoices: Set<string>; paidAmount: number }>()
        for (const payment of payments) {
          const key = payment.customerId || payment.phone || payment.customer || payment.invoice
          const row = grouped.get(key) || { customerName: payment.customer || 'Unassigned customer', phone: payment.phone, invoices: new Set<string>(), paidAmount: 0 }
          row.invoices.add(payment.invoice || payment.order)
          row.paidAmount += payment.amount
          grouped.set(key, row)
        }
        return { columns: ['customerName', 'phone', 'paidInvoices', 'paidAmount'], rows: [...grouped.values()].map((row) => ({ customerName: row.customerName, phone: row.phone, paidInvoices: row.invoices.size, paidAmount: round(row.paidAmount) })) }
      }
      return { columns: ['Date', 'Order', 'Customer', 'Mode', 'Amount'], rows: payments.map((p) => ({ Date: p.date, Order: p.order, Customer: p.customer, Mode: p.mode, Amount: p.amount })) }
    case 'expense':
      {
        const matched = expenses.filter((expense) => !search || `${expense.expenseName || expense.name || ''} ${expense.paymentReceiver || ''} ${expense.invoiceNumber || ''}`.toLowerCase().includes(search))
        if (search && matched.length === 0) return { columns: ['title', 'expenseAmount', 'taxAmount', 'amountBeforeTax'], rows: [] }
        const dates = reportFrom && reportTo ? dateKeys(reportFrom, reportTo) : [...new Set(matched.map((expense) => day(expense.expenseDate)))].sort()
        const byDate = new Map<string, { expenseAmount: number; taxAmount: number; taxKnown: boolean; count: number }>()
        const taxAmountOf = (expense: any): number | null => {
          const paise = expense.taxAmountPaise ?? expense.tax_amount_paise
          if (paise !== undefined && paise !== null && Number.isFinite(Number(paise))) return rupees(Number(paise))
          const amount = expense.taxAmount ?? expense.tax_amount
          return amount !== undefined && amount !== null && Number.isFinite(Number(amount)) ? Number(amount) : null
        }
        for (const expense of matched) {
          const date = day(expense.expenseDate)
          const values = byDate.get(date) || { expenseAmount: 0, taxAmount: 0, taxKnown: true, count: 0 }
          values.expenseAmount += rupees(expense.amountPaise)
          values.count += 1
          const tax = taxAmountOf(expense)
          if (tax === null) values.taxKnown = false
          else values.taxAmount += tax
          byDate.set(date, values)
        }
        return { columns: ['title', 'expenseAmount', 'taxAmount', 'amountBeforeTax'], rows: dates.map((date) => {
          const values = byDate.get(date)
          const expenseAmount = round(values?.expenseAmount || 0)
          const taxAmount = values?.count ? values.taxKnown ? round(values.taxAmount) : null : 0
          return { title: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`)), expenseAmount, taxAmount, amountBeforeTax: taxAmount === null ? null : round(expenseAmount - taxAmount) }
        }) }
      }
    case 'balance': {
      const balances = balanceEntries(data)
      const needle = search.trim().toLowerCase()
      const matched = balances.filter((row) => balanceView === 'customer'
        ? (!needle || `${row.customer} ${row.phone}`.toLowerCase().includes(needle))
        : (!needle || `${row.customer} ${row.phone} ${row.invoiceNumber} ${row.orderNumber}`.toLowerCase().includes(needle)))
      if (balanceView === 'invoice') return { columns: ['customer', 'phone', 'invoiceNumber', 'orderNumber', 'invoiceAmount', 'balanceAmount'], rows: matched.map(({ customer, phone, invoiceNumber, orderNumber, invoiceAmount, balanceAmount }) => ({ customer, phone, invoiceNumber, orderNumber, invoiceAmount, balanceAmount })) }
      const grouped = new Map<string, { customer: string; phone: string; invoiceAmount: number; balanceAmount: number }>()
      for (const row of matched) {
        const key = row.customerId || row.phone || row.customer
        const current = grouped.get(key) || { customer: row.customer, phone: row.phone, invoiceAmount: 0, balanceAmount: 0 }
        current.invoiceAmount += row.invoiceAmount
        current.balanceAmount += row.balanceAmount
        grouped.set(key, current)
      }
      return { columns: ['customer', 'phone', 'invoiceAmount', 'balanceAmount'], rows: [...grouped.values()].map((row) => ({ ...row, invoiceAmount: round(row.invoiceAmount), balanceAmount: round(row.balanceAmount) })) }
    }
    case 'discount':
      {
        const matched = live.filter((order) => !search || `${order.orderNumber} ${order.invoiceNumber || ''} ${order.customer.name} ${order.customer.phone}`.toLowerCase().includes(search))
        if (search && matched.length === 0) return { columns: ['title', 'totalAmount', 'discountAmount', 'amountWithoutDiscount'], rows: [] }
        const dates = reportFrom && reportTo
          ? dateKeys(reportFrom, reportTo)
          : [...new Set(matched.map((order) => day(order.orderDate || order.createdAt)))].sort()
        const byDate = new Map<string, { totalAmount: number; discountAmount: number }>()
        for (const order of matched) {
          const date = day(order.orderDate || order.createdAt)
          const values = byDate.get(date) || { totalAmount: 0, discountAmount: 0 }
          values.totalAmount += order.grandTotal
          values.discountAmount += order.discounts
          byDate.set(date, values)
        }
        return { columns: ['title', 'totalAmount', 'discountAmount', 'amountWithoutDiscount'], rows: dates.map((date) => {
          const values = byDate.get(date) || { totalAmount: 0, discountAmount: 0 }
          const totalAmount = round(values.totalAmount)
          const discountAmount = round(values.discountAmount)
          return { title: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`)), totalAmount, discountAmount, amountWithoutDiscount: round(totalAmount + discountAmount) }
        }) }
      }
    case 'customer': {
      const grouped = new Map<string, { customer: string; phone: string; revenue: number; revenueWithoutTax: number; visits: number; lastVisitedDate: string }>()
      for (const order of live) {
        const key = order.customer.id || order.customer.phone || order.customer.name
        const row = grouped.get(key) || { customer: order.customer.name, phone: order.customer.phone, revenue: 0, revenueWithoutTax: 0, visits: 0, lastVisitedDate: day(order.orderDate || order.createdAt) }
        const orderDate = day(order.orderDate || order.createdAt)
        row.revenue += order.grandTotal
        row.revenueWithoutTax += Math.max(0, order.grandTotal - order.taxAmount)
        row.visits += 1
        if (orderDate > row.lastVisitedDate) row.lastVisitedDate = orderDate
        grouped.set(key, row)
      }
      const daysSince = (date: string) => Math.max(0, Math.floor((Date.parse(`${reportTo}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000))
      return { columns: ['customer', 'phone', 'revenue', 'revenueWithoutTax', 'visits', 'lastVisitedDate', 'daysSinceVisit', 'reviews'], rows: [...grouped.values()].map((row) => ({ ...row, revenue: round(row.revenue), revenueWithoutTax: round(row.revenueWithoutTax), daysSinceVisit: daysSince(row.lastVisitedDate), reviews: '' })) }
    }
    case 'customer-list': {
      return { columns: ['customer', 'phone'], rows: (data.customers || []).map(({ customer, phone }) => ({ customer, phone })) }
    }
    case 'customer-package':
      return { columns: ['customer', 'packageName', 'packageAmount', 'status', 'assigned', 'expires'], rows: data.packages.map(({ customer, packageName, packageAmount, status, assigned, expires }) => ({ customer, packageName, packageAmount, status, assigned, expires })) }
    case 'growth': {
      const matched = live.filter((order) => !search || `${order.orderNumber} ${order.invoiceNumber || ''} ${order.customer.name} ${order.customer.phone}`.toLowerCase().includes(search.toLowerCase()))
      if (search && matched.length === 0) return { columns: ['total', 'tax', 'amountWithoutTax'], rows: [] }
      const total = round(matched.reduce((sum, order) => sum + order.grandTotal, 0))
      const tax = round(matched.reduce((sum, order) => sum + order.taxAmount, 0))
      return { columns: ['total', 'tax', 'amountWithoutTax'], rows: [{ total, tax, amountWithoutTax: round(total - tax) }] }
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
  if (kind === 'warehouse-user-work') throw Object.assign(new Error('Warehouse User Work Report is locked. Contact Us for activation.'), { code: 'REPORT_NOT_ACTIVATED' })
  const from = query.get('from') || null; const to = query.get('to') || null; const search = (query.get('search') || '').toLowerCase(); const paymentMethod = (query.get('paymentMethod') || '').trim().toLowerCase(); const collectionView = kind === 'collection' && query.get('view') === 'customer' ? 'customer' : 'invoice'; const orderView = kind === 'order' && query.get('view') === 'invoice' ? 'invoice' : 'service'
  const balanceView = kind === 'balance' && query.get('view') === 'customer' ? 'customer' : 'invoice'
  const data = kind === 'customer-package'
    ? { orders: [], raw: [], expenses: [], packages: await loadCustomerPackages(get, from, to), payments: [] }
    : kind === 'customer-list'
      ? await loadCustomerList(get, from, to)
    : await load(get, kind === 'balance' ? null : from, kind === 'balance' ? null : to, kind === 'collection', kind === 'balance', kind === 'collection' || kind === 'balance')
  const built = table(kind, data, collectionView, orderView, to || localDateKey(), search, from, balanceView)
  const rows = kind === 'growth' || kind === 'discount' || kind === 'expense' ? built.rows : built.rows.filter((row) => (!search || Object.values(row).join(' ').toLowerCase().includes(search)) && (!paymentMethod || kind !== 'collection' || collectionView !== 'invoice' || String(row.Mode || '').toLowerCase() === paymentMethod))
  const pageSize = paged ? Math.max(1, Number(query.get('pageSize')) || 100) : rows.length || 1
  const page = paged ? Math.max(1, Number(query.get('page')) || 1) : 1
  const columns = rows.length || search || kind !== 'collection' ? built.columns : collectionView === 'customer' ? ['customerName', 'phone', 'paidInvoices', 'paidAmount'] : ['Date', 'Order', 'Customer', 'Mode', 'Amount']
  const summary = kind === 'invoice' ? { label: 'Total Invoice Amount', value: round(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)), format: 'currency' } : kind === 'order' ? { label: 'Total Garment Count', value: rows.reduce((sum, row) => sum + (Number(row.totalGarments) || 0), 0), format: 'count' } : kind === 'customer' ? { label: 'Total Revenue', value: round(rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0)), format: 'currency' } : kind === 'customer-package' ? { label: 'Total Package Amount', value: round(rows.reduce((sum, row) => sum + (Number(row.packageAmount) || 0), 0)), format: 'currency' } : kind === 'discount' ? { label: 'Total Discount Amount', value: round(rows.reduce((sum, row) => sum + (Number(row.discountAmount) || 0), 0)), format: 'currency' } : kind === 'expense' ? { label: 'Total Expense', value: round(rows.reduce((sum, row) => sum + (Number(row.expenseAmount) || 0), 0)), format: 'currency' } : kind === 'balance' ? { label: 'Total Balance Amount', value: round(rows.reduce((sum, row) => sum + (Number(row.balanceAmount) || 0), 0)), format: 'currency' } : undefined
  const emptyColumns = kind === 'balance' ? balanceView === 'customer' ? ['customer', 'phone', 'invoiceAmount', 'balanceAmount'] : ['customer', 'phone', 'invoiceNumber', 'orderNumber', 'invoiceAmount', 'balanceAmount'] : built.columns
  return { kind, from: kind === 'balance' ? null : from, to: kind === 'balance' ? null : to, columns: rows.length || search ? columns : emptyColumns, rows: paged ? rows.slice((page - 1) * pageSize, page * pageSize) : rows, totalRows: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)), exportAll: !paged, ...(summary ? { summary } : {}) }
}
const shiftDay = (value: string, amount: number) => {
  const [year, month, date] = value.split('-').map(Number)
  const shifted = new Date(year, month - 1, date)
  shifted.setDate(shifted.getDate() + amount)
  return localDateKey(shifted)
}
function dateKeys(from: string, to: string) {
  const dates: string[] = []
  let current = from
  for (let i = 0; i < 366 && current <= to; i += 1) { dates.push(current); current = shiftDay(current, 1) }
  return dates
}
route('GET', '/laundry/reports/:kind/chart', async ({ get, params, query }) => {
  const kind = params.kind
  if (kind === 'warehouse-user-work') throw Object.assign(new Error('Warehouse User Work Report is locked. Contact Us for activation.'), { code: 'REPORT_NOT_ACTIVATED' })
  const to = query.get('to') || localDateKey()
  const from = query.get('from') || shiftDay(to, -6)
  if (from > to) throw new Error('chart start date must not be after end date')
  if (kind === 'customer-package') return { kind, from, to, metric: 'Package purchases', points: [] as Array<{ label: string; value: number }> }
  if (kind === 'customer-list') {
    const data = await loadCustomerList(get, from, to)
    const values = new Map<string, number>()
    for (const customer of data.customers || []) {
      if (!customer.createdAt) continue
      values.set(customer.createdAt, (values.get(customer.createdAt) || 0) + 1)
    }
    return { kind, from, to, metric: 'New customers', points: dateKeys(from, to).map((date) => ({ label: date, value: values.get(date) || 0 })) }
  }
  if (kind === 'balance') {
    const data = await load(get, null, null, false, true, true)
    const balances = balanceEntries(data)
    const values = new Map<string, number>()
    for (const row of balances) {
      if (row.date < from || row.date > to) continue
      values.set(row.date, (values.get(row.date) || 0) + row.balanceAmount)
    }
    const points = [...values.values()].some((value) => value > 0) ? dateKeys(from, to).map((date) => ({ label: date, value: round(values.get(date) || 0) })) : []
    return { kind, from, to, metric: 'Balance amount', points }
  }
  const data = await load(get, from, to, kind === 'collection', false, kind === 'collection')
  const paymentMethod = (query.get('paymentMethod') || '').trim().toLowerCase()
  if (kind === 'discount') {
    const values = new Map<string, number>()
    for (const order of data.orders.filter((row) => row.state !== 'Cancelled')) {
      const date = day(order.orderDate || order.createdAt)
      values.set(date, (values.get(date) || 0) + order.discounts)
    }
    return { kind, from, to, metric: 'Discount amount', points: dateKeys(from, to).map((date) => ({ label: date, value: round(values.get(date) || 0) })) }
  }
  if (kind === 'growth' || kind === 'expense') {
    const values = new Map<string, number>()
    if (kind === 'growth') for (const order of data.orders.filter((row) => row.state !== 'Cancelled')) { const date = day(order.orderDate || order.createdAt); values.set(date, (values.get(date) || 0) + order.grandTotal) }
    else for (const expense of data.expenses) { const date = day(expense.expenseDate); values.set(date, (values.get(date) || 0) + rupees(expense.amountPaise)) }
    return { kind, from, to, metric: kind === 'growth' ? 'Order value' : 'Expenses', points: dateKeys(from, to).map((date) => ({ label: date, value: round(values.get(date) || 0) })) }
  }
  if (kind === 'order') {
    const services = new Map<string, number>()
    for (const order of data.orders) for (const item of order.items) services.set(item.serviceName, (services.get(item.serviceName) || 0) + item.amount)
    return { kind, from, to, metric: 'Service amount', points: [...services].map(([label, value]) => ({ label, value: round(value) })) }
  }
  if (kind === 'invoice') {
    const values = new Map<string, number>()
    for (const order of data.orders) { const date = day(order.createdAt); values.set(date, (values.get(date) || 0) + order.grandTotal) }
    return { kind, from, to, metric: 'Invoice amount', points: dateKeys(from, to).map((date) => ({ label: date, value: round(values.get(date) || 0) })) }
  }
  if (kind === 'customer') {
    const values = new Map<string, number>()
    for (const order of data.orders.filter((row) => row.state !== 'Cancelled')) { const date = day(order.orderDate || order.createdAt); values.set(date, (values.get(date) || 0) + order.grandTotal) }
    return { kind, from, to, metric: 'Customer revenue', points: dateKeys(from, to).map((date) => ({ label: date, value: round(values.get(date) || 0) })) }
  }
  const built = table(kind, data, 'invoice', 'service', to, '', from)
  const filtered = kind === 'collection' && paymentMethod ? built.rows.filter((row) => String(row.Mode || '').toLowerCase() === paymentMethod) : built.rows
  const dateKey = built.columns.find((column) => /date|last order/i.test(column))
  const valueKey = built.columns.find((column) => filtered.some((row) => typeof row[column] === 'number'))
  if (dateKey) {
    const values = new Map<string, number>()
    for (const row of filtered) {
      const date = String(row[dateKey] || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to) continue
      const value = valueKey ? Number(row[valueKey]) || 0 : 1
      values.set(date, (values.get(date) || 0) + value)
    }
    const metric = valueKey ? valueKey.replace(/([A-Z])/g, ' $1') : 'Records'
    return { kind, from, to, metric, points: dateKeys(from, to).map((date) => ({ label: date, value: round(values.get(date) || 0) })) }
  }
  const categoryKey = ['Service', 'Status', 'Package', 'Customer'].find((column) => built.columns.includes(column))
  if (categoryKey) {
    const values = new Map<string, number>()
    for (const row of filtered) { const label = String(row[categoryKey] || 'Other'); const value = valueKey ? Number(row[valueKey]) || 0 : 1; values.set(label, (values.get(label) || 0) + value) }
    return { kind, from, to, metric: valueKey ? valueKey.replace(/([A-Z])/g, ' $1') : 'Records', points: [...values].map(([label, value]) => ({ label, value: round(value) })) }
  }
  return { kind, from, to, metric: 'Records', points: [] as Array<{ label: string; value: number }> }
})
route('GET', '/laundry/reports/:kind/export', ({ get, params, query }) => detail(get, params.kind, query, false))
route('GET', '/laundry/reports/:kind', ({ get, params, query }) => detail(get, params.kind, query, true))

// ── Saved views (real) ────────────────────────────────────────────────────
const viewShape = (view: any) => ({ id: view.id, name: view.viewName, kind: view.reportKind, from: view.fromDate ? day(view.fromDate) : null, to: view.toDate ? day(view.toDate) : null, search: view.search || '', shared: Boolean(view.shared), owner: view.ownerId })
route('GET', '/laundry/report-views', async ({ get }) => (listOf(await get('/vendor/report-views')) as any[]).map(viewShape))
route('POST', '/laundry/report-views', async ({ post, body }) => viewShape(await post('/vendor/report-views', { viewName: body.name, reportKind: body.kind, fromDate: body.from || undefined, toDate: body.to || undefined, search: body.search || undefined })))
