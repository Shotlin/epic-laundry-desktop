import { expect, test } from '@playwright/test'

const workstreams = [
  { label: /Open store orders/, path: '/laundry/orders' },
  { label: /Open production queue/, path: '/laundry/production-queue' },
  { label: /Track a garment/, path: '/laundry/garment-tracking' },
  { label: /Review quality work/, path: '/laundry/quality-claims' },
  { label: /Open dispatch/, path: '/laundry/dispatch' },
  { label: /Open route runs/, path: '/laundry/routes' },
  { label: /Open print centre/, path: '/laundry/print-centre' },
]

test('Operations hub workstream cards open their named destinations', async ({ page }) => {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()

  await page.goto('/ui/app/?local-demo=1#/laundry/operations', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Counter → care floor → customer.' })).toBeVisible()
  await expect(page.locator('main a')).toHaveCount(workstreams.length)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.screenshot({ path: '../docs/parity/evidence/operations-hub-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '../docs/parity/evidence/operations-hub-mobile.png', fullPage: true })

  for (const workstream of workstreams) {
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.goto('/ui/app/?local-demo=1#/laundry/operations', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Counter → care floor → customer.' })).toBeVisible()
    const link = page.getByRole('link', { name: workstream.label })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(new RegExp(`#${workstream.path.replaceAll('/', '\\/')}$`))
    await expect(page.locator('main').getByRole('heading', { level: 1 }).first()).toBeVisible()
  }
})
