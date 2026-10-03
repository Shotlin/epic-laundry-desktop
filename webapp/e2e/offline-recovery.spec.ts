import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.setTimeout(120_000)

test('offline booking queues safely and replays once after reconnect', async ({ page }) => {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  await page.locator('article').first().getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Add new customer' }).click()
  const customerDialog = page.getByRole('dialog', { name: 'Add new customer' })
  await customerDialog.getByRole('textbox', { name: /Customer name/ }).fill('Offline Replay Customer')
  await customerDialog.getByRole('textbox', { name: /Phone number/ }).fill('9000000142')
  await customerDialog.getByRole('button', { name: 'Save customer' }).click()
  await expect(customerDialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Book order' })).toBeEnabled()

  await page.route('**/api/laundry/orders', (route) => route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue())
  await page.getByRole('button', { name: 'Book order' }).click()
  await expect(page.getByText(/saved to the offline queue/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /1 offline/ })).toBeVisible()
  const queuedBeforeReconnect = await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('epic-laundry-offline-commands-v1') || '[]')
    return items.map((item: { entity?: string; attempts?: number }) => ({ entity: item.entity, attempts: item.attempts }))
  })
  expect(queuedBeforeReconnect).toEqual([{ entity: 'laundry_order', attempts: 0 }])
  await expect(page.getByRole('heading', { name: /Order booked/ })).toHaveCount(0)

  await page.unroute('**/api/laundry/orders')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('epic-laundry-offline-commands-v1') || '[]').length), { timeout: 30_000 }).toBe(0)
  await page.goto('/ui/app/?local-demo=1#/laundry/orders?view=customers', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible()
  await page.getByPlaceholder('Search name, phone or email').fill('Offline Replay Customer')
  const recoveredCustomer = page.getByRole('row').filter({ hasText: 'Offline Replay Customer' })
  await expect(recoveredCustomer).toHaveCount(1)
  await expect(recoveredCustomer.getByRole('cell').nth(1)).toHaveText('9000000142')
  await expect(recoveredCustomer.getByRole('cell').nth(2)).toHaveText('1')
})

test('production web queue retries its real adapter with one idempotency key and exports dead letters', async ({ page }) => {
  const replayCalls: Array<{ body: Record<string, unknown>; idempotencyHeader: string | null }> = []
  let failNextReplay = true

  await page.addInitScript(() => {
    localStorage.setItem('epic-web-cloud-tokens-v1', JSON.stringify({
      accessToken: 'playwright-access',
      refreshToken: 'playwright-refresh',
      accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
      phone: '9000000199',
      name: 'Offline Test Owner',
      shopRole: 'VENDOR_OWNER',
      vendorId: 'playwright-vendor',
    }))
  })
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/vendor/counter/orders')) {
      replayCalls.push({ body: request.postDataJSON() as Record<string, unknown>, idempotencyHeader: request.headers()['idempotency-key'] || null })
      if (failNextReplay) {
        failNextReplay = false
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Simulated provider outage for offline replay.' }) })
        return
      }
      const order = {
        id: 'web-replayed-order', orderNumber: 'WEB-REPLAY-001',
        customer: { id: 'web-replayed-customer', name: 'Offline Web Replay', phone: '9000000198' },
        items: [], subtotalPaise: 0, chargesPaise: 0, discountsPaise: 0, taxRateBps: 0, taxPaise: 0, totalPaise: 0,
        priceBreakdown: null, paymentMode: null, amountPaidPaise: 0, paymentStatus: 'UNPAID', status: 'BOOKED', version: 1,
        source: 'COUNTER', orderDate: '2026-09-29', expectedDeliveryDate: '2026-09-30', fulfillmentMode: 'Pickup Order',
        deliveryAddress: null, serviceZone: null, notes: null, photoPath: null, pickupRider: null, deliveryRider: null,
        placedAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { order, tags: [], containerTags: [] } }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
  })

  await page.goto('/ui/app/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible()
  const idempotencyKey = 'offline-web-command-stable-key'
  await page.evaluate((key) => {
    localStorage.setItem('epic-laundry-offline-commands-v1', JSON.stringify([{
      id: 'offline-web-order-1', entity: 'laundry_order', path: '/laundry/orders',
      data: { customer: { name: 'Offline Web Replay', phone: '9000000198' }, items: [], fulfillmentMode: 'Pickup Order' },
      idempotencyKey: key, createdAt: '2026-09-29T10:00:00.000Z', attempts: 4,
      nextAttemptAt: '2000-01-01T00:00:00.000Z', lastError: 'Previous interrupted attempt', deadLetter: false,
    }]))
    window.dispatchEvent(new Event('epic-offline-queue-changed'))
  }, idempotencyKey)

  await page.getByRole('button', { name: /1 offline/ }).click()
  await expect(page.getByText(/could not be delivered/)).toBeVisible()
  await expect(page.getByText(/Simulated provider outage/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const [item] = JSON.parse(localStorage.getItem('epic-laundry-offline-commands-v1') || '[]')
    return { attempts: item?.attempts, deadLetter: item?.deadLetter, count: JSON.parse(localStorage.getItem('epic-laundry-offline-commands-v1') || '[]').length }
  })).toEqual({ attempts: 5, deadLetter: true, count: 1 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export queue' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('epic-laundry-offline-queue.json')
  const exportedQueue = JSON.parse(await readFile((await download.path())!, 'utf8')) as Array<{ attempts: number; deadLetter: boolean; idempotencyKey: string; lastError: string }>
  expect(exportedQueue).toHaveLength(1)
  expect(exportedQueue[0]).toMatchObject({ attempts: 5, deadLetter: true, idempotencyKey, lastError: expect.stringContaining('Simulated provider outage') })

  await page.getByRole('button', { name: 'Retry dead letters' }).click()
  await expect(page.getByText(/reset and are ready for replay/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const [item] = JSON.parse(localStorage.getItem('epic-laundry-offline-commands-v1') || '[]')
    return { attempts: item?.attempts, deadLetter: item?.deadLetter, lastError: item?.lastError ?? null, nextAttemptAt: item?.nextAttemptAt ?? null }
  })).toEqual({ attempts: 0, deadLetter: false, lastError: null, nextAttemptAt: null })

  await page.getByRole('button', { name: /1 offline/ }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('epic-laundry-offline-commands-v1') || '[]').length)).toBe(0)
  await expect.poll(() => page.getByRole('button', { name: /offline/ }).count()).toBe(0)
  expect(replayCalls).toHaveLength(2)
  expect(replayCalls.map((call) => call.body.idempotencyKey)).toEqual([idempotencyKey, idempotencyKey])
  expect(replayCalls.map((call) => call.idempotencyHeader)).toEqual([idempotencyKey, idempotencyKey])
})
