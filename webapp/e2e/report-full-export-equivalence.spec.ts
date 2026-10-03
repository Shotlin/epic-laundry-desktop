import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; active?: boolean }>
  services: Array<{ id: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
  taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
}
type Report = { columns: string[]; rows: Array<Record<string, unknown>>; totalRows: number; exportAll?: boolean; exportTruncated?: boolean }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

function businessDate(offset = 0) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value || ''
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

test('filtered full exports match table rows across invoice, order, collection, balance, and expense views', async ({ page }) => {
  test.setTimeout(90_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const runId = randomUUID().slice(0, 10)
  const customerName = `Report Export ${runId}`
  const phone = `96${Date.now().toString().slice(-8)}`
  const today = businessDate()
  const reference = `EXPORT-${runId}`
  const expenseName = `Report Expense ${runId}`
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const activeGarments = new Set(catalogue.garments.filter((item) => item.active !== false).map((item) => item.id))
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const pricedLine = catalogue.prices.find((item) => item.active !== false && item.rate > 0 && activeGarments.has(item.garment) && activeServices.has(item.service))
  const taxRule = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(pricedLine, 'synthetic store has an active priced garment/service').toBeTruthy()
  expect(taxRule, 'synthetic store has the current 18% GST rule').toBeTruthy()
  if (!pricedLine || !taxRule) return

  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': `report-export-order-${runId}` },
    data: {
      customer: { name: customerName, phone }, orderDate: today,
      items: [{ garment: pricedLine.garment, service: pricedLine.service, qty: 1 }],
      expectedDeliveryDate: businessDate(5), fulfillmentMode: 'Home Delivery', paymentMode: 'Pay Later',
      taxRate: 18, taxRuleId: taxRule.id, notes: 'Synthetic filtered export fixture',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booking = await bookingResponse.json() as { order: { id: string; grandTotal: number; invoiceNumber: string } }
  const collectionAmount = Math.round(booking.order.grandTotal * 50) / 100
  expect(collectionAmount).toBeGreaterThan(0)
  expect(collectionAmount).toBeLessThan(booking.order.grandTotal)
  const paymentResponse = await page.request.post(`${origin}/api/laundry/orders/${booking.order.id}/payments`, {
    headers: { 'idempotency-key': `report-export-payment-${runId}` },
    data: { amount: collectionAmount, mode: 'UPI', reference, note: 'Synthetic report export receipt' },
  })
  expect(paymentResponse.status(), await paymentResponse.text()).toBe(201)
  const expenseResponse = await page.request.post(`${origin}/api/laundry/expenses`, {
    headers: { 'idempotency-key': `report-export-expense-${runId}` },
    data: { expenseName, expenseDate: today, amount: 23.47, financeCategory: 'UTILITIES', paymentMode: 'UPI', invoiceNumber: `EXP-${runId}` },
  })
  expect(expenseResponse.status(), await expenseResponse.text()).toBe(201)

  async function verify(kind: string, filters: Record<string, string>, expectedRows: number) {
    const params = new URLSearchParams({ ...filters, page: '1', pageSize: '500' })
    const [tableResponse, exportResponse] = await Promise.all([
      page.request.get(`${origin}/api/laundry/reports/${kind}?${params}`),
      page.request.get(`${origin}/api/laundry/reports/${kind}/export?${new URLSearchParams(filters)}`),
    ])
    expect(tableResponse.status(), `${kind} table response`).toBe(200)
    expect(exportResponse.status(), `${kind} export response`).toBe(200)
    const table = await tableResponse.json() as Report
    const exported = await exportResponse.json() as Report
    expect(table.totalRows, `${kind} filtered row count`).toBe(expectedRows)
    expect(exported).toMatchObject({ exportAll: true, exportTruncated: false, totalRows: table.totalRows, columns: table.columns, rows: table.rows })
    return table
  }

  await verify('invoice', { from: today, to: today, search: customerName }, 1)
  await verify('order', { from: today, to: today, search: customerName, view: 'invoice' }, 1)
  await verify('order', { from: today, to: today, search: customerName, view: 'service' }, 1)
  await verify('collection', { from: today, to: today, search: reference, paymentMethod: 'UPI', view: 'invoice' }, 1)
  await verify('collection', { from: today, to: today, search: customerName, view: 'customer' }, 1)
  await verify('balance', { search: customerName, view: 'invoice' }, 1)
  await verify('balance', { search: customerName, view: 'customer' }, 1)
  const expenseReport = await verify('expense', { from: today, to: today, search: expenseName }, 1)
  expect(expenseReport.rows[0].expenseAmount).toBe(23.47)
})
