import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

test.setTimeout(120_000)

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function addCustomer(page: Page, name: string, phone: string) {
  await page.goto('/ui/app/?local-demo=1#/laundry/customers?new=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Customer directory' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill(name)
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Create customer account' }).click()
  await expect(page.getByText('Customer work card', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  const match = page.url().match(/#\/laundry\/customers\/([^/?]+)/)
  expect(match, 'creating a customer should open the saved customer profile').toBeTruthy()
  return decodeURIComponent(match![1])
}

async function capture(page: Page, name: string) {
  const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage: true })
}

test('owner customer workspace supports explicit profile, address, wallet, and reward flows', async ({ page }) => {
  await signIntoDemo(page)
  const suffix = Date.now().toString().slice(-8)
  const orderWrites: string[] = []
  const customerWrites: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^\/api\/laundry\/orders(?:\/|$)/.test(url.pathname) && request.method() !== 'GET') {
      orderWrites.push(`${request.method()} ${url.pathname}`)
    }
    if (/^\/api\/laundry\/customers\/[^/]+(?:\/addresses(?:\/|$)|\/wallet$|\/rewards$)?/.test(url.pathname) && request.method() !== 'GET') {
      customerWrites.push(`${request.method()} ${url.pathname}`)
    }
  })

  const name = `Phase customer ${suffix}`
  const customerId = await addCustomer(page, name, `9${suffix}0`)
  await expect(page.getByText('No orders yet', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('No saved addresses yet')).toBeVisible()

  await page.getByRole('button', { name: 'Customer ledger' }).click()
  await expect(page.getByText('No customer activity yet')).toBeVisible()
  await page.getByRole('button', { name: 'Wallet history' }).click()
  await expect(page.getByText('No wallet movements yet')).toBeVisible()
  await page.getByRole('button', { name: 'Timeline' }).click()

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill(`${name} updated`)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  expect(customerWrites.filter((request) => request.includes('PATCH'))).toHaveLength(0)

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill(`${name} updated`)
  await page.getByRole('button', { name: 'Save customer changes' }).click()
  await expect(page.getByRole('heading', { name: `${name} updated`, exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Add address' }).click()
  await page.getByLabel('Address line 1').fill('12 Disposable Test Lane')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('No saved addresses yet')).toBeVisible()
  expect(customerWrites.some((request) => request.includes('/addresses'))).toBe(false)

  await page.getByRole('button', { name: 'Add address' }).click()
  await page.getByLabel('Label').fill('Test pickup')
  await page.getByLabel('Address line 1').fill('12 Disposable Test Lane')
  await page.getByLabel('City').fill('Kolkata')
  await page.getByRole('button', { name: 'Save address' }).click()
  await expect(page.getByText('12 Disposable Test Lane, Kolkata')).toBeVisible()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Archive this saved address')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByText('12 Disposable Test Lane, Kolkata')).toBeVisible()
  page.once('dialog', async (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByText('No saved addresses yet')).toBeVisible()

  await page.getByLabel('Wallet amount in rupees').fill('25.50')
  await page.getByLabel('Wallet adjustment reason').fill('Disposable audit credit')
  await page.getByRole('button', { name: 'Credit wallet' }).click()
  await expect(page.getByText('₹25.50', { exact: true })).toBeVisible()
  await page.getByLabel('Wallet amount in rupees').fill('5')
  await page.getByLabel('Wallet adjustment reason').fill('Disposable audit debit')
  await page.getByRole('button', { name: 'Debit wallet' }).click()
  await expect(page.getByText('₹20.50', { exact: true })).toBeVisible()
  await expect(page.getByText('Order balance', { exact: true }).locator('..').getByText('₹0', { exact: true })).toBeVisible()

  await page.getByLabel('Reward points adjustment').fill('5')
  await page.getByLabel('Reward adjustment reason').fill('Disposable audit reward')
  await page.getByRole('button', { name: 'Save reward adjustment' }).click()
  await expect(page.getByText('Reward points', { exact: true }).locator('..').getByText('5', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Wallet history' }).click()
  await expect(page.getByText('Wallet Credit')).toBeVisible()
  await expect(page.getByText('Disposable audit credit')).toBeVisible()
  await page.getByRole('button', { name: 'Timeline' }).click()
  await expect(page.getByText('Wallet Credit', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Wallet Debit', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Reward adjustment', { exact: true })).toBeVisible()

  expect(orderWrites).toEqual([])
  expect(customerWrites.some((request) => request.includes('/wallet'))).toBe(true)
  expect(customerWrites.some((request) => request.includes('/rewards'))).toBe(true)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: `${name} updated`, exact: true })).toBeVisible()
  await expect(page.getByText('₹20.50', { exact: true })).toBeVisible()
  await expect(page.getByText('Reward points', { exact: true }).locator('..').getByText('5', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1366, height: 900 })
  await capture(page, 'customer-workspace-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await capture(page, 'customer-workspace-mobile')

  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard', { waitUntil: 'domcontentloaded' })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.getByRole('button', { name: /Search customer/i }).click()
  await page.getByRole('textbox', { name: 'Customer name or phone' }).fill(`${name} updated`)
  await page.getByRole('button', { name: `Open profile for ${name} updated` }).click()
  const customerDrawer = page.getByRole('dialog')
  await expect(customerDrawer.getByRole('link', { name: 'Open full customer profile' })).toBeVisible()
  await capture(page, 'customer-work-card-drawer-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await capture(page, 'customer-work-card-drawer-mobile')
  await customerDrawer.getByRole('link', { name: 'Open full customer profile' }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/laundry\\/customers\\/${customerId}$`))
  await expect(page.getByRole('heading', { name: `${name} updated`, exact: true })).toBeVisible()
})

test('customer detail visibility follows customer and finance permissions', async ({ page }) => {
  await signIntoDemo(page)
  const suffix = Date.now().toString().slice(-7)
  const customerId = await addCustomer(page, `Role customer ${suffix}`, `8${suffix}00`)

  const createStaff = async (role: 'counter_staff' | 'processing_staff') => {
    const username = `cust.${role}.${suffix}`
    const password = `CustRole!${suffix}Aa`
    const response = await page.evaluate(async ({ username, password, role }) => {
      const result = await fetch('/api/settings/staff', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, roles: [role], firstName: 'Customer', lastName: role, email: `${username}@example.test` }),
      })
      return { status: result.status, body: await result.json() }
    }, { username, password, role })
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    return { username, password }
  }
  const counter = await createStaff('counter_staff')
  const processing = await createStaff('processing_staff')

  const signInStaff = async (staff: { username: string; password: string }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in with your LNDRY vendor number' })).toBeVisible()
    await page.goto('/ui/app/?local-demo=1', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Demo access')).toBeVisible()
    await page.getByRole('textbox', { name: 'Username' }).fill(staff.username)
    await page.getByRole('textbox', { name: 'Password' }).fill(staff.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
  }

  await signInStaff(counter)
  await page.goto(`/ui/app/?local-demo=1#/laundry/customers/${customerId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Customer work card', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add address' })).toBeVisible()
  await expect(page.getByText('Account adjustments', { exact: true })).toHaveCount(0)
  const deniedWallet = await page.evaluate(async (id) => {
    const response = await fetch(`/api/laundry/customers/${id}/wallet`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Credit', amount: 1, reason: 'must be denied' }),
    })
    return response.status
  }, customerId)
  expect(deniedWallet).toBe(403)

  await signInStaff(processing)
  await page.goto(`/ui/app/?local-demo=1#/laundry/customers/${customerId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This workspace is not assigned to your role.' })).toBeVisible()
  const deniedProfile = await page.evaluate(async (id) => {
    const response = await fetch(`/api/laundry/customers/${id}`, { credentials: 'same-origin' })
    return response.status
  }, customerId)
  expect(deniedProfile).toBe(403)
})
