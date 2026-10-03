import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Services follows the source add and view-edit flow with searchable rows and protected reversible switch-off', async ({ page }) => {
  await signIntoDemo(page)
  let services = [
    { id: 'svc-used', name: 'Dry Cleaning', description: 'Protects current price rules', units: ['Piece'], active: true, usageCount: 3 },
    { id: 'svc-free', name: 'Steam Iron', description: '', units: ['Piece', 'Pair'], active: true, usageCount: 0 },
    { id: 'svc-off', name: 'Old Service', description: '', units: ['Piece'], active: false, usageCount: 0 },
  ]
  const writes: Array<{ method: string; body: Record<string, unknown> }> = []
  await page.route('**/api/laundry/settings/services', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(services) })
    return route.continue()
  })
  await page.route('**/api/laundry/catalogue/services', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push({ method: 'POST', body })
    const created = { id: 'svc-custom', ...body, usageCount: 0 }
    services = [...services, created as typeof services[number]]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
  })
  await page.route('**/api/laundry/catalogue/services/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push({ method: 'PATCH', body })
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    const updated = { ...services.find((row) => row.id === id)!, ...body }
    services = services.map((row) => row.id === id ? updated as typeof row : row)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/services', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/laundry\/settings\/services$/)
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible()
  await expect(page.getByText(/Showing 1–3 of 3/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch off Dry Cleaning', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Restore Old Service', exact: true })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search services' }).fill('steam')
  await expect(page.getByRole('heading', { name: 'Steam Iron', exact: true })).toBeVisible()
  await expect(page.getByText(/Showing 1–1 of 1/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dry Cleaning', exact: true })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search services' }).fill('zzzz')
  await expect(page.getByText('No Data Found')).toBeVisible()
  await expect(page.getByLabel('Items per page')).toBeHidden()
  await page.getByRole('button', { name: 'Clear service search' }).click()

  await page.getByRole('button', { name: 'Add Service', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Add Service' })
  const name = dialog.getByLabel('Service *')
  await expect(name).toHaveAttribute('maxlength', '100')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await name.fill('Draft only')
  await expect(dialog.getByText('10/100', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Add Service', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Add Service' })
  await dialog.getByLabel('Service *').fill('Weekend Care')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Weekend Care', exact: true })).toBeVisible()
  expect(writes[0]).toEqual({ method: 'POST', body: { name: 'Weekend Care' } })

  await page.getByRole('button', { name: 'View Weekend Care' }).click()
  const details = page.getByRole('dialog', { name: 'View Service' })
  await expect(details.getByText('Weekend Care', { exact: true })).toBeVisible()
  await details.getByRole('button', { name: 'Edit Service', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Service' })
  await expect(dialog.getByLabel('Service *')).toHaveValue('Weekend Care')
  await dialog.getByLabel('Service *').fill('Weekend and Express Care')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Weekend and Express Care', exact: true })).toBeVisible()
  expect(writes[1]).toEqual({ method: 'PATCH', body: { name: 'Weekend and Express Care', description: '', image: '', active: true } })

  await page.getByRole('button', { name: 'Switch off Weekend and Express Care', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Switch off Weekend and Express Care?' })
  await expect(confirm.getByText(/stays in Settings and you can restore it later/)).toBeVisible()
  await confirm.getByRole('button', { name: 'Switch off service', exact: true }).click()
  await expect(page.getByText('Switched off', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Restore Weekend and Express Care', exact: true }).click()
  await expect(page.getByText('Service restored for new orders.')).toBeVisible()
  expect(writes.map((entry) => entry.method)).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH'])
  expect(writes[2].body.active).toBe(false)
  expect(writes[3].body.active).toBe(true)
})

test('Services settings API returns branch records and opening/canceling Add does not write', async ({ page }) => {
  await signIntoDemo(page)
  let serviceWrites = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/laundry/catalogue/services') serviceWrites += 1
  })
  const listResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/settings/services' && response.request().method() === 'GET')
  await page.goto('/ui/app/?local-demo=1#/laundry/settings/services', { waitUntil: 'domcontentloaded' })
  const response = await listResponse
  expect(response.status()).toBe(200)
  const records = await response.json() as Array<{ id: string; name: string; usageCount: number; active: boolean }>
  expect(records.length).toBeGreaterThan(0)
  expect(records.every((service) => service.id && service.name && Number.isInteger(service.usageCount))).toBe(true)
  await expect(page.getByText(`${records.length} services, including switched-off services`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add Service', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Service' })
  await expect(dialog.getByLabel('Service *')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(serviceWrites).toBe(0)
})
