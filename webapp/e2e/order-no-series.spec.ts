import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Order No Series mirrors the verified empty page and saves only from the explicit Add dialog', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: 'Order No Series', exact: true }).click()
  await expect(page).toHaveURL(/#\/laundry\/order-series$/)
  await expect(page.getByRole('heading', { name: 'Order No Series', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No Data Found' })).toBeVisible()
  await page.locator('.animate-in').first().evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))

  const emptyScreenshot = resolve(process.cwd(), '../artifacts/parity/order-no-series-empty.png')
  mkdirSync(dirname(emptyScreenshot), { recursive: true })
  await page.screenshot({ path: emptyScreenshot })

  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/settings/order-no-series') writes.push(request.postData() || '')
  })
  await page.getByRole('button', { name: 'Add Order No Series', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add Order No Series' })
  await expect(dialog).toBeVisible()
  const name = dialog.getByLabel('Series Name', { exact: true })
  const prefix = dialog.getByLabel('Prefix', { exact: true })
  const save = dialog.getByRole('button', { name: 'Save', exact: true })
  await expect(name).toHaveAttribute('maxlength', '100')
  await expect(prefix).toHaveAttribute('maxlength', '20')
  await expect(save).toBeDisabled()
  await name.fill('Counter series')
  await prefix.fill('CTR')
  expect(writes).toEqual([])
  const dialogScreenshot = resolve(process.cwd(), '../artifacts/parity/order-no-series-add.png')
  await page.screenshot({ path: dialogScreenshot })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([])
  await expect(page.getByRole('heading', { name: 'No Data Found' })).toBeVisible()

  await page.getByRole('button', { name: 'Add Order No Series', exact: true }).first().click()
  const saveResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/settings/order-no-series' && response.ok())
  const saveDialog = page.getByRole('dialog', { name: 'Add Order No Series' })
  await saveDialog.getByLabel('Series Name', { exact: true }).fill('Counter series')
  await saveDialog.getByLabel('Prefix', { exact: true }).fill('CTR')
  await saveDialog.getByRole('button', { name: 'Save', exact: true }).click()
  await saveResponse
  await expect(saveDialog).toBeHidden()
  await expect(page.getByRole('cell', { name: 'Counter series', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'CTR', exact: true })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0])).toEqual({ name: 'Counter series', prefix: 'CTR' })
})
