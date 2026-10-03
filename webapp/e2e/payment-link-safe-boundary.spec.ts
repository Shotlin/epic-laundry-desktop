import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; name: string; active?: boolean }>
  services: Array<{ id: string; name: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
}
type Quote = { grandTotal: number }
type PreparedPaymentLink = { method: 'upi' | 'razorpay'; intent?: string; payload?: { amount?: number; currency?: string } }
type CustomerProfile = { orders: unknown[]; metrics: { orderBalance: number } }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
}

test('preparing an UPI link is authorized, amount-matched, and does not settle or book an order', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = randomUUID()
  const customerName = `Link Flow ${runId.slice(0, 8)}`
  const phone = `98${Date.now().toString().slice(-8)}`
  let orderWrites = 0
  let paymentWrites = 0
  let providerRequests: string[] = []
  const linkRequestBodies: Array<Record<string, unknown>> = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && /^\/api\/laundry\/orders(?:\/[^/]+\/payments)?$/.test(url.pathname)) {
      if (/\/payments$/.test(url.pathname)) paymentWrites += 1
      else orderWrites += 1
    }
    if (/razorpay|paytm|phonepe|cashfree/i.test(url.hostname)) providerRequests.push(url.hostname)
    if (request.method() === 'POST' && url.pathname === '/api/payments/link') linkRequestBodies.push(request.postDataJSON() as Record<string, unknown>)
  })

  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const customerResponse = await page.request.post(`${origin}/api/laundry/customers`, {
    headers: { 'idempotency-key': `payment-link-customer-${runId}` },
    data: { name: customerName, phone },
  })
  expect(customerResponse.status(), await customerResponse.text()).toBe(201)
  const customer = await customerResponse.json() as { id: string; name: string; phone: string }
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const activeGarments = new Set(catalogue.garments.filter((item) => item.active !== false).map((item) => item.id))
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.rate > 0 && activeGarments.has(item.garment) && activeServices.has(item.service))
  expect(price, 'isolated catalogue has an active priced garment/service').toBeTruthy()
  if (!price) return
  const garment = catalogue.garments.find((item) => item.id === price.garment)!
  const service = catalogue.services.find((item) => item.id === price.service)!

  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill(customer.name)
  await page.getByRole('button', { name: new RegExp(`${customer.name} ${customer.phone}`) }).click()
  await page.getByRole('group', { name: 'Care service' }).getByRole('button', { name: service.name, exact: true }).click()
  await page.getByRole('textbox', { name: 'Search garments, categories or services' }).fill(garment.name)
  const card = page.locator('article').filter({ hasText: garment.name }).first()
  await expect(card).toBeVisible()
  const quoteResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/quote' && response.request().method() === 'POST')
  await card.getByRole('button', { name: 'Add', exact: true }).click()
  const quoteResponse = await quoteResponsePromise
  expect(quoteResponse.ok(), await quoteResponse.text()).toBe(true)
  const quote = await quoteResponse.json() as Quote
  expect(quote.grandTotal).toBeGreaterThan(0)

  await page.locator('button[title="UPI"]').click()
  const linkResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/payments/link' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Prepare UPI link' }).click()
  const linkResponse = await linkResponsePromise
  expect(linkResponse.status(), await linkResponse.text()).toBe(200)
  const prepared = await linkResponse.json() as PreparedPaymentLink
  expect(['upi', 'razorpay']).toContain(prepared.method)
  expect(prepared.intent).toMatch(/^upi:\/\/pay\?/)
  const intent = new URL(prepared.intent!)
  expect(Number(intent.searchParams.get('am'))).toBe(quote.grandTotal)
  expect(linkRequestBodies).toHaveLength(1)
  expect(linkRequestBodies[0].amount).toBe(quote.grandTotal)
  expect(linkRequestBodies[0].description).toContain(customer.name)
  if (prepared.method === 'razorpay') expect(prepared.payload?.amount).toBe(Math.round(quote.grandTotal * 100))
  await expect(page.getByText('Preparing or copying does not mark the order paid. Confirm the payment before booking.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
  expect(orderWrites).toBe(0)
  expect(paymentWrites).toBe(0)
  expect(providerRequests).toEqual([])

  const profileResponse = await page.request.get(`${origin}/api/laundry/customers/${customer.id}`)
  expect(profileResponse.ok()).toBe(true)
  const profile = await profileResponse.json() as CustomerProfile
  expect(profile.orders).toEqual([])
  expect(profile.metrics.orderBalance).toBe(0)

  const zeroAmount = await page.evaluate(async () => {
    const response = await fetch('/api/payments/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 0 }) })
    return response.status
  })
  expect(zeroAmount).toBe(400)
  const excessPrecision = await page.evaluate(async () => {
    const response = await fetch('/api/payments/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 1.001 }) })
    return response.status
  })
  expect(excessPrecision).toBe(400)
  expect(orderWrites).toBe(0)
  expect(paymentWrites).toBe(0)
  expect(providerRequests).toEqual([])
})
