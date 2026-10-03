import { expect, test } from '@playwright/test'

test('owner quick-add saves a garment and price, preserves the open order, and never books it', async ({ page }) => {
  let orderCreates = 0
  let catalogueWrites = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/laundry\/orders(?:\?|$)/.test(request.url())) orderCreates += 1
    if (request.method() === 'POST' && /\/api\/laundry\/catalogue\/quick-add(?:\?|$)/.test(request.url())) catalogueWrites += 1
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/new-order')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  const roles = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.roles as string[])
  expect(roles).toContain('owner')

  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill('Demo Priya')
  await page.getByRole('button', { name: /Demo Priya 9000000101/ }).click()
  await page.locator('article').first().getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('1 line selected')).toBeVisible()
  const draftBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('epic-laundry-booking-draft-v1') || '{}'))

  await page.getByRole('button', { name: 'Quick add garment' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add garment and price' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(catalogueWrites).toBe(0)
  const draftAfterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('epic-laundry-booking-draft-v1') || '{}'))
  expect(draftAfterCancel.customer.id).toBe(draftBefore.customer.id)
  expect(Object.keys(draftAfterCancel.cart)).toHaveLength(1)

  await page.getByRole('button', { name: 'Quick add garment' }).click()
  await expect(dialog).toBeVisible()
  const garmentName = `E2E coat ${Date.now()}`
  await dialog.getByLabel(/Garment name \/ type/).fill(garmentName)
  await dialog.getByLabel('Category / classification').selectOption({ label: "Men's Wear" })
  await dialog.getByLabel('Unit').selectOption('Piece')
  await dialog.getByLabel('Service').selectOption({ label: 'Steam Iron' })
  await dialog.getByRole('spinbutton', { name: 'Price' }).fill('137.50')
  await dialog.getByLabel('Garment icon').selectOption('foldedBlazer')
  await dialog.screenshot({ path: '../docs/parity/evidence/quick-add-garment-desktop.png' })
  await dialog.getByRole('button', { name: 'Save garment & price' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Added to this order draft' })).toBeVisible()
  await expect(page.getByText('2 lines selected')).toBeVisible()
  await expect(page.getByText(garmentName, { exact: true }).first()).toBeVisible()
  const draftAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('epic-laundry-booking-draft-v1') || '{}'))
  expect(draftAfter.customer.id).toBe(draftBefore.customer.id)
  expect(Object.keys(draftAfter.cart)).toHaveLength(2)
  expect(catalogueWrites).toBe(1)
  expect(orderCreates).toBe(0)

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Quick add garment' }).click()
  const mobileDialog = page.getByRole('dialog', { name: 'Add garment and price' })
  await expect(mobileDialog).toBeVisible()
  await mobileDialog.screenshot({ path: '../docs/parity/evidence/quick-add-garment-mobile.png' })
  await mobileDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(mobileDialog).toBeHidden()
  expect(orderCreates).toBe(0)
})

test('counter users without catalogue permission do not see the quick-add action', async ({ page }) => {
  let overrideRole = false
  await page.route('**/api/auth/session', async (route) => {
    if (!overrideRole) { await route.continue(); return }
    const response = await route.fetch()
    const session = await response.json()
    await route.fulfill({ response, json: { ...session, user: session.user ? { ...session.user, roles: ['counter_staff'] } : null } })
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  overrideRole = true
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quick add garment' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Manage garments & prices' })).toBeVisible()
})
