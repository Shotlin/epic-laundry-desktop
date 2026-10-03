import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('store profile mirrors the source tabs and saves structured address and receipt details explicitly', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Store profile & UPI QR' }).click()

  const tabs = page.getByRole('tablist', { name: 'Store profile details' })
  await expect(tabs.getByRole('tab')).toHaveCount(3)
  await expect(tabs.getByRole('tab', { name: 'Store Details' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Current branch code')).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Store name')).toHaveAttribute('required', '')
  const allowTax = page.getByRole('checkbox', { name: 'Allow tax' })
  const taxNumber = page.getByLabel('Tax No', { exact: true })
  const taxSameAsCompany = page.getByRole('checkbox', { name: 'Tax Same As Company' })
  await allowTax.setChecked(false)
  await expect(taxNumber).toHaveCount(0)
  await expect(taxSameAsCompany).toHaveCount(0)
  await allowTax.check()
  await expect(taxNumber).toBeVisible()
  await expect(taxSameAsCompany).toBeVisible()
  await taxSameAsCompany.check()
  const taxScreenshot = resolve(process.cwd(), '../artifacts/parity/store-profile-tax-toggle.png')
  mkdirSync(dirname(taxScreenshot), { recursive: true })
  await page.locator('#business-profile').screenshot({ path: taxScreenshot })
  await allowTax.uncheck()
  await expect(taxNumber).toHaveCount(0)
  await expect(taxSameAsCompany).toHaveCount(0)
  await allowTax.check()
  await expect(taxSameAsCompany).toBeChecked()
  await taxNumber.fill('22AAAAA0000A1Z5')

  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/settings/store') writes.push(request.postData() || '')
  })

  await page.getByLabel('Store name', { exact: true }).fill('Profile Review Test')
  await page.getByLabel('Google Review Link', { exact: true }).fill('https://example.com/review')
  await page.getByRole('tab', { name: 'Address Details' }).click()
  const reviewScreenshot = resolve(process.cwd(), '../artifacts/parity/store-profile-address.png')
  mkdirSync(dirname(reviewScreenshot), { recursive: true })
  await page.locator('#business-profile').screenshot({ path: reviewScreenshot })
  await page.getByLabel('Address 1', { exact: true }).fill('Unit 12')
  await page.getByLabel('Address 2', { exact: true }).fill('Market Road')
  await page.getByLabel('City', { exact: true }).fill('Kolkata')
  await page.getByLabel('State', { exact: true }).fill('West Bengal')
  await page.getByLabel('Postal Code', { exact: true }).fill('700001')
  await page.getByLabel('Landmark', { exact: true }).fill('Clock tower')
  await page.getByLabel('Terms and Conditions', { exact: true }).fill('Please collect within 30 days.')
  await expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Save store profile' }).click()
  await expect(page.getByText('Store profile saved locally.')).toBeVisible()
  expect(writes).toHaveLength(1)
  const saved = JSON.parse(writes[0])
  expect(saved.taxSameAsCompany).toBe(true)
  expect(saved.address).toBe('Unit 12, Market Road, Kolkata, West Bengal, 700001, Clock tower')
  expect(saved.googleReviewUrl).toBe('https://example.com/review')
  expect(saved.termsAndConditions).toBe('Please collect within 30 days.')

  const printSettings = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/print-settings')
    return response.json()
  })
  expect(printSettings.termsAndConditions).toBe('Please collect within 30 days.')
  expect(printSettings.googleReviewUrl).toBe('https://example.com/review')
})
