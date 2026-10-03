import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; active?: boolean }>
  services: Array<{ id: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
  taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
}
type BookedOrder = { order: { id: string; orderDate: string; invoiceNumber: string; grandTotal: number } }
type PaymentSummary = {
  invoiceNumber: string
  total: number
  paid: number
  outstanding: number
  status: string
  payments: Array<{ id: string; amount: number; mode: string; reference: string; postingDate: string; providerStatus: string }>
}
type FinancialEntry = { kind: string; direction: string; amountPaise: number; metadata?: Record<string, unknown> }
type CollectionReport = { rows: Array<{ invoiceNumber: string; amount: number; method: string; date: string; reference: string }>; totalRows: number }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function captureEvidence(page: Page, name: string) {
  const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path })
}

function businessDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

test('collection and reversal reconcile the order, collection report, and immutable money entries', async ({ page }) => {
  test.setTimeout(120_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const garment = catalogue.garments.find((item) => item.active !== false)
  expect(garment, 'the isolated catalogue should contain an active garment').toBeTruthy()
  if (!garment) return
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.garment === garment.id && item.rate > 0 && activeServices.has(item.service))
  expect(price, 'the active garment should have a priced service').toBeTruthy()
  if (!price) return
  const taxRule = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(taxRule, 'the isolated store should expose its configured GST 18% rule').toBeTruthy()
  if (!taxRule) return

  const today = businessDate()
  const yesterday = businessDate(-1)
  const reference = `PH13-${Date.now()}`
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': `phase13-book-${reference}` },
    data: {
      customer: { name: `Finance Flow ${reference.slice(-7)}`, phone: `95${Date.now().toString().slice(-8)}` },
      orderDate: yesterday,
      items: [{ garment: price.garment, service: price.service, qty: 1 }],
      expectedDeliveryDate: businessDate(5),
      fulfillmentMode: 'Home Delivery',
      paymentMode: 'Pay Later',
      taxRate: 18,
      taxRuleId: taxRule.id,
      notes: 'Synthetic finance reconciliation fixture',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booking = await bookingResponse.json() as BookedOrder
  expect(booking.order.orderDate).toBe(yesterday)
  const initialResponse = await page.request.get(`${origin}/api/laundry/orders/${booking.order.id}/payments`)
  expect(initialResponse.ok()).toBe(true)
  const initial = await initialResponse.json() as PaymentSummary
  expect(initial).toMatchObject({ status: 'Unpaid', paid: 0, outstanding: initial.total })
  const amount = Math.round(initial.total * 50) / 100
  expect(amount).toBeGreaterThan(0)
  expect(amount).toBeLessThan(initial.total)

  await page.goto(`/ui/app/?local-demo=1#/laundry/orders?order=${encodeURIComponent(booking.order.id)}`, { waitUntil: 'domcontentloaded' })
  const workCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(workCard).toBeVisible()
  await workCard.getByLabel('Amount').fill(amount.toFixed(2))
  await workCard.getByLabel('Method').selectOption('UPI')
  await workCard.getByPlaceholder('Reference / receipt no. (optional)').fill(reference)
  await workCard.getByPlaceholder('Collection note (optional)').fill('Phase 13 test collection')
  const collectResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/orders/${booking.order.id}/payments` && response.request().method() === 'POST')
  await workCard.getByRole('button', { name: 'Record collection' }).click()
  const collected = await collectResponse
  expect(collected.status(), await collected.text()).toBe(201)
  await expect(workCard.getByText('Part Paid', { exact: true })).toBeVisible()
  await captureEvidence(page, 'payment-collection-ledger-desktop')

  const paidResponse = await page.request.get(`${origin}/api/laundry/orders/${booking.order.id}/payments`)
  expect(paidResponse.ok()).toBe(true)
  const paid = await paidResponse.json() as PaymentSummary
  expect(paid.status).toBe('Part Paid')
  expect(paid.invoiceNumber).toBe(booking.order.invoiceNumber)
  expect(paid.paid).toBe(amount)
  expect(paid.outstanding).toBe(Math.round((paid.total - amount) * 100) / 100)
  expect(paid.payments).toHaveLength(1)
  expect(paid.payments[0]).toMatchObject({ amount, mode: 'UPI', reference, postingDate: today, providerStatus: 'Manual' })
  expect(paid.payments[0].postingDate).not.toBe(booking.order.orderDate)

  const reportResponse = await page.request.get(`${origin}/api/laundry/reports/collection?from=${today}&to=${today}&search=${encodeURIComponent(reference)}&paymentMethod=UPI`)
  expect(reportResponse.ok()).toBe(true)
  const report = await reportResponse.json() as CollectionReport
  expect(report.totalRows).toBe(1)
  expect(report.rows[0]).toMatchObject({ invoiceNumber: paid.invoiceNumber, amount, method: 'UPI', date: today, reference })

  await page.goto(`/ui/app/?local-demo=1#/laundry/reports/collection?from=${today}&to=${today}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Collection Report', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Payment method' }).selectOption('UPI')
  await page.getByRole('textbox', { name: 'Search invoice or order' }).fill(reference)
  const collectionRow = page.locator('tbody tr').filter({ hasText: reference })
  await expect(collectionRow).toBeVisible()
  await expect(collectionRow).toContainText(paid.invoiceNumber)
  await expect(collectionRow).toContainText(today)
  await expect(collectionRow).toContainText('UPI')

  await page.goto(`/ui/app/?local-demo=1#/laundry/orders?order=${encodeURIComponent(booking.order.id)}`, { waitUntil: 'domcontentloaded' })
  const reversalCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(reversalCard.getByText('Part Paid', { exact: true })).toBeVisible()
  await reversalCard.getByRole('button', { name: 'Reverse' }).click()
  const reversalReason = 'Customer requested correction before final receipt.'
  await reversalCard.getByPlaceholder('Reason for reversal').fill(reversalReason)
  const reverseResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/payments/${paid.payments[0].id}/reverse` && response.request().method() === 'POST')
  await reversalCard.getByRole('button', { name: 'Confirm reversal' }).click()
  expect((await reverseResponse).status()).toBe(200)
  await expect(reversalCard.getByText('Unpaid', { exact: true })).toBeVisible()

  const [reversedResponse, entriesResponse, reportAfterReverseResponse] = await Promise.all([
    page.request.get(`${origin}/api/laundry/orders/${booking.order.id}/payments`),
    page.request.get(`${origin}/api/laundry/financial-entries?sourceId=${paid.payments[0].id}`),
    page.request.get(`${origin}/api/laundry/reports/collection?from=${today}&to=${today}&search=${encodeURIComponent(reference)}&paymentMethod=UPI`),
  ])
  expect(reversedResponse.ok()).toBe(true)
  const reversed = await reversedResponse.json() as PaymentSummary
  expect(reversed).toMatchObject({ status: 'Unpaid', paid: 0, outstanding: initial.total, payments: [] })
  expect(entriesResponse.ok()).toBe(true)
  const entries = await entriesResponse.json() as FinancialEntry[]
  expect(entries.map((entry) => `${entry.kind}:${entry.direction}:${entry.amountPaise}`).sort()).toEqual([
    `collection:IN:${Math.round(amount * 100)}`,
    `refund:OUT:${Math.round(amount * 100)}`,
  ])
  expect(entries.find((entry) => entry.kind === 'refund')?.metadata?.reason).toBe(reversalReason)
  expect(reportAfterReverseResponse.ok()).toBe(true)
  expect((await reportAfterReverseResponse.json() as CollectionReport).totalRows).toBe(0)
})
