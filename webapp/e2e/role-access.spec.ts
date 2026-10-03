import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

test.setTimeout(120_000)

async function openDemoAsOwner(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function createStaff(page: Page, username: string, password: string, role: 'counter_staff' | 'processing_staff') {
  const result = await page.evaluate(async ({ username, password, role }) => {
    const response = await fetch('/api/settings/staff', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, roles: [role], firstName: 'Phase', lastName: role, email: `${username}@example.test` }),
    })
    return { status: response.status, body: await response.json() }
  }, { username, password, role })
  expect(result.status, JSON.stringify(result.body)).toBe(201)
}

async function signInStaff(page: Page, username: string, password: string) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in with your LNDRY vendor number' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function openEligibleOrderSummary(page: Page) {
  const pageData = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/orders?page=1&pageSize=100')
    return { status: response.status, body: await response.json() }
  })
  expect(pageData.status, JSON.stringify(pageData.body)).toBe(200)
  const target = (pageData.body as { items: Array<{ id: string; orderNumber: string; invoiceNumber?: string; state: string }> }).items.find((order) => !['Delivered', 'Cancelled'].includes(order.state))
  expect(target, 'the isolated demo should include an order that is still active').toBeTruthy()
  if (!target) throw new Error('No active demo order was available for the role check.')
  await page.getByRole('textbox', { name: 'Order No' }).fill(target.orderNumber)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const summaryButton = page.getByRole('button', { name: 'Open order summary for ' + (target.invoiceNumber || target.orderNumber) })
  await expect(summaryButton).toBeVisible()
  await summaryButton.click()
  return target
}

test('counter and processing staff get their work route and cannot open excluded workspaces', async ({ page }) => {
  await openDemoAsOwner(page)
  const ownerNavigation = page.locator('aside nav')
  const ownerFinanceGroup = ownerNavigation.getByRole('button', { name: /Finance & compliance/i })
  if (await ownerFinanceGroup.getAttribute('aria-expanded') !== 'true') await ownerFinanceGroup.click()
  await expect(ownerNavigation.getByRole('link', { name: 'Finance & compliance', exact: true })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/finance', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'See every rupee, without a spreadsheet.' })).toBeVisible()

  // Seed one isolated open claim so the role check can verify action controls
  // against a real record. Playwright runs this against its disposable demo DB.
  const qualityFixture = await page.evaluate(async () => {
    const [unitsResponse, claimsResponse] = await Promise.all([
      fetch('/api/laundry/garment-units'),
      fetch('/api/laundry/quality-claims'),
    ])
    const units = await unitsResponse.json() as Array<{ id: string; tagCode: string }>
    const claims = await claimsResponse.json() as Array<{ unitId: string; status: string }>
    const activeUnitIds = new Set(claims.filter((claim) => ['Open', 'Under Review'].includes(claim.status)).map((claim) => claim.unitId))
    const unit = units.find((candidate) => !activeUnitIds.has(candidate.id))
    if (!unit) return { status: 0, body: { error: 'No unclaimed garment was available in the disposable demo.' } }
    const response = await fetch('/api/laundry/quality-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garmentUnitId: unit.id, category: 'Stain', severity: 'Low', description: 'Synthetic role permission fixture' }),
    })
    return { status: response.status, body: await response.json() as { id: string; tagCode: string } }
  })
  expect(qualityFixture.status, JSON.stringify(qualityFixture.body)).toBe(201)
  const claimFixture = qualityFixture.body as { id: string; tagCode: string }
  await createStaff(page, 'phase.counter', 'PhaseCounterPassword!2026', 'counter_staff')
  await createStaff(page, 'phase.processing', 'PhaseProcessingPassword!2026', 'processing_staff')

  await signInStaff(page, 'phase.counter', 'PhaseCounterPassword!2026')
  await expect(page).toHaveURL(/#\/laundry\/new-order$/)
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard', { waitUntil: 'domcontentloaded' })
  const counterNavigation = page.locator('aside nav')
  const counterGroup = counterNavigation.getByRole('button', { name: 'Counter' })
  if (await counterGroup.getAttribute('aria-expanded') !== 'true') await counterGroup.click()
  await expect(counterNavigation.getByRole('link', { name: 'Order booking' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('region', { name: 'Start the next task' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: /Search customer/i })).toBeVisible()

  await page.goto('/ui/app/?local-demo=1#/laundry/quality-claims', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Claims & exceptions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open a claim' })).toBeVisible()
  const counterClaim = page.locator('article').filter({ hasText: claimFixture.tagCode }).first()
  await expect(counterClaim).toContainText('Synthetic role permission fixture')
  await expect(counterClaim.getByRole('button', { name: 'Resolve' })).toHaveCount(0)
  await expect(counterClaim.getByLabel(`Resolution decision for ${claimFixture.tagCode}`)).toHaveCount(0)
  const counterResolve = await page.evaluate(async (claimId) => (await fetch(`/api/laundry/quality-claims/${claimId}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'Release', note: 'Must be denied for counter staff' }),
  })).status, claimFixture.id)
  expect(counterResolve).toBe(403)
  const counterClaimOpen = await page.evaluate(async () => (await fetch('/api/laundry/quality-claims', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  })).status)
  expect(counterClaimOpen).toBe(400)

  await page.goto('/ui/app/?local-demo=1#/laundry/production-queue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Work queue' })).toBeVisible()
  const counterOpenTask = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/production-queue?status=Open')
    const items = await response.json() as Array<{ id: string; tagCode: string; station: string }>
    return items[0] || null
  })
  if (counterOpenTask) {
    const taskRow = page.locator('article').filter({ hasText: counterOpenTask.tagCode }).filter({ hasText: counterOpenTask.station }).first()
    await expect(taskRow.getByRole('button', { name: 'Start' })).toHaveCount(0)
    await expect(taskRow).toContainText('Processing staff starts this task')
  }
  const deniedStart = await page.evaluate(async (taskId) => (await fetch(`/api/laundry/production-tasks/${taskId}/start`, { method: 'POST' })).status, counterOpenTask?.id || 'role-fixture-missing')
  expect(deniedStart).toBe(403)
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  const counterFinanceGroup = counterNavigation.getByRole('button', { name: /Finance & compliance/i })
  if (await counterFinanceGroup.getAttribute('aria-expanded') !== 'true') await counterFinanceGroup.click()
  await expect(counterNavigation.getByRole('link', { name: 'Finance & compliance', exact: true })).toHaveCount(0)
  await expect(counterNavigation.getByRole('link', { name: 'Store expense' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store expense' })).toBeVisible()
  const counterExpenseRead = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/expenses')
    return { status: response.status, body: await response.json() }
  })
  expect(counterExpenseRead.status).toBe(200)
  expect(Array.isArray(counterExpenseRead.body)).toBe(true)
  await page.goto('/ui/app/?local-demo=1#/laundry/finance', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  await counterNavigation.getByRole('button', { name: /Business controls/i }).click()
  await expect(counterNavigation.getByRole('link', { name: 'Garments & prices' })).toBeVisible()
  await expect(counterNavigation.getByRole('link', { name: 'Marketplace catalogue' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/catalogue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Catalogue command centre' })).toBeVisible()
  await expect(page.getByText('Read-only catalogue access')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add garment' })).toHaveCount(0)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.screenshot({ path: '../docs/parity/evidence/catalogue-readonly-counter-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  mkdirSync(dirname(resolve(process.cwd(), '../docs/parity/evidence/catalogue-readonly-counter-mobile.png')), { recursive: true })
  await page.screenshot({ path: '../docs/parity/evidence/catalogue-readonly-counter-mobile-viewport.png' })
  await page.screenshot({ path: '../docs/parity/evidence/catalogue-readonly-counter-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1366, height: 900 })
  const marketplaceWrites: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/marketplace/cloud/') && ['POST', 'PATCH', 'DELETE'].includes(request.method())) marketplaceWrites.push(`${request.method()} ${url.pathname}`)
  })
  await page.route('**/api/marketplace/cloud/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, connected: true, remoteVendorName: 'Fixture marketplace', remoteVendorId: 'fixture-vendor' }) }))
  await page.route('**/api/marketplace/cloud/catalogue', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'fixture-item', garmentTypeId: 'fixture-shirt', name: 'Fixture shirt', categoryName: 'Shirts', sku: 'FIX-SHIRT', price: 45, salePrice: 40, costPrice: 20, stockQuantity: 3, lowStockThreshold: 1, maxOrderQty: 8, isAvailable: true, isFeatured: false, approvalStatus: 'APPROVED', updatedAt: '2026-10-01T08:00:00.000Z' }]) }))
  await page.route('**/api/marketplace/cloud/service-categories', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/marketplace/cloud/my-services', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto('/ui/app/?local-demo=1#/laundry/marketplace-catalogue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Marketplace catalogue' })).toBeVisible()
  await expect(page.getByText('Read-only view. Ask an owner to manage marketplace prices, stock, and availability.')).toBeVisible()
  await expect(page.getByText('Fixture shirt', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Price', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Available on the marketplace' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save pricing & availability' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save stock' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'New request' })).toHaveCount(0)
  expect(marketplaceWrites).toEqual([])
  await page.screenshot({ path: '../docs/parity/evidence/marketplace-catalogue-readonly-counter-desktop.png' })
  await expect(counterNavigation.getByRole('link', { name: 'Store settings' })).toHaveCount(0)
  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()

  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()
  await openEligibleOrderSummary(page)
  const counterOrderCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(counterOrderCard.getByRole('button', { name: 'Edit in order builder' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(counterOrderCard).toBeHidden()

  await signInStaff(page, 'phase.processing', 'PhaseProcessingPassword!2026')
  await expect(page).toHaveURL(/#\/laundry\/production-queue$/)
  await expect(page.getByRole('heading', { name: 'Work queue' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard', { waitUntil: 'domcontentloaded' })
  const processingNavigation = page.locator('aside nav')
  const productionGroup = processingNavigation.getByRole('button', { name: 'Production' })
  if (await productionGroup.getAttribute('aria-expanded') !== 'true') await productionGroup.click()
  await expect(processingNavigation.getByRole('link', { name: 'Production queue' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/quality-claims', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Claims & exceptions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open a claim' })).toBeVisible()
  const processingClaim = page.locator('article').filter({ hasText: claimFixture.tagCode }).first()
  await expect(processingClaim.getByRole('combobox', { name: `Resolution decision for ${claimFixture.tagCode}` })).toBeVisible()
  await expect(processingClaim.getByRole('button', { name: 'Resolve' })).toBeVisible()
  const processingResolveValidation = await page.evaluate(async (claimId) => {
    const response = await fetch(`/api/laundry/quality-claims/${claimId}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'Not a decision', note: 'Synthetic permission validation' }),
    })
    return { status: response.status, body: await response.json() as { error?: string } }
  }, claimFixture.id)
  expect(processingResolveValidation.status).toBe(400)
  expect(processingResolveValidation.body.error).toMatch(/unknown quality claim decision/i)

  await page.goto('/ui/app/?local-demo=1#/laundry/production-queue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Work queue' })).toBeVisible()
  const processingOpenTask = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/production-queue?status=Open')
    const items = await response.json() as Array<{ id: string; tagCode: string; station: string }>
    return items[0] || null
  })
  if (processingOpenTask) {
    const taskRow = page.locator('article').filter({ hasText: processingOpenTask.tagCode }).filter({ hasText: processingOpenTask.station }).first()
    await expect(taskRow.getByRole('button', { name: 'Start' })).toBeVisible()
  }
  const processingStartValidation = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/production-tasks/role-fixture-missing/start', {
      method: 'POST', headers: { 'idempotency-key': 'role-access-missing-task-start' },
    })
    return { status: response.status, body: await response.json() as { error?: string } }
  })
  expect(processingStartValidation.status).toBe(400)
  expect(processingStartValidation.body.error).toMatch(/production task not found/i)
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  await processingNavigation.getByRole('button', { name: /Business controls/i }).click()
  await expect(processingNavigation.getByRole('link', { name: 'Garments & prices' })).toBeVisible()
  await expect(processingNavigation.getByRole('link', { name: 'Marketplace catalogue' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/catalogue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Catalogue command centre' })).toBeVisible()
  await expect(page.getByText('Read-only catalogue access')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add garment' })).toHaveCount(0)
  await page.goto('/ui/app/?local-demo=1#/laundry/marketplace-catalogue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Marketplace catalogue' })).toBeVisible()
  await expect(page.getByText('Read-only view. Ask an owner to manage marketplace prices, stock, and availability.')).toBeVisible()
  await expect(page.getByText('Fixture shirt', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Price', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Available on the marketplace' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save pricing & availability' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save stock' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'New request' })).toHaveCount(0)
  expect(marketplaceWrites).toEqual([])
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/laundry\/dashboard$/)
  await expect(page.locator('main')).not.toContainText('Work queue')
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('region', { name: 'Start the next task' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: /Search customer/i })).toHaveCount(0)
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()
  await expect(processingNavigation.getByRole('link', { name: 'Store expense' })).toHaveCount(0)
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()
  const processingExpenseRead = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/expenses')
    return { status: response.status, body: await response.json() }
  })
  expect(processingExpenseRead.status).toBe(403)
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()
  const processingOrder = await openEligibleOrderSummary(page)
  const processingOrderCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(processingOrderCard.getByRole('button', { name: 'Edit in order builder' })).toHaveCount(0)
  await expect(processingOrderCard.getByRole('button', { name: 'Cancel order' })).toHaveCount(0)
  await expect(processingOrderCard.getByRole('button', { name: 'Save progress event' })).toHaveCount(0)
  await expect(processingOrderCard.getByRole('button', { name: 'Record collection' })).toHaveCount(0)
  await expect(processingOrderCard.getByRole('button', { name: 'Reverse', exact: true })).toHaveCount(0)
  await expect(processingOrderCard.getByText('Progress entry is available to staff with order edit access.')).toBeVisible()
  const deniedEdit = await page.evaluate(async (id) => {
    const response = await fetch('/api/laundry/orders/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'must not be saved' }),
    })
    return response.status
  }, processingOrder.id)
  expect(deniedEdit).toBe(403)
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order?edit=' + processingOrder.id, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()
})
