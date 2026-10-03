import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Store Charges and Store Discounts use source page sizes and paginate large rule lists', async ({ page }) => {
  await signIntoDemo(page)
  const charges = Array.from({ length: 12 }, (_value, index) => ({
    id: `charge-${index + 1}`, name: `Charge ${index + 1}`, type: index % 2 ? 'Flat' : 'Percentage', amount: index + 1,
    expressCharge: index % 2 === 0, description: '', active: true,
  }))
  const discounts = Array.from({ length: 12 }, (_value, index) => ({
    id: `discount-${index + 1}`, name: `Discount ${index + 1}`, type: index % 2 ? 'Flat' : 'Percentage', amount: index + 1,
    description: '', active: true,
  }))
  await page.route('**/api/laundry/catalogue/charges', async (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charges) })
    : route.continue())
  await page.route('**/api/laundry/catalogue/discounts', async (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(discounts) })
    : route.continue())

  const pageSizes = ['10', '20', '50', '100', '500']
  for (const [path, heading, firstItem, lastItem] of [
    ['/laundry/settings/charges', 'Store Charges', 'Charge 1', 'Charge 12'],
    ['/laundry/settings/discounts', 'Store Discounts', 'Discount 1', 'Discount 12'],
  ]) {
    await page.goto(`/ui/app/?local-demo=1#${path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    const pageSize = page.getByRole('combobox', { name: 'Items per page' })
    await expect(pageSize).toHaveValue('100')
    await expect(pageSize.locator('option')).toHaveText(pageSizes)
    await expect(page.getByText('Showing 1–12 of 12')).toBeVisible()
    await pageSize.selectOption('10')
    await expect(page.getByText('Showing 1–10 of 12')).toBeVisible()
    await expect(page.getByRole('cell', { name: firstItem, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: lastItem, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText('Showing 11–12 of 12')).toBeVisible()
    await expect(page.getByRole('cell', { name: lastItem, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
  }
})
