import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('customer import validates, exports original rejected rows, and commits only after review', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/import-customers', { waitUntil: 'domcontentloaded' })

  const previewRequests: Array<Record<string, unknown>> = []
  let committedRows: Array<Record<string, unknown>> | null = null
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/laundry/import/preview' && request.method() === 'POST') {
      previewRequests.push(request.postDataJSON())
    }
  })
  await page.route('**/api/laundry/import/customers', async (route) => {
    const body = route.request().postDataJSON() as { rows: Array<Record<string, unknown>> }
    committedRows = body.rows
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ created: body.rows.length, updated: 0, skipped: 0, errors: [] }),
    })
  })

  const customerCsv = [
    'Customer Name,Phone,Email,Address',
    'Review Customer,9810112345,review@example.test,Example Road',
    'Needs phone,123,needs-phone@example.test,Example Street',
  ].join('\n')
  await page.getByLabel('Select Excel file').setInputFiles({
    name: 'customers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(customerCsv),
  })

  await expect(page.getByText('customers.csv · 2 rows ready')).toBeVisible()
  expect(previewRequests).toEqual([])
  expect(committedRows).toBeNull()

  const previewResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/import/preview' && response.request().method() === 'POST'
  })
  await page.getByRole('button', { name: 'Validate and preview' }).click()
  await previewResponse
  await expect(page.getByText('1 of 2 rows passed checks · 1 need correction', { exact: true })).toBeVisible()
  await expect(page.getByText('Row 3: a valid phone is required', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import 1 valid row', exact: true })).toBeVisible()
  expect(committedRows).toBeNull()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download rows to correct' }).click()
  const download = await downloadPromise
  const correctionPath = await download.path()
  expect(correctionPath).toBeTruthy()
  const correctionCsv = readFileSync(correctionPath!, 'utf8')
  expect(correctionCsv).toContain('"Worksheet Row"')
  expect(correctionCsv).toContain('"Needs phone"')
  expect(correctionCsv).toContain('"123"')

  const correctedCsv = correctionCsv
    .replace('"Needs phone"', '"Corrected Customer"')
    .replace('"123"', '"9810123456"')
    .replace('"a valid phone is required"', '""')
  await page.getByLabel('Select Excel file').setInputFiles({
    name: 'corrected-customers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(correctedCsv),
  })

  await expect(page.getByText('corrected-customers.csv · 1 row ready')).toBeVisible()
  const correctedPreview = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/import/preview' && response.request().method() === 'POST'
  })
  await page.getByRole('button', { name: 'Validate and preview' }).click()
  await correctedPreview
  await expect(page.getByText('1 of 1 rows passed checks · 0 need correction', { exact: true })).toBeVisible()
  expect(committedRows).toBeNull()

  await page.getByRole('button', { name: 'Import 1 valid row', exact: true }).click()
  await expect.poll(() => committedRows).toEqual([
    { name: 'Corrected Customer', phone: '9810123456', email: 'needs-phone@example.test', address: 'Example Street' },
  ])
  await expect(page.getByRole('heading', { name: 'Import result' })).toBeVisible()
})

test('garment-price import blocks new garments without an approved visual before commit', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/import-prices', { waitUntil: 'domcontentloaded' })

  let commitCount = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/laundry/import/prices' && request.method() === 'POST') commitCount += 1
  })
  const priceCsv = [
    'Garment,Category,Service,Rate,Unit,HSN,GST Rate,Customer Phone',
    'New garment,New category,New service,25,Piece,9997,0,',
  ].join('\n')
  await page.getByLabel('Select Excel file').setInputFiles({
    name: 'prices.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(priceCsv),
  })

  const previewResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/import/preview' && response.request().method() === 'POST'
  })
  await page.getByRole('button', { name: 'Validate and preview' }).click()
  await previewResponse
  await expect(page.getByText('0 of 1 rows passed checks · 1 need correction', { exact: true })).toBeVisible()
  await expect(page.getByText(/Create this garment in Garments first/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Import .*valid row/ })).toHaveCount(0)
  expect(commitCount).toBe(0)
})
