import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Store Discounts matches the verified source form and maps Amount without writing a test rule', async ({ page }) => {
  await page.route('**/api/laundry/catalogue/discounts', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    await route.continue()
  })
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: 'Store Discounts', exact: true }).click()
  await expect(page).toHaveURL(/#\/laundry\/settings\/discounts$/)
  await expect(page.getByRole('heading', { name: 'Store Discounts', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No Data Found' })).toBeVisible()
  await page.locator('.animate-in').first().evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))

  const emptyScreenshot = resolve(process.cwd(), '../artifacts/parity/store-discounts-empty.png')
  mkdirSync(dirname(emptyScreenshot), { recursive: true })
  await page.screenshot({ path: emptyScreenshot })

  const requests: Record<string, unknown>[] = []
  let returnPausedRule = false
  const pausedRule = { id: 'synthetic-paused-discount', name: 'Paused test rule', type: 'Flat', amount: 7, description: 'Still available to edit', active: false }
  await page.route('**/api/laundry/catalogue/discounts', async (route) => {
    if (route.request().method() === 'GET' && returnPausedRule) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([pausedRule]) })
    }
    if (route.request().method() !== 'POST') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    requests.push(body)
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'synthetic-discount', ...body }) })
  })

  await page.getByRole('button', { name: 'Add Store Discount', exact: true }).first().click()
  let dialog = page.getByRole('dialog', { name: 'Add Store Discount' })
  const name = dialog.getByLabel('Discount Name', { exact: true })
  const type = dialog.getByLabel('Discount In Type', { exact: true })
  const amount = dialog.getByLabel('Discount Amount', { exact: true })
  const description = dialog.getByLabel('Description', { exact: true })
  await expect(name).toHaveAttribute('maxlength', '50')
  await expect(type).toHaveAttribute('required', '')
  await expect(type.locator('option').allTextContents()).resolves.toEqual(['Select discount type', 'Percentage', 'Amount'])
  await expect(amount).toHaveAttribute('required', '')
  await expect(description).toHaveAttribute('maxlength', '200')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
  await type.selectOption('Percentage')
  await expect(amount).toHaveAttribute('max', '100')
  await type.selectOption('Flat')
  await expect(amount).not.toHaveAttribute('max', '100')
  await name.fill('Draft only')
  await expect(dialog.getByText('10/50', { exact: true })).toBeVisible()
  await description.fill('This draft is canceled')
  await expect(dialog.getByText('22/200', { exact: true })).toBeVisible()
  const addScreenshot = resolve(process.cwd(), '../artifacts/parity/store-discounts-add.png')
  await page.screenshot({ path: addScreenshot })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(requests).toEqual([])
  await expect(page.getByRole('heading', { name: 'No Data Found' })).toBeVisible()

  await page.goto('/ui/app/?local-demo=1#/laundry/catalogue', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Discount', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add Store Discount', exact: true })).toBeVisible()
  await expect(page.getByLabel('Discount In Type', { exact: true })).toHaveAttribute('required', '')
  await expect(page.getByLabel('Discount Name', { exact: true })).toHaveAttribute('maxlength', '50')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(requests).toEqual([])

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/discounts', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Add Store Discount', exact: true }).first().click()
  dialog = page.getByRole('dialog', { name: 'Add Store Discount' })
  await dialog.getByLabel('Discount Name', { exact: true }).fill('Adapter Check')
  await dialog.getByLabel('Discount In Type', { exact: true }).selectOption('Flat')
  await expect(dialog.getByLabel('Discount Amount', { exact: true })).not.toHaveAttribute('max', '100')
  await dialog.getByLabel('Discount Amount', { exact: true }).fill('15.5')
  await dialog.getByLabel('Description', { exact: true }).fill('Synthetic mapping check')
  await dialog.getByRole('checkbox', { name: 'Available to staff' }).uncheck()
  const saveRequest = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/laundry/catalogue/discounts')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await saveRequest
  await expect(dialog).toBeHidden()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toEqual({ name: 'Adapter Check', type: 'Flat', amount: 15.5, description: 'Synthetic mapping check', active: false })
  await expect(page.getByRole('status')).toHaveText('Store discount saved.')

  returnPausedRule = true
  await page.reload()
  await expect(page.getByRole('cell', { name: 'Paused test rule', exact: true })).toBeVisible()
  await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const pausedDialog = page.getByRole('dialog', { name: 'Edit Store Discount' })
  await expect(pausedDialog.getByRole('checkbox', { name: 'Available to staff' })).not.toBeChecked()
  await pausedDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(requests).toHaveLength(1)
})
