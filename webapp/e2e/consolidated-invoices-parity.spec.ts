import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('consolidated invoices defaults to Today and preserves the verified empty state', async ({ page }) => {
  await signIntoDemo(page)
  const reportRequests: URL[] = []
  let chartRequests = 0
  await page.route('**/api/laundry/reports/consolidated-invoices*', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/chart')) {
      chartRequests += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'consolidated-invoices', from: '2026-09-30', to: '2026-09-30', metric: 'Invoices', points: [] }) })
    }
    reportRequests.push(url)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'consolidated-invoices', from: url.searchParams.get('from'), to: url.searchParams.get('to'), columns: [], rows: [], totalRows: 0, page: 1, pageSize: 100, totalPages: 1 }),
    })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/reports/consolidated-invoices', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Consolidated Invoice Report', exact: true })).toBeVisible()
  const today = await page.evaluate(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
  const reportBy = page.getByRole('combobox', { name: 'Report by' })
  const from = page.getByRole('textbox', { name: 'From', exact: true })
  const to = page.getByRole('textbox', { name: 'To', exact: true })
  await expect(reportBy).toHaveValue('today')
  await expect(from).toHaveValue(today)
  await expect(to).toHaveValue(today)
  await expect(from).toBeDisabled()
  await expect(to).toBeDisabled()
  await expect(reportBy.locator('option')).toHaveText(['Today', 'Yesterday', 'Week', 'Month', 'Year', 'Custom'])
  await expect(page.getByText('No Data Found', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apply Filter', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Filter rows', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Page PDF', exact: true })).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Consolidated Invoice Report by period' })).toHaveCount(0)
  await expect.poll(() => reportRequests.at(-1)?.searchParams.get('from')).toBe(today)
  await expect.poll(() => reportRequests.at(-1)?.searchParams.get('to')).toBe(today)
  expect(chartRequests).toBe(0)

  await reportBy.selectOption('custom')
  await expect(from).toBeEnabled()
  await expect(to).toBeEnabled()
  await from.fill('2026-08-01')
  await to.fill('2026-08-10')
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click()
  await expect.poll(() => reportRequests.at(-1)?.searchParams.get('from')).toBe('2026-08-01')
  await expect.poll(() => reportRequests.at(-1)?.searchParams.get('to')).toBe('2026-08-10')
  await expect(reportBy).toHaveValue('custom')
  await expect(from).toHaveValue('2026-08-01')
  await expect(to).toHaveValue('2026-08-10')
  await expect(page.getByText('No Data Found', { exact: true })).toBeVisible()
  expect(chartRequests).toBe(0)
})
