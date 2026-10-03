import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type BookingResult = {
  order: { id: string; orderNumber: string; invoiceNumber: string; state: string; grandTotal: number }
  garmentUnits: Array<{ tagCode: string; state: string }>
}
type Catalogue = {
  garments: Array<{ id: string; name: string; unit: string; active?: boolean }>
  services: Array<{ id: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
  taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
}
type Payments = { total: number; paid: number; outstanding: number; status: string; invoiceNumber: string }
type Dispatch = { riders: Array<{ id: string; name: string }> }
type RouteRun = { id: string; status: string; stops: Array<{ id: string; status: string }> }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible({ timeout: 20_000 })
}

async function captureEvidence(page: Page, name: string, fullPage = true) {
  const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage })
}

function businessDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function startTask(page: Page, tagCode: string, station: string) {
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  const navigation = page.getByRole('navigation', { name: 'Laundry workspace navigation' })
  const productionGroup = navigation.getByRole('button', { name: 'Production', exact: true })
  if (await productionGroup.getAttribute('aria-expanded') !== 'true') await productionGroup.click()
  await navigation.getByRole('link', { name: 'Production queue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Work queue' })).toBeVisible({ timeout: 15_000 })
  const task = page.locator('article').filter({ hasText: tagCode }).filter({ hasText: station }).first()
  const response = page.waitForResponse((item) => /^\/api\/laundry\/production-tasks\/[^/]+\/start$/.test(new URL(item.url()).pathname) && item.request().method() === 'POST')
  await task.getByRole('button', { name: 'Start' }).click()
  expect((await response).status()).toBe(200)
  await expect(task).toContainText('In Progress')
}

async function scanTo(page: Page, tagCode: string, state: string, location: string) {
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  const navigation = page.getByRole('navigation', { name: 'Laundry workspace navigation' })
  const productionGroup = navigation.getByRole('button', { name: 'Production', exact: true })
  if (await productionGroup.getAttribute('aria-expanded') !== 'true') await productionGroup.click()
  await navigation.getByRole('link', { name: 'Garment tracking', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Garment tracking' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('textbox', { name: 'Tag or unit code' }).fill(tagCode)
  await page.getByLabel('Move to').selectOption(state)
  await page.getByLabel('Location').fill(location)
  const response = page.waitForResponse((item) => new URL(item.url()).pathname === '/api/laundry/garment-units/scan' && item.request().method() === 'POST')
  await page.getByRole('button', { name: 'Scan tag' }).click()
  expect((await response).status()).toBe(201)
  await expect(page.getByRole('status')).toContainText('scan accepted and recorded')
}

async function confirmOrderMove(page: Page, orderNumber: string, next: string) {
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Order No' }).fill(orderNumber)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: orderNumber }).first()
  const response = page.waitForResponse((item) => new URL(item.url()).pathname.endsWith('/transition') && item.request().method() === 'POST')
  await row.getByRole('button', { name: `Move order ${orderNumber} to ${next}` }).click()
  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation.getByRole('heading', { name: `Mark ${orderNumber} as ${next}?` })).toBeVisible()
  await confirmation.getByRole('button', { name: `Yes, mark ${next}` }).click()
  const result = await response
  expect(result.status(), await result.text()).toBe(200)
  await expect(row).toContainText(next)
}

test('one synthetic customer order connects Dashboard, booking, Store Orders, production, delivery, payment and report', async ({ page }) => {
  test.setTimeout(180_000)
  await signIntoDemo(page)
  await captureEvidence(page, 'integrated-daily-workflow-dashboard')
  const origin = new URL(page.url()).origin
  const [catalogueResponse, zonesResponse, dispatchResponse] = await Promise.all([
    page.request.get(`${origin}/api/laundry/catalogue`),
    page.request.get(`${origin}/api/laundry/service-zones`),
    page.request.get(`${origin}/api/laundry/dispatch`),
  ])
  expect(catalogueResponse.ok()).toBe(true)
  expect(zonesResponse.ok()).toBe(true)
  expect(dispatchResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const zones = await zonesResponse.json() as string[]
  const dispatch = await dispatchResponse.json() as Dispatch
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const garment = catalogue.garments.find((item) => item.active !== false && item.unit === 'Piece'
    && catalogue.prices.some((price) => price.active !== false && price.garment === item.id && price.rate > 0 && activeServices.has(price.service)))
  expect(garment, 'the isolated catalogue should have one active priced piece garment').toBeTruthy()
  const price = garment && catalogue.prices.find((item) => item.active !== false && item.garment === garment.id && item.rate > 0 && activeServices.has(item.service))
  expect(price).toBeTruthy()
  const taxRule = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(taxRule, 'the isolated demo should use its existing GST 18% rule').toBeTruthy()
  const rider = dispatch.riders[0]
  expect(rider, 'the isolated demo should have a route captain').toBeTruthy()
  if (!garment || !price || !taxRule || !rider) return

  const fixtureId = randomUUID()
  const customerName = `Integrated ${fixtureId.slice(0, 8)}`
  const phone = `9${Date.now().toString().slice(-9)}`
  const serviceZone = zones[0] || 'North'

  const dashboardNewOrder = page.locator('a[href="#/laundry/new-order"]').last()
  await expect(dashboardNewOrder).toBeVisible()
  await dashboardNewOrder.click()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  const gst = page.getByRole('combobox', { name: 'GST' })
  await expect(gst.locator('option:checked')).toHaveText('GST (18%)')
  const garmentCard = page.locator('article').filter({ hasText: garment.name }).first()
  await garmentCard.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('1 line selected')).toBeVisible()
  await page.getByRole('textbox', { name: 'Service zone' }).fill(serviceZone)
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill(customerName)
  await expect(page.getByText('No saved customer matches')).toBeVisible()
  await page.getByRole('button', { name: 'Add new customer' }).click()
  const customerDialog = page.getByRole('dialog', { name: 'Add new customer' })
  await customerDialog.getByRole('textbox', { name: /Customer name/ }).fill(customerName)
  await customerDialog.getByRole('textbox', { name: /Phone number/ }).fill(phone)
  await customerDialog.getByRole('textbox', { name: /Address/ }).fill('21 Integrated Test Road')
  await customerDialog.getByRole('button', { name: 'Save customer' }).click()
  await expect(page.getByText(customerName, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Book order' })).toBeEnabled()

  const bookingResponse = page.waitForResponse((item) => new URL(item.url()).pathname === '/api/laundry/orders' && item.request().method() === 'POST')
  await page.getByRole('button', { name: 'Book order' }).click()
  const bookedResponse = await bookingResponse
  expect(bookedResponse.status(), await bookedResponse.text()).toBe(201)
  const booked = await bookedResponse.json() as BookingResult
  expect(booked.order.state).toBe('Booked')
  expect(booked.order.grandTotal).toBeGreaterThan(0)
  expect(booked.garmentUnits).toHaveLength(1)
  await expect(page.getByText('Order booked', { exact: true })).toBeVisible()
  await captureEvidence(page, 'integrated-daily-workflow-booking-receipt')
  await page.getByRole('button', { name: 'Close receipt' }).click()

  await page.getByRole('button', { name: 'Back to dashboard' }).click()

  const navigation = page.getByRole('navigation', { name: 'Laundry workspace navigation' })
  const counterGroup = navigation.getByRole('button', { name: 'Counter', exact: true })
  if (await counterGroup.getAttribute('aria-expanded') !== 'true') await counterGroup.click()
  await navigation.getByRole('link', { name: 'Store orders & customers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()
  const orderSearch = page.getByRole('textbox', { name: 'Order No' })
  await orderSearch.fill(booked.order.orderNumber)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const orderRow = page.getByRole('row').filter({ hasText: booked.order.orderNumber }).first()
  await expect(orderRow).toBeVisible()
  await orderRow.getByRole('button', { name: `Open order history for ${booked.order.invoiceNumber}` }).click()
  const history = page.getByRole('dialog', { name: 'Order history' })
  await expect(history.getByText('Current order status')).toBeVisible()
  await expect(history).toContainText('Booked')
  await page.keyboard.press('Escape')
  await orderRow.getByRole('button', { name: `Open order summary for ${booked.order.invoiceNumber}` }).click()
  const workCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(workCard.getByText('Unpaid', { exact: true })).toBeVisible()
  await captureEvidence(page, 'integrated-daily-workflow-store-order')
  await page.keyboard.press('Escape')

  await confirmOrderMove(page, booked.order.orderNumber, 'In Process')
  const [unit] = booked.garmentUnits
  const stations = [
    ['Intake', 'Sorted', 'Sorting table'],
    ['Sorting', 'Processing', 'Wash station'],
    ['Processing', 'QC', 'Inspection table'],
    ['Quality control', 'Assembly', 'Folding table'],
    ['Assembly', 'Racked', `Rack ${fixtureId.slice(0, 6)}`],
  ] as const
  for (const [station, next, location] of stations) {
    await startTask(page, unit.tagCode, station)
    await scanTo(page, unit.tagCode, next, location)
  }
  await captureEvidence(page, 'integrated-daily-workflow-production-racked')
  await confirmOrderMove(page, booked.order.orderNumber, 'Ready')

  const paymentResponse = await page.request.get(`${origin}/api/laundry/orders/${booked.order.id}/payments`)
  expect(paymentResponse.ok()).toBe(true)
  const paymentBefore = await paymentResponse.json() as Payments
  expect(paymentBefore.status).toBe('Unpaid')
  expect(paymentBefore.invoiceNumber).toBe(booked.order.invoiceNumber)
  const reference = `INTEGRATED-${fixtureId.slice(0, 10)}`
  await orderRow.getByRole('button', { name: `Open order summary for ${booked.order.invoiceNumber}` }).click()
  const collectionCard = page.getByRole('dialog', { name: 'Order work card' })
  await collectionCard.getByLabel('Amount').fill(paymentBefore.outstanding.toFixed(2))
  await collectionCard.getByLabel('Method').selectOption('UPI')
  await collectionCard.getByPlaceholder('Reference / receipt no. (optional)').fill(reference)
  const collectionResponse = page.waitForResponse((item) => new URL(item.url()).pathname === `/api/laundry/orders/${booked.order.id}/payments` && item.request().method() === 'POST')
  await collectionCard.getByRole('button', { name: 'Record collection' }).click()
  expect((await collectionResponse).status()).toBe(201)
  await expect(collectionCard.getByText('This invoice is fully settled.', { exact: true })).toBeVisible()
  await captureEvidence(page, 'integrated-daily-workflow-payment')
  await page.keyboard.press('Escape')

  const today = businessDate()
  await page.goto(`/ui/app/?local-demo=1#/laundry/reports/collection?from=${today}&to=${today}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Collection Report', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Payment method' }).selectOption('UPI')
  await page.getByRole('textbox', { name: 'Search invoice or order' }).fill(reference)
  const collectionRow = page.getByRole('row').filter({ hasText: booked.order.invoiceNumber }).first()
  await expect(collectionRow).toBeVisible()
  await expect(collectionRow.getByText(today)).toBeVisible()
  await expect(collectionRow.getByText('UPI', { exact: true })).toBeVisible()

  const assignment = await page.request.post(`${origin}/api/laundry/orders/${booked.order.id}/assign`, {
    data: { stage: 'delivery', riderId: rider.id, slot: '11:00-12:00' },
  })
  expect(assignment.status(), await assignment.text()).toBe(200)
  await page.goto('/ui/app/?local-demo=1#/laundry/routes', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Route control' })).toBeVisible()
  await page.getByRole('button', { name: 'Delivery', exact: true }).click()
  await page.getByLabel('Route captain').selectOption(rider.id)
  await page.getByRole('combobox', { name: 'Zone' }).fill(serviceZone)
  const deliveryOrder = page.getByRole('button').filter({ hasText: customerName })
  await expect(deliveryOrder).toBeVisible()
  await deliveryOrder.click()
  const createRouteResponse = page.waitForResponse((item) => new URL(item.url()).pathname === '/api/laundry/routes' && item.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create run · 1' }).click()
  const routeResponse = await createRouteResponse
  expect(routeResponse.status(), await routeResponse.text()).toBe(201)
  const route = await routeResponse.json() as RouteRun
  const runCard = page.locator('article').filter({ hasText: route.id })
  await expect(runCard).toBeVisible()
  const startRouteResponse = page.waitForResponse((item) => new URL(item.url()).pathname === `/api/laundry/routes/${route.id}/start` && item.request().method() === 'POST')
  await runCard.getByRole('button', { name: 'Start' }).click()
  expect((await startRouteResponse).status()).toBe(200)
  await runCard.getByRole('button', { name: `Show stops for ${route.id}` }).click()
  const completeStopResponse = page.waitForResponse((item) => new URL(item.url()).pathname === `/api/laundry/routes/${route.id}/stops/${route.stops[0].id}/complete` && item.request().method() === 'POST')
  await runCard.getByRole('button', { name: `Complete ${booked.order.orderNumber}` }).click()
  const completedRouteResponse = await completeStopResponse
  expect(completedRouteResponse.status()).toBe(200)
  expect((await completedRouteResponse.json() as RouteRun).status).toBe('Completed')
  await expect(page.getByRole('status')).toContainText('1/1 stops closed (Completed)')
  await captureEvidence(page, 'integrated-daily-workflow-delivery')

  const [savedOrderResponse, paymentAfterResponse, reportResponse, routesResponse] = await Promise.all([
    page.request.get(`${origin}/api/laundry/orders/${booked.order.id}`),
    page.request.get(`${origin}/api/laundry/orders/${booked.order.id}/payments`),
    page.request.get(`${origin}/api/laundry/reports/collection?from=${today}&to=${today}&search=${encodeURIComponent(reference)}&paymentMethod=UPI`),
    page.request.get(`${origin}/api/laundry/routes`),
  ])
  expect(savedOrderResponse.ok()).toBe(true)
  expect((await savedOrderResponse.json() as { state: string }).state).toBe('Delivered')
  expect(paymentAfterResponse.ok()).toBe(true)
  expect(await paymentAfterResponse.json()).toMatchObject({ status: 'Paid', paid: paymentBefore.total, outstanding: 0 })
  expect(reportResponse.ok()).toBe(true)
  const report = await reportResponse.json() as { totalRows: number; rows: Array<{ invoiceNumber: string; amount: number; method: string; date: string; reference: string }> }
  expect(report.totalRows).toBe(1)
  expect(report.rows[0]).toMatchObject({ invoiceNumber: paymentBefore.invoiceNumber, amount: paymentBefore.total, method: 'UPI', date: today, reference })
  expect(routesResponse.ok()).toBe(true)
  const savedRoute = (await routesResponse.json() as RouteRun[]).find((item) => item.id === route.id)
  expect(savedRoute?.status).toBe('Completed')
  expect(savedRoute?.stops[0]?.status).toBe('Completed')
})
