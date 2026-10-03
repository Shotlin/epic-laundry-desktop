import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
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

test('report pages and direct/full export APIs require the reports.read permission', async ({ page }) => {
  await signIntoDemo(page)
  const runId = randomUUID().slice(0, 8)
  const username = `report-denied.${runId}`
  const password = `ReportDenied!${runId}Aa`
  const created = await apiStatus(page, 'POST', '/api/settings/staff', {
    username, password, roles: ['processing_staff'], firstName: 'Report', lastName: 'Denied', email: `${username}@example.test`,
  })
  expect(created.status, JSON.stringify(created.body)).toBe(201)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in with your LNDRY vendor number' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/#\/laundry\/production-queue$/)
  await expect(page.getByRole('button', { name: 'Back to dashboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  await expect(page.locator('aside').first()).toBeVisible()

  const nav = page.locator('aside nav')
  const businessControls = nav.getByRole('button', { name: 'Business controls' })
  if (await businessControls.count()) {
    if (await businessControls.getAttribute('aria-expanded') !== 'true') await businessControls.click()
    await expect(nav.getByRole('link', { name: 'Reports', exact: true })).toHaveCount(0)
  }
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/invoice', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()

  expect((await apiStatus(page, 'GET', '/api/laundry/reports/invoice')).status).toBe(403)
  expect((await apiStatus(page, 'GET', '/api/laundry/reports/invoice/export?from=2026-10-01&to=2026-10-02')).status).toBe(403)
  expect((await apiStatus(page, 'POST', '/api/laundry/report-exports', { kind: 'invoice', from: '2026-10-01', to: '2026-10-02' })).status).toBe(403)
  expect((await apiStatus(page, 'GET', '/api/laundry/report-exports/no-access')).status).toBe(403)
})
