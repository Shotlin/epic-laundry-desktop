import { expect, test } from '@playwright/test'

test('Clear draft restores order choices and filters without booking', async ({ page }) => {
  let orderCreates = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/laundry\/orders(?:\?|$)/.test(request.url())) orderCreates += 1
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/new-order')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to dashboard' })).toBeVisible()
  await expect(page.locator('aside').first()).not.toBeVisible()

  const expectedDelivery = page.getByRole('textbox', { name: 'Expected delivery' })
  const defaultDate = await expectedDelivery.inputValue()
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill('Demo Priya')
  await page.getByRole('button', { name: /Demo Priya 9000000101/ }).click()
  await page.getByRole('button', { name: 'Express', exact: true }).click()
  await expectedDelivery.fill('2026-10-20')
  await page.getByRole('button', { name: 'Dry Cleaning', exact: true }).click()
  await page.getByRole('button', { name: "Men's Wear", exact: true }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await page.locator('button[title="Cash"]').click()

  await expect(page.getByText('1 line selected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Express', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('button[title="Cash"]')).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Clear draft' }).click()

  await expect(page.getByText('0 lines selected')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search customers by name or phone' })).toBeVisible()
  const fulfilment = page.getByRole('group', { name: 'Fulfilment type' })
  await expect(fulfilment.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(fulfilment.getByRole('button', { name: 'Express', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(expectedDelivery).toHaveValue(defaultDate)
  await expect(page.getByRole('button', { name: 'All services', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'All categories', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('button[title="Pay Later"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('button[title="Cash"]')).toHaveAttribute('aria-pressed', 'false')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '../docs/parity/evidence/order-draft-clear-mobile.png', fullPage: true })
  expect(orderCreates).toBe(0)
})
