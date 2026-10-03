import { expect, test } from '@playwright/test'

const destinations = [
  { group: 'Home', label: 'Dashboard', path: '/laundry/dashboard' },
  { group: 'Home', label: 'Overview', path: '/laundry/statistics' },
  { group: 'Counter', label: 'Order booking', path: '/laundry/new-order' },
  { group: 'Counter', label: 'Store orders & customers', path: '/laundry/orders' },
  { group: 'Counter', label: 'Print centre', path: '/laundry/print-centre' },
  { group: 'Production', label: 'Operations centre', path: '/laundry/operations' },
  { group: 'Production', label: 'Garment tracking', path: '/laundry/garment-tracking' },
  { group: 'Production', label: 'Production queue', path: '/laundry/production-queue' },
  { group: 'Production', label: 'Quality claims', path: '/laundry/quality-claims' },
  { group: 'Production', label: 'Correction documents', path: '/laundry/corrections' },
  { group: 'Production', label: 'Returns', path: '/laundry/returns' },
  { group: 'Pickup & delivery', label: 'Route runs', path: '/laundry/routes' },
  { group: 'Pickup & delivery', label: 'Pickup & delivery', path: '/laundry/dispatch' },
  { group: 'Finance & compliance', label: 'Finance & compliance', path: '/laundry/finance' },
  { group: 'Finance & compliance', label: 'Statutory controls', path: '/laundry/finance/statutory' },
  { group: 'Finance & compliance', label: 'Cash closing', path: '/laundry/cash-closing' },
  { group: 'Finance & compliance', label: 'Captain settlements', path: '/laundry/settlements' },
  { group: 'Finance & compliance', label: 'Store expense', path: '/laundry/expenses' },
  { group: 'Customer programs', label: 'Care packages', path: '/laundry/packages' },
  { group: 'Business controls', label: 'People & payroll', path: '/laundry/management' },
  { group: 'Business controls', label: 'Finance setup', path: '/laundry/finance-setup' },
  { group: 'Business controls', label: 'Online orders', path: '/laundry/online-orders' },
  { group: 'Business controls', label: 'Marketplace catalogue', path: '/laundry/marketplace-catalogue' },
  { group: 'Business controls', label: 'Marketplace sync', path: '/laundry/sync-status' },
  { group: 'Business controls', label: 'Platform Control', path: '/laundry/platform-control' },
  { group: 'Business controls', label: 'Platform orders', path: '/laundry/platform-orders', heading: 'Platform orders' },
  { group: 'Business controls', label: 'Platform audit trail', path: '/laundry/platform-audit', heading: 'Platform audit trail' },
  { group: 'Business controls', label: 'Platform finance', path: '/laundry/platform-finance', heading: 'Platform finance' },
  { group: 'Business controls', label: 'Reports', path: '/laundry/reports' },
  { group: 'Business controls', label: 'Garments & prices', path: '/laundry/catalogue' },
  { group: 'Business controls', label: 'Import prices', path: '/laundry/import-prices' },
  { group: 'Business controls', label: 'Import catalogue', path: '/laundry/import-catalogue' },
  { group: 'Business controls', label: 'Import customers', path: '/laundry/import-customers' },
  { group: 'Business controls', label: 'Store settings', path: '/laundry/settings' },
]

test.setTimeout(180_000)

test('every visible desktop navigation link reaches its declared route', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible({ timeout: 20_000 })
  const nav = page.getByRole('navigation', { name: 'Laundry workspace navigation' })
  for (const label of [...new Set(destinations.map((destination) => destination.group))]) {
    const group = nav.getByRole('button', { name: label, exact: true })
    if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  }
  await expect(nav.getByRole('link', { name: 'Captain settlements', exact: true })).toHaveCount(1)
  await page.screenshot({ path: '../docs/parity/evidence/navigation-workstreams-desktop.png', fullPage: true })

  for (const destination of destinations) {
    const back = page.getByRole('button', { name: 'Back to dashboard' })
    if (await back.isVisible()) await back.click()
    const group = nav.getByRole('button', { name: destination.group, exact: true })
    await expect(group).toBeVisible()
    if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
    const link = group.locator('..').getByRole('link', { name: destination.label, exact: true })
    await expect(link).toBeVisible()
    await link.click()
    await expect.poll(() => new URL(page.url()).hash).toBe(`#${destination.path}`)
    const content = page.locator('main')
    if ('heading' in destination) {
      await expect(content.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible()
      const routeName = destination.path.split('/').at(-1)
      await page.screenshot({ path: `../docs/parity/evidence/${routeName}-disconnected-desktop.png`, fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await page.screenshot({ path: `../docs/parity/evidence/${routeName}-disconnected-mobile.png`, fullPage: true })
      await page.setViewportSize({ width: 1366, height: 900 })
      await page.getByRole('link', { name: 'Open Platform Control' }).click()
      await expect.poll(() => new URL(page.url()).hash).toBe('#/laundry/platform-control')
      await expect(page.locator('main').getByRole('heading').first()).toBeVisible()
    } else await expect(content.getByRole('heading').first()).toBeVisible()
  }
})
