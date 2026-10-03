import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; unit: string; active?: boolean }>
  services: Array<{ id: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
  taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
}
type Booking = { containerTags: Array<{ tagNumber: string; containerId: string; state: string; service: string }>; containers: Array<{ id: string; weightKg?: number; orderWeightKg?: number }> }
type Container = { id: string; tagCode: string; weightKg?: number; orderWeightKg?: number; state: string; events: Array<{ fromState?: string; toState?: string; note?: string }> }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function captureEvidence(page: Page, name: string, fullPage = false) {
  const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage })
}

test('bag/container tracking records valid handoffs and rejects a skipped state safely', async ({ page }) => {
  test.setTimeout(120_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const kilogramGarment = catalogue.garments.find((garment) => garment.active !== false && garment.unit === 'Kilogram')
  expect(kilogramGarment, 'the demo catalogue should contain an active weight-priced garment').toBeTruthy()
  if (!kilogramGarment) return
  const serviceIds = new Set(catalogue.services.filter((service) => service.active !== false).map((service) => service.id))
  const price = catalogue.prices.find((row) => row.active !== false && row.garment === kilogramGarment.id && row.rate > 0 && serviceIds.has(row.service))
  expect(price, 'the weight-priced garment should have an active service price').toBeTruthy()
  if (!price) return
  const gst = catalogue.taxRules.find((rule) => rule.active !== false && rule.rate === 18 && /laundry|9997/i.test(rule.name))
  expect(gst, 'the isolated store should expose its existing configured 18% laundry rule').toBeTruthy()
  if (!gst) return

  const fixtureId = randomUUID()
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': `container-tracking-${fixtureId}` },
    data: {
      customer: { name: `Container ${fixtureId.slice(0, 8)}`, phone: `92${Date.now().toString().slice(-8)}` },
      items: [{ garment: price.garment, service: price.service, qty: 2.5 }],
      containerCount: 2,
      expectedDeliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      fulfillmentMode: 'Home Delivery',
      paymentMode: 'Pay Later',
      taxRate: 18,
      taxRuleId: gst.id,
      notes: 'Synthetic bag tracking fixture',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booked = await bookingResponse.json() as Booking
  expect(booked.containerTags).toHaveLength(2)
  expect(booked.containers).toHaveLength(2)
  expect(booked.containers.map((container) => [container.weightKg, container.orderWeightKg])).toEqual([[undefined, 2.5], [undefined, 2.5]])
  expect(booked.containerTags.every((tag) => tag.service === 'Order total 2.5 kg; individual bag weight not recorded')).toBe(true)
  const tagCode = booked.containerTags[0].tagNumber
  expect(tagCode).toMatch(/^ELB-/)

  const garmentUnitsLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/garment-units' && response.request().method() === 'GET')
  await page.goto('/ui/app/?local-demo=1#/laundry/garment-tracking', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Garment tracking' })).toBeVisible()
  expect((await garmentUnitsLoaded).ok()).toBe(true)
  await page.getByRole('button', { name: 'Bag / container tag' }).click()
  const tagInput = page.getByRole('textbox', { name: 'Container tag or code' })
  await expect(tagInput).toBeVisible()
  await captureEvidence(page, 'container-tracking-station-desktop')
  await tagInput.fill(tagCode)

  const scan = async (nextState: string, location: string, note: string) => {
    await page.getByLabel('Move to').selectOption(nextState)
    await page.getByLabel('Location').fill(location)
    await page.getByLabel('Operator note').fill(note)
    const response = page.waitForResponse((candidate) => new URL(candidate.url()).pathname === '/api/laundry/containers/scan' && candidate.request().method() === 'POST')
    await page.getByRole('button', { name: 'Scan tag' }).click()
    return response
  }

  expect((await scan('Processing', 'Bulk wash', 'Loaded into batch A')).status()).toBe(201)
  await expect(page.getByRole('status')).toContainText('scan accepted and recorded')
  await expect(page.getByText('Selected container')).toBeVisible()
  await expect(page.getByText('Order total weight')).toBeVisible()
  await expect(page.getByText('Individual bag weight')).toBeVisible()
  await expect(page.getByText('2.5 kg', { exact: true })).toBeVisible()
  await expect(page.getByText('Not recorded', { exact: true })).toBeVisible()
  await expect(page.getByText('Intake → Processing')).toBeVisible()
  await expect(page.getByText('Loaded into batch A')).toBeVisible()

  expect((await scan('Delivered', 'Delivery shelf', 'Invalid skipped handoff')).status()).toBe(400)
  await expect(page.getByRole('status')).toContainText('scan rejected; no state change was recorded')
  const afterRejectedScanResponse = await page.request.get(`${origin}/api/laundry/containers/${encodeURIComponent(tagCode)}`)
  expect(afterRejectedScanResponse.ok()).toBe(true)
  const afterRejectedScan = await afterRejectedScanResponse.json() as Container
  expect(afterRejectedScan.state).toBe('Processing')
  expect(afterRejectedScan.events.some((event) => event.note === 'Invalid skipped handoff')).toBe(false)

  expect((await scan('Ready', 'Packing station', 'Packed for dispatch')).status()).toBe(201)
  await expect(page.getByText('Processing → Ready')).toBeVisible()
  expect((await scan('Delivered', 'Customer handoff', 'Handed to customer')).status()).toBe(201)
  await expect(page.getByText('Ready → Delivered')).toBeVisible()
  const deliveredResponse = await page.request.get(`${origin}/api/laundry/containers/${encodeURIComponent(tagCode)}`)
  expect(deliveredResponse.ok()).toBe(true)
  const delivered = await deliveredResponse.json() as Container
  expect(delivered.state).toBe('Delivered')
  expect(delivered.orderWeightKg).toBe(2.5)
  expect(delivered.weightKg).toBeUndefined()
  expect(delivered.events.some((event) => event.fromState === 'Ready' && event.toState === 'Delivered' && event.note === 'Handed to customer')).toBe(true)
  const siblingResponse = await page.request.get(`${origin}/api/laundry/containers/${encodeURIComponent(booked.containers[1].id)}`)
  expect(siblingResponse.ok()).toBe(true)
  const untouchedSibling = await siblingResponse.json() as Container
  expect(untouchedSibling.state).toBe('Intake')
  expect(untouchedSibling.events.every((event) => event.toState === 'Intake')).toBe(true)
  await page.getByText('Order total weight').scrollIntoViewIfNeeded()
  await captureEvidence(page, 'container-tracking-desktop')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByText('Order total weight').scrollIntoViewIfNeeded()
  await captureEvidence(page, 'container-tracking-mobile', true)
})
