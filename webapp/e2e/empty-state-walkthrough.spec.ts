import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

async function createEmptyWorkspace(page: Page) {
  await page.addInitScript({
    content: 'Object.defineProperty(window, "epic", { configurable: true, value: { workspaceStatus: async () => ({ mode: "production" }) } })',
  })
  const baseURL = page.url().startsWith('http') ? new URL(page.url()).origin : 'http://127.0.0.1:3921'
  const response = await page.request.post(new URL('/api/auth/bootstrap', baseURL).toString(), {
    data: {
      username: `empty.state.${Date.now()}`,
      password: 'EmptyStatePassword!2026',
      firstName: 'Empty',
      lastName: 'State',
      businessName: 'Empty State Laundry',
      phone: '9000000044',
      email: 'empty-state@example.invalid',
      address: 'Disposable empty-state workspace',
    },
  })
  expect(response.ok()).toBeTruthy()
  await page.goto('/ui/app/#/laundry/dashboard')
  await expect(page.locator('aside').first()).toBeVisible()
}

const emptySurfaces = [
  ['orders?view=customers', 'Store orders & customers'],
  ['orders', 'Store orders & customers'],
  ['online-orders', 'Online orders'],
  ['production-queue', 'Work queue'],
  ['quality-claims', 'Claims & exceptions'],
  ['corrections', 'Correction documents'],
  ['returns', 'Returns & refund requests'],
  ['dispatch', 'Delivery operations'],
  ['settlements', 'Captain settlements'],
  ['expenses', 'Store expense'],
] as const

test('a fresh production workspace explains every core empty operational surface', async ({ page }) => {
  await createEmptyWorkspace(page)
  for (const [route, heading] of emptySurfaces) {
    await page.goto(`/ui/app/#/laundry/${route}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main').getByRole('heading', { name: heading })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Application error')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
    await expect(page.locator('main img[alt=""]').first()).toBeVisible()
  }
})
