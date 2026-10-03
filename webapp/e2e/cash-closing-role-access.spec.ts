import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120_000)

type Shift = {
  id: string
  status: string
  register: string
  openedBy: string
  closedBy?: string | null
  openingCash: number
  expectedCash: number
  countedCash: number | null
  variance: number | null
  varianceApprovedBy?: string | null
}

async function openDemoAsOwner(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function signInDemoOwner(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in with your LNDRY vendor number' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function createStaff(page: Page, username: string, password: string, role: 'counter_staff' | 'processing_staff') {
  const result = await page.evaluate(async ({ username, password, role }) => {
    const response = await fetch('/api/settings/staff', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, roles: [role], firstName: 'Cash', lastName: role, email: `${username}@example.test` }),
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
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('aside').first()).toBeVisible()
}

async function apiStatus(page: Page, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(path, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, body: await response.json().catch(() => ({})) }
  }, { method, path, body })
}

test('cash shifts allow counter reconciliation, require owner variance approval, and deny processing access', async ({ page }) => {
  await openDemoAsOwner(page)
  const runId = randomUUID()
  const counterUsername = `cash.counter.${runId.slice(0, 8)}`
  const counterPassword = `CashCounter!${runId.slice(0, 8)}Aa`
  const processingUsername = `cash.processing.${runId.slice(0, 8)}`
  const processingPassword = `CashProcessing!${runId.slice(0, 8)}Aa`
  const register = `Role close ${runId.slice(0, 8)}`
  await createStaff(page, counterUsername, counterPassword, 'counter_staff')
  await createStaff(page, processingUsername, processingPassword, 'processing_staff')

  await signInStaff(page, counterUsername, counterPassword)
  const counterPaymentLink = await apiStatus(page, 'POST', '/api/payments/link', { amount: 1, description: 'Role boundary check' })
  expect(counterPaymentLink.status, JSON.stringify(counterPaymentLink.body)).toBe(200)
  const nav = page.locator('aside nav')
  const financeGroup = nav.getByRole('button', { name: /Finance & compliance/i })
  if (await financeGroup.getAttribute('aria-expanded') !== 'true') await financeGroup.click()
  await expect(nav.getByRole('link', { name: 'Cash closing' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/cash-closing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cash closing', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 1366, height: 900 })

  await page.getByLabel('Register').fill(register)
  await page.getByLabel('Opening float').fill('26.00')
  const counterOpenPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/open' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Open shift' }).click()
  const counterOpenResponse = await counterOpenPromise
  expect(counterOpenResponse.status(), await counterOpenResponse.text()).toBe(201)
  const firstShift = await counterOpenResponse.json() as Shift
  expect(firstShift).toMatchObject({ status: 'Open', register, openingCash: 26 })

  await page.getByLabel('Counted cash').fill('26.00')
  await page.getByLabel('Close note').fill('Counter matched the physical drawer count.')
  const matchingClosePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift' }).click()
  const matchingCloseResponse = await matchingClosePromise
  expect(matchingCloseResponse.status(), await matchingCloseResponse.text()).toBe(201)
  expect(await matchingCloseResponse.json() as Shift).toMatchObject({ status: 'Closed', variance: 0, closedBy: counterUsername })

  // The same register can start a new shift after the prior immutable close.
  await expect(page.getByRole('button', { name: 'Open shift' })).toBeVisible()
  await page.getByLabel('Opening float').fill('20.00')
  const secondOpenPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/open' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Open shift' }).click()
  const secondOpenResponse = await secondOpenPromise
  expect(secondOpenResponse.status(), await secondOpenResponse.text()).toBe(201)
  const secondShift = await secondOpenResponse.json() as Shift
  expect(secondShift.id).not.toBe(firstShift.id)

  await page.getByLabel('Counted cash').fill('19.00')
  await page.getByLabel('Close note').fill('Counter found a one-rupee shortage.')
  const deniedVariancePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift' }).click()
  const deniedVarianceResponse = await deniedVariancePromise
  expect(deniedVarianceResponse.status()).toBe(400)
  await expect(page.getByText(/a non-zero cash variance requires supervisor approval/i)).toBeVisible()
  const stillOpen = await apiStatus(page, 'GET', `/api/laundry/cash-shift?register=${encodeURIComponent(register)}`)
  expect(stillOpen.status).toBe(200)
  expect(stillOpen.body).toMatchObject({ id: secondShift.id, status: 'Open', variance: null })

  await signInDemoOwner(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/cash-closing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cash closing', exact: true })).toBeVisible()
  await page.getByLabel('Register').fill(register)
  await expect(page.getByText(`Open shift · ${register}`, { exact: true })).toBeVisible()
  await page.getByLabel('Counted cash').fill('19.00')
  await page.getByLabel('Close note').fill('Owner reviewed and approved the reported shortage.')
  const approvedClosePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift' }).click()
  const approvedCloseResponse = await approvedClosePromise
  expect(approvedCloseResponse.status(), await approvedCloseResponse.text()).toBe(201)
  const approvedShift = await approvedCloseResponse.json() as Shift
  expect(approvedShift).toMatchObject({ id: secondShift.id, status: 'Closed', countedCash: 19, expectedCash: 20, variance: -1 })
  expect(approvedShift.closedBy).not.toBe(counterUsername)
  expect(approvedShift.varianceApprovedBy).toBe(approvedShift.closedBy)

  await signInStaff(page, processingUsername, processingPassword)
  const processingNav = page.locator('aside nav')
  const processingFinanceGroup = processingNav.getByRole('button', { name: /Finance & compliance/i })
  if (await processingFinanceGroup.count()) {
    if (await processingFinanceGroup.getAttribute('aria-expanded') !== 'true') await processingFinanceGroup.click()
    await expect(processingNav.getByRole('link', { name: 'Cash closing' })).toHaveCount(0)
  }
  await page.goto('/ui/app/?local-demo=1#/laundry/cash-closing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()
  expect((await apiStatus(page, 'GET', `/api/laundry/cash-shift?register=${encodeURIComponent(register)}`)).status).toBe(403)
  expect((await apiStatus(page, 'GET', '/api/laundry/cash-shifts')).status).toBe(403)
  expect((await apiStatus(page, 'POST', '/api/laundry/cash-shift/open', { openingCash: 5, register: `${register} denied` })).status).toBe(403)
  expect((await apiStatus(page, 'POST', '/api/laundry/cash-shift/close', { countedCash: 20, register })).status).toBe(403)
  expect((await apiStatus(page, 'POST', '/api/payments/link', { amount: 1, description: 'Role boundary check' })).status).toBe(403)
})
