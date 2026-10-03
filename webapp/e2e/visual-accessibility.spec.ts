import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial', timeout: 120_000 })

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  const demoAccess = page.getByText('Demo access')
  if (await demoAccess.isVisible()) {
    await page.getByRole('button', { name: 'Sign in' }).click()
  }
  await expect(page.locator('aside').first()).toBeVisible()
}

test('reduced motion and primary operator surfaces remain accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIntoDemo(page)

  const motionValues = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.animationDuration = '10s'
    probe.style.transitionDuration = '10s'
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe)
    const result = {
      animationDuration: computed.animationDuration,
      transitionDuration: computed.transitionDuration,
      scrollBehavior: computed.scrollBehavior,
    }
    probe.remove()
    return result
  })
  expect(motionValues.animationDuration).toMatch(/0\.01s|1e-05s|0ms/)
  expect(motionValues.transitionDuration).toMatch(/0\.01s|1e-05s|0ms/)
  expect(motionValues.scrollBehavior).toBe('auto')

  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('textbox', { name: 'Command search' })).toBeVisible()
  await page.keyboard.press('Escape')

  for (const route of [
    '/ui/app/#/laundry/dashboard',
    '/ui/app/#/laundry/new-order',
    '/ui/app/#/laundry/orders',
    '/ui/app/#/laundry/finance',
    '/ui/app/#/laundry/finance/statutory',
    '/ui/app/#/laundry/expenses',
    '/ui/app/#/laundry/management',
  ]) {
    await page.goto(route.replace('/ui/app/', '/ui/app/?local-demo=1'), { waitUntil: 'domcontentloaded' })
    if (route.endsWith('/dashboard')) await expect(page.locator('aside').first()).toBeVisible()
    else {
      await expect(page.getByRole('button', { name: 'Back to dashboard' })).toBeVisible()
    }
    await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.locator('body')).not.toContainText('Application error')
    await expect(page.locator('main')).toBeVisible()
  }

  await page.goto('/ui/app/?local-demo=1#/laundry/settings', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('tablist', { name: 'Settings workspaces' })).toBeVisible()
  const workspaceTabs = page.getByRole('tablist', { name: 'Settings workspaces' })
  await expect(workspaceTabs.getByRole('tab')).toHaveCount(5)
  for (const area of [
    ['Operations', 'Production station capacity'],
    ['Finance controls', 'Financial normalization'],
    ['Printing', 'Tag template configurator'],
    ['Data safety', 'Recovery rehearsal'],
  ] as const) {
    await page.getByRole('tab', { name: new RegExp(area[0]) }).click()
    await expect(page.getByRole('tabpanel')).toHaveCount(1)
    await expect(page.getByText(area[1], { exact: false }).first()).toBeVisible()
  }
})

test('Epic theme switch preserves the brand and persists the operator choice', async ({ page }, testInfo) => {
  await signIntoDemo(page)
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible()
  const body = page.locator('body')
  const brandAction = page.locator('header [class~="bg-[#e8bf68]"]').first()
  const lightCanvas = await body.evaluate((element) => getComputedStyle(element).backgroundColor)
  const darkTrigger = page.getByRole('button', { name: 'Switch to dark theme' })
  await expect(darkTrigger).toHaveAttribute('aria-pressed', 'false')
  await darkTrigger.click()

  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
  const darkCanvas = await body.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(darkCanvas).not.toBe(lightCanvas)
  await expect.poll(() => brandAction.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(102, 76, 240)')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('epic-laundry-theme-v1'))).toBe('dark')
  await page.screenshot({ path: testInfo.outputPath('dark-theme-dashboard.png'), fullPage: true })

  await page.goto('/ui/app/?local-demo=1#/laundry/new-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible()
  await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.getByRole('button', { name: 'All services' }).evaluate((element) => getComputedStyle(element).color)).toBe('rgb(184, 170, 255)')
  await expect.poll(() => page.getByRole('button', { name: "Men's Wear", exact: true }).evaluate((element) => getComputedStyle(element).color)).toBe('rgb(210, 203, 220)')
  await page.locator('main').evaluate(async (element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))))
  await page.screenshot({ path: testInfo.outputPath('dark-theme-order-booking.png'), fullPage: true })

  await page.goto('/ui/app/?local-demo=1#/laundry/reports/collection', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByText('Current store data')).toBeVisible({ timeout: 30_000 })
  await page.locator('main').evaluate(async (element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))))
  await page.screenshot({ path: testInfo.outputPath('dark-theme-collection-report.png'), fullPage: true })
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('epic-laundry-theme-v1'))).toBe('light')
})

test('compact navigation opens, closes with Escape, and returns focus', async ({ page }) => {
  await signIntoDemo(page)
  await page.setViewportSize({ width: 390, height: 844 })

  const trigger = page.getByRole('button', { name: 'Open navigation' })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const drawer = page.getByRole('dialog', { name: 'Laundry workspace navigation' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  await expect(drawer.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await drawer.getByRole('button', { name: 'Counter' }).click()
  await expect(drawer.getByRole('link', { name: 'Order booking' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('key operator pages fit a compact viewport without page-level horizontal overflow', async ({ page }) => {
  await signIntoDemo(page)
  await page.setViewportSize({ width: 390, height: 844 })

  for (const route of [
    '/laundry/dashboard',
    '/laundry/new-order',
    '/laundry/orders',
    '/laundry/expenses',
    '/laundry/settings',
    '/laundry/reports',
    '/laundry/reports/invoice',
    '/laundry/reports/collection',
    '/laundry/reports/order',
    '/laundry/finance',
    '/laundry/production-queue',
  ]) {
    await page.goto(`/ui/app/?local-demo=1#${route}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0, { timeout: 30_000 })
    if (route === '/laundry/dashboard') await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
    else await expect(page.getByRole('button', { name: 'Back to dashboard' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Application error')
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      elements: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.right > window.innerWidth + 1 || rect.left < -1)
        .sort((a, b) => b.rect.right - a.rect.right)
        .slice(0, 6)
        .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 90)} [${Math.round(rect.left)},${Math.round(rect.right)}]`),
    }))
    expect(overflow.width, `${route} overflows at 390px: ${overflow.elements.join('; ')}`).toBeLessThanOrEqual(390)
  }
})

test('customer work card traps focus and restores it when dismissed', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/orders?view=customers', { waitUntil: 'domcontentloaded' })
  const trigger = page.getByRole('button', { name: 'Open profile' }).first()
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await trigger.click()

  const drawer = page.getByRole('dialog').filter({ hasText: 'Customer work card' })
  const close = drawer.getByRole('button', { name: 'Close customer work card' })
  await expect(drawer).toBeVisible()
  await expect(close).toBeFocused()

  // The activity tab contains only the close control and three section tabs;
  // after repeated forward navigation focus must still be in the modal.
  for (let index = 0; index < 8; index += 1) await page.keyboard.press('Tab')
  await expect(drawer.locator(':focus')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('order work card traps focus and restores it when dismissed', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/orders', { waitUntil: 'domcontentloaded' })
  const trigger = page.getByRole('button', { name: /Open order summary for / }).first()
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await trigger.click()

  const drawer = page.getByRole('dialog', { name: 'Order work card' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Close order work card' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(drawer.locator(':focus')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('statutory workspace traps focus and restores it when dismissed', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/finance/statutory', { waitUntil: 'domcontentloaded' })
  const trigger = page.getByRole('button').filter({ hasText: 'Post TDS' }).first()
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await trigger.click()

  const drawer = page.getByRole('dialog', { name: 'Post TDS liability' })
  const close = drawer.getByRole('button', { name: 'Close panel', exact: true }).last()
  await expect(drawer).toBeVisible()
  await expect(close).toBeFocused()

  for (let index = 0; index < 10; index += 1) await page.keyboard.press('Tab')
  await expect(drawer.locator(':focus')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('print workset traps focus and restores it when dismissed', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/print-centre', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'All', exact: true }).click()
  const trigger = page.getByRole('button', { name: /INV-\d+-\d+/ }).filter({ hasText: 'Demo Nisha' }).first()
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await trigger.click()

  const drawer = page.getByRole('dialog', { name: 'Live print workset' })
  await expect(drawer).toBeVisible()
  await expect(drawer).toBeFocused()

  for (let index = 0; index < 10; index += 1) await page.keyboard.press('Tab')
  await expect(drawer.locator(':focus')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('expense reason dialog traps focus and restores its action', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })
  const trigger = page.getByRole('button', { name: 'Cancel', exact: true }).first()
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: 'Cancel this expense?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Expense action reason' })).toBeFocused()

  for (let index = 0; index < 6; index += 1) await page.keyboard.press('Tab')
  await expect(dialog.locator(':focus')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})
