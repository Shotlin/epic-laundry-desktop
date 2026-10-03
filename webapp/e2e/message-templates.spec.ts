import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('message templates use stage tabs, safe previews, explicit save, archive and restore', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/message-templates', { waitUntil: 'domcontentloaded' })

  const writes: Array<{ method: string; pathname: string; body: string | null }> = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/laundry/message-templates') && request.method() !== 'GET') {
      writes.push({ method: request.method(), pathname: url.pathname, body: request.postData() })
    }
  })

  const tabs = page.getByRole('tablist', { name: 'Order message stage' })
  await expect(tabs.getByRole('tab')).toHaveCount(4)
  await expect(tabs.getByRole('tab', { name: 'Order Booked' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Settings only')).toBeVisible()
  await expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit Order Booked' })
  await expect(dialog).toBeVisible()
  const message = dialog.getByRole('textbox', { name: 'Message', exact: true })
  await message.fill('Hello {CustomerName}, your {UnknownField} order is booked.')
  await expect(dialog.getByRole('alert')).toContainText('Unknown placeholder: UnknownField')
  await expect(dialog.getByRole('button', { name: 'Save template' })).toBeDisabled()

  await message.fill('Hello {CustomerName}, your order {OrderNo} is booked.')
  await expect(dialog.getByLabel('Message preview')).toContainText('Hello Alex, your order EL-1042 is booked.')
  await expect(dialog.getByRole('button', { name: 'Save template' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Save template' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Hello {CustomerName}, your order {OrderNo} is booked.')).toBeVisible()
  expect(writes.map((write) => [write.method, write.pathname])).toEqual([
    ['PATCH', '/api/laundry/message-templates/order-booked'],
  ])
  expect(JSON.parse(writes[0].body || '{}').body).toContain('{OrderNo}')

  await tabs.getByRole('tab', { name: 'Order Processing' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const processingDialog = page.getByRole('dialog', { name: 'Edit Order Processing' })
  await processingDialog.getByRole('textbox', { name: 'Message', exact: true }).fill('Unsubmitted draft for {OrderNo}')
  await processingDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(processingDialog).toBeHidden()
  await expect(page.getByText('Unsubmitted draft for {OrderNo}')).toHaveCount(0)
  expect(writes).toHaveLength(1)

  await tabs.getByRole('tab', { name: 'Order Booked' }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByText('Archive this stage template?')).toBeVisible()
  await page.getByRole('button', { name: 'Archive template', exact: true }).click()
  await expect(page.getByText('Archived', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore template' }).click()
  await expect(page.getByText('Active', { exact: true })).toBeVisible()
  expect(writes.map((write) => write.pathname)).toEqual([
    '/api/laundry/message-templates/order-booked',
    '/api/laundry/message-templates/order-booked/archive',
    '/api/laundry/message-templates/order-booked/restore',
  ])
  expect(writes.some((write) => write.pathname.includes('/send'))).toBe(false)
})
