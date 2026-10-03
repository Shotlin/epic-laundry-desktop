import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; active?: boolean }>
  services: Array<{ id: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
}
type Shift = { id: string; status: string; register: string; openingCash: number; collections: number; expectedCash: number; movementCounts: { collections: number } }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function captureEvidence(page: Page, filename: string) {
  const path = resolve(process.cwd(), `../docs/parity/evidence/${filename}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage: true })
}

test('care package sale, cash register, UPI balance, redemption and cash close stay in sync', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const runId = randomUUID()
  const register = `Package ${runId.slice(0, 6)}`
  const otherRegister = `Package alt ${runId.slice(0, 6)}`

  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const included = catalogue.prices.find((price) => price.active !== false && price.rate > 0 && catalogue.garments.some((garment) => garment.id === price.garment && garment.active !== false) && catalogue.services.some((service) => service.id === price.service && service.active !== false))
  expect(included).toBeTruthy()
  if (!included) return

  const customerResponse = await page.request.post(`${origin}/api/laundry/customers`, {
    headers: { 'idempotency-key': `package-ui-customer-${runId}` },
    data: { name: `Package UI ${runId.slice(0, 8)}`, phone: `96${Date.now().toString().slice(-8)}` },
  })
  expect(customerResponse.status(), await customerResponse.text()).toBe(201)
  const customer = await customerResponse.json() as { id: string; name: string }

  for (const [index, name] of [register, otherRegister].entries()) {
    const opened = await page.request.post(`${origin}/api/laundry/cash-shift/open`, {
      headers: { 'idempotency-key': `package-ui-open-${runId}-${index}` },
      data: { openingCash: 40, register: name, note: 'Synthetic care package flow' },
    })
    expect(opened.status(), await opened.text()).toBe(201)
  }

  let failedRegisterLookup = false
  await page.route('**/api/laundry/cash-shifts', async (route) => {
    if (!failedRegisterLookup) {
      failedRegisterLookup = true
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary register lookup failure' }) })
      return
    }
    await route.continue()
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/packages', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Care package desk', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Define package', exact: true }).click()
  const packageName = `Care test ${runId.slice(0, 6)}`
  await page.getByLabel('Package name').fill(packageName)
  await page.getByLabel('Package price').fill('250')
  await page.getByLabel('Validity (days)').fill('30')
  const garmentName = catalogue.garments.find((item) => item.id === included.garment)?.name
  const serviceName = catalogue.services.find((item) => item.id === included.service)?.name
  expect(garmentName).toBeTruthy()
  expect(serviceName).toBeTruthy()
  if (!garmentName || !serviceName) return
  await page.getByLabel('Included garment').selectOption(included.garment)
  await page.getByLabel('Included service').selectOption(included.service)
  await page.getByLabel('Included allowance').fill('2')
  const createPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/packages' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Save care package', exact: true }).click()
  expect((await createPromise).status()).toBe(201)
  await expect(page.getByText(packageName, { exact: true })).toBeVisible()

  await page.getByLabel('Search customers').fill(customer.name)
  const customerSelect = page.locator('aside').getByRole('combobox')
  await expect(customerSelect.locator(`option[value="${customer.id}"]`)).toBeAttached()
  await customerSelect.selectOption(customer.id)
  await expect(page.getByText('No package for this customer')).toBeVisible()
  await page.locator('article').filter({ hasText: packageName }).getByRole('button', { name: 'Assign to selected customer', exact: true }).click()
  await expect(page.getByText(packageName, { exact: true })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  const paymentAmount = page.getByLabel('Package payment amount')
  await paymentAmount.fill('75')
  const cashRegister = page.getByLabel('Package cash register')
  await expect(cashRegister.locator('option')).toHaveCount(3)
  await cashRegister.selectOption(register)
  const cashPaymentPromise = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/payments') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Record package payment', exact: true }).click()
  const cashPaymentResponse = await cashPaymentPromise
  expect(cashPaymentResponse.status(), await cashPaymentResponse.text()).toBe(201)
  const cashPayment = await page.request.get(`${origin}/api/laundry/cash-shift?register=${encodeURIComponent(register)}`)
  expect(cashPayment.ok()).toBe(true)
  expect(await cashPayment.json() as Shift).toMatchObject({ openingCash: 40, collections: 75, expectedCash: 115, movementCounts: { collections: 1 } })

  await expect(page.getByText('Outstanding ₹175')).toBeVisible()
  await page.getByLabel('Package payment method').selectOption('UPI')
  await paymentAmount.fill('175')
  const upiPaymentPromise = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/payments') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Record package payment', exact: true }).click()
  expect((await upiPaymentPromise).status()).toBe(201)
  await expect(page.getByText('Package balance settled.', { exact: true })).toBeVisible()
  const reconciliation = await page.request.get(`${origin}/api/laundry/reconciliation`)
  expect(reconciliation.ok()).toBe(true)
  expect((await reconciliation.json()).status).toBe('Reconciled')

  await page.getByRole('button', { name: 'Redeem 1', exact: true }).click()
  await expect(page.getByText('1 of 2 left', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Redeem 1', exact: true }).click()
  await expect(page.getByText('0 of 2 left', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Redeem 1', exact: true })).toBeDisabled()

  const assignedResponse = await page.request.get(`${origin}/api/laundry/customers/${customer.id}/packages`)
  expect(assignedResponse.ok()).toBe(true)
  const assigned = (await assignedResponse.json() as Array<{ id: string; status: string; pricePaid: number; paymentStatus: string; services: Array<{ remaining: number }> }>)[0]
  expect(assigned).toMatchObject({ status: 'Exhausted', pricePaid: 250, paymentStatus: 'Paid', services: [{ remaining: 0 }] })
  const liabilityResponse = await page.request.get(`${origin}/api/laundry/package-liability?customerId=${encodeURIComponent(customer.id)}`)
  expect(liabilityResponse.ok()).toBe(true)
  expect((await liabilityResponse.json()).totals).toMatchObject({ contract: 250, collected: 250, outstanding: 0, redeemedUnits: 2, remainingUnits: 0 })
  await captureEvidence(page, 'care-package-flow')

  await page.goto('/ui/app/?local-demo=1#/laundry/cash-closing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cash closing', exact: true })).toBeVisible()
  await page.getByLabel('Register').fill(register)
  await expect(page.getByText(`Open shift · ${register}`, { exact: true })).toBeVisible()
  await page.getByLabel('Counted cash').fill('115')
  await page.getByLabel('Close note').fill('Synthetic package payment cash count matched.')
  const closePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift', exact: true }).click()
  const closeResponse = await closePromise
  expect(closeResponse.status(), await closeResponse.text()).toBe(201)
  expect(await closeResponse.json() as Shift).toMatchObject({ status: 'Closed', collections: 75, expectedCash: 115 })
  const drillResponse = await page.request.get(`${origin}/api/laundry/cash-close-drill`)
  expect(drillResponse.ok()).toBe(true)
  expect((await drillResponse.json()).passed).toBe(true)
  await captureEvidence(page, 'care-package-cash-close')
})
