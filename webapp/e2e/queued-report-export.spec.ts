import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

async function mockLargeInvoiceReport(page: Page) {
  await page.route(/\/api\/laundry\/reports\/invoice\/chart(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'invoice', from: url.searchParams.get('from'), to: url.searchParams.get('to'), metric: 'invoice amount', points: [] }),
    })
  })
  await page.route(/\/api\/laundry\/reports\/invoice(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'invoice', from: url.searchParams.get('from'), to: url.searchParams.get('to'),
        columns: ['invoiceNumber', 'amount'],
        rows: [{ invoiceNumber: 'INV-LARGE-001', amount: 123.45 }],
        totalRows: 6001, page: 1, pageSize: 100, totalPages: 61,
        summary: { label: 'Total Invoice Amount', value: 123.45, format: 'currency' },
      }),
    })
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/invoice?from=2026-09-01&to=2026-09-30&search=INV-LARGE', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Invoice Report', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'INV-LARGE-001', exact: true })).toBeVisible()
  await expect(page.getByText('6001', { exact: true })).toBeVisible()
}

test('large Export all queues, polls to completion and downloads the full CSV', async ({ page }) => {
  await signIntoDemo(page)
  await mockLargeInvoiceReport(page)

  let requestBody: Record<string, unknown> | undefined
  let pollCount = 0
  await page.route(/\/api\/laundry\/report-exports$/, async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'export-success', kind: 'invoice', status: 'Queued', totalRows: 0, fileName: null, error: null, expiresAt: null }) })
  })
  await page.route(/\/api\/laundry\/report-exports\/export-success$/, async (route) => {
    pollCount += 1
    const status = pollCount === 1 ? 'Running' : 'Completed'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'export-success', kind: 'invoice', status, totalRows: status === 'Completed' ? 6001 : 0, fileName: status === 'Completed' ? 'laundry-report-export-success.csv' : null, error: null, expiresAt: null }) })
  })
  await page.route(/\/api\/laundry\/report-exports\/export-success\/download$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      headers: { 'Content-Disposition': 'attachment; filename="laundry-report-export-success.csv"' },
      body: '\uFEFFinvoiceNumber,amount\r\nINV-LARGE-001,123.45\r\n',
    })
  })

  const downloadReady = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all', exact: true }).click()
  const download = await downloadReady
  expect(download.suggestedFilename()).toBe('laundry-report-export-success.csv')
  await expect.poll(() => pollCount).toBeGreaterThanOrEqual(2)
  await expect(page.getByText(/Full export ready \(6001 rows\)/)).toBeVisible()
  expect(requestBody).toMatchObject({ kind: 'invoice', from: '2026-09-01', to: '2026-09-30', search: 'INV-LARGE' })
})

test('large Export all presents the worker failure and does not start a download', async ({ page }) => {
  await signIntoDemo(page)
  await mockLargeInvoiceReport(page)

  let downloadRequested = false
  await page.route(/\/api\/laundry\/report-exports$/, async (route) => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'export-failed', kind: 'invoice', status: 'Queued', totalRows: 0, fileName: null, error: null, expiresAt: null }) })
  })
  await page.route(/\/api\/laundry\/report-exports\/export-failed$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'export-failed', kind: 'invoice', status: 'Failed', totalRows: 0, fileName: null, error: 'worker thread failed safely', expiresAt: null }) })
  })
  await page.route(/\/api\/laundry\/report-exports\/export-failed\/download$/, async (route) => {
    downloadRequested = true
    await route.fulfill({ status: 500, body: 'unexpected download' })
  })

  await page.getByRole('button', { name: 'Export all', exact: true }).click()
  await expect(page.getByText('Full export failed: worker thread failed safely.', { exact: true })).toBeVisible({ timeout: 5000 })
  expect(downloadRequested).toBe(false)
})
