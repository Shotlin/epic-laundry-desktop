import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Service Units mirrors the source add and view-edit flow with guarded archive and catalogue options', async ({ page }) => {
  await signIntoDemo(page)
  let units = [
    { id: 'builtin:Piece', value: 'Piece', fullName: 'Quantity', shortName: 'Qty', active: true, builtIn: true, usageCount: 12 },
    { id: 'builtin:Kilogram', value: 'Kilogram', fullName: 'Kilogram', shortName: 'Kg', active: true, builtIn: true, usageCount: 2 },
    { id: 'builtin:Square Foot', value: 'Square Foot', fullName: 'Sq.Ft', shortName: 'Sq.Ft', active: true, builtIn: true, usageCount: 1 },
    { id: 'builtin:Pair', value: 'Pair', fullName: 'Pair', shortName: 'Pair', active: true, builtIn: true, usageCount: 3 },
  ]
  const writes: Array<{ method: string; body: Record<string, unknown> }> = []
  await page.route('**/api/laundry/settings/service-units', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(units) })
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      writes.push({ method: 'POST', body })
      const created = { id: 'unit-synthetic-bundle', value: String(body.fullName), fullName: String(body.fullName), shortName: String(body.shortName), active: true, builtIn: false, usageCount: 0 }
      units = [...units, created]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.continue()
  })
  await page.route('**/api/laundry/settings/service-units/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push({ method: 'PATCH', body })
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    const previous = units.find((unit) => unit.id === id)!
    const updated = {
      ...previous,
      ...(typeof body.fullName === 'string' ? { fullName: body.fullName } : {}),
      ...(typeof body.shortName === 'string' ? { shortName: body.shortName } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
      value: previous.builtIn ? previous.value : String(body.fullName || previous.fullName),
    }
    units = units.map((unit) => unit.id === id ? updated : unit)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/service-units', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/laundry\/settings\/service-units$/)
  await expect(page.getByRole('heading', { name: 'Service Units', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unit list', exact: true })).toBeVisible()
  for (const name of ['Quantity', 'Kilogram', 'Sq.Ft', 'Pair']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Add Unit', exact: true }).first().click()
  let dialog = page.getByRole('dialog', { name: 'Add Service Unit' })
  const fullName = dialog.getByLabel(/Full Unit Name/)
  const shortName = dialog.getByLabel(/Short Unit Name/)
  await expect(fullName).toHaveAttribute('maxlength', '100')
  await expect(shortName).toHaveAttribute('maxlength', '10')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await fullName.fill('Draft only')
  await shortName.fill('Drf')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Add Unit', exact: true }).first().click()
  dialog = page.getByRole('dialog', { name: 'Add Service Unit' })
  await dialog.getByLabel(/Full Unit Name/).fill('Bundle')
  await dialog.getByLabel(/Short Unit Name/).fill('Bdl')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bundle', exact: true })).toBeVisible()
  expect(writes).toEqual([{ method: 'POST', body: { fullName: 'Bundle', shortName: 'Bdl' } }])

  await page.getByRole('button', { name: 'View unit', exact: true }).last().click()
  const details = page.getByRole('dialog', { name: 'View Unit' })
  await expect(details.getByText('Bundle', { exact: true })).toBeVisible()
  await details.getByRole('button', { name: 'Edit Service Unit', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Service Unit' })
  await expect(dialog.getByLabel(/Full Unit Name/)).toHaveValue('Bundle')
  await dialog.getByLabel(/Full Unit Name/).fill('Parcel')
  await dialog.getByLabel(/Short Unit Name/).fill('Pcl')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Parcel', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Archive', exact: true }).last().click()
  await page.getByRole('dialog', { name: 'Archive Parcel?' }).getByRole('button', { name: 'Archive Unit', exact: true }).click()
  await expect(page.getByText('Archived', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Parcel', exact: true })).toBeVisible()
  expect(writes.map((entry) => entry.method)).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH'])
  expect(writes[1].body).toEqual({ fullName: 'Parcel', shortName: 'Pcl' })
  expect(writes[2].body).toEqual({ active: false })
  expect(writes[3].body).toEqual({ active: true })

})

test('Service Units uses the source page-size choices and keeps large lists navigable', async ({ page }) => {
  await signIntoDemo(page)
  const units = Array.from({ length: 12 }, (_value, index) => ({
    id: `unit-${index + 1}`,
    value: `Unit ${index + 1}`,
    fullName: `Unit ${index + 1}`,
    shortName: `U${index + 1}`,
    active: true,
    builtIn: index < 4,
    usageCount: 0,
  }))
  await page.route('**/api/laundry/settings/service-units', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(units) })
    return route.continue()
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/service-units', { waitUntil: 'domcontentloaded' })
  const pageSize = page.getByRole('combobox', { name: 'Items per page' })
  await expect(pageSize).toHaveValue('100')
  await expect(pageSize.locator('option')).toHaveText(['10', '20', '50', '100', '500'])
  await expect(page.getByText('Showing 1–12 of 12')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()

  await pageSize.selectOption('10')
  await expect(page.getByText('Showing 1–10 of 12')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unit 10', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unit 11', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('Showing 11–12 of 12')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unit 11', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unit 12', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
})
