import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('collection report explains a failed load and recovers on Refresh', async ({ page }) => {
  await signIntoDemo(page)
  let outage = true
  let failedAttempts = 0
  await page.route('**/api/laundry/reports/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/api/laundry/reports/collection') return route.continue()
    if (outage) {
      failedAttempts += 1
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated report service outage.' }) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'collection', from: null, to: null, columns: ['invoiceNumber', 'amount', 'method', 'date'], rows: [], totalRows: 0, page: 1, pageSize: 100, totalPages: 1 }),
    })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/reports/collection', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('This report could not be loaded.')).toBeVisible({ timeout: 15_000 })
  expect(failedAttempts).toBeGreaterThan(1)
  outage = false
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByText('Current store data')).toBeVisible()
  await expect(page.getByText('No rows in this view')).toBeVisible()
})

test('collection report switches to customer totals and supports the source page sizes', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/collection', { waitUntil: 'domcontentloaded' })

  const view = page.getByRole('combobox', { name: 'Collection report view' })
  const pageSize = page.getByRole('combobox', { name: 'Items per page' })
  await expect(view).toHaveValue('invoice')
  await expect(pageSize).toHaveValue('100')
  await view.selectOption('customer')
  await expect(page.getByRole('textbox', { name: 'Search customer' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Customer Name' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Total Paid Invoices' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Total Paid Amount' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Payment method' })).toHaveCount(0)

  await pageSize.selectOption('10')
  await expect(pageSize).toHaveValue('10')
})

test('collection report validates table dates and keeps chart dates independent', async ({ page }) => {
  await signIntoDemo(page)
  const tableRequests: URL[] = []
  const chartRequests: URL[] = []
  const writes: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/laundry/reports/collection')) return
    if (request.method() !== 'GET') writes.push(request.method())
  })
  await page.route(/\/api\/laundry\/reports\/collection\/chart(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    chartRequests.push(url)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'collection', from: url.searchParams.get('from'), to: url.searchParams.get('to'), metric: 'collection amount', points: [{ label: url.searchParams.get('from'), value: 525 }] }) })
  })
  await page.route(/\/api\/laundry\/reports\/collection(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    tableRequests.push(url)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'collection', from: url.searchParams.get('from'), to: url.searchParams.get('to'), columns: ['invoiceNumber', 'amount', 'method', 'date'], rows: [{ invoiceNumber: 'INV-100', amount: 525, method: 'Cash', date: '2026-09-10' }], totalRows: 1, page: Number(url.searchParams.get('page') || 1), pageSize: Number(url.searchParams.get('pageSize') || 100), totalPages: 1, summary: { label: 'Collection Amount', value: 525, format: 'currency' } }) })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/reports/collection?period=today', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Collection Report', exact: true })).toBeVisible()
  const reportBy = page.getByRole('combobox', { name: 'Report by' })
  await expect(reportBy.locator('option')).toHaveText(['Today', 'Yesterday', 'Week', 'Month', 'Year', 'Custom'])
  await expect(page.getByLabel('From', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('To', { exact: true })).toBeDisabled()
  await expect(page.getByRole('columnheader', { name: 'Invoice No' })).toBeVisible()
  await expect(page.getByText('INV-100')).toBeVisible()
  await expect.poll(() => tableRequests.length).toBeGreaterThan(0)
  await expect.poll(() => chartRequests.length).toBeGreaterThan(0)
  const todayFrom = tableRequests.at(-1)?.searchParams.get('from') || ''
  const todayTo = tableRequests.at(-1)?.searchParams.get('to') || ''
  expect(todayFrom).toBe(todayTo)
  const initialChartCount = chartRequests.length
  const capture = async (name: string, fullPage = true) => {
    const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
    mkdirSync(dirname(path), { recursive: true })
    await page.screenshot({ path, fullPage })
  }
  await capture('collection-report-controls-desktop')

  await reportBy.selectOption('custom')
  const startDate = page.getByLabel('From', { exact: true })
  const endDate = page.getByLabel('To', { exact: true })
  await expect(startDate).toBeEnabled()
  await expect(endDate).toBeEnabled()
  await startDate.fill('2026-09-10')
  await endDate.fill('2026-09-20')
  await expect(startDate).toHaveAttribute('max', '2026-09-20')
  await expect(endDate).toHaveAttribute('min', '2026-09-10')
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect.poll(() => tableRequests.at(-1)?.searchParams.get('from')).toBe('2026-09-10')
  expect(tableRequests.at(-1)?.searchParams.get('to')).toBe('2026-09-20')
  expect(chartRequests.at(-1)?.searchParams.get('from')).not.toBe('2026-09-10')
  expect(chartRequests.length).toBe(initialChartCount)

  const paymentMethod = page.getByRole('combobox', { name: 'Payment method' })
  await paymentMethod.selectOption('Cash')
  await expect.poll(() => tableRequests.at(-1)?.searchParams.get('paymentMethod')).toBe('Cash')
  await expect.poll(() => chartRequests.at(-1)?.searchParams.get('paymentMethod')).toBe('Cash')
  const tableRequestCount = tableRequests.length

  const chartPeriod = page.getByRole('combobox', { name: 'Chart period' })
  await chartPeriod.selectOption('Month')
  await expect.poll(() => chartRequests.at(-1)?.searchParams.get('from')).not.toBe('2026-09-10')
  expect(tableRequests.length).toBe(tableRequestCount)
  expect(chartRequests.at(-1)?.searchParams.get('to')).not.toBe('2026-09-20')

  await chartPeriod.selectOption('Custom')
  const chartDialog = page.getByRole('dialog', { name: 'Select custom date range' })
  await expect(chartDialog).toBeVisible()
  await expect(chartDialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await chartDialog.getByLabel('Chart start date').fill('2026-09-01')
  await chartDialog.getByLabel('Chart end date').fill('2026-09-05')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await capture('collection-chart-custom-range-mobile', false)
  const chartRequestCount = chartRequests.length
  await chartDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(chartPeriod).toHaveValue('Month')
  expect(chartRequests.length).toBe(chartRequestCount)

  await chartPeriod.selectOption('Custom')
  const activeChartDialog = page.getByRole('dialog', { name: 'Select custom date range' })
  await activeChartDialog.getByLabel('Chart start date').fill('2026-09-01')
  await activeChartDialog.getByLabel('Chart end date').fill('2026-09-05')
  await activeChartDialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect.poll(() => chartRequests.at(-1)?.searchParams.get('from')).toBe('2026-09-01')
  expect(chartRequests.at(-1)?.searchParams.get('to')).toBe('2026-09-05')
  expect(tableRequests.at(-1)?.searchParams.get('from')).toBe('2026-09-10')
  expect(tableRequests.at(-1)?.searchParams.get('to')).toBe('2026-09-20')
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/collection?from=2026-09-20&to=2026-09-10', { waitUntil: 'domcontentloaded' })
  const invalidStart = page.getByLabel('From', { exact: true })
  const invalidEnd = page.getByLabel('To', { exact: true })
  await expect(invalidStart).toHaveAttribute('max', '2026-09-10')
  await expect(invalidEnd).toHaveAttribute('min', '2026-09-20')
  await expect(page.getByRole('status')).toHaveText('End date must be on or after the start date.')
  await expect(page.getByRole('button', { name: 'Apply filter', exact: true })).toBeDisabled()
  expect(writes).toEqual([])
})

test('invoice report keeps its invoice-specific total and table fields', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/invoice', { waitUntil: 'domcontentloaded' })

  await expect(page.getByText('Total Invoice Amount')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Invoice No' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Amount (₹)' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Tax (₹)' })).toBeVisible()
})

test('report PDF downloads the visible page with a valid PDF signature', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/invoice', { waitUntil: 'domcontentloaded' })
  const pdfButton = page.getByRole('button', { name: 'Page PDF' })
  await expect(pdfButton).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await pdfButton.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^epic-invoice-report-page-1-\d{4}-\d{2}-\d{2}\.pdf$/)
  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  const pdf = readFileSync(filePath!)
  expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(500)
  await expect(page.getByText(/Downloaded page 1 of .* as PDF/)).toBeVisible()
})

test('customer report keeps source customer fields and page size', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/customer', { waitUntil: 'domcontentloaded' })

  await expect(page.getByText('Total Revenue')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search customer' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Customer' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Phone' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Revenue (₹)' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Revenue Without GST (₹)' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'No of Times Visited' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Last Visited Date' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'No Of Days Before' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Reviews' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Items per page' })).toHaveValue('100')
})

test('customer package report shows its verified total without an unobserved chart', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/customer-package', { waitUntil: 'domcontentloaded' })

  await expect(page.getByText('Total Package Amount')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Customer' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Package Name' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Package Amount (₹)' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Assigned' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Expires' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Items per page' })).toHaveValue('100')
  await expect(page.getByRole('heading', { name: 'Customer Package Report by period' })).toHaveCount(0)
})

test('customer list keeps its source-verified fields and readable search', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/customer-list', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Customer List', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search customer' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Customer' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Phone' })).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveCount(2)
  await expect(page.getByText('Epic report view')).toBeVisible()
})

test('growth report shows reconciled total, tax, and pre-tax value', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/growth', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Growth Report', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Total Amount (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Tax (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Revenue Without Tax (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveCount(3)
})

test('discount report matches the observed summary and daily amount columns', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/discount', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Discount Report', exact: true })).toBeVisible()
  const reportBy = page.getByRole('combobox', { name: 'Report by' })
  await expect(reportBy).toHaveValue('week')
  await expect(reportBy.locator('option')).toHaveText(['Week', 'Month', 'Quarter', 'Year', 'Custom'])
  await expect(page.getByRole('textbox', { name: 'From', exact: true })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'To', exact: true })).toBeDisabled()
  await expect(page.getByText('Total Discount Amount')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Title', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Total Amount (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Discount Amount (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Amount Without Discount (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Items per page' })).toHaveValue('100')
})

test('expense report matches its weekly summary and daily amount columns', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/expense', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Expense Report', exact: true })).toBeVisible()
  const reportBy = page.getByRole('combobox', { name: 'Report by' })
  await expect(reportBy).toHaveValue('week')
  await expect(reportBy.locator('option')).toHaveText(['Week', 'Month', 'Quarter', 'Year', 'Custom'])
  await expect(page.getByRole('textbox', { name: 'From', exact: true })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'To', exact: true })).toBeDisabled()
  await expect(page.getByText('Total Expense')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Title', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Expense Amount (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Tax Amount (₹)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Amount Without Tax (₹)', exact: true })).toBeVisible()
})

test('balance report switches between invoice and customer views without applying table dates', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/balance', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Balance Report', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Balance report view' })).toHaveValue('invoice')
  await expect(page.getByRole('combobox', { name: 'Balance report view' }).locator('option')).toHaveText(['Invoice', 'Customer'])
  await expect(page.getByRole('combobox', { name: 'Report by' })).toHaveCount(0)
  await expect(page.getByText('Total Balance Amount')).toBeVisible()
  for (const header of ['Customer', 'Phone', 'Invoice No', 'Order No', 'Invoice Amount (₹)', 'Balance Amount (₹)']) {
    await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible()
  }

  await page.getByRole('combobox', { name: 'Balance report view' }).selectOption('customer')
  await expect(page.getByRole('columnheader')).toHaveCount(4)
  for (const header of ['Customer', 'Phone', 'Invoice Amount (₹)', 'Balance Amount (₹)']) {
    await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible()
  }
})

test('order report switches between service and invoice summaries', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/order', { waitUntil: 'domcontentloaded' })

  const view = page.getByRole('combobox', { name: 'Order report view' })
  await expect(view).toHaveValue('service')
  await expect(page.getByText('Total Garment Count')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Service Name' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Total Garments' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Garment Summary' })).toBeVisible()

  await view.selectOption('invoice')
  await expect(view).toHaveValue('invoice')
  await expect(page.getByRole('columnheader', { name: 'Order Date' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Customer Name' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Order No' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Invoice No' })).toBeVisible()
})

test('warehouse user work report matches the source activation lock and protects report endpoints', async ({ page }) => {
  await signIntoDemo(page)
  let reportReadRequested = false
  page.on('request', (request) => {
    if (/\/api\/laundry\/reports\/warehouse-user-work/.test(request.url())) reportReadRequested = true
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/warehouse-user-work', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Warehouse User Work Report', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Select User' })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'This report needs activation' })).toBeVisible()
  await expect(page.getByText(/Contact Us to activate it/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open support options' })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  expect(reportReadRequested).toBe(false)

  const results = await page.evaluate(async () => {
    const paths = [
      '/api/laundry/reports/warehouse-user-work',
      '/api/laundry/reports/warehouse-user-work/chart',
      '/api/laundry/reports/warehouse-user-work/export',
    ]
    return Promise.all(paths.map(async (path) => {
      const response = await fetch(path, { credentials: 'same-origin' })
      return { status: response.status, body: await response.json() }
    }))
  })
  expect(results.map((result) => result.status)).toEqual([423, 423, 423])
  expect(results.every((result) => result.body.code === 'REPORT_NOT_ACTIVATED')).toBe(true)

  const exportCreation = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/report-exports', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'warehouse-user-work' }),
    })
    return { status: response.status, body: await response.json() }
  })
  expect(exportCreation.status).toBe(423)
  expect(exportCreation.body.code).toBe('REPORT_NOT_ACTIVATED')
})

test('pickup and rider report routes retain reference labels and shared controls', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Rider Delivery', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rider Collection', exact: true })).toBeVisible()
  for (const [kind, title] of [
    ['pickup', 'Pickup Overview'],
    ['rider-delivery', 'Rider Delivery'],
    ['rider-collection', 'Rider Collection'],
  ]) {
    await page.goto(`/ui/app/?local-demo=1#/laundry/reports/${kind}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Report by' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Items per page' })).toHaveValue('100')
    await expect(page.getByRole('combobox', { name: 'Chart period' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()
  }
})
