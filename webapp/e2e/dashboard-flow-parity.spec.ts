import { expect, test } from '@playwright/test'

async function openDemoDashboard(page: import('@playwright/test').Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard')
  const signIn = page.getByRole('button', { name: 'Sign in' })
  if (await signIn.isVisible().catch(() => false)) {
    await signIn.click()
  } else {
    await expect(signIn).toBeVisible({ timeout: 15_000 })
    await signIn.click()
  }
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible()
}

test('dashboard Collection Amount keeps the Today preset and its dates locked', async ({ page }) => {
  await openDemoDashboard(page)

  await page.getByRole('link', { name: /Collection amount/i }).click()
  await expect(page).toHaveURL(/#\/laundry\/reports\/collection\?period=today&from=/)
  const reportBy = page.locator('[aria-label="Report date filter"] select')
  const dateInputs = page.locator('[aria-label="Report date filter"] input[type="date"]')
  await expect(reportBy).toHaveValue('today')
  await expect(dateInputs).toHaveCount(2)
  await expect(dateInputs.nth(0)).toBeDisabled()
  await expect(dateInputs.nth(1)).toBeDisabled()
})

test('dashboard order shortcuts open the queue named on each card', async ({ page }) => {
  await openDemoDashboard(page)
  const queues = [
    { key: 'pending', label: 'Pending orders', links: 1 },
    { key: 'booking', label: 'Booking', links: 1 },
    { key: 'delivery', label: 'Delivery', links: 1 },
    { key: 'delivered', label: 'Delivered', links: 1 },
    { key: 'pickup-unassigned', label: 'Pending / unassigned pickup', links: 1 },
    { key: 'delivery-due', label: 'Upcoming delivery', links: 2 },
    { key: 'delivery-unassigned', label: 'Unassigned delivery', links: 1 },
    { key: 'express', label: 'Express delivery', links: 1 },
  ]

  for (const queue of queues) {
    const href = `#/laundry/orders?queue=${queue.key}`
    const links = page.locator(`a[href="${href}"]`)
    await expect(links).toHaveCount(queue.links)
    for (let index = 0; index < queue.links; index += 1) {
      const shortcut = links.nth(index)
      await expect(shortcut).toBeVisible()
      await expect(shortcut).toContainText('View')
      await shortcut.click()
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(href)
      await expect(page.getByText(`Dashboard filter: ${queue.label}`, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Back to dashboard' }).click()
      await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible({ timeout: 20_000 })
    }
  }

  const requestsHref = '#/laundry/online-orders?filter=AwaitingAcceptance'
  const requestShortcuts = page.locator(`a[href="${requestsHref}"]`)
  await expect(requestShortcuts).toHaveCount(2)
  for (let index = 0; index < 2; index += 1) {
    await requestShortcuts.nth(index).click()
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(requestsHref)
    await expect(page.getByRole('heading', { name: 'Online orders' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Needs acceptance' })).toHaveClass(/bg-\[#173f46\] text-white/)
    await page.getByRole('button', { name: 'Back to dashboard' }).click()
    await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible({ timeout: 20_000 })
  }
})

test('dashboard New Order and WhatsApp controls keep their expected action boundaries', async ({ page }) => {
  await openDemoDashboard(page)
  const orderLinks = page.locator('a[href="#/laundry/new-order"]')
  await expect(orderLinks).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    await orderLinks.nth(index).click()
    await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to dashboard' }).click()
    await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible({ timeout: 20_000 })
  }

  await page.getByRole('button', { name: /Send WhatsApp/i }).click()
  const messageDialog = page.getByRole('dialog', { name: 'Review before sending' })
  await expect(messageDialog).toBeVisible()
  await expect(messageDialog.getByRole('link')).toHaveCount(0)
  await expect(messageDialog.getByRole('button', { name: /send/i })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  await expect(messageDialog).toBeHidden()

  const displayCard = page.getByText('Counter sales today').locator('xpath=..')
  expect(await displayCard.evaluate((element) => element.closest('a,button') === null)).toBe(true)
})

test('dashboard Search Customer opens a lookup and a result opens its customer workspace', async ({ page }) => {
  await page.route(/\/api\/laundry\/customers(?:[/?]|$)/, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname.endsWith('/laundry/customers')) {
      const search = url.searchParams.get('search') || ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(search ? [{ id: 'customer-audit-1', name: 'Mira Sample', phone: '9000000001', email: '' }] : []),
      })
      return
    }
    await route.continue()
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await openDemoDashboard(page)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const mobileNavigation = page.getByRole('dialog', { name: 'Laundry workspace navigation' })
  await expect(mobileNavigation).toBeVisible()
  await expect(mobileNavigation.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  await mobileNavigation.getByRole('button', { name: 'Close navigation' }).click()
  await expect(mobileNavigation).toBeHidden()
  const pageWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.viewport)
  await page.getByRole('button', { name: /Search customer/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Search Customer' })
  await expect(dialog).toBeVisible()
  const dialogBounds = await dialog.boundingBox()
  expect(dialogBounds).not.toBeNull()
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: /Search customer/i }).click()
  await page.getByRole('textbox', { name: 'Customer name or phone' }).fill('Mira')
  await expect(page.getByRole('button', { name: /Open profile for Mira Sample/ })).toBeVisible()
  await page.getByRole('button', { name: /Open profile for Mira Sample/ }).click()
  await expect(page).toHaveURL(/#\/laundry\/orders\?view=customers&customer=customer-audit-1/)
})

test('Add Customer opens a reversible customer form and does not save on cancel', async ({ page }) => {
  let customerCreateRequests = 0
  await page.route(/\/api\/laundry\/customers(?:[/?]|$)/, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'POST' && url.pathname.endsWith('/laundry/customers')) {
      customerCreateRequests += 1
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'unexpected' }) })
      return
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/laundry/customers')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.continue()
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await openDemoDashboard(page)
  await page.getByRole('button', { name: /Search customer/i }).click()
  await page.getByRole('button', { name: 'Add Customer' }).click()
  await expect(page).toHaveURL(/#\/laundry\/customers\?new=1/)
  await expect(page.getByRole('heading', { name: 'Customer directory' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Customer name' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/#\/laundry\/orders\?view=customers/)
  expect(customerCreateRequests).toBe(0)
})
