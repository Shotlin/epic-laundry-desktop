import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Store Charges matches the verified draft and keeps Save behind the explicit action', async ({ page }) => {
  await signIntoDemo(page)
  let getMode: 'empty' | 'paused' | 'saved' = 'empty'
  const requests: Record<string, unknown>[] = []
  const pausedRule = { id: 'synthetic-paused-charge', name: 'Paused test charge', type: 'Flat', amount: 7, expressCharge: true, description: 'Still available to edit', active: false }
  const savedRule = { id: 'synthetic-charge', name: 'Adapter Check', type: 'Percentage', amount: 12.5, expressCharge: true, description: 'Synthetic mapping check', active: true }
  await page.route('**/api/laundry/catalogue/charges', async (route) => {
    if (route.request().method() === 'GET') {
      const rows = getMode === 'paused' ? [pausedRule] : getMode === 'saved' ? [savedRule] : []
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
    }
    if (route.request().method() !== 'POST' && route.request().method() !== 'PATCH') return route.continue()
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    getMode = 'saved'
    return route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify({ id: 'synthetic-charge', ...requests.at(-1) }) })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/settings/charges', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/laundry\/settings\/charges$/)
  await expect(page.getByRole('heading', { name: 'Store Charges', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No Data Found' })).toBeVisible()
  await page.locator('.animate-in').first().evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))

  const emptyScreenshot = resolve(process.cwd(), '../artifacts/parity/store-charges-empty.png')
  mkdirSync(dirname(emptyScreenshot), { recursive: true })
  await page.screenshot({ path: emptyScreenshot })

  await page.getByRole('button', { name: 'Add Store Charge', exact: true }).first().click()
  let dialog = page.getByRole('dialog', { name: 'Add Store Charge' })
  const name = dialog.getByLabel('Charge Name', { exact: true })
  const type = dialog.getByLabel('Charge In Type', { exact: true })
  const amount = dialog.getByLabel('Charge Amount', { exact: true })
  const description = dialog.getByLabel('Description', { exact: true })
  const express = dialog.getByRole('checkbox', { name: /Express charge/ })
  await expect(name).toHaveAttribute('required', '')
  await expect(name).toHaveAttribute('maxlength', '50')
  await expect(type).toHaveAttribute('required', '')
  await expect(type.locator('option').allTextContents()).resolves.toEqual(['Select charge type', 'Percentage', 'Amount'])
  await expect(amount).toHaveAttribute('required', '')
  await expect(amount).toHaveAttribute('min', '0')
  await expect(description).toHaveAttribute('maxlength', '500')
  await expect(express).not.toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: 'Available to staff' })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: 'Available to staff' })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
  await type.selectOption('Percentage')
  await expect(amount).toHaveAttribute('max', '100')
  await type.selectOption('Flat')
  await expect(amount).not.toHaveAttribute('max', '100')
  await name.fill('Draft only')
  await expect(dialog.getByText('10/50', { exact: true })).toBeVisible()
  await description.fill('This draft is canceled')
  await expect(dialog.getByText('22/500', { exact: true })).toBeVisible()
  await express.check()
  const addScreenshot = resolve(process.cwd(), '../artifacts/parity/store-charges-add.png')
  await page.screenshot({ path: addScreenshot })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(requests).toEqual([])
  await expect(page.getByRole('heading', { name: 'No Data Found' })).toBeVisible()

  await page.getByRole('button', { name: 'Add Store Charge', exact: true }).first().click()
  dialog = page.getByRole('dialog', { name: 'Add Store Charge' })
  await dialog.getByLabel('Charge Name', { exact: true }).fill('Adapter Check')
  await dialog.getByLabel('Charge In Type', { exact: true }).selectOption('Percentage')
  await dialog.getByLabel('Charge Amount', { exact: true }).fill('12.5')
  await dialog.getByLabel('Express charge').check()
  await dialog.getByLabel('Description', { exact: true }).fill('Synthetic mapping check')
  await dialog.getByRole('checkbox', { name: 'Available to staff' }).check()
  const saveRequest = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/laundry/catalogue/charges')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await saveRequest
  await expect(dialog).toBeHidden()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toEqual({ name: 'Adapter Check', type: 'Percentage', amount: 12.5, expressCharge: true, description: 'Synthetic mapping check', active: true })
  await expect(page.getByRole('status')).toHaveText('Store charge saved.')
  await expect(page.getByRole('cell', { name: 'Adapter Check', exact: true })).toBeVisible()
  await expect(page.getByText('Express', { exact: true })).toBeVisible()

  getMode = 'paused'
  await page.reload()
  await expect(page.getByRole('cell', { name: 'Paused test charge', exact: true })).toBeVisible()
  await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const pausedDialog = page.getByRole('dialog', { name: 'Edit Store Charge' })
  await expect(pausedDialog.getByRole('checkbox', { name: 'Available to staff' })).not.toBeChecked()
  await expect(pausedDialog.getByRole('checkbox', { name: /Express charge/ })).toBeChecked()
  await pausedDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(requests).toHaveLength(1)

  await page.goto('/ui/app/?local-demo=1#/laundry/catalogue', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Charge', exact: true }).click()
  await expect(page.getByLabel('Charge In Type', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Charge Name', { exact: true })).toHaveAttribute('maxlength', '50')
  await expect(page.getByRole('checkbox', { name: /Express charge/ })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(requests).toHaveLength(1)
})

test('Express Delivery selects the active express charge in the unsaved booking draft', async ({ page }) => {
  await signIntoDemo(page)
  await page.evaluate(() => localStorage.removeItem('epic-laundry-booking-draft-v1'))
  const catalogue = {
    categories: [], services: [], garments: [], prices: [],
    chargeRules: [{ id: 'express-charge-rule', name: 'Express handling', type: 'Flat', amount: 60, expressCharge: true, active: true }],
    discountRules: [], taxRules: [], serviceUnits: ['Piece', 'Kilogram', 'Pair', 'Square Foot'],
  }
  await page.route('**/api/laundry/catalogue', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalogue) }))
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('group', { name: 'Fulfilment type' })).toBeVisible()
  const fulfilment = page.getByRole('group', { name: 'Fulfilment type' })
  await fulfilment.getByRole('button', { name: 'Express', exact: true }).click()
  await expect(fulfilment.getByRole('button', { name: 'Express', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Charge, discount & GST' })).toBeVisible()
  const chargeRule = page.getByLabel('Charge', { exact: true })
  await expect(chargeRule).toBeVisible()
  await expect(chargeRule).toHaveValue('express-charge-rule')
  await expect(chargeRule.locator('option:checked')).toContainText('Express charge')
  await chargeRule.selectOption('')
  await expect(chargeRule).toHaveValue('')
  await fulfilment.getByRole('button', { name: 'Home', exact: true }).click()
  await fulfilment.getByRole('button', { name: 'Express', exact: true }).click()
  await expect(chargeRule).toHaveValue('express-charge-rule')
  await expect(page.getByRole('button', { name: /Book order/ })).toBeDisabled()
})
