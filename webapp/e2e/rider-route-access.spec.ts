import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

type Catalogue = {
  garments: Array<{ id: string; unit: string; active?: boolean }>
  services: Array<{ id: string; active?: boolean }>
  prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
  taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
}
type Rider = { id: string; name: string }
type Booking = { order: { id: string; orderNumber: string; state: string } }
type RouteRun = { id: string; status: string; stops: Array<{ id: string; orderId: string; status: string }> }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('rider board shows only linked work and confirms successful route actions', async ({ page }) => {
  test.setTimeout(120_000)
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const fixture = randomUUID()
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as Catalogue
  const garment = catalogue.garments.find((item) => item.active !== false && item.unit === 'Piece')
  expect(garment).toBeTruthy()
  if (!garment) return
  const activeServices = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const price = catalogue.prices.find((item) => item.active !== false && item.garment === garment.id && item.rate > 0 && activeServices.has(item.service))
  expect(price).toBeTruthy()
  if (!price) return
  const gst = catalogue.taxRules.find((item) => item.active !== false && item.rate === 18 && /laundry|9997/i.test(item.name))
  expect(gst).toBeTruthy()
  if (!gst) return

  const createRider = async (name: string, phone: string) => {
    const response = await page.request.post(`${origin}/api/laundry/riders`, { data: { name, phone } })
    expect(response.status(), await response.text()).toBe(201)
    return await response.json() as Rider
  }
  const linkedRider = await createRider(`Linked ${fixture.slice(0, 8)}`, `94${Date.now().toString().slice(-8)}`)
  const otherRider = await createRider(`Other ${fixture.slice(0, 8)}`, `95${Date.now().toString().slice(-8)}`)
  const linkedUsername = `linked-${fixture.slice(0, 8)}`
  const unlinkedUsername = `unlinked-${fixture.slice(0, 8)}`
  const linkedPassword = `RiderTest!${fixture.slice(0, 12)}26`
  const unlinkedPassword = `RiderTest!${fixture.slice(12, 24)}26`
  const linkedStaff = await page.request.post(`${origin}/api/settings/staff`, {
    data: { username: linkedUsername, password: linkedPassword, roles: ['rider'], riderId: linkedRider.id, firstName: 'Linked', lastName: 'Rider' },
  })
  expect(linkedStaff.status(), await linkedStaff.text()).toBe(201)
  const unlinkedStaff = await page.request.post(`${origin}/api/settings/staff`, {
    data: { username: unlinkedUsername, password: unlinkedPassword, roles: ['rider'], firstName: 'Unlinked', lastName: 'Rider' },
  })
  expect(unlinkedStaff.status(), await unlinkedStaff.text()).toBe(201)

  const createAssignedPickup = async (label: string, riderId: string) => {
    const booking = await page.request.post(`${origin}/api/laundry/orders`, {
      headers: { 'idempotency-key': `rider-route-${fixture}-${label}` },
      data: {
        customer: { name: `${label} ${fixture.slice(0, 8)}`, phone: `96${Date.now().toString().slice(-8)}`, address: `${label} Test Street` },
        items: [{ garment: garment.id, service: price.service, qty: 1 }],
        expectedDeliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        fulfillmentMode: 'Pickup Order', paymentMode: 'Pay Later', taxRate: 18, taxRuleId: gst.id,
        notes: 'Synthetic rider access fixture',
      },
    })
    expect(booking.status(), await booking.text()).toBe(201)
    const created = await booking.json() as Booking
    const assignment = await page.request.post(`${origin}/api/laundry/orders/${created.order.id}/assign`, { data: { stage: 'pickup', riderId, slot: '09:00-10:00' } })
    expect(assignment.status(), await assignment.text()).toBe(200)
    const routeResponse = await page.request.post(`${origin}/api/laundry/routes`, {
      headers: { 'idempotency-key': `rider-route-run-${fixture}-${label}` },
      data: { riderId, stage: 'Pickup', routeDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), orderIds: [created.order.id], startTime: '09:00' },
    })
    expect(routeResponse.status(), await routeResponse.text()).toBe(201)
    return { order: created.order, route: await routeResponse.json() as RouteRun }
  }
  const own = await createAssignedPickup('OwnRoute', linkedRider.id)
  const foreign = await createAssignedPickup('OtherRoute', otherRider.id)
  expect(own.route.status).toBe('Planned')
  expect(foreign.route.status).toBe('Planned')

  const linkedLogin = await page.request.post(`${origin}/api/auth/sign-in`, { data: { username: linkedUsername, password: linkedPassword } })
  expect(linkedLogin.status(), await linkedLogin.text()).toBe(200)
  const linkedSessionResponse = await page.request.get(`${origin}/api/auth/session`)
  const linkedSession = await linkedSessionResponse.json() as { user: { riderId?: string | null; roles: string[] } }
  expect(linkedSession.user.roles).toContain('rider')
  expect(linkedSession.user.riderId).toBe(linkedRider.id)
  const browserSession = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session')
    return { status: response.status, body: await response.json() as { user: { riderId?: string | null; roles: string[] } } }
  })
  expect(browserSession.status).toBe(200)
  expect(browserSession.body.user.roles).toContain('rider')
  expect(browserSession.body.user.riderId).toBe(linkedRider.id)
  const riderRouteRead = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/routes')
    return { status: response.status, body: await response.text() }
  })
  expect(riderRouteRead.status, riderRouteRead.body).toBe(200)

  // Keep the explicit loopback demo flag across reloads so AuthGate reads the
  // local session cookie instead of routing to the production OTP login. The
  // hash-only navigation preserves the existing QueryClient, so force a full
  // reload after the API login changes the cookie.
  await page.goto('/ui/app/?local-demo=1#/laundry/routes', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'My route runs' })).toBeVisible()
  await expect(page.getByText(own.route.id)).toBeVisible()
  await expect(page.getByText(foreign.route.id)).toHaveCount(0)
  await expect(page.getByLabel('Route captain')).toHaveCount(0)
  const ownRouteCard = page.locator('article').filter({ hasText: own.route.id })
  const startResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/routes/${own.route.id}/start` && response.request().method() === 'POST')
  await ownRouteCard.getByRole('button', { name: 'Start' }).click()
  expect((await startResponse).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText(`Run ${own.route.id} started. 1 stop is ready for handoff.`)
  await expect(ownRouteCard).toContainText('In Progress')
  await ownRouteCard.getByRole('button', { name: `Show stops for ${own.route.id}` }).click()
  const stopResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/laundry/routes/${own.route.id}/stops/${own.route.stops[0].id}/complete` && response.request().method() === 'POST')
  await ownRouteCard.getByRole('button', { name: `Complete ${own.order.orderNumber}` }).click()
  expect((await stopResponse).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText(`Run ${own.route.id} updated: 1/1 stops closed (Completed).`)
  const pickedUp = await page.request.get(`${origin}/api/laundry/orders/${own.order.id}`)
  expect(pickedUp.status()).toBe(403)

  const foreignStart = await page.request.post(`${origin}/api/laundry/routes/${foreign.route.id}/start`, { headers: { 'idempotency-key': `foreign-start-${fixture}` } })
  expect(foreignStart.status()).toBe(403)
  const foreignComplete = await page.request.post(`${origin}/api/laundry/routes/${foreign.route.id}/stops/${foreign.route.stops[0].id}/complete`, {
    headers: { 'idempotency-key': `foreign-stop-${fixture}` }, data: { status: 'Completed' },
  })
  expect(foreignComplete.status()).toBe(403)
  const foreignStillPlanned = await page.request.get(`${origin}/api/laundry/routes`)
  const visibleLinkedRoutes = await foreignStillPlanned.json() as RouteRun[]
  expect(visibleLinkedRoutes.some((route) => route.id === foreign.route.id)).toBe(false)

  const unlinkedLogin = await page.request.post(`${origin}/api/auth/sign-in`, { data: { username: unlinkedUsername, password: unlinkedPassword } })
  expect(unlinkedLogin.status(), await unlinkedLogin.text()).toBe(200)
  const unlinkedSessionResponse = await page.request.get(`${origin}/api/auth/session`)
  const unlinkedSession = await unlinkedSessionResponse.json() as { user: { riderId?: string | null; roles: string[] } }
  expect(unlinkedSession.user.roles).toContain('rider')
  expect(unlinkedSession.user.riderId).toBeNull()
  await page.goto('/ui/app/?local-demo=1#/laundry/routes', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'My route runs' })).toBeVisible()
  await expect(page.getByText('This captain account is not linked to an active captain record.')).toBeVisible()
  await expect(page.getByText('No active route runs')).toBeVisible()
  await expect(page.getByText(own.route.id)).toHaveCount(0)
  await expect(page.getByText(foreign.route.id)).toHaveCount(0)
  const unlinkedRoutes = await page.request.get(`${origin}/api/laundry/routes`)
  expect(unlinkedRoutes.ok()).toBe(true)
  expect(await unlinkedRoutes.json()).toEqual([])

  // Rider accounts can operate assigned routes but cannot inspect general
  // order details. Verify the lifecycle effect through the owner session.
  const ownerLogin = await page.request.post(`${origin}/api/auth/sign-in`, { data: { username: 'demo', password: 'DemoLaundry!2026' } })
  expect(ownerLogin.status(), await ownerLogin.text()).toBe(200)
  const pickedUpAsOwner = await page.request.get(`${origin}/api/laundry/orders/${own.order.id}`)
  expect(pickedUpAsOwner.ok()).toBe(true)
  expect((await pickedUpAsOwner.json() as { state: string }).state).toBe('Picked Up')
})
