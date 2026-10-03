import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Categories follows the source add and view-edit flow with searchable rows and reversible switch off', async ({ page }) => {
  await signIntoDemo(page)
  let categories = [
    { id: 'cat-mens', name: "Men's Wear", active: true, usageCount: 4, sort_order: 1 },
    { id: 'cat-household', name: 'Household', active: true, usageCount: 0, sort_order: 2 },
    { id: 'cat-off', name: 'Old category', active: false, usageCount: 0, sort_order: 3 },
  ]
  const writes: Array<{ method: string; body: Record<string, unknown> }> = []
  await page.route('**/api/laundry/settings/categories', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(categories) })
    return route.continue()
  })
  await page.route('**/api/laundry/catalogue/categories', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push({ method: 'POST', body })
    const created = { id: 'cat-custom', ...body, usageCount: 0, sort_order: Number(body.sortOrder || 0) }
    categories = [...categories, created as typeof categories[number]]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
  })
  await page.route('**/api/laundry/catalogue/categories/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push({ method: 'PATCH', body })
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    const updated = { ...categories.find((row) => row.id === id)!, ...body }
    categories = categories.map((row) => row.id === id ? updated as typeof row : row)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/categories', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/laundry\/settings\/categories$/)
  await expect(page.getByRole('heading', { name: 'Categories', exact: true })).toBeVisible()
  await expect(page.getByText(/Showing 1–3 of 3/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch off Men\'s Wear', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Restore Old category', exact: true })).toBeVisible()
  await expect(page.getByLabel('Items per page').locator('option').allTextContents()).resolves.toEqual(['10', '20', '50', '100', '500'])

  await page.getByRole('searchbox', { name: 'Search categories' }).fill('house')
  await expect(page.getByText('Household', { exact: true })).toBeVisible()
  await expect(page.getByText(/Showing 1–1 of 1/)).toBeVisible()
  await expect(page.getByText("Men's Wear", { exact: true })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search categories' }).fill('zzzz')
  await expect(page.getByText('No Data Found')).toBeVisible()
  await expect(page.getByLabel('Items per page')).toBeHidden()
  await page.getByRole('button', { name: 'Clear category search' }).click()

  await page.getByRole('button', { name: 'Add Category', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Add Category' })
  const name = dialog.getByLabel('Category *')
  await expect(name).toHaveAttribute('maxlength', '100')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await name.fill('Draft only')
  await expect(dialog.getByText('10/100', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Add Category', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Add Category' })
  await dialog.getByLabel('Category *').fill('HOUSE HOLD')
  await expect(dialog.getByRole('alert')).toHaveText('A category with the same name ignoring case and spaces already exists.')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  expect(writes).toEqual([])
  await dialog.getByLabel('Category *').fill('Weekend Care')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Weekend Care', { exact: true })).toBeVisible()
  expect(writes[0]).toEqual({ method: 'POST', body: { name: 'Weekend Care' } })

  await page.getByRole('button', { name: 'View Weekend Care' }).click()
  const details = page.getByRole('dialog', { name: 'View Category' })
  await expect(details.getByText('Weekend Care', { exact: true })).toBeVisible()
  await details.getByRole('button', { name: 'Edit Category', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Category' })
  await expect(dialog.getByLabel('Category *')).toHaveValue('Weekend Care')
  await dialog.getByLabel('Category *').fill('Weekend and Express Care')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Weekend and Express Care', { exact: true })).toBeVisible()
  expect(writes[1]).toEqual({ method: 'PATCH', body: { name: 'Weekend and Express Care', color: '', image: '', sortOrder: 0, active: true, parentId: null } })

  await page.getByRole('button', { name: 'Switch off Weekend and Express Care', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Switch off Weekend and Express Care?' })
  await expect(confirm.getByText(/stays in Settings and you can restore it later/)).toBeVisible()
  await confirm.getByRole('button', { name: 'Switch off category', exact: true }).click()
  await expect(page.getByText('Switched off', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Restore Weekend and Express Care', exact: true }).click()
  await expect(page.getByText('Category restored for new orders.')).toBeVisible()
  expect(writes.map((entry) => entry.method)).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH'])
  expect(writes[2].body.active).toBe(false)
  expect(writes[3].body.active).toBe(true)
})

test('Categories settings API returns branch records and opening/canceling Add does not write', async ({ page }) => {
  await signIntoDemo(page)
  let categoryWrites = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/laundry/catalogue/categories') categoryWrites += 1
  })
  const listResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/settings/categories' && response.request().method() === 'GET')
  await page.goto('/ui/app/?local-demo=1#/laundry/settings/categories', { waitUntil: 'domcontentloaded' })
  const response = await listResponse
  expect(response.status()).toBe(200)
  const records = await response.json() as Array<{ id: string; name: string; usageCount: number; active: boolean }>
  expect(records.length).toBeGreaterThan(0)
  expect(records.every((category) => category.id && category.name && Number.isInteger(category.usageCount))).toBe(true)
  await expect(page.getByText(`${records.length} categories, including switched-off categories`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add Category', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Category' })
  await expect(dialog.getByLabel('Category *')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(categoryWrites).toBe(0)
})
