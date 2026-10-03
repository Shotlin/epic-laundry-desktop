import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'See the next move at a glance.', exact: true })).toBeVisible({ timeout: 15_000 })
}

async function stubInvoiceReport(page: Page) {
  await page.route(/\/api\/laundry\/reports\/invoice(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'invoice', from: url.searchParams.get('from'), to: url.searchParams.get('to'),
        columns: ['invoiceNumber', 'amount', 'status', 'tax'],
        rows: [{ invoiceNumber: 'INV-EXPORT-001', amount: 123.45, status: 'Paid', tax: 18.81 }],
        totalRows: 1, page: 1, pageSize: 100, totalPages: 1,
        summary: { label: 'Total Invoice Amount', value: 123.45, format: 'currency' },
      }),
    })
  })
}

test('report Print invokes the browser action and Page Excel contains the visible report rows', async ({ page }) => {
  await signIntoDemo(page)
  const writes: string[] = []
  page.on('request', (request) => {
    if (!request.url().includes('/api/laundry/reports/')) return
    if (request.method() !== 'GET') writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
  })
  await stubInvoiceReport(page)

  await page.goto('/ui/app/?local-demo=1#/laundry/reports/invoice?from=2026-09-01&to=2026-09-30', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Invoice Report', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'INV-EXPORT-001', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page Excel', exact: true })).toBeEnabled()

  await page.evaluate(() => {
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => document.body.setAttribute('data-epic-print-called', 'yes'),
    })
  })
  await page.getByRole('button', { name: 'Print', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-epic-print-called', 'yes')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Page Excel', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^invoice-report-\d{4}-\d{2}-\d{2}\.xlsx$/)
  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  const workbook = XLSX.read(readFileSync(filePath!), { type: 'buffer' })
  expect(workbook.SheetNames).toEqual(['Invoice Report'])
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  expect(XLSX.utils.sheet_to_json(sheet)).toEqual([
    { invoiceNumber: 'INV-EXPORT-001', amount: 123.45, status: 'Paid', tax: 18.81 },
  ])
  await expect(page.getByText('Exported current page.', { exact: true })).toBeVisible()
  expect(writes).toEqual([])
})

test('report detail preserves the selected table and filters in print preview', async ({ page }) => {
  await signIntoDemo(page)
  await stubInvoiceReport(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/reports/invoice?from=2026-09-01&to=2026-09-30', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Invoice Report', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'INV-EXPORT-001', exact: true })).toBeVisible()

  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('heading', { name: 'Invoice Report', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'INV-EXPORT-001', exact: true })).toBeVisible()
  await expect(page.locator('.report-print-summary')).toContainText('Report period: 2026-09-01 to 2026-09-30')
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeHidden()
  await expect(page.locator('aside').first()).toBeHidden()
  await page.screenshot({ path: resolve(process.cwd(), '../docs/parity/evidence/report-print-preview.png'), fullPage: true })
})

test('Reports overview retains its readable content in print preview', async ({ page }) => {
  await signIntoDemo(page)
  await page.route(/\/api\/laundry\/reports(?:\?.*)?$/, async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      summary: { orderValue: 123.45, collected: 100, outstanding: 23.45, expenses: 10, operatingCash: 90, orders: 1, customers: 1 },
      stateBreakdown: [], paymentBreakdown: [], trend: [], fulfillmentBreakdown: [], topGarments: [], topServices: [],
    }),
  }))
  await page.goto('/ui/app/?local-demo=1#/laundry/reports', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  await expect(page.getByRole('paragraph').filter({ hasText: /^Order value$/ })).toBeVisible()

  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  await expect(page.getByRole('paragraph').filter({ hasText: /^Order value$/ })).toBeVisible()
  await expect(page.locator('.report-print-summary')).toContainText('Report period: All dates')
  await expect(page.getByRole('button', { name: 'Print / PDF', exact: true })).toBeHidden()
  await expect(page.locator('aside').first()).toBeHidden()
  await page.screenshot({ path: resolve(process.cwd(), '../docs/parity/evidence/report-overview-print-preview.png'), fullPage: true })
})
