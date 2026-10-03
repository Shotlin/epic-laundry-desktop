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
type Dispatch = { riders: Array<{ id: string; name: string }> }
type BookedOrder = { order: { id: string; orderNumber: string; customer: { name: string } }; garmentUnits?: Array<{ tagCode: string }> }
type RouteRun = {
  id: string
  status: string
  stops: Array<{ id: string; orderId: string; status: string; note?: string }>
}

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

test('route control plans a pickup, records completed handoff, and audits a skipped stop', async ({ page }) => {
  test.setTimeout(120_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const [catalogueResponse, dispatchResponse, zonesResponse] = await Promise.all([
    page.request.get(`${origin}/api/laundry/catalogue`),
    page.request.get(`${origin}/api/laundry/dispatch`),
    page.request.get(`${origin}/api/laundry/service-zones`),
  ])
  expect(catalogueResponse.ok()).toBe(true)
  expect(dispatchResponse.ok()).toBe(true)
  expect(zonesResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const dispatch = await dispatchResponse.json() as Dispatch
  const zones = await zonesResponse.json() as string[]
  const garment = catalogue.garments.find((item) => item.active !== false && item.unit === 'Piece')
  expect(garment, 'the isolated catalogue should contain an active piece garment').toBeTruthy()
  if (!garment) return
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.garment === garment.id && item.rate > 0 && activeServices.has(item.service))
  expect(price, 'the active garment should have a priced service').toBeTruthy()
  if (!price) return
  const taxRule = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(taxRule, 'the isolated store should expose its configured GST 18% rule').toBeTruthy()
  if (!taxRule) return
  const rider = dispatch.riders[0]
  expect(rider, 'the isolated dispatch workspace should have an active rider').toBeTruthy()
  if (!rider) return
  const zone = zones[0] || ''
  const fixtureId = randomUUID()
  const orders: Array<{ id: string; orderNumber: string; customerName: string }> = []

  for (const suffix of ['Complete', 'Skip']) {
    const customerName = `Route ${suffix} ${fixtureId.slice(0, 7)}`
    const booking = await page.request.post(`${origin}/api/laundry/orders`, {
      headers: { 'idempotency-key': `route-control-${fixtureId}-${suffix}` },
      data: {
        customer: { name: customerName, phone: `93${Date.now().toString().slice(-8)}` },
        items: [{ garment: garment.id, service: price.service, qty: 1 }],
        expectedDeliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        fulfillmentMode: 'Pickup Order',
        serviceZone: zone,
        paymentMode: 'Pay Later',
        taxRate: 18,
        taxRuleId: taxRule.id,
        notes: 'Synthetic route-control fixture',
      },
    })
    expect(booking.status(), await booking.text()).toBe(201)
    const order = await booking.json() as BookedOrder
    const assignment = await page.request.post(`${origin}/api/laundry/orders/${order.order.id}/assign`, {
      data: { stage: 'pickup', riderId: rider.id, slot: '09:00-10:00' },
    })
    expect(assignment.status(), await assignment.text()).toBe(200)
    orders.push({ id: order.order.id, orderNumber: order.order.orderNumber, customerName })
  }

  await page.goto('/ui/app/?local-demo=1#/laundry/routes', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Route control' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Route stage' })).toBeVisible()
  await page.getByLabel('Route captain').selectOption(rider.id)
  await page.getByRole('combobox', { name: 'Zone' }).fill(zone)
  await page.getByLabel('Route start time').fill('09:30')
  await page.getByLabel('Minutes / stop').fill('20')
  for (const order of orders) {
    const orderCard = page.getByRole('button').filter({ hasText: order.customerName })
    await expect(orderCard).toBeVisible()
    await orderCard.click()
  }
  await expect(page.getByRole('heading', { name: /Pickup stops 2 selected/ })).toBeVisible()
  await captureEvidence(page, 'route-control-plan-desktop')
  const createResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/routes' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create run · 2' }).click()
  const createResult = await createResponse
  expect(createResult.status(), await createResult.text()).toBe(201)
  const createdRoute = await createResult.json() as RouteRun
  expect(createdRoute.status).toBe('Planned')
  expect(createdRoute.stops.map((stop) => stop.orderId).sort()).toEqual(orders.map((order) => order.id).sort())

  const runCard = page.locator('article').filter({ hasText: createdRoute.id })
  await expect(runCard).toBeVisible()
  const startResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/routes/${createdRoute.id}/start` && response.request().method() === 'POST')
  await runCard.getByRole('button', { name: 'Start' }).click()
  expect((await startResponse).status()).toBe(200)
  await runCard.getByRole('button', { name: `Show stops for ${createdRoute.id}` }).click()
  await runCard.scrollIntoViewIfNeeded()
  await captureEvidence(page, 'route-control-run-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await runCard.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const completeButton = runCard.getByRole('button', { name: `Complete ${orders[0].orderNumber}` })
  const skipButton = runCard.getByRole('button', { name: `Skip ${orders[1].orderNumber}` })
  await expect(completeButton).toBeVisible()
  await expect(completeButton.getByText('Complete', { exact: true })).toBeVisible()
  await expect(skipButton).toBeVisible()
  await expect(skipButton.getByText('Skip', { exact: true })).toBeVisible()
  await captureEvidence(page, 'route-control-run-mobile')
  await page.setViewportSize({ width: 1280, height: 720 })
  await runCard.getByRole('button', { name: `Complete ${orders[0].orderNumber}` }).click()
  await expect(runCard.getByText('Completed', { exact: true })).toBeVisible()

  await runCard.getByRole('button', { name: `Skip ${orders[1].orderNumber}` }).click()
  await expect(page.getByRole('dialog', { name: `Skip ${orders[1].orderNumber}?` })).toBeVisible()
  await page.getByRole('textbox', { name: 'Skip reason' }).fill('Customer unavailable; call before retry.')
  const skipResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/routes/${createdRoute.id}/stops/${createdRoute.stops.find((stop) => stop.orderId === orders[1].id)?.id}/complete` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Confirm skip' }).click()
  expect((await skipResponse).status()).toBe(200)

  const [finishedRouteResponse, skippedOrderResponse, completedOrderResponse] = await Promise.all([
    page.request.get(`${origin}/api/laundry/routes`).then(async (response) => ({ ok: response.ok(), data: await response.json() as RouteRun[] })),
    page.request.get(`${origin}/api/laundry/orders/${orders[1].id}`).then(async (response) => ({ ok: response.ok(), data: await response.json() as { state: string } })),
    page.request.get(`${origin}/api/laundry/orders/${orders[0].id}`).then(async (response) => ({ ok: response.ok(), data: await response.json() as { state: string } })),
  ])
  expect(finishedRouteResponse.ok).toBe(true)
  const finished = finishedRouteResponse.data.find((route) => route.id === createdRoute.id)
  expect(finished?.status).toBe('Completed')
  expect(finished?.stops.find((stop) => stop.orderId === orders[1].id)).toMatchObject({ status: 'Skipped', note: 'Customer unavailable; call before retry.' })
  expect(skippedOrderResponse).toMatchObject({ ok: true, data: { state: 'Booked' } })
  expect(completedOrderResponse).toMatchObject({ ok: true, data: { state: 'Picked Up' } })

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('delivery route dispatches a ready garment and records the delivered order state', async ({ page }) => {
  test.setTimeout(120_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const [catalogueResponse, dispatchResponse, zonesResponse] = await Promise.all([
    page.request.get(`${origin}/api/laundry/catalogue`),
    page.request.get(`${origin}/api/laundry/dispatch`),
    page.request.get(`${origin}/api/laundry/service-zones`),
  ])
  expect(catalogueResponse.ok()).toBe(true)
  expect(dispatchResponse.ok()).toBe(true)
  expect(zonesResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const dispatch = await dispatchResponse.json() as Dispatch
  const zones = await zonesResponse.json() as string[]
  const garment = catalogue.garments.find((item) => item.active !== false && item.unit === 'Piece')
  expect(garment).toBeTruthy()
  if (!garment) return
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.garment === garment.id && item.rate > 0 && activeServices.has(item.service))
  expect(price).toBeTruthy()
  if (!price) return
  const taxRule = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(taxRule).toBeTruthy()
  if (!taxRule) return
  const rider = dispatch.riders[0]
  expect(rider).toBeTruthy()
  if (!rider) return
  const fixtureId = randomUUID()
  const customerName = `Delivery ${fixtureId.slice(0, 8)}`
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': `delivery-route-${fixtureId}` },
    data: {
      customer: { name: customerName, phone: `94${Date.now().toString().slice(-8)}`, address: '8 Delivery Road' },
      items: [{ garment: garment.id, service: price.service, qty: 1 }],
      expectedDeliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      fulfillmentMode: 'Home Delivery',
      serviceZone: zones[0] || '',
      paymentMode: 'Pay Later',
      taxRate: 18,
      taxRuleId: taxRule.id,
      notes: 'Synthetic delivery route fixture',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const booking = await bookingResponse.json() as BookedOrder
  const unitTag = booking.garmentUnits?.[0]?.tagCode
  expect(unitTag, 'the synthetic piece item should receive one garment tag').toBeTruthy()
  if (!unitTag) return

  const inProcess = await page.request.post(`${origin}/api/laundry/orders/${booking.order.id}/transition`, { data: { state: 'In Process', note: 'Synthetic production handoff' } })
  expect(inProcess.status(), await inProcess.text()).toBe(200)
  for (const [nextState, location] of [
    ['Processing', 'Wash station'],
    ['QC', 'Quality desk'],
    ['Assembly', 'Packing table'],
    ['Racked', `Delivery rack ${fixtureId.slice(0, 8)}`],
  ]) {
    const scanned = await page.request.post(`${origin}/api/laundry/garment-units/scan`, {
      headers: { 'idempotency-key': `delivery-route-${fixtureId}-${nextState}` },
      data: { tagCode: unitTag, nextState, location, note: `Synthetic delivery preparation: ${nextState}` },
    })
    expect(scanned.status(), await scanned.text()).toBe(201)
  }
  const ready = await page.request.post(`${origin}/api/laundry/orders/${booking.order.id}/transition`, { data: { state: 'Ready', note: 'Synthetic garment ready for dispatch' } })
  expect(ready.status(), await ready.text()).toBe(200)
  const assignment = await page.request.post(`${origin}/api/laundry/orders/${booking.order.id}/assign`, {
    data: { stage: 'delivery', riderId: rider.id, slot: '11:00-12:00' },
  })
  expect(assignment.status(), await assignment.text()).toBe(200)

  await page.goto('/ui/app/?local-demo=1#/laundry/routes', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Route control' })).toBeVisible()
  await page.getByRole('button', { name: 'Delivery', exact: true }).click()
  await page.getByLabel('Route captain').selectOption(rider.id)
  const zone = zones[0] || ''
  await page.getByRole('combobox', { name: 'Zone' }).fill(zone)
  const orderCard = page.getByRole('button').filter({ hasText: customerName })
  await expect(orderCard).toBeVisible()
  await orderCard.click()
  const createResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/routes' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create run · 1' }).click()
  const createResult = await createResponse
  expect(createResult.status(), await createResult.text()).toBe(201)
  const route = await createResult.json() as RouteRun
  const runCard = page.locator('article').filter({ hasText: route.id })
  await expect(runCard).toBeVisible()
  await runCard.scrollIntoViewIfNeeded()
  await captureEvidence(page, 'route-control-delivery-desktop')
  const startResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/routes/${route.id}/start` && response.request().method() === 'POST')
  await runCard.getByRole('button', { name: 'Start' }).click()
  expect((await startResponse).status()).toBe(200)
  await runCard.getByRole('button', { name: `Show stops for ${route.id}` }).click()
  await expect(runCard.getByText('In Progress')).toBeVisible()
  const dispatched = await page.request.get(`${origin}/api/laundry/orders/${booking.order.id}`)
  expect(dispatched.ok()).toBe(true)
  expect((await dispatched.json() as { state: string }).state).toBe('Out for Delivery')

  const completeResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/routes/${route.id}/stops/${route.stops[0].id}/complete` && response.request().method() === 'POST')
  await runCard.getByRole('button', { name: `Complete ${booking.order.orderNumber}` }).click()
  expect((await completeResponse).status()).toBe(200)
  const delivered = await page.request.get(`${origin}/api/laundry/orders/${booking.order.id}`)
  expect(delivered.ok()).toBe(true)
  expect((await delivered.json() as { state: string }).state).toBe('Delivered')
  const routeHistory = await page.request.get(`${origin}/api/laundry/routes`)
  expect(routeHistory.ok()).toBe(true)
  const savedRoute = (await routeHistory.json() as RouteRun[]).find((candidate) => candidate.id === route.id)
  expect(savedRoute?.status).toBe('Completed')
  expect(savedRoute?.stops[0]?.status).toBe('Completed')
})
