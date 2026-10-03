import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

test('Store Users follows the source view-edit flow with explicit access confirmation and safe password handling', async ({ page }) => {
  await signIntoDemo(page)
  let users = [{ id: 'staff-counter', username: 'counter.one', roles: ['counter_staff'], enabled: true, firstName: 'Counter', lastName: 'One', email: 'counter@example.test', phone: '9000000001', description: 'Front desk', createdAt: '2026-09-01T00:00:00Z' }]
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  await page.route('**/api/laundry/riders', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

  await page.route('**/api/settings/staff', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(users) })
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      writes.push({ method: 'POST', path: '/settings/staff', body })
      const created = { id: 'staff-new', ...body, enabled: true, createdAt: '2026-09-29T00:00:00Z' }
      users = [...users, created as typeof users[number]]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.continue()
  })
  await page.route('**/api/settings/staff/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api', '')
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>
      writes.push({ method: 'PATCH', path, body })
      const id = path.split('/').at(-1)!
      const updated = { ...users.find((user) => user.id === id)!, ...body }
      users = users.map((user) => user.id === id ? updated as typeof user : user)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
    }
    if (request.method() === 'POST' && path.endsWith('/enabled')) {
      const body = request.postDataJSON() as { enabled: boolean }
      writes.push({ method: 'POST', path, body })
      const id = path.split('/').at(-2)!
      const updated = { ...users.find((user) => user.id === id)!, enabled: body.enabled }
      users = users.map((user) => user.id === id ? updated as typeof user : user)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
    }
    if (request.method() === 'POST' && path.endsWith('/reset-password')) {
      const body = request.postDataJSON() as Record<string, unknown>
      writes.push({ method: 'POST', path, body })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.continue()
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/store-users', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/laundry\/settings\/store-users$/)
  await expect(page.getByRole('heading', { name: 'Store Users', exact: true })).toBeVisible()
  await expect(page.getByText('Showing 1–1 of 1')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search users' }).fill('counter')
  await expect(page.getByText('Counter One', { exact: true })).toBeVisible()
  await expect(page.getByText('No Data Found')).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search users' }).fill('missing user')
  await expect(page.getByText('No Data Found')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()

  await page.getByRole('button', { name: 'Add User', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Add Store User' })
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await dialog.getByLabel('First Name').fill('Draft')
  await dialog.getByLabel('User Name').fill('draft.only')
  await dialog.getByLabel('Password').fill('this-is-a-temporary-password')
  await dialog.getByLabel('Phone').fill('9000000099')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Add User', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Add Store User' })
  await dialog.getByLabel('First Name').fill('New')
  await dialog.getByLabel('Last Name').fill('Member')
  await dialog.getByLabel('User Name').fill('new.member')
  await dialog.getByLabel('Password').fill('a-temporary-password-123')
  await dialog.getByLabel('Email').fill('new.member@example.test')
  await dialog.getByLabel('Phone').fill('9000000002')
  await dialog.getByLabel('Role').selectOption('rider')
  await expect(dialog.getByLabel('Link active Captain')).toBeVisible()
  await expect(dialog.getByText('No active Captains are available. Add a Captain record first.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await dialog.getByLabel('Role').selectOption('owner')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: /Owner access is broad/ }).check()
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await dialog.getByRole('checkbox', { name: /Owner access is broad/ }).uncheck()
  await dialog.getByLabel('Role').selectOption('processing_staff')
  await dialog.getByLabel('Description / designation').fill('Finishing desk')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Store user added.')).toBeVisible()
  await expect(page.getByText('New Member', { exact: true })).toBeVisible()
  expect(writes[0]).toEqual({
    method: 'POST', path: '/settings/staff', body: {
      username: 'new.member', password: 'a-temporary-password-123', roles: ['processing_staff'],
      firstName: 'New', lastName: 'Member', email: 'new.member@example.test', phone: '9000000002', description: 'Finishing desk', riderId: '',
    },
  })

  await page.getByRole('button', { name: 'View New Member' }).click()
  const details = page.getByRole('dialog', { name: 'View User' })
  await expect(details.getByText('new.member@example.test')).toBeVisible()
  await expect(details.getByText('Finishing desk')).toBeVisible()
  await expect(details.locator('input[type="password"]')).toHaveCount(0)
  await details.getByRole('button', { name: 'Edit User', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Store User' })
  await expect(dialog.getByLabel('User Name')).toBeDisabled()
  await dialog.getByLabel('Role').selectOption('counter_staff')
  await dialog.getByLabel('Description / designation').fill('Counter and finishing')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Store user updated.')).toBeVisible()
  expect(writes[1]).toEqual({ method: 'PATCH', path: '/settings/staff/staff-new', body: {
    firstName: 'New', lastName: 'Member', email: 'new.member@example.test', phone: '9000000002',
    description: 'Counter and finishing', roles: ['counter_staff'], riderId: undefined,
  } })

  await page.getByRole('button', { name: 'Disable access for New Member' }).click()
  const accessConfirm = page.getByRole('alertdialog', { name: 'Disable access for New Member?' })
  await expect(accessConfirm.getByText(/cannot sign in until access is enabled again/)).toBeVisible()
  await accessConfirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toHaveLength(2)
  await page.getByRole('button', { name: 'Disable access for New Member' }).click()
  await page.getByRole('alertdialog', { name: 'Disable access for New Member?' }).getByRole('button', { name: 'Confirm disable', exact: true }).click()
  await expect(page.getByText('Sign-in access switched off.')).toBeVisible()
  expect(writes[2]).toEqual({ method: 'POST', path: '/settings/staff/staff-new/enabled', body: { enabled: false } })
})

test('Store Users page reads branch members and its Settings link navigates to the familiar workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIntoDemo(page)
  const get = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/settings/staff' && response.request().method() === 'GET')
  await page.goto('/ui/app/?local-demo=1#/laundry/settings/store-users', { waitUntil: 'domcontentloaded' })
  expect((await get).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Branch access' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Back to Settings' }).click()
  await expect(page).toHaveURL(/#\/laundry\/settings$/)
  await expect(page.getByRole('link', { name: 'Store Users' })).toBeVisible()
})
