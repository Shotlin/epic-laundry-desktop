import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('UPI / Invoice QR keeps Generate and Update behind explicit, valid draft actions', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Store profile & UPI QR' }).click()

  const tabs = page.getByRole('tablist', { name: 'Store profile details' })
  await expect(tabs.getByRole('tab', { name: 'UPI / Invoice QR' })).toBeVisible()
  await tabs.getByRole('tab', { name: 'UPI / Invoice QR' }).click()
  await expect(page.getByRole('heading', { name: 'UPI / Invoice QR', exact: true })).toBeVisible()

  const upi = page.getByLabel('UPI ID', { exact: true })
  const generate = page.getByRole('button', { name: 'Generate QR', exact: true })
  const update = page.getByRole('button', { name: 'Update', exact: true })
  const visibility = page.getByRole('checkbox', { name: 'Show UPI QR on printed documents' })
  await expect(generate).toBeDisabled()
  await expect(update).toBeDisabled()
  await upi.fill('missing-handle')
  await expect(page.getByRole('alert')).toContainText('valid UPI ID')
  await expect(generate).toBeDisabled()
  await expect(update).toBeDisabled()

  await upi.fill('counter-review@upi')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(generate).toBeEnabled()
  await expect(update).toBeEnabled()
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/settings/store', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const payload = route.request().postDataJSON() as Record<string, unknown>
    posts.push(payload)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ businessName: 'Epic Laundry', upiId: payload.upiId, qrOnPrint: payload.qrOnPrint }) })
  })

  await generate.click()
  const qrImage = page.getByRole('img', { name: /^UPI QR for / })
  await expect(qrImage).toBeVisible()
  const screenshot = resolve(process.cwd(), '../artifacts/parity/store-upi-invoice-qr.png')
  mkdirSync(dirname(screenshot), { recursive: true })
  await page.screenshot({ path: screenshot })
  expect(posts).toEqual([])

  await visibility.check()
  await expect(update).toBeEnabled()
  await update.click()
  await expect(page.getByRole('status')).toContainText('UPI / invoice QR settings updated.')
  expect(posts).toEqual([{ upiId: 'counter-review@upi', qrOnPrint: true }])
  await expect(update).toBeDisabled()
  await expect(page.getByRole('img', { name: /^UPI QR for / })).toHaveCount(0)
})
