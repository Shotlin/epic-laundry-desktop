import { expect, test } from '@playwright/test'

async function openDemoOrders(page: import('@playwright/test').Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/orders')
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await expect(signIn).toBeVisible()
  await signIn.click()
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()
}

test('Phone No shows saved customer suggestions after three digits and fills the matching filters', async ({ page }) => {
  await page.route(/\/api\/laundry\/customers\?search=900(?:&|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'customer-900', name: 'Mira Sample', phone: '9000000001', email: '', address: '' }]),
    })
  })

  await openDemoOrders(page)
  const phone = page.getByRole('textbox', { name: 'Phone No' })
  await phone.fill('90')
  await expect(page.getByRole('listbox', { name: 'Saved customer suggestions' })).toHaveCount(0)

  await phone.fill('900')
  const suggestions = page.getByRole('listbox', { name: 'Saved customer suggestions' })
  await expect(suggestions).toBeVisible()
  await suggestions.getByRole('option', { name: /Mira Sample.*9000000001/ }).click()
  await expect(phone).toHaveValue('9000000001')
  await expect(page.getByRole('textbox', { name: 'Customer' })).toHaveValue('Mira Sample')
})
