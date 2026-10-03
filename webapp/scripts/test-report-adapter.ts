import assert from 'node:assert/strict'
import { matchAdapter } from '../src/lib/webAdapters/core'
import '../src/lib/webAdapters/reports'

const orders = [
  {
    id: 'order-1', orderNumber: 'INV-1001', customer: { id: 'customer-1', name: 'Asha Patel', phone: '9876543210' },
    items: [{ name: 'Shirt', serviceName: 'Steam Iron', unit: 'Piece', qty: 2, ratePaise: 1000, amountPaise: 2000 }], subtotalPaise: 15000, chargesPaise: 0, discountsPaise: 0, taxRateBps: 0, taxPaise: 0, totalPaise: 15000,
    paymentMode: 'UPI', amountPaidPaise: 15000, paymentStatus: 'PAID', status: 'BOOKED', version: 1, source: 'COUNTER',
    orderDate: '2026-09-28', expectedDeliveryDate: '2026-09-30', fulfillmentMode: 'Pickup Order', deliveryAddress: null, serviceZone: null,
    notes: null, photoPath: null, pickupRider: null, deliveryRider: null, placedAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z',
  },
  {
    id: 'order-2', orderNumber: 'INV-1002', customer: { id: 'customer-1', name: 'Asha Patel', phone: '9876543210' },
    items: [{ name: 'Towel', serviceName: 'Wash & Fold', unit: 'Piece', qty: 1, ratePaise: 5000, amountPaise: 5000 }], subtotalPaise: 5000, chargesPaise: 0, discountsPaise: 500, taxRateBps: 1000, taxPaise: 500, totalPaise: 5500,
    paymentMode: 'CASH', amountPaidPaise: 5000, paymentStatus: 'PAID', status: 'DELIVERED', version: 1, source: 'COUNTER',
    orderDate: '2026-09-29', expectedDeliveryDate: '2026-09-29', fulfillmentMode: 'Pickup Order', deliveryAddress: null, serviceZone: null,
    notes: null, photoPath: null, pickupRider: null, deliveryRider: null, placedAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
  },
  {
    id: 'order-3', orderNumber: 'INV-1003', customer: { id: 'customer-1', name: 'Asha Patel', phone: '9876543210' },
    items: [{ name: 'Shirt', serviceName: 'Steam Iron', unit: 'Piece', qty: 1, ratePaise: 4000, amountPaise: 4000 }], subtotalPaise: 4000, chargesPaise: 0, discountsPaise: 0, taxRateBps: 0, taxPaise: 0, totalPaise: 4000,
    paymentMode: 'UPI', amountPaidPaise: 4000, paymentStatus: 'PAID', status: 'DELIVERED', version: 1, source: 'COUNTER',
    orderDate: '2026-09-01', expectedDeliveryDate: '2026-09-05', fulfillmentMode: 'Pickup Order', deliveryAddress: null, serviceZone: null,
    notes: null, photoPath: null, pickupRider: null, deliveryRider: null, placedAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  },
]

const payments: Record<string, Array<{ id: string; amountPaise: number; mode: string; createdAt: string }>> = {
  'order-1': [
    { id: 'payment-1', amountPaise: 10000, mode: 'UPI', createdAt: '2026-09-28T10:01:00.000Z' },
    { id: 'payment-2', amountPaise: 5000, mode: 'UPI', createdAt: '2026-09-28T10:02:00.000Z' },
  ],
  'order-2': [{ id: 'payment-3', amountPaise: 5000, mode: 'CASH', createdAt: '2026-09-29T10:01:00.000Z' }],
  'order-3': [{ id: 'payment-4', amountPaise: 4000, mode: 'UPI', createdAt: '2026-09-28T11:00:00.000Z' }],
}

async function get(path: string): Promise<any> {
  if (path === '/vendor/counter/orders?limit=500') return orders
  if (path === '/vendor/expenses?limit=200') return [
    { id: 'expense-1', expenseName: 'Laundry soap', expenseDate: '2026-09-28', amountPaise: 11000, taxAmountPaise: 1000, status: 'PAID' },
    { id: 'expense-2', expenseName: 'Delivery fuel', expenseDate: '2026-09-29', amountPaise: 20000, isTaxPaid: true, status: 'PAID' },
  ]
  if (path === '/vendor/counter/customers') return [{ id: 'customer-1', name: 'Asha Patel', phone: '9876543210', createdAt: '2026-09-28T10:00:00.000Z' }]
  if (path === '/vendor/service-packages/customers/customer-1') return [{ id: 'package-1', packageName: 'Steam Pack', contractPricePaise: 7500, purchasedDate: '2026-09-28', expiresOn: '2026-10-28', status: 'ACTIVE' }]
  const paymentMatch = /^\/vendor\/counter\/orders\/(order-[123])\/payments$/.exec(path)
  if (paymentMatch) return payments[paymentMatch[1]]
  throw new Error(`Unexpected adapter request: ${path}`)
}

async function invoke(path: string) {
  const matched = matchAdapter('GET', path)
  assert.ok(matched, `No GET adapter matched ${path}`)
  return matched.fn({
    get, post: async () => { throw new Error('Unexpected POST') }, put: async () => { throw new Error('Unexpected PUT') },
    patch: async () => { throw new Error('Unexpected PATCH') }, del: async () => { throw new Error('Unexpected DELETE') },
    params: matched.params, query: matched.query, body: undefined,
  })
}

const customer = await invoke('/laundry/reports/collection?view=customer&page=1&pageSize=10') as any
assert.deepEqual(customer.columns, ['customerName', 'phone', 'paidInvoices', 'paidAmount'])
assert.deepEqual(customer.rows, [{ customerName: 'Asha Patel', phone: '9876543210', paidInvoices: 3, paidAmount: 240 }])

const filteredInvoice = await invoke('/laundry/reports/collection?view=invoice&page=1&pageSize=10&paymentMethod=upi') as any
assert.equal(filteredInvoice.totalRows, 3)
assert.ok(filteredInvoice.rows.every((row: any) => row.Mode === 'UPI'))

const chart = await invoke('/laundry/reports/collection/chart?from=2026-09-28&to=2026-09-29&paymentMethod=UPI') as any
assert.deepEqual(chart.points, [{ label: '2026-09-28', value: 190 }, { label: '2026-09-29', value: 0 }])

const invoice = await invoke('/laundry/reports/invoice?page=1&pageSize=10') as any
assert.deepEqual(invoice.columns, ['invoiceNumber', 'amount', 'status', 'tax'])
assert.equal(invoice.summary.label, 'Total Invoice Amount')
assert.equal(invoice.summary.value, 245)
assert.equal(invoice.summary.format, 'currency')

const customerReport = await invoke('/laundry/reports/customer?from=2026-09-01&to=2026-09-29&page=1&pageSize=10') as any
assert.deepEqual(customerReport.columns, ['customer', 'phone', 'revenue', 'revenueWithoutTax', 'visits', 'lastVisitedDate', 'daysSinceVisit', 'reviews'])
assert.deepEqual(customerReport.summary, { label: 'Total Revenue', value: 245, format: 'currency' })
assert.deepEqual(customerReport.rows, [{ customer: 'Asha Patel', phone: '9876543210', revenue: 245, revenueWithoutTax: 240, visits: 3, lastVisitedDate: '2026-09-29', daysSinceVisit: 0, reviews: '' }])

const customerChart = await invoke('/laundry/reports/customer/chart?from=2026-09-28&to=2026-09-29') as any
assert.deepEqual(customerChart.points, [{ label: '2026-09-28', value: 150 }, { label: '2026-09-29', value: 55 }])

await assert.rejects(() => invoke('/laundry/reports/warehouse-user-work?page=1&pageSize=100'), /locked\. Contact Us for activation/)

const customerPackageReport = await invoke('/laundry/reports/customer-package?from=2026-09-28&to=2026-09-29&page=1&pageSize=10') as any
assert.deepEqual(customerPackageReport.columns, ['customer', 'packageName', 'packageAmount', 'status', 'assigned', 'expires'])
assert.deepEqual(customerPackageReport.summary, { label: 'Total Package Amount', value: 75, format: 'currency' })
assert.deepEqual(customerPackageReport.rows, [{ customer: 'Asha Patel', packageName: 'Steam Pack', packageAmount: 75, status: 'Active', assigned: '2026-09-28', expires: '2026-10-28' }])

const customerList = await invoke('/laundry/reports/customer-list?from=2026-09-28&to=2026-09-29&page=1&pageSize=10&search=9876543210') as any
assert.deepEqual(customerList.columns, ['customer', 'phone'])
assert.deepEqual(customerList.rows, [{ customer: 'Asha Patel', phone: '9876543210' }])
const emptyCustomerList = await invoke('/laundry/reports/customer-list?from=2026-10-01&to=2026-10-02&page=1&pageSize=10') as any
assert.deepEqual(emptyCustomerList.columns, customerList.columns)
assert.equal(emptyCustomerList.totalRows, 0)
const customerListChart = await invoke('/laundry/reports/customer-list/chart?from=2026-09-28&to=2026-09-29') as any
assert.equal(customerListChart.metric, 'New customers')
assert.deepEqual(customerListChart.points, [{ label: '2026-09-28', value: 1 }, { label: '2026-09-29', value: 0 }])

const growth = await invoke('/laundry/reports/growth?from=2026-09-28&to=2026-09-29') as any
assert.deepEqual(growth.columns, ['total', 'tax', 'amountWithoutTax'])
assert.deepEqual(growth.rows, [{ total: 205, tax: 5, amountWithoutTax: 200 }])
const searchedGrowth = await invoke('/laundry/reports/growth?from=2026-09-28&to=2026-09-29&search=INV-1001') as any
assert.deepEqual(searchedGrowth.rows, [{ total: 150, tax: 0, amountWithoutTax: 150 }])
const growthChart = await invoke('/laundry/reports/growth/chart?from=2026-09-28&to=2026-09-29') as any
assert.equal(growthChart.metric, 'Order value')
assert.deepEqual(growthChart.points, [{ label: '2026-09-28', value: 150 }, { label: '2026-09-29', value: 55 }])

const discount = await invoke('/laundry/reports/discount?from=2026-09-28&to=2026-09-29&page=1&pageSize=10') as any
assert.deepEqual(discount.columns, ['title', 'totalAmount', 'discountAmount', 'amountWithoutDiscount'])
assert.deepEqual(discount.rows, [
  { title: 'Monday', totalAmount: 150, discountAmount: 0, amountWithoutDiscount: 150 },
  { title: 'Tuesday', totalAmount: 55, discountAmount: 5, amountWithoutDiscount: 60 },
])
assert.deepEqual(discount.summary, { label: 'Total Discount Amount', value: 5, format: 'currency' })
const discountExport = await invoke('/laundry/reports/discount/export?from=2026-09-28&to=2026-09-29') as any
assert.deepEqual(discountExport.rows, discount.rows)
assert.equal(discountExport.exportAll, true)
const searchedDiscount = await invoke('/laundry/reports/discount?from=2026-09-28&to=2026-09-29&search=INV-1002') as any
assert.equal(searchedDiscount.summary.value, 5)
assert.equal(searchedDiscount.rows.reduce((sum: number, row: any) => sum + row.discountAmount, 0), 5)
const emptyDiscount = await invoke('/laundry/reports/discount?from=2026-10-01&to=2026-10-02&page=1&pageSize=10') as any
assert.deepEqual(emptyDiscount.columns, discount.columns)
assert.equal(emptyDiscount.summary.value, 0)
assert.equal(emptyDiscount.rows.length, 2)
const discountChart = await invoke('/laundry/reports/discount/chart?from=2026-09-28&to=2026-09-29') as any
assert.equal(discountChart.metric, 'Discount amount')
assert.deepEqual(discountChart.points, [{ label: '2026-09-28', value: 0 }, { label: '2026-09-29', value: 5 }])

const expense = await invoke('/laundry/reports/expense?from=2026-09-28&to=2026-09-29&page=1&pageSize=10') as any
assert.deepEqual(expense.columns, ['title', 'expenseAmount', 'taxAmount', 'amountBeforeTax'])
assert.deepEqual(expense.rows, [
  { title: 'Monday', expenseAmount: 110, taxAmount: 10, amountBeforeTax: 100 },
  { title: 'Tuesday', expenseAmount: 200, taxAmount: null, amountBeforeTax: null },
])
assert.deepEqual(expense.summary, { label: 'Total Expense', value: 310, format: 'currency' })
const searchedExpense = await invoke('/laundry/reports/expense?from=2026-09-28&to=2026-09-29&search=soap') as any
assert.equal(searchedExpense.summary.value, 110)
assert.equal(searchedExpense.rows.reduce((sum: number, row: any) => sum + row.expenseAmount, 0), 110)
const emptyExpense = await invoke('/laundry/reports/expense?from=2026-10-01&to=2026-10-02&page=1&pageSize=10') as any
assert.deepEqual(emptyExpense.columns, expense.columns)
assert.equal(emptyExpense.summary.value, 0)
assert.equal(emptyExpense.rows.length, 2)
const expenseExport = await invoke('/laundry/reports/expense/export?from=2026-09-28&to=2026-09-29') as any
assert.deepEqual(expenseExport.rows, expense.rows)
const expenseChart = await invoke('/laundry/reports/expense/chart?from=2026-09-28&to=2026-09-29') as any
assert.deepEqual(expenseChart.points, [{ label: '2026-09-28', value: 110 }, { label: '2026-09-29', value: 200 }])

const invoiceChart = await invoke('/laundry/reports/invoice/chart?from=2026-09-28&to=2026-09-29') as any
assert.deepEqual(invoiceChart.points, [{ label: '2026-09-28', value: 150 }, { label: '2026-09-29', value: 55 }])

const serviceOrder = await invoke('/laundry/reports/order?page=1&pageSize=10&view=service') as any
assert.deepEqual(serviceOrder.columns, ['serviceName', 'totalGarments', 'garmentSummary'])
assert.equal(serviceOrder.summary.value, 4)
assert.equal(serviceOrder.summary.format, 'count')
assert.equal(serviceOrder.rows.find((row: any) => row.serviceName === 'Steam Iron').totalGarments, 3)

const invoiceOrder = await invoke('/laundry/reports/order?page=1&pageSize=10&view=invoice') as any
assert.deepEqual(invoiceOrder.columns, ['orderDate', 'customerName', 'orderNumber', 'invoiceNumber', 'totalGarments', 'garmentSummary'])
assert.equal(invoiceOrder.rows[0].customerName, 'Asha Patel')

const priorBalanceStatus = orders[2].paymentStatus
const priorBalancePaid = orders[2].amountPaidPaise
orders[2].paymentStatus = 'UNPAID'
orders[2].amountPaidPaise = 0
const invoiceBalance = await invoke('/laundry/reports/balance?from=1999-01-01&to=1999-01-02&page=1&pageSize=10') as any
assert.deepEqual(invoiceBalance.columns, ['customer', 'phone', 'invoiceNumber', 'orderNumber', 'invoiceAmount', 'balanceAmount'])
assert.equal(invoiceBalance.summary.label, 'Total Balance Amount')
assert.equal(invoiceBalance.summary.value, 115)
assert.deepEqual(invoiceBalance.rows.map((row: any) => [row.invoiceNumber, row.invoiceAmount, row.balanceAmount]), [
  ['INV-1003', 40, 40],
  ['Package Payment', 75, 75],
])
assert.equal(invoiceBalance.from, null, 'balance rows are not date-filtered by the separate chart range')
const customerBalance = await invoke('/laundry/reports/balance?view=customer&search=Asha&page=1&pageSize=10') as any
assert.deepEqual(customerBalance.columns, ['customer', 'phone', 'invoiceAmount', 'balanceAmount'])
assert.deepEqual(customerBalance.rows, [{ customer: 'Asha Patel', phone: '9876543210', invoiceAmount: 115, balanceAmount: 115 }])
const emptyBalance = await invoke('/laundry/reports/balance?view=customer&search=no-such-customer') as any
assert.deepEqual(emptyBalance.columns, customerBalance.columns)
assert.equal(emptyBalance.summary.value, 0)
const balanceExport = await invoke('/laundry/reports/balance/export?view=customer&search=Asha') as any
assert.deepEqual(balanceExport.rows, customerBalance.rows)
const balanceChart = await invoke('/laundry/reports/balance/chart?from=2026-09-28&to=2026-09-29') as any
assert.equal(balanceChart.metric, 'Balance amount')
assert.deepEqual(balanceChart.points, [{ label: '2026-09-28', value: 75 }, { label: '2026-09-29', value: 0 }])
orders[2].paymentStatus = priorBalanceStatus
orders[2].amountPaidPaise = priorBalancePaid

console.log('Report adapter checks passed: invoice/customer/customer-list/growth/discount/expense/balance reports, package and order receivables, collection view/date/method filters, and both order report views.')
