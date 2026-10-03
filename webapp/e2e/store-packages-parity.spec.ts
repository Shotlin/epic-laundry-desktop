import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

test('Store Packages matches the observed add flow, limit groups and explicit save boundary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIntoDemo(page)
  const services = [
    { id: 'service-wash', name: 'Wash', active: true },
    { id: 'service-iron', name: 'Steam Iron', active: true },
    { id: 'service-inactive', name: 'Old Service', active: false },
  ]
  let packages: Array<Record<string, any>> = []
  const writes: Array<Record<string, unknown>> = []
  await page.route('**/api/laundry/settings/services', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(services) }))
  await page.route('**/api/settings/store-packages', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(packages) })
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, any>
      writes.push(body)
      const created = { id: 'store-package-1', ...body, services: body.serviceIds.map((id: string) => services.find((service) => service.id === id)), createdAt: '2026-09-30T00:00:00Z' }
      packages = [...packages, created]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.continue()
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/store-packages', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store Packages', exact: true })).toBeVisible()
  await expect(page.getByText('No Data Found')).toBeVisible()
  const pageSize = page.getByLabel('Items per page')
  await expect(pageSize).toHaveValue('100')
  expect(await pageSize.locator('option').allTextContents()).toEqual(['10', '20', '50', '100', '500'])
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
  await pageSize.selectOption('10')
  await pageSize.selectOption('100')
  await expect(page.getByText(/Package setup only/)).toBeVisible()
  await page.getByRole('button', { name: 'Add Store Package', exact: true }).first().click()
  let dialog = page.getByRole('dialog', { name: 'Add Store Package' })
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await dialog.getByLabel('Package Name').fill('Draft package')
  await dialog.getByLabel('Amount').fill('1200.50')
  await dialog.getByRole('button', { name: 'Select services' }).click()
  await expect(dialog.getByRole('button', { name: 'Select services' })).toHaveAttribute('aria-expanded', 'true')
  await dialog.getByRole('checkbox', { name: 'Wash' }).press('Escape')
  await expect(dialog.getByRole('button', { name: 'Select services' })).toHaveAttribute('aria-expanded', 'false')
  await dialog.getByRole('button', { name: 'Select services' }).click()
  await dialog.getByRole('checkbox', { name: 'Wash' }).check()
  await dialog.getByRole('checkbox', { name: 'Steam Iron' }).check()
  await expect(dialog.getByRole('checkbox', { name: 'Old Service' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Done choosing services' }).click()
  await dialog.getByRole('button', { name: 'Add Service-wise Usage Limit' }).click()
  await dialog.getByLabel('Quantity Limit for Wash').fill('12.5')
  await dialog.getByLabel('Amount Limit for Wash').fill('2500')
  await expect(dialog.getByLabel('Quantity Limit for Steam Iron')).toBeVisible()
  await dialog.getByRole('button', { name: '2 services selected' }).click()
  await dialog.getByRole('checkbox', { name: 'Steam Iron' }).uncheck()
  await expect(dialog.getByLabel('Quantity Limit for Steam Iron')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Done choosing services' }).click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toEqual([])
  await expect(page.getByText('No Data Found')).toBeVisible()

  await page.getByRole('button', { name: 'Add Store Package', exact: true }).first().click()
  dialog = page.getByRole('dialog', { name: 'Add Store Package' })
  await dialog.getByLabel('Package Name').fill('Wash plan')
  await dialog.getByLabel('Amount').fill('1200.50')
  await dialog.getByRole('button', { name: 'Select services' }).click()
  await dialog.getByRole('checkbox', { name: 'Wash' }).check()
  await dialog.getByRole('checkbox', { name: 'Steam Iron' }).check()
  await dialog.getByRole('button', { name: 'Done choosing services' }).click()
  await dialog.getByRole('button', { name: 'Add Service-wise Usage Limit' }).click()
  await dialog.getByRole('button', { name: 'Remove Limits' }).click()
  await expect(dialog.getByLabel('Quantity Limit for Wash')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Add Service-wise Usage Limit' }).click()
  await dialog.getByLabel('Quantity Limit for Wash').fill('10')
  await dialog.getByLabel('Amount Limit for Wash').fill('1500.25')
  await dialog.getByLabel('Quantity Limit for Steam Iron').fill('4')
  await dialog.getByLabel('Amount Limit for Steam Iron').fill('900')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Store Package added.')).toBeVisible()
  await expect(page.getByText('Showing 1–1 of 1')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Wash plan' })).toBeVisible()
  await expect(page.getByRole('cell', { name: /₹1,200.50/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2 service limit groups' })).toBeVisible()
  expect(writes).toEqual([{
    name: 'Wash plan', amount: 1200.5, serviceIds: ['service-wash', 'service-iron'], limitsEnabled: true,
    serviceLimits: [
      { serviceId: 'service-wash', quantityLimit: 10, amountLimit: 1500.25 },
      { serviceId: 'service-iron', quantityLimit: 4, amountLimit: 900 },
    ],
  }])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Back to Settings' }).click()
  await expect(page).toHaveURL(/#\/laundry\/settings$/)
  await expect(page.getByRole('link', { name: 'Store Packages' })).toBeVisible()
})
