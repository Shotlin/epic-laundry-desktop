import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; active?: boolean }>
  services: Array<{ id: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
  taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
}
type Order = { order: { id: string; grandTotal: number } }
type Shift = {
  id: string
  status: string
  register: string
  openingCash: number
  collections: number
  expenses: number
  refunds: number
  expectedCash: number
  countedCash: number | null
  variance: number | null
  varianceApprovedBy?: string | null
  movementCounts: { collections: number; expenses: number; refunds: number }
}
type PaymentSummary = { total: number; paid: number; outstanding: number; status: string }
type CloseDrill = { passed: boolean; shifts: Array<{ shiftId: string; passed: boolean; checks: { equation: boolean; variance: boolean; fixedScale: boolean } }> }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function captureEvidence(page: Page, name: string) {
  const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage: true })
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

function displayedINR(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

test('cash closing reconciles a cash receipt and safely reviews a variance', async ({ page }) => {
  test.setTimeout(90_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const garment = catalogue.garments.find((item) => item.active !== false && catalogue.prices.some((price) => price.garment === item.id && price.active !== false && price.rate > 0))
  expect(garment).toBeTruthy()
  if (!garment) return
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.garment === garment.id && item.rate > 0 && activeServices.has(item.service))
  const taxRule = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(price).toBeTruthy()
  expect(taxRule).toBeTruthy()
  if (!price || !taxRule) return

  const register = `Cash recon ${randomUUID().slice(0, 8)}`
  const registerPage = '/ui/app/?local-demo=1#/laundry/cash-closing'
  await page.goto(registerPage, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cash closing', exact: true })).toBeVisible()
  await page.getByLabel('Register').fill(register)
  await page.getByLabel('Opening float').fill('50.00')
  await page.getByLabel('Shift note').fill('Synthetic cash drawer reconciliation')
  const openResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/open' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Open shift', exact: true }).click()
  const openResponse = await openResponsePromise
  expect(openResponse.status(), await openResponse.text()).toBe(201)
  const openShift = await openResponse.json() as Shift
  await expect(page.getByText(`Cash shift opened for ${register}.`, { exact: true })).toBeVisible()

  const fixtureId = randomUUID()
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': `cash-close-order-${fixtureId}` },
    data: {
      customer: { name: `Cash Close ${fixtureId.slice(0, 8)}`, phone: `96${Date.now().toString().slice(-8)}` },
      orderDate: businessDate(-1),
      items: [{ garment: price.garment, service: price.service, qty: 1 }],
      expectedDeliveryDate: businessDate(5), fulfillmentMode: 'Home Delivery', paymentMode: 'Pay Later',
      taxRate: 18, taxRuleId: taxRule.id, notes: 'Synthetic cash close reconciliation fixture',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booking = await bookingResponse.json() as Order
  const initialPaymentResponse = await page.request.get(`${origin}/api/laundry/orders/${booking.order.id}/payments`)
  expect(initialPaymentResponse.ok()).toBe(true)
  const initialPayment = await initialPaymentResponse.json() as PaymentSummary
  expect(initialPayment.status).toBe('Unpaid')

  await page.goto(`/ui/app/?local-demo=1#/laundry/orders?order=${encodeURIComponent(booking.order.id)}`, { waitUntil: 'domcontentloaded' })
  const workCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(workCard).toBeVisible()
  await workCard.getByLabel('Amount').fill(initialPayment.total.toFixed(2))
  await workCard.getByLabel('Method').selectOption('Cash')
  await workCard.getByLabel('Cash register').selectOption(register)
  const collectionResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/orders/${booking.order.id}/payments` && response.request().method() === 'POST')
  await workCard.getByRole('button', { name: 'Record collection' }).click()
  const collectionResponse = await collectionResponsePromise
  expect(collectionResponse.status(), await collectionResponse.text()).toBe(201)
  await expect(workCard.getByText('This invoice is fully settled.', { exact: true })).toBeVisible()

  await page.goto(registerPage, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Register').fill(register)
  const activeShiftResponse = await page.request.get(`${origin}/api/laundry/cash-shift?register=${encodeURIComponent(register)}`)
  expect(activeShiftResponse.ok()).toBe(true)
  const activeShift = await activeShiftResponse.json() as Shift
  expect(activeShift).toMatchObject({
    id: openShift.id, status: 'Open', register,
    openingCash: 50, collections: initialPayment.total,
    expenses: 0, refunds: 0, expectedCash: 50 + initialPayment.total,
    movementCounts: { collections: 1, expenses: 0, refunds: 0 },
  })
  await expect(page.getByText('Cash collections', { exact: true })).toBeVisible()
  await expect(page.getByText('Expected in drawer', { exact: true })).toBeVisible()
  await expect(page.getByText('Cash collections', { exact: true }).locator('..')).toContainText(displayedINR(initialPayment.total))
  await expect(page.getByText('Expected in drawer', { exact: true }).locator('..')).toContainText(displayedINR(activeShift.expectedCash))
  await expect(page.getByText('Cash collections', { exact: true }).locator('..')).toContainText('1 entries')
  await captureEvidence(page, 'cash-close-open-shift')

  await page.getByLabel('Counted cash').fill(activeShift.expectedCash.toFixed(2))
  await page.getByLabel('Close note').fill('Synthetic count matched the register balance.')
  const closeResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift', exact: true }).click()
  const closeResponse = await closeResponsePromise
  expect(closeResponse.status(), await closeResponse.text()).toBe(201)
  const closedShift = await closeResponse.json() as Shift
  expect(closedShift).toMatchObject({ status: 'Closed', countedCash: activeShift.expectedCash, variance: 0, movementCounts: { collections: 1, expenses: 0, refunds: 0 } })
  await expect(page.getByText(/Shift closed\. Variance: ₹0/)).toBeVisible()
  await captureEvidence(page, 'cash-close-matched-count')

  const drillResponse = await page.request.get(`${origin}/api/laundry/cash-close-drill?businessDate=${businessDate()}`)
  expect(drillResponse.ok()).toBe(true)
  const drill = await drillResponse.json() as CloseDrill
  expect(drill.shifts.find((shift) => shift.shiftId === closedShift.id)).toMatchObject({ passed: true, checks: { equation: true, variance: true, fixedScale: true } })

  const varianceRegister = register
  await page.getByLabel('Register').fill(varianceRegister)
  await page.getByLabel('Opening float').fill('20.00')
  const varianceOpenPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/open' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Open shift', exact: true }).click()
  const varianceOpenResponse = await varianceOpenPromise
  expect(varianceOpenResponse.status()).toBe(201)
  const reopenedShift = await varianceOpenResponse.json() as Shift
  expect(reopenedShift.id).not.toBe(closedShift.id)
  await page.getByLabel('Counted cash').fill('19.00')
  const rejectedClosePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift', exact: true }).click()
  const rejectedClose = await rejectedClosePromise
  expect(rejectedClose.status()).toBe(400)
  await expect(page.getByText(/variance explanation is required before supervisor approval/)).toBeVisible()
  await captureEvidence(page, 'cash-close-variance-review')
  const remainsOpenResponse = await page.request.get(`${origin}/api/laundry/cash-shift?register=${encodeURIComponent(varianceRegister)}`)
  expect((await remainsOpenResponse.json() as Shift).status).toBe('Open')

  await page.getByLabel('Close note').fill('Investigated the synthetic one-rupee shortage.')
  const approvedClosePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift', exact: true }).click()
  const approvedClose = await approvedClosePromise
  expect(approvedClose.status(), await approvedClose.text()).toBe(201)
  const varianceShift = await approvedClose.json() as Shift
  expect(varianceShift).toMatchObject({ status: 'Closed', countedCash: 19, variance: -1 })
  expect(varianceShift.varianceApprovedBy).toBeTruthy()
  await captureEvidence(page, 'cash-close-supervisor-approved-variance')
})
