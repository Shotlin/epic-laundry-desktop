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
type BookingResult = {
  order: { id: string; orderNumber: string; customer: { name: string }; state: string }
  garmentUnits: Array<{ id: string; tagCode: string; state: string }>
}
type Analytics = { openClaims: number; resolvedClaims: number; correctionDocuments: number }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function openProductionNavigation(page: Page) {
  const back = page.getByRole('button', { name: 'Back to dashboard' })
  if (await back.isVisible()) await back.click()
  const group = page.getByRole('button', { name: 'Production', exact: true })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
}

async function waitForPageAnimations(page: Page) {
  await page.evaluate(async () => {
    const animations = document.querySelector('main')?.getAnimations({ subtree: true }) ?? []
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
  })
}

async function startTask(page: Page, tagCode: string, station: string) {
  await openProductionNavigation(page)
  await page.getByRole('link', { name: 'Production queue' }).click()
  await expect(page).toHaveURL(/#\/laundry\/production-queue/)
  await expect(page.getByRole('heading', { name: 'Work queue' })).toBeVisible({ timeout: 15_000 })
  const taskRow = page.locator('article')
    .filter({ hasText: tagCode })
    .filter({ hasText: station })
    .first()
  const startButton = taskRow.getByRole('button', { name: 'Start' })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  const startResponse = page.waitForResponse((response) => /^\/api\/laundry\/production-tasks\/[^/]+\/start$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST', { timeout: 20_000 })
  await startButton.click()
  expect((await startResponse).status()).toBe(200)
  await expect(taskRow).toContainText('In Progress', { timeout: 20_000 })
}

async function scanTo(page: Page, tagCode: string, state: string, location: string, note = '') {
  await openProductionNavigation(page)
  await page.getByRole('link', { name: 'Garment tracking' }).click()
  await expect(page).toHaveURL(/#\/laundry\/garment-tracking/)
  await expect(page.getByRole('heading', { name: 'Garment tracking' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('textbox', { name: 'Tag or unit code' }).fill(tagCode)
  await page.getByLabel('Move to').selectOption(state)
  await page.getByLabel('Location').fill(location)
  if (note) await page.getByLabel('Operator note').fill(note)
  const scanResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/garment-units/scan' && response.request().method() === 'POST', { timeout: 20_000 })
  await page.getByRole('button', { name: 'Scan tag' }).click()
  expect((await scanResponse).status()).toBe(201)
  await expect(page.getByRole('status')).toContainText('scan accepted and recorded', { timeout: 15_000 })
}

test('partial order quantities keep garment production and quality histories independent', async ({ page }) => {
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
  expect(gst, 'the disposable demo must expose its existing configured 18% GST rule').toBeTruthy()
  if (!gst) return

  const fixture = randomUUID()
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': `production-quality-${fixture}` },
    data: {
      customer: { name: `Lifecycle ${fixture.slice(0, 8)}`, phone: `91${Date.now().toString().slice(-8)}` },
      items: [{ garment: price.garment, service: price.service, qty: 3, color: 'Navy', garmentType: 'Standard' }],
      expectedDeliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      fulfillmentMode: 'Home Delivery', paymentMode: 'Pay Later', taxRate: 18, taxRuleId: gst.id,
      notes: 'Synthetic production lifecycle fixture',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booked = await bookingResponse.json() as BookingResult
  expect(booked.order.state).toBe('Booked')
  expect(booked.garmentUnits).toHaveLength(3)
  const [unit, ...unprocessedUnits] = booked.garmentUnits
  expect(unit.state).toBe('Intake')
  expect(unprocessedUnits.every((item) => item.state === 'Intake')).toBe(true)

  await startTask(page, unit.tagCode, 'Intake')
  await scanTo(page, unit.tagCode, 'Sorted', 'Sorting table', 'Sorted for the wash floor')
  await startTask(page, unit.tagCode, 'Sorting')
  await scanTo(page, unit.tagCode, 'Processing', 'Wash station', 'Wash cycle started')
  await startTask(page, unit.tagCode, 'Processing')
  await scanTo(page, unit.tagCode, 'QC', 'Inspection table', 'Ready for quality inspection')
  await startTask(page, unit.tagCode, 'Quality control')
  const qcTaskResponse = await page.request.get(`${origin}/api/laundry/production-queue?station=Quality%20control`)
  expect(qcTaskResponse.ok()).toBe(true)
  const qcTasks = await qcTaskResponse.json() as Array<{ tagCode: string; status: string; station: string }>
  expect(qcTasks.some((task) => task.tagCode === unit.tagCode && task.status === 'In Progress' && task.station === 'Quality control')).toBe(true)

  const analyticsBeforeResponse = await page.request.get(`${origin}/api/laundry/quality-analytics`)
  expect(analyticsBeforeResponse.ok()).toBe(true)
  const analyticsBefore = await analyticsBeforeResponse.json() as Analytics

  await page.goto('/ui/app/?local-demo=1#/laundry/quality-claims', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Claims & exceptions' })).toBeVisible()
  await waitForPageAnimations(page)
  await expect(page.getByRole('button', { name: 'Open claim' })).toBeDisabled()
  const desktopEvidence = resolve(process.cwd(), '../docs/parity/evidence/production-quality-desktop.png')
  mkdirSync(dirname(desktopEvidence), { recursive: true })
  await page.screenshot({ path: desktopEvidence, fullPage: true })

  await page.getByLabel('Tag or unit code').fill(unit.tagCode)
  await page.getByLabel('Category').selectOption('Stain')
  await page.getByLabel('Severity').selectOption('High')
  await page.getByLabel('Description').fill('Oil mark found during inspection')
  await expect(page.getByRole('button', { name: 'Open claim' })).toBeEnabled()
  const openClaimResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/quality-claims' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Open claim' }).click()
  expect((await openClaimResponse).status()).toBe(201)

  const claim = page.locator('article').filter({ hasText: unit.tagCode }).first()
  await expect(claim).toContainText('Stain')
  await expect(claim).toContainText('High')
  await expect(claim).toContainText('QC')
  await expect(page.getByText('Quality claim opened for supervisor review.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Quality metrics' }).getByText('Open claims', { exact: true }).locator('..').getByText(String(analyticsBefore.openClaims + 1), { exact: true })).toBeVisible()

  await page.getByLabel('Tag or unit code').fill(unit.tagCode)
  await page.getByLabel('Description').fill('Duplicate issue that must be rejected')
  const duplicateResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/quality-claims' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Open claim' }).click()
  expect((await duplicateResponse).status()).toBe(400)
  await expect(page.getByRole('alert')).toContainText(/already has an open quality claim/i)
  await expect(claim).toContainText('Oil mark found during inspection')
  await page.getByLabel('Tag or unit code').fill('')
  await page.getByLabel('Description').fill('')
  await expect(page.getByRole('alert')).toHaveCount(0)

  await expect(claim.getByRole('button', { name: 'Resolve' })).toBeDisabled()
  await claim.getByRole('combobox', { name: `Resolution decision for ${unit.tagCode}` }).selectOption('Rewash')
  await claim.getByPlaceholder('Required resolution note').fill('Rewash to remove the recorded oil mark')
  const resolveResponse = page.waitForResponse((response) => /^\/api\/laundry\/quality-claims\/[^/]+\/resolve$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await claim.getByRole('button', { name: 'Resolve' }).click()
  expect((await resolveResponse).status()).toBe(200)
  await expect(claim).toContainText('Resolved')
  await expect(claim).toContainText('Decision: Rewash')
  await expect(claim).toContainText('Customer correction issued')
  await expect(page.getByRole('region', { name: 'Claim register' }).getByRole('status')).toContainText('Claim decision recorded in the garment audit trail.')
  await expect(page.getByRole('region', { name: 'Quality metrics' }).getByText('Open claims', { exact: true }).locator('..').getByText(String(analyticsBefore.openClaims), { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Quality metrics' }).getByText('Resolved', { exact: true }).locator('..').getByText(String(analyticsBefore.resolvedClaims + 1), { exact: true })).toBeVisible()
  await waitForPageAnimations(page)
  await page.screenshot({ path: desktopEvidence, fullPage: true })

  const unitResponse = await page.request.get(`${origin}/api/laundry/garment-units/${unit.id}`)
  expect(unitResponse.ok()).toBe(true)
  const afterRewash = await unitResponse.json() as { state: string; events: Array<{ fromState?: string; toState?: string; note?: string }> }
  expect(afterRewash.state).toBe('Rewash')
  expect(afterRewash.events.some((event) => event.fromState === 'QC' && event.toState === 'Rewash' && /oil mark/i.test(event.note || ''))).toBe(true)

  for (const sibling of unprocessedUnits) {
    const siblingResponse = await page.request.get(`${origin}/api/laundry/garment-units/${sibling.id}`)
    expect(siblingResponse.ok()).toBe(true)
    const siblingRecord = await siblingResponse.json() as { state: string; events: Array<{ toState?: string }> }
    expect(siblingRecord.state).toBe('Intake')
    expect(siblingRecord.events.every((event) => event.toState === 'Intake')).toBe(true)
  }

  const rewashTaskResponse = await page.request.get(`${origin}/api/laundry/production-queue?station=Rewash`)
  expect(rewashTaskResponse.ok()).toBe(true)
  const rewashTasks = await rewashTaskResponse.json() as Array<{ tagCode: string; status: string; priority: string; reason: string }>
  expect(rewashTasks.some((task) => task.tagCode === unit.tagCode && task.status === 'Open' && task.priority === 'Urgent' && /oil mark/i.test(task.reason))).toBe(true)

  await page.goto('/ui/app/?local-demo=1#/laundry/corrections', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Correction documents' })).toBeVisible()
  const correction = page.locator('article').filter({ hasText: unit.id }).first()
  await expect(correction).toContainText('Quality exception Stain resolved as Rewash')
  await expect(correction).toContainText(/sent this garment back for rewash/i)
  await expect(correction.getByRole('button', { name: 'Print copy' })).toBeVisible()
  const correctionAnalyticsResponse = await page.request.get(`${origin}/api/laundry/quality-analytics`)
  expect(correctionAnalyticsResponse.ok()).toBe(true)
  const analyticsAfter = await correctionAnalyticsResponse.json() as Analytics
  expect(analyticsAfter.correctionDocuments).toBe(analyticsBefore.correctionDocuments + 1)

  await page.goto('/ui/app/?local-demo=1#/laundry/quality-claims', { waitUntil: 'domcontentloaded' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Claims & exceptions' })).toBeVisible()
  await waitForPageAnimations(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const mobileEvidence = resolve(process.cwd(), '../docs/parity/evidence/production-quality-mobile.png')
  await page.screenshot({ path: mobileEvidence, fullPage: true })
})
