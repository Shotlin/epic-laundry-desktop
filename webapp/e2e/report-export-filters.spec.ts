import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('collection Export all carries the active table date, view, method and search filters', async ({ page }) => {
  await signIntoDemo(page)
  const tableRequests: URL[] = []
  const exportRequests: URL[] = []

  await page.route(/\/api\/laundry\/reports\/collection\/chart(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'collection', from: url.searchParams.get('from'), to: url.searchParams.get('to'), metric: 'collection amount', points: [] }),
    })
  })

  await page.route(/\/api\/laundry\/reports\/collection\/export(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    exportRequests.push(url)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'collection', from: url.searchParams.get('from'), to: url.searchParams.get('to'),
        columns: ['invoiceNumber', 'amount', 'method', 'date'],
        rows: [
          { invoiceNumber: 'INV-777', amount: 250, method: 'UPI', date: '2026-09-12' },
          { invoiceNumber: 'INV-778', amount: 300, method: 'UPI', date: '2026-09-13' },
        ],
        totalRows: 2, page: 1, pageSize: 100, totalPages: 1, exportAll: true,
      }),
    })
  })

  await page.route(/\/api\/laundry\/reports\/collection(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    tableRequests.push(url)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'collection', from: url.searchParams.get('from'), to: url.searchParams.get('to'),
        columns: ['invoiceNumber', 'amount', 'method', 'date'],
        rows: [{ invoiceNumber: 'INV-777', amount: 250, method: 'UPI', date: '2026-09-12' }],
        totalRows: 2, page: Number(url.searchParams.get('page') || 1), pageSize: Number(url.searchParams.get('pageSize') || 100), totalPages: 2,
        summary: { label: 'Collection Amount', value: 550, format: 'currency' },
      }),
    })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/reports/collection', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Collection Report', exact: true })).toBeVisible()

  await page.getByRole('combobox', { name: 'Report by' }).selectOption('custom')
  await page.getByLabel('From', { exact: true }).fill('2026-09-10')
  await page.getByLabel('To', { exact: true }).fill('2026-09-20')
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await page.getByRole('combobox', { name: 'Payment method' }).selectOption('UPI')
  await page.getByRole('textbox', { name: 'Search invoice or order' }).fill('INV-77')

  await expect.poll(() => tableRequests.at(-1)?.searchParams.get('from')).toBe('2026-09-10')
  await expect.poll(() => tableRequests.at(-1)?.searchParams.get('to')).toBe('2026-09-20')
  await expect.poll(() => tableRequests.at(-1)?.searchParams.get('paymentMethod')).toBe('UPI')
  await expect.poll(() => tableRequests.at(-1)?.searchParams.get('search')).toBe('INV-77')
  await expect(page.getByText('INV-777')).toBeVisible()

  const downloadReady = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all', exact: true }).click()
  const download = await downloadReady
  expect(download.suggestedFilename()).toContain('collection-report')
  await expect.poll(() => exportRequests.length).toBe(1)
  expect(exportRequests[0].searchParams.get('from')).toBe('2026-09-10')
  expect(exportRequests[0].searchParams.get('to')).toBe('2026-09-20')
  expect(exportRequests[0].searchParams.get('view')).toBe('invoice')
  expect(exportRequests[0].searchParams.get('paymentMethod')).toBe('UPI')
  expect(exportRequests[0].searchParams.get('search')).toBe('INV-77')
  await expect(page.getByText('Exported 2 rows.')).toBeVisible()
})
