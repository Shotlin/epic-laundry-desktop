import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Garment Pricing filters and pages catalogue rules without changing them', async ({ page }) => {
  await signIntoDemo(page)
  await page.route('**/api/laundry/catalogue', async (route) => {
    const response = await route.fetch()
    const catalogue = await response.json()
    const garments = Array.from({ length: 12 }, (_, index) => ({
      id: `price-filter-garment-${index + 1}`,
      name: `Shirt ${String(index + 1).padStart(2, '0')}`,
      category: 'price-filter-category',
      categoryName: 'Everyday',
      unit: index % 2 === 0 ? 'Piece' : 'Kilogram',
      active: true,
    }))
    const services = [
      { id: 'price-filter-wash', name: 'Wash & Fold', units: ['Piece', 'Kilogram'], active: true },
      { id: 'price-filter-dry', name: 'Dry Cleaning', units: ['Piece', 'Kilogram'], active: true },
    ]
    const prices = garments.map((garment, index) => ({
      id: `price-filter-rule-${index + 1}`,
      garment: garment.id,
      service: index < 6 ? 'price-filter-wash' : 'price-filter-dry',
      customer: index === 0 ? 'price-filter-customer' : undefined,
      garmentName: garment.name,
      serviceName: index < 6 ? (index === 0 ? 'WASH & FOLD' : 'Wash & Fold') : (index === 6 ? 'DRY_CLEANING' : 'Dry Cleaning'),
      rate: 100 + index,
      active: index !== 11,
    }))
    await route.fulfill({ response, json: { ...catalogue, categories: [{ id: 'price-filter-category', name: 'Everyday', active: true }], services, garments, prices, serviceUnits: ['Piece', 'Kilogram'] } })
  })

  let catalogueWrites = 0
  page.on('request', (request) => {
    if (/\/api\/laundry\/catalogue(?:\/|\?|$)/.test(request.url()) && !['GET', 'HEAD'].includes(request.method())) catalogueWrites += 1
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/catalogue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Garment price matrix' })).toBeVisible()
  await expect(page.getByText('Showing 1–12 of 12 price rules')).toBeVisible()
  await expect(page.getByRole('table').getByRole('columnheader', { name: 'Category', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /Shirt 01.*Wash & Fold.*Quantity.*Everyday/ })).toBeVisible()
  await expect(page.getByLabel('Service').getByRole('option', { name: 'Wash & Fold', exact: true })).toHaveCount(1)
  await expect(page.getByRole('row', { name: /Shirt 07.*Dry Cleaning.*Quantity.*Everyday/ })).toBeVisible()

  await page.getByLabel('Items per page').selectOption('10')
  await expect(page.getByText('Showing 1–10 of 12 price rules')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(11)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Showing 11–12 of 12 price rules')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(3)

  await page.getByLabel('Service', { exact: true }).selectOption({ label: 'Dry Cleaning' })
  await expect(page.getByText('Showing 1–6 of 6 price rules')).toBeVisible()
  await page.getByLabel('Service unit').selectOption('Kilogram')
  await expect(page.getByText('Showing 1–3 of 3 price rules')).toBeVisible()
  await page.getByLabel('Status', { exact: true }).selectOption('disabled')
  await expect(page.getByText('Showing 1–1 of 1 price rules')).toBeVisible()
  await expect(page.getByRole('row', { name: /Shirt 12.*Dry Cleaning.*Kilogram/ })).toBeVisible()

  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await expect(page.getByText('Showing 1–10 of 12 price rules')).toBeVisible()
  await expect(page.getByLabel('Service', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Service unit', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('all')
  await page.getByRole('combobox', { name: 'Garment' }).fill('Shirt 01')
  await expect(page.getByRole('listbox', { name: 'Matching garments' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Shirt 01 1 price' })).toBeVisible()
  await page.getByRole('option', { name: 'Shirt 01 1 price' }).click()
  await expect(page.getByText('Showing 1–1 of 1 price rules')).toBeVisible()
  await expect(page.getByRole('row', { name: /Shirt 01.*Wash & Fold/ })).toBeVisible()
  await page.getByRole('button', { name: 'Clear garment filter' }).click()
  await expect(page.getByText('Showing 1–10 of 12 price rules')).toBeVisible()
  await page.getByRole('combobox', { name: 'Garment' }).fill('Shirt 02')
  await page.getByRole('combobox', { name: 'Garment' }).press('ArrowDown')
  await page.getByRole('combobox', { name: 'Garment' }).press('Enter')
  await expect(page.getByText('Showing 1–1 of 1 price rules')).toBeVisible()
  await expect(page.getByRole('row', { name: /Shirt 02.*Wash & Fold/ })).toBeVisible()
  await page.getByRole('button', { name: 'Clear garment filter' }).click()
  await expect(page.getByText('Showing 1–10 of 12 price rules')).toBeVisible()
  expect(catalogueWrites).toBe(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('combobox', { name: 'Garment' })).toBeVisible()
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(1)
})
