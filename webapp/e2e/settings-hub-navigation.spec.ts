import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('Settings directory links and workspace tabs are discoverable without writing data', async ({ page }) => {
  const mutations: string[] = []
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) mutations.push(`${request.method()} ${new URL(request.url()).pathname}`)
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store settings', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose what you want to manage', exact: true })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Laundry workspace navigation' })
  const capture = async (name: string) => {
    const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
    mkdirSync(dirname(path), { recursive: true })
    await page.screenshot({ path, fullPage: true })
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture('settings-directory-desktop')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366)

  const directoryLinks = [
    ['WhatsApp message templates', '/laundry/message-templates'],
    ['Users & payroll', '/laundry/management'],
    ['Garment pricing', '/laundry/catalogue?view=pricing'],
    ['Store Charges', '/laundry/settings/charges'],
    ['Store Discounts', '/laundry/settings/discounts'],
    ['Garments', '/laundry/catalogue?view=garments'],
    ['Categories', '/laundry/settings/categories'],
    ['Services', '/laundry/settings/services'],
    ['Service Units', '/laundry/settings/service-units'],
    ['Import catalog', '/laundry/import-catalogue'],
    ['Store Users', '/laundry/settings/store-users'],
    ['Store Packages', '/laundry/settings/store-packages'],
    ['Order No Series', '/laundry/order-series'],
  ] as const
  for (const [label, destination] of directoryLinks) {
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect.poll(() => new URL(page.url()).hash).toBe(`#${destination}`)
    await expect(page.locator('main').getByRole('heading').first()).toBeVisible()
    if (destination.includes('view=')) {
      const selected = destination.endsWith('pricing') ? 'Garment pricing' : 'Garments'
      await expect(page.getByRole('status')).toContainText(`${selected} selected from Store settings.`)
      await expect(page.locator(destination.endsWith('pricing') ? '#catalogue-pricing' : '#catalogue-garments')).toBeFocused()
    }
    await page.getByRole('button', { name: 'Back to dashboard' }).click()
    const businessControls = navigation.getByRole('button', { name: 'Business controls', exact: true })
    if (await businessControls.getAttribute('aria-expanded') !== 'true') await businessControls.click()
    await navigation.getByRole('link', { name: 'Store settings', exact: true }).click()
    await expect.poll(() => new URL(page.url()).hash).toBe('#/laundry/settings')
  }

  await page.getByRole('button', { name: 'Store profile & UPI QR', exact: true }).click()
  const workspaceTabs = page.getByRole('tablist', { name: 'Settings workspaces' })
  await expect(workspaceTabs.getByRole('tab', { name: /^Workspace\b/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Capacity, zones & racks', exact: true }).click()
  await expect(workspaceTabs.getByRole('tab', { name: /^Operations\b/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Tags & printers', exact: true }).click()
  await expect(workspaceTabs.getByRole('tab', { name: /^Printing\b/ })).toHaveAttribute('aria-selected', 'true')
  const settingsPanels = [
    ['Workspace', 'workspace-setup'],
    ['Operations', 'operations-setup'],
    ['Finance controls', 'finance-controls'],
    ['Printing', 'printing-setup'],
    ['Data safety', 'data-safety'],
  ] as const
  for (const [label, panelId] of settingsPanels) {
    const tab = workspaceTabs.getByRole('tab', { name: new RegExp(`^${label}\\b`) })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator(`#settings-panel-${panelId}`)).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await capture(`settings-${panelId}-desktop`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [label, panelId] of settingsPanels) {
    const tab = workspaceTabs.getByRole('tab', { name: new RegExp(`^${label}\\b`) })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator(`#settings-panel-${panelId}`)).toBeVisible()
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth, `Settings ${label} workspace overflowed the 390px viewport`).toBeLessThanOrEqual(390)
    if (label === 'Finance controls') {
      const table = page.locator(`#settings-panel-${panelId} table`).first()
      await expect(table).toBeVisible()
      const tableViewport = await table.evaluate((element) => {
        const wrapper = element.parentElement!
        const style = window.getComputedStyle(wrapper)
        return { overflowX: style.overflowX, scrollWidth: wrapper.scrollWidth, clientWidth: wrapper.clientWidth }
      })
      expect(tableViewport.overflowX).toMatch(/auto|scroll/)
      expect(tableViewport.scrollWidth).toBeGreaterThan(tableViewport.clientWidth)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await capture(`settings-${panelId}-mobile`)
  }
  await workspaceTabs.getByRole('tab', { name: /^Workspace\b/ }).click()
  await page.getByRole('tab', { name: 'UPI / Invoice QR' }).click()
  await expect(page.getByRole('heading', { name: 'UPI / Invoice QR', exact: true })).toBeVisible()

  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Choose what you want to manage', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(page.getByRole('heading', { name: 'Store settings', exact: true })).toBeInViewport()
  await capture('settings-directory-mobile')
  expect(mutations).toEqual([])
})
