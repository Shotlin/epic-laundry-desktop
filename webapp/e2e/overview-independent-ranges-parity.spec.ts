import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Overview keeps the four observed date controls independent', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await signIntoDemo(page)
  const requests: URL[] = []
  await page.route('**/api/laundry/statistics*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const range = (key: string, fallback: string) => ({
      period: url.searchParams.get(`${key}Period`) || fallback,
      from: url.searchParams.get(`${key}From`) || '2026-09-30',
      to: url.searchParams.get(`${key}To`) || '2026-09-30',
    })
    const body = {
      period: 'today', from: '2026-09-30', to: '2026-09-30',
      ranges: {
        ordersReview: range('ordersReview', 'today'), collection: range('collection', 'week'),
        customerFrequency: range('customerFrequency', 'today'), newCustomer: range('newCustomer', 'week'),
      },
      ordersReview: { total: 2, breakdown: [{ state: 'Booked', count: 2 }], daily: [{ date: '2026-09-30', orders: 2, amount: 1200 }] },
      revenue: { total: 1200, averageOrderValue: 600 },
      collection: { total: 500, daily: [{ date: '2026-09-30', amount: 500 }] },
      customerFrequency: { total: 1, repeatCustomers: 1, breakdown: [{ customer: 'Demo Customer', visits: 2 }] },
      newCustomer: { total: 1, daily: [{ date: '2026-09-30', count: 1 }] },
      serviceMix: [], online: { count: 0, estimatedRevenue: 0, topGarments: [] },
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/statistics', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(page.locator('[data-stat-card]')).toHaveCount(6)
  await expect(page.locator('[data-stat-card] [data-stat-spark]')).toHaveCount(0)
  const metricAnalytics = page.locator('[data-metric-analytics]')
  await expect(metricAnalytics).toHaveCount(6)
  await expect(metricAnalytics.getByRole('heading', { name: 'Revenue performance' })).toBeVisible()
  await expect(metricAnalytics.getByRole('heading', { name: 'Order volume' })).toBeVisible()
  await expect(metricAnalytics.getByRole('heading', { name: 'Collection trend' })).toBeVisible()
  await expect(metricAnalytics.getByRole('heading', { name: 'Average order value' })).toBeVisible()
  await expect(metricAnalytics.getByRole('heading', { name: 'Customer base' })).toBeVisible()
  await expect(metricAnalytics.getByRole('heading', { name: 'New customer acquisition' })).toBeVisible()
  const executiveBoard = page.locator('[data-executive-chart-board]')
  await expect(executiveBoard).toBeVisible()
  await expect(executiveBoard.locator('[data-executive-chart]')).toHaveCount(3)
  const executiveDonuts = executiveBoard.getByRole('group', { name: 'Distribution chart' })
  await expect(executiveDonuts).toHaveCount(2)
  await expect.poll(async () => (await executiveDonuts.first().boundingBox())?.width || 0).toBeGreaterThan(220)
  await expect(executiveBoard.locator('[data-donut-ring]')).toHaveCount(2)
  const optionLists = [
    ['Orders Review', ['Today', 'Yesterday', 'Week', 'Month', 'Year', 'Custom']],
    ['Collection', ['Week', 'Month', 'Quarter', 'Year', 'Custom']],
    ['Customer Frequency', ['Today', 'Yesterday', 'Week', 'Month', 'Year', 'Custom']],
    ['New Customer', ['Week', 'Month', 'Quarter', 'Year', 'Custom']],
  ] as const
  for (const [label, options] of optionLists) {
    await expect(page.getByRole('combobox', { name: `${label} date range` }).locator('option')).toHaveText(options)
  }
  const capture = async (name: string, fullPage = true) => {
    const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
    mkdirSync(dirname(path), { recursive: true })
    await page.screenshot({ path, fullPage })
  }
  await capture('overview-populated-desktop')

  await page.getByRole('combobox', { name: 'Orders Review date range' }).selectOption('month')
  await expect.poll(() => requests.at(-1)?.searchParams.get('ordersReviewPeriod')).toBe('month')
  expect(requests.at(-1)?.searchParams.get('collectionPeriod')).toBe('week')
  expect(requests.at(-1)?.searchParams.get('customerFrequencyPeriod')).toBe('today')
  expect(requests.at(-1)?.searchParams.get('newCustomerPeriod')).toBe('week')

  const collectionFilter = page.getByRole('combobox', { name: 'Collection date range' })
  await collectionFilter.selectOption('custom')
  const dialog = page.getByRole('dialog', { name: 'Select custom date range' })
  await expect(dialog).toBeVisible()
  const apply = dialog.getByRole('button', { name: 'Apply', exact: true })
  await expect(apply).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(collectionFilter).toHaveValue('week')

  await collectionFilter.selectOption('custom')
  const activeDialog = page.getByRole('dialog', { name: 'Select custom date range' })
  await activeDialog.getByLabel('Collection start date').fill('2026-09-01')
  await activeDialog.getByLabel('Collection end date').fill('2026-09-12')
  await activeDialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect.poll(() => requests.at(-1)?.searchParams.get('collectionPeriod')).toBe('custom')
  expect(requests.at(-1)?.searchParams.get('collectionFrom')).toBe('2026-09-01')
  expect(requests.at(-1)?.searchParams.get('collectionTo')).toBe('2026-09-12')
  expect(requests.at(-1)?.searchParams.get('ordersReviewPeriod')).toBe('month')
  expect(requests.at(-1)?.searchParams.get('customerFrequencyPeriod')).toBe('today')
  expect(requests.at(-1)?.searchParams.get('newCustomerPeriod')).toBe('week')

  await page.getByRole('combobox', { name: 'Customer Frequency date range' }).selectOption('year')
  await expect.poll(() => requests.at(-1)?.searchParams.get('customerFrequencyPeriod')).toBe('year')
  expect(requests.at(-1)?.searchParams.get('ordersReviewPeriod')).toBe('month')
  expect(requests.at(-1)?.searchParams.get('collectionPeriod')).toBe('custom')
  expect(requests.at(-1)?.searchParams.get('newCustomerPeriod')).toBe('week')

  await page.getByRole('combobox', { name: 'New Customer date range' }).selectOption('month')
  await expect.poll(() => requests.at(-1)?.searchParams.get('newCustomerPeriod')).toBe('month')
  expect(requests.at(-1)?.searchParams.get('ordersReviewPeriod')).toBe('month')
  expect(requests.at(-1)?.searchParams.get('collectionPeriod')).toBe('custom')
  expect(requests.at(-1)?.searchParams.get('customerFrequencyPeriod')).toBe('year')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture('overview-populated-mobile')
  await collectionFilter.selectOption('week')
  await collectionFilter.selectOption('custom')
  const mobileDialog = page.getByRole('dialog', { name: 'Select custom date range' })
  await expect(mobileDialog).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await capture('overview-custom-range-dialog-mobile', false)
})
