import { expect, test } from '@playwright/test'

test('order pricing keeps GST selection clear and updates the quote without booking', async ({ page }) => {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  const savedPricingResponse = await page.request.get('/api/laundry/catalogue')
  expect(savedPricingResponse.ok(), await savedPricingResponse.text()).toBe(true)
  const savedPricing = await savedPricingResponse.json() as { chargeRules: Array<{ name: string }>; discountRules: Array<{ name: string }> }
  expect(savedPricing.chargeRules.some((rule) => rule.name === 'Premium Express Delivery')).toBe(true)
  expect(savedPricing.discountRules.some((rule) => rule.name === 'Welcome Offer')).toBe(true)
  let gstRuleId = ''
  await page.route('**/api/laundry/catalogue', async (route) => {
    const response = await route.fetch()
    const catalogue = await response.json()
    catalogue.chargeRules = [...catalogue.chargeRules, { id: 'ui-audit-charge', name: 'Audit express charge', type: 'Flat', amount: 40, active: true }]
    catalogue.discountRules = [...catalogue.discountRules, { id: 'ui-audit-discount', name: 'Audit care discount', type: 'Percentage', amount: 10, active: true }]
    catalogue.prices = [...catalogue.prices, { ...catalogue.prices[0], id: 'ui-audit-zero-price', garmentName: 'Zero-price test item', rate: 0 }]
    gstRuleId = catalogue.taxRules.find((rule: { id: string; name: string; rate: number }) => rule.rate === 18 && /laundry|9997/i.test(rule.name))?.id || ''
    await route.fulfill({ response, json: catalogue })
  })
  const observedTaxQuotes: Array<{ taxRuleId: string; taxRate: number; taxAmount: number }> = []
  await page.route('**/api/laundry/quote', async (route) => {
    const input = route.request().postDataJSON() as { chargeRuleIds?: string[]; discountRuleIds?: string[]; taxRuleId?: string; taxRate?: number }
    const usesFixtureRule = input.chargeRuleIds?.includes('ui-audit-charge') || input.discountRuleIds?.includes('ui-audit-discount')
    // Keep the quote API real while removing test-only rule IDs that are not
    // persisted in the disposable demo catalogue.
    const response = await route.fetch({ postData: JSON.stringify(usesFixtureRule ? { ...input, chargeRuleIds: [], discountRuleIds: [] } : input) })
    const quote = await response.json() as { taxAmount?: number }
    observedTaxQuotes.push({ taxRuleId: input.taxRuleId || '', taxRate: Number(input.taxRate) || 0, taxAmount: Number(quote.taxAmount) || 0 })
    await route.fulfill({ response, json: quote })
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  await expect(page.getByText('Zero-price test item', { exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Online', exact: true })).toHaveClass(/border-\[\#efd37c\]/)

  const charge = page.getByRole('combobox', { name: 'Charge' })
  const discount = page.getByRole('combobox', { name: 'Discount', exact: true })
  const tax = page.getByRole('combobox', { name: 'GST' })
  await expect(charge).toBeVisible()
  await expect(discount).toBeVisible()
  await expect(tax).toBeVisible()
  await expect(charge.locator('option').first()).toHaveText('None')
  await expect(discount.locator('option').first()).toHaveText('None')
  await expect(tax.locator('option').first()).toHaveText('None')
  expect(gstRuleId).toBeTruthy()
  await expect(tax).toHaveValue(gstRuleId)
  await expect(tax.locator('option:checked')).toHaveText('GST (18%)')
  await expect(tax.locator('option')).toHaveCount(2)
  await page.locator('section').filter({ hasText: 'Charge, discount & GST' }).last().screenshot({ path: 'test-results/gst-selector-panel.png' })
  const originalViewport = page.viewportSize() || { width: 1280, height: 720 }
  await page.setViewportSize({ width: 390, height: 844 })
  expect((await tax.boundingBox())?.width || 0).toBeGreaterThan(240)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize(originalViewport)
  await expect(charge.locator('option[value="ui-audit-charge"]')).toHaveText('Audit express charge · Amount · ₹40')
  await expect(discount.locator('option[value="ui-audit-discount"]')).toHaveText('Audit care discount · Percentage · 10%')
  await expect(page.getByText('Manual adjustments (optional)')).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Additional charge' })).not.toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Manual discount amount' })).not.toBeVisible()
  await page.getByText('Manual adjustments (optional)', { exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Additional charge' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Manual discount amount' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Manual tax rate (%)' })).not.toBeVisible()

  let orderWrites = 0
  page.on('request', (request) => {
    if (/\/api\/laundry\/orders(?:\?|$)/.test(request.url()) && request.method() !== 'GET') orderWrites += 1
  })
  await page.locator('article').first().getByRole('button', { name: 'Add' }).click()
  await page.getByLabel(/^Edit /).click()
  const priceOverride = page.getByRole('spinbutton', { name: /Price override/ })
  await priceOverride.fill('0')
  await expect(priceOverride).toHaveValue('')
  await expect.poll(() => observedTaxQuotes.find((quote) => quote.taxRuleId === gstRuleId)?.taxAmount || 0).toBeGreaterThan(0)
  await charge.selectOption('__custom__')
  const customCharge = page.getByRole('spinbutton', { name: 'Custom charge amount' })
  await expect(customCharge).toBeVisible()
  await customCharge.fill('25')
  await expect(page.getByText('Applied ₹25', { exact: true })).toBeVisible()
  await discount.selectOption('__custom__')
  const discountType = page.getByRole('combobox', { name: 'Custom discount type', exact: true })
  const customDiscount = page.getByRole('spinbutton', { name: 'Custom discount amount' })
  await expect(discountType).toHaveValue('amount')
  await expect(customDiscount).toBeVisible()
  await discountType.selectOption('percentage')
  await customDiscount.fill('10')
  await expect(discountType).toHaveValue('percentage')
  await expect(page.getByRole('button', { name: 'Remove custom charge' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove custom discount' })).toBeVisible()
  await charge.selectOption('ui-audit-charge')
  await expect(charge).toHaveValue('ui-audit-charge')
  await discount.selectOption('ui-audit-discount')
  await expect(discount).toHaveValue('ui-audit-discount')
  await tax.selectOption('')
  await expect(tax).toHaveValue('')
  await expect.poll(() => observedTaxQuotes.at(-1)).toEqual({ taxRuleId: '', taxRate: 0, taxAmount: 0 })
  await charge.selectOption('')
  await discount.selectOption('')
  await expect(charge).toHaveValue('')
  await expect(discount).toHaveValue('')
  await expect(tax).toHaveValue('')
  await expect.poll(() => observedTaxQuotes.at(-1)).toEqual({ taxRuleId: '', taxRate: 0, taxAmount: 0 })
  await tax.selectOption(gstRuleId)
  await expect(tax).toHaveValue(gstRuleId)
  await expect(tax.locator('option:checked')).toHaveText('GST (18%)')
  await expect.poll(() => observedTaxQuotes.find((quote) => quote.taxRuleId === gstRuleId)?.taxAmount || 0).toBeGreaterThan(0)
  expect(orderWrites).toBe(0)
})

test('GST rate choice is unavailable for a store without GST enabled', async ({ page }) => {
  await page.route('**/api/laundry/print-settings', async (route) => {
    const response = await route.fetch()
    const settings = await response.json()
    await route.fulfill({ response, json: { ...settings, taxMode: 'none' } })
  })
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })

  const tax = page.getByRole('combobox', { name: 'GST' })
  await expect(tax).toBeVisible()
  await expect(tax.locator('option')).toHaveCount(1)
  await expect(tax.locator('option').first()).toHaveText('None')
  await expect(page.getByText('GST is not enabled for this store.').first()).toBeVisible()
})

test('booking requires review before a saved non-18 tax rate can be committed', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('epic-laundry-booking-draft-v1', JSON.stringify({ taxRate: 8 })))
  let customerWrites = 0
  await page.route('**/api/laundry/customers**', async (route) => {
    if (route.request().method() === 'POST') {
      customerWrites += 1
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'legacy-tax-customer', name: 'Draft customer', phone: '9000000000' }) })
      return
    }
    await route.continue()
  })
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()

  const tax = page.getByRole('combobox', { name: 'GST' })
  const book = page.getByRole('button', { name: 'Book order' })
  let orderWrites = 0
  page.on('request', (request) => {
    if (/\/api\/laundry\/orders(?:\?|$)/.test(request.url()) && request.method() !== 'GET') orderWrites += 1
  })
  await expect(tax.locator('option:checked')).toHaveText('Saved GST rate · 8% · choose a supported option')
  await page.locator('article').first().getByRole('button', { name: 'Add' }).click()
  await expect(book).toBeDisabled()
  await tax.selectOption({ label: 'GST (18%)' })
  await expect(tax.locator('option:checked')).toHaveText('GST (18%)')
  await expect(book).toBeDisabled()
  await page.getByRole('button', { name: 'Add new customer' }).click()
  const customerDialog = page.getByRole('dialog', { name: 'Add new customer' })
  await customerDialog.getByRole('textbox', { name: /Customer name/ }).fill('Draft customer')
  await customerDialog.getByRole('textbox', { name: /Phone number/ }).fill('9000000000')
  await customerDialog.getByRole('button', { name: 'Save customer' }).click()
  await expect(page.getByText('Draft customer', { exact: true })).toBeVisible()
  await expect(book).toBeEnabled()
  expect(customerWrites).toBe(1)
  expect(orderWrites).toBe(0)
})
