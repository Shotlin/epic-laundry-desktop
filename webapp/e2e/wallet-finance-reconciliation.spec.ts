import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; name: string; active?: boolean }>
  services: Array<{ id: string; name: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
  taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
}
type BookingResult = { order: { id: string; invoiceNumber: string; grandTotal: number; paymentStatus: string; customer: { id: string } } }
type PaymentSummary = {
  invoiceNumber: string
  total: number
  paid: number
  outstanding: number
  status: string
  payments: Array<{ id: string; amount: number; mode: string; reference: string; postingDate: string; providerStatus: string }>
}
type CustomerProfile = {
  metrics: { orderBalance: number; walletBalance: number }
  reconciliation: { unreconciledOrderCount: number }
  ledger: Array<{ entryType: string; debit: number; credit: number; referenceType: string; referenceId: string }>
}
type CollectionReport = { rows: Array<{ invoiceNumber: string; amount: number; method: string; date: string; reference: string }>; totalRows: number }
type BalanceReport = { rows: Array<{ invoiceNumber: string; invoiceAmount: number; balanceAmount: number }>; totalRows: number }
type FinancialEntry = { kind: string; direction: string; amountPaise: number; metadata?: Record<string, unknown> }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
}

function businessDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function captureEvidence(page: Page) {
  const path = resolve(process.cwd(), '../docs/parity/evidence/wallet-finance-reconciliation.png')
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path })
}

test('LNDRY wallet partial payment reconciles through booking, order balance, collection, and reports', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const runId = randomUUID()
  const customerName = `Wallet Flow ${runId.slice(0, 8)}`
  const customerPhone = `97${Date.now().toString().slice(-8)}`

  // Keep local demo authentication on its normal settings, then expose the wallet
  // controls only after the demo shell has loaded. This never contacts LNDRY.
  let workspaceReads = 0
  await page.route('**/api/workspace/status', async (route) => {
    workspaceReads += 1
    const response = await route.fetch()
    if (workspaceReads === 1) return route.fulfill({ response })
    return route.fulfill({ response, json: { mode: 'production' } })
  })

  const walletCalls: Array<{ path: string; body: Record<string, unknown> }> = []
  await page.route('**/api/marketplace/cloud/wallet/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON() as Record<string, unknown>
    walletCalls.push({ path, body })
    if (path.endsWith('/lookup')) {
      return route.fulfill({ json: { userId: 'synthetic-lndry-user', name: customerName, balancePaise: 1735 } })
    }
    if (path.endsWith('/redemption-requests')) {
      return route.fulfill({ json: { requestId: 'synthetic-redemption-1735', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() } })
    }
    if (path.endsWith('/confirm')) {
      return route.fulfill({ json: { requestId: 'synthetic-redemption-1735', amountPaise: 1735, walletTransactionId: 'synthetic-wallet-transaction', newBalance: 0, holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString() } })
    }
    if (path.endsWith('/cancel')) return route.fulfill({ json: { ok: true } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected synthetic wallet route' } })
  })

  const localWrites: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && /^\/api\/laundry\/orders(?:\/[^/]+\/payments)?$/.test(url.pathname)) {
      localWrites.push(`${request.method()} ${url.pathname}`)
    }
  })

  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const customerCreateResponse = await page.request.post(`${origin}/api/laundry/customers`, {
    headers: { 'idempotency-key': `wallet-flow-customer-${runId}` },
    data: { name: customerName, phone: customerPhone },
  })
  expect(customerCreateResponse.status(), await customerCreateResponse.text()).toBe(201)
  const customer = await customerCreateResponse.json() as { id: string; name: string; phone: string }
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const activeGarments = new Set(catalogue.garments.filter((item) => item.active !== false).map((item) => item.id))
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.rate >= 20 && activeGarments.has(item.garment) && activeServices.has(item.service))
  expect(price, 'the isolated catalogue should have an active garment/service above the wallet tender').toBeTruthy()
  if (!price) return
  const garment = catalogue.garments.find((item) => item.id === price.garment)!
  const service = catalogue.services.find((item) => item.id === price.service)!

  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill(customer.name)
  await page.getByRole('button', { name: new RegExp(`${customer.name} ${customer.phone}`) }).click()
  await expect(page.getByText('Wallet balance: ₹17.35')).toBeVisible()
  await page.getByRole('group', { name: 'Care service' }).getByRole('button', { name: service.name, exact: true }).click()
  await page.getByRole('textbox', { name: 'Search garments, categories or services' }).fill(garment.name)
  const garmentCard = page.locator('article').filter({ hasText: garment.name }).first()
  await expect(garmentCard).toBeVisible()
  await garmentCard.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Grand total', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Use wallet')).toBeEnabled()
  await page.getByLabel('Use wallet').check()
  await expect(page.getByText(new RegExp(`requested — ask ${customer.name}`))).toBeVisible()
  await expect.poll(() => walletCalls.some((call) => call.path.endsWith('/redemption-requests'))).toBe(true)
  expect(walletCalls.find((call) => call.path.endsWith('/redemption-requests'))?.body.amountPaise).toBe(1735)
  await page.getByPlaceholder('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText('₹17.35 reserved from LNDRY Wallet')).toBeVisible()
  await expect(page.getByText('Due via Pay Later', { exact: true })).toBeVisible()
  await expect.poll(() => localWrites).toEqual([])
  await expect.poll(() => walletCalls.map((call) => call.path.endsWith('/confirm'))).toContain(true)
  await captureEvidence(page)

  const bookingResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/orders' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Book order', exact: true }).click()
  const bookingResponse = await bookingResponsePromise
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booking = await bookingResponse.json() as BookingResult
  expect(booking.order.grandTotal).toBeGreaterThan(17.35)
  expect(booking.order.paymentStatus).toBe('Part Paid')
  await expect(page.getByText('Order booked', { exact: true })).toBeVisible()
  await expect(page.getByText('Part Paid · Pay Later', { exact: true })).toBeVisible()
  expect(walletCalls.map((call) => call.path.split('/').at(-1))).toEqual(['lookup', 'redemption-requests', 'confirm'])

  const date = businessDate()
  const initialResponse = await page.request.get(`${origin}/api/laundry/orders/${booking.order.id}/payments`)
  expect(initialResponse.ok()).toBe(true)
  const initial = await initialResponse.json() as PaymentSummary
  expect(initial).toMatchObject({ status: 'Part Paid', invoiceNumber: booking.order.invoiceNumber, paid: 17.35 })
  expect(initial.outstanding).toBe(Math.round((initial.total - 17.35) * 100) / 100)
  expect(initial.payments).toHaveLength(1)
  expect(initial.payments[0]).toMatchObject({ amount: 17.35, mode: 'LNDRY Wallet', reference: 'synthetic-redemption-1735', providerStatus: 'Manual' })

  const partialProfileResponse = await page.request.get(`${origin}/api/laundry/customers/${booking.order.customer.id}`)
  expect(partialProfileResponse.ok()).toBe(true)
  const partialProfile = await partialProfileResponse.json() as CustomerProfile
  expect(partialProfile.metrics.orderBalance).toBe(initial.outstanding)
  expect(partialProfile.metrics.walletBalance).toBe(0)
  expect(partialProfile.reconciliation.unreconciledOrderCount).toBe(0)
  expect(partialProfile.ledger).toEqual(expect.arrayContaining([
    expect.objectContaining({ entryType: 'Invoice Debit', debit: initial.total, referenceType: 'laundry_order', referenceId: booking.order.id }),
    expect.objectContaining({ entryType: 'Wallet Debit', credit: 17.35, referenceType: 'payment_entry', referenceId: initial.payments[0].id }),
  ]))

  const partialBalanceResponse = await page.request.get(`${origin}/api/laundry/reports/balance?search=${encodeURIComponent(booking.order.invoiceNumber)}`)
  expect(partialBalanceResponse.ok()).toBe(true)
  const partialBalance = await partialBalanceResponse.json() as BalanceReport
  expect(partialBalance.totalRows).toBe(1)
  expect(partialBalance.rows[0]).toMatchObject({ invoiceNumber: booking.order.invoiceNumber, invoiceAmount: initial.total, balanceAmount: initial.outstanding })
  const walletCollectionResponse = await page.request.get(`${origin}/api/laundry/reports/collection?from=${date}&to=${date}&search=${encodeURIComponent(booking.order.invoiceNumber)}&paymentMethod=${encodeURIComponent('LNDRY Wallet')}`)
  expect(walletCollectionResponse.ok()).toBe(true)
  const walletCollection = await walletCollectionResponse.json() as CollectionReport
  expect(walletCollection.totalRows).toBe(1)
  expect(walletCollection.rows[0]).toMatchObject({ invoiceNumber: booking.order.invoiceNumber, amount: 17.35, method: 'LNDRY Wallet' })

  await page.goto(`/ui/app/?local-demo=1#/laundry/orders?order=${encodeURIComponent(booking.order.id)}`, { waitUntil: 'domcontentloaded' })
  const workCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(workCard).toBeVisible()
  await expect(workCard.getByText('Part Paid', { exact: true })).toBeVisible()
  await workCard.getByLabel('Amount').fill(initial.outstanding.toFixed(2))
  await workCard.getByLabel('Method').selectOption('UPI')
  await workCard.getByPlaceholder('Reference / receipt no. (optional)').fill('synthetic-wallet-balance-settlement')
  const collectResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/orders/${booking.order.id}/payments` && response.request().method() === 'POST')
  await workCard.getByRole('button', { name: 'Record collection' }).click()
  const collectResponse = await collectResponsePromise
  expect(collectResponse.status(), await collectResponse.text()).toBe(201)
  await expect(workCard.getByText('Paid', { exact: true }).first()).toBeVisible()

  const [settledResponse, profileResponse, balanceResponse, collectionResponse] = await Promise.all([
    page.request.get(`${origin}/api/laundry/orders/${booking.order.id}/payments`),
    page.request.get(`${origin}/api/laundry/customers/${booking.order.customer.id}`),
    page.request.get(`${origin}/api/laundry/reports/balance?search=${encodeURIComponent(booking.order.invoiceNumber)}`),
    page.request.get(`${origin}/api/laundry/reports/collection?from=${date}&to=${date}&search=${encodeURIComponent(booking.order.invoiceNumber)}`),
  ])
  expect(settledResponse.ok()).toBe(true)
  const settled = await settledResponse.json() as PaymentSummary
  expect(settled.status).toBe('Paid')
  expect(settled.paid).toBe(settled.total)
  expect(settled.outstanding).toBe(0)
  expect(settled.payments.map((payment) => payment.mode).sort()).toEqual(['LNDRY Wallet', 'UPI'])
  expect(settled.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0)).toBe(Math.round(settled.total * 100))
  const settledProfile = await profileResponse.json() as CustomerProfile
  expect(settledProfile.metrics.orderBalance).toBe(0)
  expect(settledProfile.metrics.walletBalance).toBe(0)
  expect(settledProfile.ledger.reduce((balance, entry) => balance + entry.debit - entry.credit, 0)).toBe(0)
  expect((await balanceResponse.json() as BalanceReport).totalRows).toBe(0)
  const allCollections = await collectionResponse.json() as CollectionReport
  expect(allCollections.totalRows).toBe(2)
  expect(allCollections.rows.map((row) => row.method).sort()).toEqual(['LNDRY Wallet', 'UPI'])

  const financialEntriesResponse = await page.request.get(`${origin}/api/laundry/financial-entries?sourceId=${encodeURIComponent(initial.payments[0].id)}`)
  expect(financialEntriesResponse.ok()).toBe(true)
  const walletEntries = await financialEntriesResponse.json() as FinancialEntry[]
  expect(walletEntries).toHaveLength(1)
  expect(walletEntries[0]).toMatchObject({ kind: 'collection', direction: 'IN', amountPaise: 1735 })
  expect(walletEntries[0].metadata?.mode).toBe('LNDRY Wallet')
})
