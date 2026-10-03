import { expect, test, type Page } from '@playwright/test'

async function openBooking(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
}

test('add customer is a separate save and returns to the unbooked order draft', async ({ page }) => {
  let customerWrites = 0
  let orderWrites = 0
  let savedCustomer: Record<string, unknown> | undefined
  await page.route('**/api/laundry/customers**', async (route) => {
    if (route.request().method() === 'POST') {
      customerWrites += 1
      savedCustomer = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'fixture-customer-1', name: 'Phase 9 Customer', phone: '9000000123', email: 'buyer@example.test', address: '22 Laundry Street' }) })
      return
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      return
    }
    await route.continue()
  })
  page.on('request', (request) => {
    if (/\/api\/laundry\/orders(?:\?|$)/.test(request.url()) && request.method() !== 'GET') orderWrites += 1
  })

  await openBooking(page)
  await page.locator('article').first().getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('1 line selected')).toBeVisible()
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill('Phase 9 Customer')
  await expect(page.getByText('No saved customer matches')).toBeVisible()

  await page.getByRole('button', { name: 'Add new customer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add new customer' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: /Customer name/ })).toHaveValue('Phase 9 Customer')
  await page.setViewportSize({ width: 390, height: 844 })
  const dialogBounds = await dialog.boundingBox()
  expect(dialogBounds).not.toBeNull()
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(391)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await dialog.screenshot({ path: 'test-results/booking-customer-dialog-mobile.png' })
  await dialog.getByRole('textbox', { name: /Phone number/ }).fill('+91 90000 00123')
  await dialog.getByRole('textbox', { name: /Email/ }).fill('buyer@example.test')
  await dialog.getByRole('textbox', { name: /Address/ }).fill('22 Laundry Street')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).not.toBeVisible()
  expect(customerWrites).toBe(0)
  expect(orderWrites).toBe(0)
  await expect(page.getByText('1 line selected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Book order' })).toBeDisabled()

  await page.getByRole('button', { name: 'Add new customer' }).click()
  const reopened = page.getByRole('dialog', { name: 'Add new customer' })
  await reopened.getByRole('textbox', { name: /Phone number/ }).fill('+91 90000 00123')
  await reopened.getByRole('textbox', { name: /Email/ }).fill('buyer@example.test')
  await reopened.getByRole('textbox', { name: /Address/ }).fill('22 Laundry Street')
  await reopened.getByRole('button', { name: 'Save customer' }).click()

  await expect(page.getByText('Phase 9 Customer', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Pickup / delivery address' })).toHaveValue('22 Laundry Street')
  await expect(page.getByText('1 line selected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Book order' })).toBeEnabled()
  expect(customerWrites).toBe(1)
  expect(savedCustomer).toMatchObject({ name: 'Phase 9 Customer', phone: '+91 90000 00123', email: 'buyer@example.test', address: '22 Laundry Street', openingBalance: 0, marketingConsent: false })
  expect(orderWrites).toBe(0)
})

test('new customer validation and duplicate errors keep booking uncommitted', async ({ page }) => {
  let orderWrites = 0
  await page.route('**/api/laundry/customers**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'CUSTOMER_PHONE_EXISTS', error: 'A customer with this phone already exists in this branch.' }) })
      return
    }
    await route.continue()
  })
  page.on('request', (request) => {
    if (/\/api\/laundry\/orders(?:\?|$)/.test(request.url()) && request.method() !== 'GET') orderWrites += 1
  })
  await openBooking(page)
  await page.locator('article').first().getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: 'Add new customer' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add new customer' })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Book order' })).toBeDisabled()
  await page.getByRole('button', { name: 'Add new customer' }).click()
  dialog = page.getByRole('dialog', { name: 'Add new customer' })
  await dialog.getByRole('textbox', { name: /Customer name/ }).fill('Duplicate test')
  await dialog.getByRole('textbox', { name: /Phone number/ }).fill('1234')
  await expect(dialog.getByRole('button', { name: 'Save customer' })).toBeDisabled()
  await dialog.getByRole('textbox', { name: /Phone number/ }).fill('9000000999')
  await expect(dialog.getByRole('button', { name: 'Save customer' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Save customer' }).click()
  await expect(dialog.getByRole('alert')).toContainText('already exists')
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Book order' })).toBeDisabled()
  expect(orderWrites).toBe(0)
})

test('an existing customer match can be selected without creating a duplicate', async ({ page }) => {
  let customerWrites = 0
  let orderWrites = 0
  await page.route('**/api/laundry/customers**', async (route) => {
    if (route.request().method() === 'POST') {
      customerWrites += 1
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'unexpected-customer', name: 'Unexpected', phone: '9000000000' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'existing-customer-1', name: 'Asha Patel', phone: '9000000101', address: '8 Clean Road' }]) })
  })
  page.on('request', (request) => {
    if (/\/api\/laundry\/orders(?:\?|$)/.test(request.url()) && request.method() !== 'GET') orderWrites += 1
  })
  await openBooking(page)
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill('Asha')
  const match = page.getByRole('button', { name: /Asha Patel/ })
  await expect(match).toBeVisible()
  await match.click()
  await expect(page.getByText('Asha Patel', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Pickup / delivery address' })).toHaveValue('8 Clean Road')
  expect(customerWrites).toBe(0)
  expect(orderWrites).toBe(0)
})

test('a new customer is persisted in the isolated test server and can be found again', async ({ page }) => {
  const name = `Epic customer flow ${Date.now()}`
  const phone = String(Date.now()).slice(-10)
  let customerWrites = 0
  let orderWrites = 0
  page.on('request', (request) => {
    if (/\/api\/laundry\/customers(?:\?|$)/.test(request.url()) && request.method() === 'POST') customerWrites += 1
    if (/\/api\/laundry\/orders(?:\?|$)/.test(request.url()) && request.method() !== 'GET') orderWrites += 1
  })
  await openBooking(page)
  await page.locator('article').first().getByRole('button', { name: 'Add' }).click()
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill(name)
  await expect(page.getByText('No saved customer matches')).toBeVisible()
  await page.getByRole('button', { name: 'Add new customer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add new customer' })
  await dialog.getByRole('textbox', { name: /Phone number/ }).fill(phone)
  await dialog.getByRole('textbox', { name: /Address/ }).fill('5 Test Laundry Road')
  await dialog.getByRole('button', { name: 'Save customer' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Pickup / delivery address' })).toHaveValue('5 Test Laundry Road')
  await page.getByRole('button', { name: 'Clear customer' }).click()
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill(phone)
  const savedMatch = page.getByRole('button', { name: new RegExp(name) })
  await expect(savedMatch).toBeVisible()
  await savedMatch.click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Pickup / delivery address' })).toHaveValue('5 Test Laundry Road')
  await expect(page.getByText('1 line selected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Book order' })).toBeEnabled()
  expect(customerWrites).toBe(1)
  expect(orderWrites).toBe(0)
})
