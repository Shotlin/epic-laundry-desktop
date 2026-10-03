import { expect, test, type Page } from '@playwright/test'

async function openDemoBooking(page: Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
}

async function selectLocalDemoCustomer(page: Page) {
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill('Demo Priya')
  await page.getByRole('button', { name: /Demo Priya 9000000101/ }).click()
}

test('local demo customer selection does not call LNDRY wallet APIs', async ({ page }) => {
  const walletCalls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/marketplace/cloud/wallet/lookup')) walletCalls.push(request.url())
  })

  await openDemoBooking(page)
  await selectLocalDemoCustomer(page)

  await expect(page.getByText('Demo Priya', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => walletCalls).toEqual([])
  await expect(page.getByText('Use wallet', { exact: true })).toHaveCount(0)
})

test('a disconnected production wallet shows a clear next step instead of a raw error code', async ({ page }) => {
  let workspaceReads = 0
  await page.route('**/api/workspace/status', async (route) => {
    workspaceReads += 1
    const response = await route.fetch()
    if (workspaceReads === 1) return route.fulfill({ response })
    return route.fulfill({ response, json: { mode: 'production' } })
  })

  await openDemoBooking(page)
  await selectLocalDemoCustomer(page)

  await expect(page.getByRole('alert')).toContainText('The LNDRY vendor account is not connected')
  await expect(page.getByRole('alert')).toContainText('you can continue without wallet or app sync')
  await expect(page.getByText('CLOUD_NOT_CONNECTED', { exact: true })).toHaveCount(0)
  expect(workspaceReads).toBeGreaterThanOrEqual(2)
})
