import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

async function captureEvidence(page: Page, name: string, fullPage = false) {
  const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage })
}

async function expectMoneyField(region: Locator, label: string, expected: number) {
  const value = await region.getByText(label, { exact: true }).locator('..').locator('dd').innerText()
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  expect(parsed, `${label} should match the saved order amount`).toBeCloseTo(expected, 2)
}

function displayDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Store Orders exposes keyboard-ready read-only history separately from order actions', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()

  const historyButton = page.getByRole('button', { name: /^Open order history for / }).first()
  const summaryButton = page.getByRole('button', { name: /^Open order summary for / }).first()
  await expect(historyButton).toBeVisible()
  await expect(summaryButton).toBeVisible()
  await expect(historyButton.locator('svg')).toHaveClass(/lucide-eye/)
  await expect(summaryButton.locator('svg')).toHaveClass(/lucide-external-link/)
  await historyButton.focus()
  let writes = 0
  page.on('request', (request) => {
    if (/\/api\/laundry\/orders\//.test(request.url()) && request.method() !== 'GET') writes += 1
  })
  await historyButton.click()

  const dialog = page.getByRole('dialog', { name: 'Order history' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Current order status')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Order timeline' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Record collection|Confirm reversal|Move order/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  expect(writes).toBe(0)
  await captureEvidence(page, 'orders-history-modal-desktop')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(historyButton).toBeFocused()

  await summaryButton.click()
  const workCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(workCard).toBeVisible()
  await expect(workCard.getByText('Order work card', { exact: true })).toBeVisible()
  expect(writes).toBe(0)
  await captureEvidence(page, 'orders-summary-modal-desktop')
  await page.keyboard.press('Escape')
  await expect(workCard).toBeHidden()

  await page.setViewportSize({ width: 390, height: 844 })
  await historyButton.click()
  const mobileDialog = page.getByRole('dialog', { name: 'Order history' })
  await expect(mobileDialog).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await captureEvidence(page, 'orders-history-modal-mobile')
  expect(writes).toBe(0)
})

test('Store Orders edits through the shared builder and Cancel discards the unsaved amendment', async ({ page }) => {
  await signIntoDemo(page)

  type OrderListResponse = {
    items: Array<{
      id: string
      orderNumber: string
      invoiceNumber?: string
      state: string
      expectedDeliveryDate: string
      customer: { name: string; phone: string }
      items: Array<{ garmentName: string; serviceName: string; qty: number; color?: string; garmentType?: string }>
    }>
  }

  const listResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/orders' && response.request().method() === 'GET' && response.ok()
  })
  const orderWrites: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^\/api\/laundry\/orders(?:\/|$)/.test(url.pathname) && request.method() !== 'GET') {
      orderWrites.push(`${request.method()} ${url.pathname}`)
    }
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  const listResponse = await listResponsePromise
  const orderPage = await listResponse.json() as OrderListResponse
  const target = orderPage.items.find((order) =>
    !['Delivered', 'Cancelled'].includes(order.state)
    && order.items.some((item) => item.garmentName && item.serviceName && item.qty > 0),
  )
  expect(target, 'the isolated demo should include an amendable order with garment lines').toBeTruthy()
  if (!target) return

  const summaryButton = page.getByRole('button', { name: `Open order summary for ${target.invoiceNumber || target.orderNumber}` })
  await expect(summaryButton).toBeVisible()
  await summaryButton.click()

  const workCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(workCard.getByText(target.orderNumber, { exact: true })).toBeVisible()
  await expect(workCard.getByText(target.customer.name, { exact: true })).toBeVisible()
  await expect(workCard.getByText(target.customer.phone, { exact: true })).toBeVisible()
  await workCard.getByRole('button', { name: 'Edit in order builder' }).click()

  await expect(page).toHaveURL(/#\/laundry\/new-order\?edit=/)
  const editHash = new URL(page.url()).hash
  expect(new URLSearchParams(editHash.slice(editHash.indexOf('?') + 1)).get('edit')).toBe(target.id)
  await expect(page.getByRole('heading', { name: 'Amend the order in the familiar builder.' })).toBeVisible()
  await expect(page.getByText('Controlled amendment', { exact: true })).toBeVisible()
  await expect(page.getByText(target.customer.name, { exact: true })).toBeVisible()
  await expect(page.getByText(target.customer.phone, { exact: true })).toBeVisible()
  await expect(page.getByText('The customer and paid collections stay fixed.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Expected delivery')).toHaveValue(target.expectedDeliveryDate)

  for (const item of target.items.filter((line) => line.garmentName && line.serviceName && line.qty > 0)) {
    await expect(page.getByText(item.garmentName, { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: `Edit ${item.garmentName}`, exact: true }).first().click()
    await expect(page.getByLabel(`Colour for ${item.garmentName}`).first()).toHaveValue(item.color || '')
    await expect(page.getByLabel(`Care type for ${item.garmentName}`).first()).toHaveValue(item.garmentType || '')
  }
  await captureEvidence(page, 'order-edit-builder-desktop')

  await page.getByRole('button', { name: 'Order photos & notes', exact: true }).click()
  await page.getByRole('textbox', { name: 'Order remarks' }).fill('UNSAVED CANCEL CHECK')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await captureEvidence(page, 'order-edit-builder-mobile')

  await page.getByRole('button', { name: 'Cancel amendment' }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/laundry\\/orders\\?order=${target.id}`))
  const returnedWorkCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(returnedWorkCard.getByText(target.orderNumber, { exact: true })).toBeVisible()
  await expect(returnedWorkCard.getByText('UNSAVED CANCEL CHECK', { exact: true })).toHaveCount(0)
  expect(orderWrites).toEqual([])
})

test('shared-builder amendment preserves GST 18% and records a replacement invoice', async ({ page }) => {
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin

  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as {
    garments: Array<{ id: string; active?: boolean }>
    services: Array<{ id: string; active?: boolean }>
    prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
    taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
  }
  const garmentIds = new Set(catalogue.garments.filter((item) => item.active !== false).map((item) => item.id))
  const serviceIds = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const pricedPair = catalogue.prices.find((price) => price.active !== false && price.rate > 0 && garmentIds.has(price.garment) && serviceIds.has(price.service))
  expect(pricedPair, 'the isolated demo should provide one active garment/service price').toBeTruthy()
  if (!pricedPair) return
  const gstRule = catalogue.taxRules.find((rule) => rule.active !== false && rule.rate === 18 && /laundry|9997/i.test(rule.name))
  expect(gstRule, 'the isolated demo should provide its configured 18% laundry GST rule').toBeTruthy()
  if (!gstRule) return

  const fixtureKey = `edit-flow-${Date.now()}`
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': fixtureKey },
    data: {
      customer: { name: `Edit Save Fixture ${fixtureKey}`, phone: `91${Date.now().toString().slice(-8)}` },
      items: [{ garment: pricedPair.garment, service: pricedPair.service, qty: 1, color: 'Navy', garmentType: 'Standard' }],
      expectedDeliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      fulfillmentMode: 'Home Delivery',
      paymentMode: 'Pay Later',
      taxRate: 18,
      taxRuleId: gstRule.id,
      notes: 'Original fixture note',
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const bookingResult = await bookingResponse.json() as { order: {
    id: string; orderNumber: string; invoiceNumber?: string; version?: number; taxRate: number; taxAmount: number; grandTotal: number;
    orderDate: string; expectedDeliveryDate: string; subtotal: number; charges: number; discounts: number; paymentMode: string;
    paymentStatus: string; source: string; notes: string; items: Array<{ garmentName: string; serviceName: string; qty: number; unit: string; rate: number; amount: number; color?: string; garmentType?: string }>;
  } }
  const bookedOrder = bookingResult.order
  expect(bookedOrder.invoiceNumber).toBeTruthy()
  expect(bookedOrder.taxRate).toBe(18)

  const orderWrites: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^\/api\/laundry\/orders(?:\/|$)/.test(url.pathname) && request.method() !== 'GET') {
      orderWrites.push(`${request.method()} ${url.pathname}`)
    }
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox', { name: 'Order No' }).fill(bookedOrder.orderNumber)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const summaryButton = page.getByRole('button', { name: `Open order summary for ${bookedOrder.invoiceNumber || bookedOrder.orderNumber}` })
  await expect(summaryButton).toBeVisible()
  await summaryButton.click()
  const workCard = page.getByRole('dialog', { name: 'Order work card' })
  await expect(workCard.getByText(bookedOrder.orderNumber, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(workCard).toBeHidden()
  await page.goto('/ui/app/?local-demo=1#/laundry/orders/' + bookedOrder.id, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Order detail', { exact: true })).toBeVisible()
  await expect(page.getByText(bookedOrder.orderNumber, { exact: true })).toBeVisible()
  const orderSummary = page.getByRole('region', { name: 'Order summary' })
  await expect(orderSummary.getByText('Invoice number', { exact: true }).locator('..').locator('dd')).toHaveText(bookedOrder.invoiceNumber!)
  await expect(orderSummary.getByText('Order date', { exact: true }).locator('..').locator('dd')).toHaveText(displayDate(bookedOrder.orderDate))
  await expect(orderSummary.getByText('Expected delivery', { exact: true }).locator('..').locator('dd')).toHaveText(displayDate(bookedOrder.expectedDeliveryDate))
  await expect(orderSummary.getByText('Payment method', { exact: true }).locator('..').locator('dd')).toHaveText(bookedOrder.paymentMode)
  await expect(orderSummary.getByText('Payment status', { exact: true }).locator('..').locator('dd')).toHaveText(bookedOrder.paymentStatus)
  const financialSummary = page.getByRole('region', { name: 'Order financial summary' })
  await expectMoneyField(financialSummary, 'Subtotal', bookedOrder.subtotal)
  await expectMoneyField(financialSummary, 'Charges', bookedOrder.charges)
  await expectMoneyField(financialSummary, 'Discounts', bookedOrder.discounts)
  await expect(financialSummary.getByText('GST rate', { exact: true }).locator('..').locator('dd')).toHaveText('18%')
  await expectMoneyField(financialSummary, 'GST amount', bookedOrder.taxAmount)
  await expectMoneyField(financialSummary, 'Grand total', bookedOrder.grandTotal)
  await expect(page.getByRole('region', { name: 'Order notes and photo' })).toContainText('Original fixture note')
  await expect(page.getByText('Navy · Standard', { exact: true })).toBeVisible()
  await captureEvidence(page, 'order-detail-page-full-desktop', true)
  await page.getByRole('button', { name: 'Edit in order builder' }).click()

  await expect(page.getByText('Controlled amendment', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'GST', exact: true })).toHaveValue(gstRule.id)
  await expect(page.getByRole('combobox', { name: 'GST', exact: true }).locator('option:checked')).toHaveText('GST (18%)')
  await expect(page.getByText('Grand total', { exact: true }).locator('..')).toContainText(`₹${bookedOrder.grandTotal.toFixed(2)}`)
  await page.getByRole('button', { name: 'Order photos & notes', exact: true }).click()
  await page.getByRole('textbox', { name: 'Order remarks' }).fill('Saved amendment fixture note')

  const amendmentResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === `/api/laundry/orders/${bookedOrder.id}` && response.request().method() === 'PATCH'
  })
  await page.getByRole('button', { name: 'Save replacement invoice' }).click()
  const amendmentResponse = await amendmentResponsePromise
  expect(amendmentResponse.status(), await amendmentResponse.text()).toBe(200)
  const amendedOrder = await amendmentResponse.json() as { id: string; invoiceNumber?: string; version?: number; taxRate: number; grandTotal: number; notes?: string }
  expect(amendedOrder.id).toBe(bookedOrder.id)
  expect(amendedOrder.taxRate).toBe(18)
  expect(amendedOrder.grandTotal).toBe(bookedOrder.grandTotal)
  expect(amendedOrder.invoiceNumber).not.toBe(bookedOrder.invoiceNumber)
  expect(amendedOrder.version).toBeGreaterThan(bookedOrder.version || 0)
  expect(amendedOrder.notes).toBe('Saved amendment fixture note')
  expect(new URL(page.url()).hash).toBe('#/laundry/orders/' + bookedOrder.id)
  expect(orderWrites).toEqual([`PATCH /api/laundry/orders/${bookedOrder.id}`])

  const persistedResponse = await page.request.get(`${origin}/api/laundry/orders/${bookedOrder.id}`)
  expect(persistedResponse.ok()).toBe(true)
  const persistedOrder = await persistedResponse.json() as { id: string; invoiceNumber?: string; taxRate: number; grandTotal: number; notes?: string }
  expect(persistedOrder).toMatchObject({
    id: bookedOrder.id,
    invoiceNumber: amendedOrder.invoiceNumber,
    taxRate: 18,
    grandTotal: bookedOrder.grandTotal,
    notes: 'Saved amendment fixture note',
  })
  const canonicalResponse = await page.request.get(`${origin}/api/gst/canonical-invoices/${bookedOrder.id}`)
  expect(canonicalResponse.ok()).toBe(true)
  const canonicalSnapshot = await canonicalResponse.json() as { data: { sourceOrderId: string; sourceInvoiceId?: string; invoiceNumber: string; tax: { totals: { totalPaise: number } } } }
  expect(canonicalSnapshot.data.sourceOrderId).toBe(bookedOrder.id)
  expect(canonicalSnapshot.data.sourceInvoiceId).toBeTruthy()
  expect(canonicalSnapshot.data.invoiceNumber).toBe(amendedOrder.invoiceNumber)
  expect(canonicalSnapshot.data.tax.totals.totalPaise).toBe(Math.round(amendedOrder.grandTotal * 100))
  const printResponse = await page.request.get(`${origin}/api/gst/canonical-invoices/${bookedOrder.id}/print`)
  expect(printResponse.ok()).toBe(true)
  const printedInvoice = await printResponse.text()
  expect(printedInvoice).toContain(amendedOrder.invoiceNumber)
  expect(printedInvoice).not.toContain(bookedOrder.invoiceNumber!)
})

test('shared-builder edit rejects a stale version and keeps the draft recoverable', async ({ page }) => {
  await signIntoDemo(page)
  const origin = new URL(page.url()).origin
  const catalogueResponse = await page.request.get(`${origin}/api/laundry/catalogue`)
  expect(catalogueResponse.ok()).toBe(true)
  const catalogue = await catalogueResponse.json() as {
    garments: Array<{ id: string; active?: boolean }>
    services: Array<{ id: string; active?: boolean }>
    prices: Array<{ garment: string; service: string; rate: number; active?: boolean }>
    taxRules: Array<{ id: string; name: string; rate: number; active?: boolean }>
  }
  const garmentIds = new Set(catalogue.garments.filter((item) => item.active !== false).map((item) => item.id))
  const serviceIds = new Set(catalogue.services.filter((item) => item.active !== false).map((item) => item.id))
  const pricedPair = catalogue.prices.find((price) => price.active !== false && price.rate > 0 && garmentIds.has(price.garment) && serviceIds.has(price.service))
  const gstRule = catalogue.taxRules.find((rule) => rule.active !== false && rule.rate === 18 && /laundry|9997/i.test(rule.name))
  expect(pricedPair, 'the isolated demo should provide an active garment/service price').toBeTruthy()
  expect(gstRule, 'the isolated demo should provide the configured 18% laundry GST rule').toBeTruthy()
  if (!pricedPair || !gstRule) return

  const fixtureKey = `stale-edit-${Date.now()}`
  const bookingResponse = await page.request.post(`${origin}/api/laundry/orders`, {
    headers: { 'idempotency-key': fixtureKey },
    data: {
      customer: { name: `Stale Edit Fixture ${fixtureKey}`, phone: `91${Date.now().toString().slice(-8)}` },
      items: [{ garment: pricedPair.garment, service: pricedPair.service, qty: 1, color: 'Navy', garmentType: 'Standard' }],
      expectedDeliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      fulfillmentMode: 'Home Delivery', paymentMode: 'Pay Later', taxRate: 18, taxRuleId: gstRule.id,
    },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  const created = await bookingResponse.json() as { order: {
    id: string; version?: number; expectedDeliveryDate: string; fulfillmentMode: string; charges: number; discounts: number; taxRate: number;
    items: Array<{ garment?: string; service?: string; qty: number; color?: string; garmentType?: string; rateOverride?: number }>
  } }
  const originalOrder = created.order
  expect(Number.isInteger(originalOrder.version)).toBe(true)
  expect(originalOrder.version).toBeGreaterThanOrEqual(0)

  await page.goto(`/ui/app/?local-demo=1#/laundry/orders/${originalOrder.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Edit in order builder' }).click()
  await expect(page.getByRole('heading', { name: 'Amend the order in the familiar builder.' })).toBeVisible()
  await page.getByRole('button', { name: 'Order photos & notes', exact: true }).click()
  const unsavedNote = `Stale draft ${fixtureKey}`
  await page.getByRole('textbox', { name: 'Order remarks' }).fill(unsavedNote)

  // Simulate another authorized workspace saving after this editor loaded its
  // version. The browser editor must not overwrite that newer invoice.
  const concurrentResponse = await page.request.patch(`${origin}/api/laundry/orders/${originalOrder.id}`, {
    data: {
      items: originalOrder.items,
      expectedDeliveryDate: originalOrder.expectedDeliveryDate,
      fulfillmentMode: originalOrder.fulfillmentMode,
      charges: originalOrder.charges,
      discounts: originalOrder.discounts,
      taxRate: originalOrder.taxRate,
      chargeRuleIds: [],
      discountRuleIds: [],
      taxRuleId: gstRule.id,
      notes: `Concurrent save ${fixtureKey}`,
      expectedVersion: originalOrder.version,
    },
  })
  expect(concurrentResponse.status(), await concurrentResponse.text()).toBe(200)
  const concurrentOrder = await concurrentResponse.json() as { version: number; invoiceNumber?: string; notes: string }
  expect(concurrentOrder.version).toBe((originalOrder.version || 0) + 1)

  const editorWrites: number[] = []
  page.on('request', (request) => {
    if (request.url().includes(`/api/laundry/orders/${originalOrder.id}`) && request.method() === 'PATCH') editorWrites.push(request.method() === 'PATCH' ? 1 : 0)
  })
  const rejectedEdit = page.waitForResponse((response) => response.url().includes(`/api/laundry/orders/${originalOrder.id}`) && response.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Save replacement invoice' }).click()
  const rejectedResponse = await rejectedEdit
  expect(rejectedResponse.status()).toBe(400)
  await expect(page.getByText(/stale order version: expected/i)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Order remarks' })).toHaveValue(unsavedNote)
  expect(editorWrites).toEqual([1])

  const persistedResponse = await page.request.get(`${origin}/api/laundry/orders/${originalOrder.id}`)
  expect(persistedResponse.ok()).toBe(true)
  const persisted = await persistedResponse.json() as { version: number; invoiceNumber?: string; notes: string }
  expect(persisted).toMatchObject({ version: concurrentOrder.version, invoiceNumber: concurrentOrder.invoiceNumber, notes: concurrentOrder.notes })
})

test('Store Orders matches the source multi-select status filter and applies it only on Search', async ({ page }) => {
  await signIntoDemo(page)
  const orderQueries: URL[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/laundry/orders' && request.method() === 'GET') orderQueries.push(url)
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: 'More filters' }).click()
  const statusFilter = page.getByRole('button', { name: 'Select order statuses' })
  await expect(statusFilter).toBeVisible()
  await expect(statusFilter).toContainText('All Status')
  await statusFilter.click()
  const statusOptions = page.getByRole('group', { name: 'Order statuses' })
  const statusLabels = [
    'Booked',
    'In Process',
    'Delivered',
    'Cancelled',
    'Done',
    'Partially Delivered',
    'Pickup Assigned',
    'Pickup Received',
    'Out for Delivery',
  ]
  await expect(statusOptions.getByRole('checkbox')).toHaveCount(statusLabels.length)
  for (const label of statusLabels) await expect(statusOptions.getByRole('checkbox', { name: label, exact: true })).toBeVisible()

  await expect(page.getByText(/\d+ matching orders?/)).toBeVisible()
  await expect.poll(() => orderQueries.some((url) => !url.searchParams.has('status'))).toBe(true)
  const defaultMatches = await page.getByText(/\d+ matching orders?/).innerText()
  const initialQueryCount = orderQueries.length
  await statusOptions.getByRole('checkbox', { name: 'In Process', exact: true }).check()
  await statusOptions.getByRole('checkbox', { name: 'Done', exact: true }).check()
  expect(orderQueries).toHaveLength(initialQueryCount)
  await statusOptions.getByRole('button', { name: 'Close status list', exact: true }).click()
  await expect(statusFilter).toBeFocused()
  const filteredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/orders' && url.searchParams.get('status') === 'in-process,done' && response.ok()
  })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await filteredResponse
  await expect.poll(() => orderQueries.some((url) => url.searchParams.get('status') === 'in-process,done')).toBe(true)
  await expect(statusFilter).toContainText('In Process, Done')
  await expect(page.getByRole('columnheader', { name: 'Source', exact: true })).toBeVisible()
  await expect(page.getByRole('table').getByRole('row').nth(1).getByRole('cell').nth(4)).toContainText(/By-Store|Customer App|Website|Marketplace/)
  await expect(page.getByRole('cell', { name: 'In Process', exact: true }).first()).toBeVisible()
  const visibleRows = await page.getByRole('table').getByRole('row').all()
  const statesInPage = await Promise.all(visibleRows.slice(1).map(async (row) => (await row.getByRole('cell').nth(5).innerText()).trim()))
  expect(statesInPage.length).toBeGreaterThan(0)
  expect(new Set(statesInPage.map((state) => state.trim()))).toEqual(new Set(['In Process', 'Ready']))

  await statusFilter.click()
  await statusOptions.getByRole('button', { name: 'All Status', exact: true }).click()
  for (const label of statusLabels) await expect(statusOptions.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked()
  await statusOptions.getByRole('button', { name: 'Close status list', exact: true }).click()
  await expect(statusFilter).toContainText('All Status')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText(defaultMatches)).toBeVisible()
})

test('Store Orders Excel exports every filtered page and offers recovery after a failed page read', async ({ page }) => {
  await signIntoDemo(page)
  const exportRequests: URL[] = []
  let failFirstExportPage = true
  const exportRow = (sequence: number) => ({
    id: `export-fixture-${sequence}`,
    invoiceNumber: `INV-EXPORT-${sequence}`,
    orderNumber: `ORD-EXPORT-${sequence}`,
    customer: { name: `Export Customer ${sequence}`, phone: `900000${String(sequence).padStart(4, '0')}` },
    orderDate: '2026-09-20',
    expectedDeliveryDate: '2026-10-01',
    grandTotal: 100 + sequence,
    paymentMode: 'Pay Later',
    paymentStatus: 'Unpaid',
    state: 'Booked',
    fulfillmentMode: 'Pickup Order',
    itemCount: 1,
  })
  await page.route('**/api/laundry/orders?*', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || url.searchParams.get('pageSize') !== '100') {
      await route.continue()
      return
    }
    exportRequests.push(url)
    const requestedPage = Number(url.searchParams.get('page') || 1)
    if (failFirstExportPage) {
      failFirstExportPage = false
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary export read failure' }) })
      return
    }
    const items = requestedPage === 1 ? Array.from({ length: 100 }, (_, index) => exportRow(index + 1)) : [exportRow(101)]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, total: 101, page: requestedPage, pageSize: 100, totalPages: 2 }),
    })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(/\d+ matching orders?/)).toBeVisible()
  await page.getByRole('button', { name: 'More filters' }).click()
  const statusMenu = page.getByRole('button', { name: 'Select order statuses' })
  await statusMenu.click()
  const statusOptions = page.getByRole('group', { name: 'Order statuses' })
  await statusOptions.getByRole('checkbox', { name: 'Booked', exact: true }).check()
  await statusOptions.getByRole('button', { name: 'Close status list' }).click()
  const filteredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/orders' && url.searchParams.get('status') === 'booked' && response.ok()
  })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await filteredResponse

  const excelButton = page.getByRole('button', { name: 'Excel', exact: true })
  await expect(excelButton).toBeEnabled()
  await excelButton.click()
  await expect(page.getByRole('alert')).toHaveText('Could not export all matching orders. Check the connection and try again.')
  expect(exportRequests).toHaveLength(1)
  expect(exportRequests[0].searchParams.get('status')).toBe('booked')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel', exact: true }).click()
  const download = await downloadPromise
  const savedPath = await download.path()
  expect(savedPath).toBeTruthy()
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(readFileSync(savedPath!), { type: 'buffer' })
  const exportedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Store Orders'])
  expect(exportedRows).toHaveLength(101)
  expect(exportedRows[0]).toMatchObject({ 'Order no.': 'ORD-EXPORT-1', Status: 'Booked' })
  expect(exportedRows[100]).toMatchObject({ 'Order no.': 'ORD-EXPORT-101', Status: 'Booked' })
  expect(exportRequests.map((url) => url.searchParams.get('page'))).toEqual(['1', '1', '2'])
  expect(exportRequests.every((url) => url.searchParams.get('status') === 'booked')).toBe(true)
  await expect(page.getByRole('status')).toHaveText('Excel file prepared for 101 matching orders.')
})

test('Store Orders exposes separate source search fields and clears the applied search', async ({ page }) => {
  await signIntoDemo(page)
  const orderQueries: URL[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/laundry/orders' && request.method() === 'GET') orderQueries.push(url)
  })
  const initialResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/orders'
      && !url.searchParams.has('phone')
      && !url.searchParams.has('orderNo')
      && !url.searchParams.has('customer')
      && response.ok()
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })

  const phone = page.getByRole('textbox', { name: 'Phone No' })
  const orderNo = page.getByRole('textbox', { name: 'Order No' })
  const customer = page.getByRole('textbox', { name: 'Customer' })
  await expect(phone).toBeVisible()
  await expect(orderNo).toBeVisible()
  await expect(customer).toBeVisible()
  await expect(page.getByText(/\d+ matching orders?/)).toBeVisible()
  const initialResponse = await initialResponsePromise
  const initialTotal = (await initialResponse.json() as { total: number }).total
  const initialMatches = `${initialTotal} matching order${initialTotal === 1 ? '' : 's'}`
  await expect(page.getByText(initialMatches)).toBeVisible()
  const initialQueryCount = orderQueries.length

  await phone.fill('5550001010')
  await orderNo.fill('order-no-not-found-5843')
  await customer.fill('customer-not-found-7244')
  expect(orderQueries).toHaveLength(initialQueryCount)

  const filteredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/laundry/orders'
      && url.searchParams.get('phone') === '5550001010'
      && url.searchParams.get('orderNo') === 'order-no-not-found-5843'
      && url.searchParams.get('customer') === 'customer-not-found-7244'
      && response.ok()
  })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await filteredResponse
  await expect(page.getByText(/0 matching orders?/)).toBeVisible()

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(phone).toHaveValue('')
  await expect(orderNo).toHaveValue('')
  await expect(customer).toHaveValue('')
  await expect(page.getByText(initialMatches)).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(phone).toBeVisible()
  await expect(orderNo).toBeVisible()
  await expect(customer).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await captureEvidence(page, 'store-orders-search-mobile')
})

test('Store Orders toggles list and grid views without dropping rows or actions', async ({ page }) => {
  await signIntoDemo(page)
  const listQueries: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/laundry/orders' && request.method() === 'GET') listQueries.push(url.href)
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('table')).toBeVisible()
  const firstRow = page.getByRole('table').getByRole('row').nth(1)
  const firstOrderText = (await firstRow.getByRole('cell').nth(0).innerText()).trim()
  const queryCount = listQueries.length

  const gridView = page.getByRole('button', { name: 'Grid view' })
  await gridView.focus()
  await page.keyboard.press('Enter')
  await expect(gridView).toHaveAttribute('aria-pressed', 'true')
  const grid = page.getByRole('list', { name: 'Store orders' })
  await expect(grid).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  const firstCard = grid.getByRole('listitem').first()
  await expect(firstCard).toContainText(firstOrderText.split('\n')[0])
  await expect(firstCard.getByRole('button', { name: /^Open order history for / })).toBeVisible()
  await expect(firstCard.getByRole('button', { name: /^Open order summary for / })).toBeVisible()
  expect(listQueries).toHaveLength(queryCount)
  await firstCard.scrollIntoViewIfNeeded()
  await captureEvidence(page, 'store-orders-grid-desktop')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await firstCard.scrollIntoViewIfNeeded()
  await captureEvidence(page, 'store-orders-grid-mobile')
  const listView = page.getByRole('button', { name: 'List view' })
  await listView.click()
  await expect(listView).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row').nth(1).getByRole('cell').nth(0)).toContainText(firstOrderText.split('\n')[0])
  expect(listQueries).toHaveLength(queryCount)
})

test('Store Orders page size and pagination preserve the correct result slice', async ({ page }) => {
  await signIntoDemo(page)
  const seedResponse = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/orders?page=1&pageSize=1')
    return { ok: response.ok, body: await response.json() }
  })
  expect(seedResponse.ok).toBe(true)
  const seed = (seedResponse.body as { items: Array<Record<string, any>> }).items[0]
  expect(seed).toBeTruthy()

  const fixtures = Array.from({ length: 11 }, (_, index) => ({
    ...seed,
    id: `pagination-fixture-${index + 1}`,
    orderNumber: `LND-PAGE-${String(index + 1).padStart(2, '0')}`,
    invoiceNumber: `INV-PAGE-${String(index + 1).padStart(2, '0')}`,
    customer: { ...seed.customer, id: `pagination-customer-${index + 1}`, name: `Pagination Customer ${index + 1}` },
  }))
  const queries: URL[] = []
  await page.route('**/api/laundry/orders?*', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || url.pathname !== '/api/laundry/orders') {
      await route.continue()
      return
    }
    queries.push(url)
    const requestedPage = Number(url.searchParams.get('page') || 1)
    const requestedSize = Number(url.searchParams.get('pageSize') || 50)
    const start = (requestedPage - 1) * requestedSize
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: fixtures.slice(start, start + requestedSize), total: fixtures.length, page: requestedPage, pageSize: requestedSize, totalPages: Math.ceil(fixtures.length / requestedSize) }),
    })
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  const pageSize = page.getByRole('combobox', { name: 'Items per page' })
  await expect(pageSize).toHaveValue('50')

  await pageSize.selectOption('10')
  await expect(page.getByText('Page 1 of 2')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'LND-PAGE-01' })).toBeVisible()
  expect(queries.at(-1)?.searchParams.get('page')).toBe('1')
  expect(queries.at(-1)?.searchParams.get('pageSize')).toBe('10')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'LND-PAGE-11' })).toBeVisible()
  expect(queries.at(-1)?.searchParams.get('page')).toBe('2')
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByText('Page 1 of 2')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'LND-PAGE-01' })).toBeVisible()

  await pageSize.selectOption('25')
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'LND-PAGE-11' })).toBeVisible()
  expect(queries.at(-1)?.searchParams.get('page')).toBe('1')
  expect(queries.at(-1)?.searchParams.get('pageSize')).toBe('25')
})

test('Store Orders bulk status actions select eligible orders and confirm each change', async ({ page }) => {
  await signIntoDemo(page)
  let order = {
    id: 'bulk-status-fixture', orderNumber: 'LND-BULK-001', invoiceNumber: 'INV-BULK-001',
    customer: { id: 'bulk-customer', name: 'Bulk Status Customer', phone: '9000001234' },
    orderDate: '2026-09-20', expectedDeliveryDate: '2026-10-03', fulfillmentMode: 'Pickup Order',
    deliveryAddress: '', serviceZone: '', state: 'In Process', version: 4, itemCount: 1,
    subtotal: 100, charges: 0, discounts: 0, taxRate: 18, taxAmount: 18, grandTotal: 118,
    paymentMode: 'Pay Later', paymentStatus: 'Unpaid', source: 'By Store', reportedBy: 'Owner',
    pickupSlot: '', deliverySlot: '', items: [{ garment: 'shirt', service: 'wash', garmentName: 'Shirt', serviceName: 'Wash', unit: 'Piece', qty: 1, rate: 100, amount: 100 }],
    physicalUnits: [], containers: [], notes: '', photoPaths: '', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
  }
  const transitionPayloads: Array<{ state: string; expectedVersion: number }> = []
  await page.route('**/api/laundry/orders?*', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname === '/api/laundry/orders') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [order], total: 1, page: Number(url.searchParams.get('page') || 1), pageSize: Number(url.searchParams.get('pageSize') || 50), totalPages: 1 }) })
      return
    }
    await route.continue()
  })
  await page.route('**/api/laundry/orders/bulk-status-fixture/transition', async (route) => {
    const payload = route.request().postDataJSON() as { state: string; expectedVersion: number }
    transitionPayloads.push(payload)
    order = { ...order, state: payload.state, version: order.version + 1 }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order) })
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  const actions = page.getByRole('region', { name: 'Bulk order status actions' })
  await expect(actions).toBeVisible()
  await expect(actions.getByText('0 selected', { exact: true })).toBeVisible()
  await actions.getByRole('button', { name: 'Select eligible for Done (1)' }).click()
  await expect(actions.getByText('1 selected', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Move selected to Done' }).click()
  const confirmDialog = page.getByRole('alertdialog')
  await expect(confirmDialog.getByRole('heading', { name: 'Move 1 order to Done (Ready)?' })).toBeVisible()
  await captureEvidence(page, 'store-orders-bulk-confirmation-desktop')
  await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirmDialog).toBeHidden()
  expect(transitionPayloads).toEqual([])

  await actions.getByRole('button', { name: 'Select eligible for Done (1)' }).click()
  await page.getByRole('button', { name: 'Move selected to Done' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm Done (Ready)' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Moved 1 of 1 selected orders to Done (Ready).' })).toBeVisible()
  await expect(page.getByRole('table').getByRole('cell', { name: 'Ready', exact: true })).toBeVisible()
  expect(transitionPayloads).toEqual([{ state: 'Ready', expectedVersion: 4 }])

  await actions.getByRole('button', { name: 'Select eligible for delivery (1)' }).click()
  await page.getByRole('button', { name: 'Mark selected delivered' }).click()
  const deliveryDialog = page.getByRole('alertdialog')
  await expect(deliveryDialog.getByRole('heading', { name: 'Move 1 order to Delivered?' })).toBeVisible()
  await expect(deliveryDialog).toContainText('Any unpaid balance remains due.')
  await deliveryDialog.getByRole('button', { name: 'Confirm Delivered' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Moved 1 of 1 selected orders to Delivered.' })).toBeVisible()
  await expect(page.getByRole('table').getByRole('cell', { name: 'Delivered', exact: true })).toBeVisible()
  expect(transitionPayloads).toEqual([{ state: 'Ready', expectedVersion: 4 }, { state: 'Delivered', expectedVersion: 5 }])
})

test('Store Orders applies date filters on Search and blocks an invalid range', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })

  const orderQueries: URL[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/laundry/orders' && request.method() === 'GET') orderQueries.push(url)
  })
  await expect(page.getByText(/\d+ matching orders?/)).toBeVisible()
  const initialQueryCount = orderQueries.length
  await page.getByRole('button', { name: 'More filters' }).click()
  await page.screenshot({ path: 'test-results/store-orders-date-filters.png' })
  const from = page.getByLabel('From date')
  const to = page.getByLabel('To date')
  await from.fill('2026-09-20')
  await to.fill('2026-09-19')
  await expect(page.getByRole('alert')).toHaveText('End date must be the same as or later than the start date.')
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled()
  expect(orderQueries).toHaveLength(initialQueryCount)
  await captureEvidence(page, 'store-orders-invalid-date-filter-desktop')

  await to.fill('2026-09-29')
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled()
  expect(orderQueries).toHaveLength(initialQueryCount)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect.poll(() => orderQueries.some((url) => url.searchParams.get('from') === '2026-09-20' && url.searchParams.get('to') === '2026-09-29')).toBe(true)
})

test('direct order detail route loads as a page, retries errors, and returns from shared Edit Mode', async ({ page }) => {
  await signIntoDemo(page)
  const orderPage = await page.evaluate(async () => {
    const response = await fetch('/api/laundry/orders?page=1&pageSize=100')
    return { status: response.status, body: await response.json() }
  })
  expect(orderPage.status, JSON.stringify(orderPage.body)).toBe(200)
  const target = (orderPage.body as { items: Array<{ id: string; orderNumber: string; state: string; customer: { name: string; phone: string } }> }).items.find((order) => !['Delivered', 'Cancelled'].includes(order.state))
  expect(target, 'the isolated demo should contain an order for the direct detail route').toBeTruthy()
  if (!target) return

  const orderWrites: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/laundry/orders/' + target.id && request.method() !== 'GET') orderWrites.push(request.method() + ' ' + url.pathname)
  })
  let detailAttempts = 0
  await page.route('**/api/laundry/orders/' + target.id, async (route) => {
    if (route.request().method() === 'GET' && detailAttempts === 0) {
      detailAttempts += 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary detail outage fixture' }) })
      return
    }
    if (route.request().method() === 'GET') detailAttempts += 1
    await route.continue()
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/orders/' + target.id, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(new RegExp('#/laundry/orders/' + target.id + '$'))
  await expect(page.getByRole('heading', { name: /We couldn.t open this order/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await captureEvidence(page, 'order-detail-retry-state-desktop')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText(target.orderNumber, { exact: true })).toBeVisible()
  await expect(page.getByText(target.customer.name, { exact: true })).toBeVisible()
  await expect(page.getByText(target.customer.phone, { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Order summary' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Order financial summary' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Order notes and photo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to Store Orders and Customers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit in order builder' })).toBeVisible()
  expect(detailAttempts).toBe(2)
  await captureEvidence(page, 'order-detail-page-desktop')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.getByRole('region', { name: 'Order summary' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Order financial summary' })).toBeVisible()
  await captureEvidence(page, 'order-detail-page-mobile')
  await captureEvidence(page, 'order-detail-page-full-mobile', true)
  await page.getByRole('button', { name: 'Edit in order builder' }).click()
  const editHash = new URL(page.url()).hash
  const [editRoute, editQuery = ''] = editHash.slice(1).split('?')
  const editParams = new URLSearchParams(editQuery)
  expect(editRoute).toBe('/laundry/new-order')
  expect(editParams.get('edit')).toBe(target.id)
  expect(editParams.get('returnTo')).toBe('/laundry/orders/' + target.id)
  await expect(page.getByRole('heading', { name: 'Amend the order in the familiar builder.' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel amendment' }).click()
  await expect(page).toHaveURL(new RegExp('#/laundry/orders/' + target.id + '$'))
  await expect(page.getByText(target.orderNumber, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Store Orders and Customers' }).click()
  await expect(page).toHaveURL(/#\/laundry\/orders$/)
  expect(orderWrites).toEqual([])
})

test('order detail labels saved charge, discount, and GST rows without writing', async ({ page }) => {
  await signIntoDemo(page)
  const listResponse = await page.request.get('/api/laundry/orders?page=1&pageSize=100')
  expect(listResponse.ok()).toBe(true)
  const listed = await listResponse.json() as { items: Array<{ id: string; state: string }> }
  const target = listed.items.find((item) => item.id)
  expect(target, 'the isolated demo should provide an order for its read-only price-detail view').toBeTruthy()
  if (!target) return

  const detailResponse = await page.request.get(`/api/laundry/orders/${target.id}`)
  expect(detailResponse.ok()).toBe(true)
  const detail = await detailResponse.json() as { orderNumber: string; subtotal: number; items: unknown[]; [key: string]: unknown }
  const charges = 40
  const discounts = 10
  const taxAmount = 12.34
  const grandTotal = Number((detail.subtotal + charges - discounts + taxAmount).toFixed(2))
  await page.route(`**/api/laundry/orders/${target.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...detail,
        charges,
        discounts,
        taxRate: 18,
        taxAmount,
        grandTotal,
        breakdown: {
          charges: [{ label: 'Express handling', percent: 10, amount: charges }],
          discounts: [{ label: 'Care discount', percent: null, amount: discounts }],
          tax: { label: 'GST', percent: 18, amount: taxAmount },
        },
      }),
    })
  })

  let writes = 0
  page.on('request', (request) => {
    if (request.url().includes(`/api/laundry/orders/${target.id}`) && request.method() !== 'GET') writes += 1
  })
  await page.goto(`/ui/app/?local-demo=1#/laundry/orders/${target.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(detail.orderNumber, { exact: true })).toBeVisible()
  const priceDetails = page.getByRole('list', { name: 'Applied price details' })
  await expect(priceDetails).toContainText('Express handling (10%)')
  await expect(priceDetails).toContainText('Care discount')
  await expect(priceDetails).toContainText('GST (18%)')
  await expect(priceDetails).toContainText('₹40')
  await expect(priceDetails).toContainText('−₹10')
  expect(writes).toBe(0)
  await priceDetails.scrollIntoViewIfNeeded()
  await captureEvidence(page, 'order-price-breakdown-desktop')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await priceDetails.scrollIntoViewIfNeeded()
  await captureEvidence(page, 'order-price-breakdown-mobile')
  expect(writes).toBe(0)
})

test('direct order detail explains missing and permission-denied records without offering a retry', async ({ page }) => {
  await signIntoDemo(page)
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/laundry/orders/') && request.method() !== 'GET') writes.push(request.method())
  })

  await page.route('**/api/laundry/orders/permission-fixture', (route) => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'FORBIDDEN', error: 'Insufficient permission' }),
  }))
  await page.goto('/ui/app/?local-demo=1#/laundry/orders/permission-fixture', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'You don’t have access to this order.' })).toBeVisible()
  await expect(page.getByText('Your role cannot open this order record.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Back to Store Orders' })).toBeVisible()

  await page.route('**/api/laundry/orders/missing-fixture', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'ORDER_NOT_FOUND', error: 'Order not found' }),
  }))
  await page.goto('/ui/app/?local-demo=1#/laundry/orders/missing-fixture', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'This order can’t be found.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Back to Store Orders' })).toBeVisible()
  expect(writes).toEqual([])
})
