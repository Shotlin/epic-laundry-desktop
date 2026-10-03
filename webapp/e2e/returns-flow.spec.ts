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
type Booking = { order: { id: string; orderNumber: string; customer: { name: string }; grandTotal: number } }
type Finance = { current: { kpis: { refundsPaise: number }; returns: { cases: number; requestedPaise: number } } }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('a return request is reviewed, auditable and separate from an actual refund', async ({ page }) => {
  test.setTimeout(180_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const garments = new Set(catalogue.garments.filter((item) => item.active !== false).map((item) => item.id))
  const services = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.rate > 0 && garments.has(item.garment) && services.has(item.service))
  expect(price, 'the disposable demo must provide one active priced garment/service pair').toBeTruthy()
  if (!price) return
  const gst = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(gst, 'the existing configured 18% GST rule remains the booking default').toBeTruthy()
  if (!gst) return

  const fixture = randomUUID()
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': `return-flow-${fixture}` },
    data: {
      customer: { name: `Return ${fixture.slice(0, 8)}`, phone: `91${Date.now().toString().slice(-8)}` },
      items: [{ garment: price.garment, service: price.service, qty: 1, color: 'Navy', garmentType: 'Standard' }],
      expectedDeliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      fulfillmentMode: 'Home Delivery', paymentMode: 'Pay Later', taxRate: 18, taxRuleId: gst.id,
      notes: 'Synthetic return-flow fixture',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booked = await bookingResponse.json() as Booking
  expect(booked.order.grandTotal).toBeGreaterThan(0)

  const today = new Date().toISOString().slice(0, 10)
  const financeBeforeResponse = await page.request.get(`${origin}/api/finance/command-center?from=${today}&to=${today}`)
  expect(financeBeforeResponse.ok()).toBe(true)
  const financeBefore = await financeBeforeResponse.json() as Finance

  const productionGroup = page.locator('aside nav').getByRole('button', { name: 'Production', exact: true })
  if (await productionGroup.getAttribute('aria-expanded') !== 'true') await productionGroup.click()
  await page.locator('aside nav').getByRole('link', { name: 'Returns', exact: true }).click()
  await expect(page).toHaveURL(/#\/laundry\/returns$/)
  await expect(page.getByRole('heading', { name: 'Returns & refund requests' })).toBeVisible()
  await expect(page.getByText(/request is not a refund/i)).toBeVisible()

  const writes: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/laundry/returns' && request.method() === 'POST') writes.push(request.method())
  })
  const search = page.getByRole('searchbox', { name: 'Search orders by order number or customer' })
  await search.fill(`missing-${fixture.slice(0, 8)}`)
  await expect(page.getByRole('listbox', { name: 'Matching orders' })).toContainText('No matching orders')
  await search.fill(booked.order.orderNumber)
  const orderChoice = page.getByRole('option', { name: new RegExp(booked.order.orderNumber) })
  await expect(orderChoice).toBeVisible()
  await orderChoice.click()
  await expect(page.getByRole('region', { name: 'Selected order' })).toContainText(booked.order.orderNumber)
  await expect(page.getByRole('region', { name: 'Selected order' })).toContainText(booked.order.customer.name)

  const requestedAmount = Math.max(0.01, Math.round(booked.order.grandTotal / 2 * 100) / 100)
  const amountInput = page.getByRole('spinbutton', { name: 'Requested amount' })
  await amountInput.fill((booked.order.grandTotal + 0.01).toFixed(2))
  await page.getByRole('button', { name: 'Review request' }).click()
  await expect(page.getByRole('alert')).toContainText('cannot exceed this order total')
  await expect(page.getByRole('dialog', { name: 'Review return request' })).toHaveCount(0)
  expect(writes).toEqual([])

  await amountInput.fill('1.001')
  await page.getByRole('button', { name: 'Review request' }).click()
  await expect(page.getByRole('alert')).toContainText('no more than two decimal places')
  const serverPrecision = await page.request.post(`${origin}/api/laundry/returns`, {
    headers: { 'idempotency-key': `return-precision-${fixture}` },
    data: { orderId: booked.order.id, amount: 1.001, reason: 'Quality issue', note: 'Must be rejected' },
  })
  expect(serverPrecision.status()).toBe(400)
  expect((await serverPrecision.json() as { code?: string }).code).toBe('RETURN_AMOUNT_PRECISION_INVALID')

  const existingCasesResponse = await page.request.get(`${origin}/api/laundry/returns`)
  expect(existingCasesResponse.ok()).toBe(true)
  const existingCases = await existingCasesResponse.json() as Array<{ orderId: string }>
  const caseCountBeforeFixture = existingCases.filter((item) => item.orderId === booked.order.id).length
  const serverOverLimit = await page.request.post(`${origin}/api/laundry/returns`, {
    headers: { 'idempotency-key': `return-over-limit-${fixture}` },
    data: { orderId: booked.order.id, amount: booked.order.grandTotal + 0.01, reason: 'Quality issue', note: 'Must be rejected' },
  })
  expect(serverOverLimit.status()).toBe(400)
  expect((await serverOverLimit.json() as { code?: string }).code).toBe('RETURN_EXCEEDS_ORDER_TOTAL')
  const afterInvalidCases = await (await page.request.get(`${origin}/api/laundry/returns`)).json() as Array<{ orderId: string }>
  expect(afterInvalidCases.filter((item) => item.orderId === booked.order.id)).toHaveLength(caseCountBeforeFixture)
  await amountInput.fill(requestedAmount.toFixed(2))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Reason' }).selectOption('Quality issue')
  await page.getByRole('textbox', { name: 'Evidence note' }).fill('Synthetic inspected return request')
  await page.getByRole('button', { name: 'Review request' }).click()
  const review = page.getByRole('dialog', { name: 'Review return request' })
  await expect(review).toBeVisible()
  await expect(review).toContainText(booked.order.orderNumber)
  await expect(review).toContainText(requestedAmount.toFixed(2))
  expect(writes).toEqual([])
  await page.keyboard.press('Escape')
  await expect(review).toBeHidden()
  await expect(page.getByRole('button', { name: 'Review request' })).toBeFocused()
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Review request' }).click()
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(review).toBeHidden()
  await expect(page.getByRole('spinbutton', { name: 'Requested amount' })).toHaveValue(requestedAmount.toFixed(2))
  expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Review request' }).click()
  const submit = page.getByRole('dialog', { name: 'Review return request' }).getByRole('button', { name: 'Submit return request' })
  const createResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/returns' && response.request().method() === 'POST')
  await submit.click()
  expect((await createResponse).status()).toBe(201)
  await expect(page.getByRole('status')).toContainText(/return request recorded/i)
  await expect(page.getByRole('status')).toContainText(/no refund was issued/i)
  const caseRow = page.locator('article').filter({ hasText: booked.order.orderNumber }).filter({ hasText: booked.order.customer.name }).first()
  await expect(caseRow).toContainText('Quality issue')
  await expect(caseRow).toContainText('Requested')
  await expect(caseRow).toContainText('Synthetic inspected return request')

  const financeAfterResponse = await page.request.get(`${origin}/api/finance/command-center?from=${today}&to=${today}`)
  expect(financeAfterResponse.ok()).toBe(true)
  const financeAfter = await financeAfterResponse.json() as Finance
  expect(financeAfter.current.returns.cases).toBe(financeBefore.current.returns.cases + 1)
  expect(financeAfter.current.returns.requestedPaise).toBe(financeBefore.current.returns.requestedPaise + Math.round(requestedAmount * 100))
  expect(financeAfter.current.kpis.refundsPaise).toBe(financeBefore.current.kpis.refundsPaise)

  await search.fill(booked.order.orderNumber)
  await expect(orderChoice).toBeVisible()
  await orderChoice.click()
  await page.getByRole('spinbutton', { name: 'Requested amount' }).fill(requestedAmount.toFixed(2))
  await page.getByRole('combobox', { name: 'Reason' }).selectOption('Quality issue')
  await page.getByRole('textbox', { name: 'Evidence note' }).fill('Synthetic inspected return request')
  await page.getByRole('button', { name: 'Review request' }).click()
  const duplicateSubmit = page.getByRole('dialog', { name: 'Review return request' }).getByRole('button', { name: 'Submit return request' })
  const duplicateResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/returns' && response.request().method() === 'POST')
  await duplicateSubmit.click()
  expect((await duplicateResponse).status()).toBe(201)
  await expect(page.getByRole('status')).toContainText(/matching request already exists/i)
  await expect(page.locator('article').filter({ hasText: booked.order.orderNumber }).filter({ hasText: booked.order.customer.name })).toHaveCount(1)

  await page.getByRole('combobox', { name: 'Reason' }).selectOption('Other')
  await page.getByRole('textbox', { name: 'Evidence note' }).fill('Synthetic case used to check recovery after a service error')
  await page.route('**/api/laundry/returns', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service is temporarily unavailable', code: 'TEMPORARY_FAILURE' }) })
  })
  await page.getByRole('button', { name: 'Review request' }).click()
  const failedSubmit = page.getByRole('dialog', { name: 'Review return request' }).getByRole('button', { name: 'Submit return request' })
  const failedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/returns' && response.request().method() === 'POST')
  await failedSubmit.click()
  expect((await failedResponse).status()).toBe(503)
  await expect(page.getByRole('alert')).toContainText(/could not save this return request/i)
  await expect(page.getByRole('alert')).toContainText(/nothing was recorded/i)
  expect(await page.getByRole('alert').innerText()).not.toMatch(/POST \/api|503/)
  await page.unroute('**/api/laundry/returns')

  await page.getByRole('button', { name: 'Review request' }).click()
  const retrySubmit = page.getByRole('dialog', { name: 'Review return request' }).getByRole('button', { name: 'Submit return request' })
  const retryResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/returns' && response.request().method() === 'POST')
  await retrySubmit.click()
  expect((await retryResponse).status()).toBe(201)
  await expect(page.getByRole('status')).toContainText(/return request recorded/i)
  await expect(page.locator('article').filter({ hasText: booked.order.orderNumber }).filter({ hasText: booked.order.customer.name })).toHaveCount(2)

  const financeFinalResponse = await page.request.get(`${origin}/api/finance/command-center?from=${today}&to=${today}`)
  expect(financeFinalResponse.ok()).toBe(true)
  const financeFinal = await financeFinalResponse.json() as Finance
  expect(financeFinal.current.returns.cases).toBe(financeBefore.current.returns.cases + 2)
  expect(financeFinal.current.returns.requestedPaise).toBe(financeBefore.current.returns.requestedPaise + Math.round(requestedAmount * 200))
  expect(financeFinal.current.kpis.refundsPaise).toBe(financeBefore.current.kpis.refundsPaise)

  const desktopEvidence = resolve(process.cwd(), '../docs/parity/evidence/returns-flow-desktop.png')
  const mobileEvidence = resolve(process.cwd(), '../docs/parity/evidence/returns-flow-mobile.png')
  mkdirSync(dirname(mobileEvidence), { recursive: true })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('main')?.scrollTo(0, 0) })
  await page.screenshot({ path: desktopEvidence, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('main')?.scrollTo(0, 0) })
  await expect(page.getByRole('heading', { name: 'Returns & refund requests' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: mobileEvidence, fullPage: true })
})

test('the return register explains a read failure and retries to a clear empty state', async ({ page }) => {
  test.setTimeout(90_000)
  await signIntoDemo(page)
  let registerReads = 0
  const writes: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/laundry/returns' && request.method() === 'POST') writes.push(request.method())
  })
  await page.route('**/api/laundry/returns', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return }
    registerReads += 1
    if (registerReads <= 2) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary register failure' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  const productionGroup = page.locator('aside nav').getByRole('button', { name: 'Production', exact: true })
  if (await productionGroup.getAttribute('aria-expanded') !== 'true') await productionGroup.click()
  await page.locator('aside nav').getByRole('link', { name: 'Returns', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Return requests could not be loaded' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect.poll(() => registerReads).toBe(3)
  await expect(page.getByRole('heading', { name: 'Returns & refund requests' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('No return requests yet')).toBeVisible()
  expect(registerReads).toBe(3)
  expect(writes).toEqual([])
})
