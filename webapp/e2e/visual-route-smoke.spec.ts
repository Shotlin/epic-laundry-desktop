import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial', timeout: 300_000 });
const viewports = [1024, 1280, 1366, 1440, 1920, 2560] as const;

const routes = [
  ['dashboard', '/ui/app/#/laundry/dashboard'],
  ['overview', '/ui/app/#/laundry/statistics'],
  ['operations', '/ui/app/#/laundry/operations'],
  ['new-order', '/ui/app/#/laundry/new-order'],
  ['orders', '/ui/app/#/laundry/orders'],
  ['online-orders', '/ui/app/#/laundry/online-orders'],
  ['customers', '/ui/app/#/laundry/customers'],
  ['print-centre', '/ui/app/#/laundry/print-centre'],
  ['garment-tracking', '/ui/app/#/laundry/garment-tracking'],
  ['production-queue', '/ui/app/#/laundry/production-queue'],
  ['quality-claims', '/ui/app/#/laundry/quality-claims'],
  ['corrections', '/ui/app/#/laundry/corrections'],
  ['returns', '/ui/app/#/laundry/returns'],
  ['dispatch', '/ui/app/#/laundry/dispatch'],
  ['routes', '/ui/app/#/laundry/routes'],
  ['settlements', '/ui/app/#/laundry/settlements'],
  ['cash-closing', '/ui/app/#/laundry/cash-closing'],
  ['finance', '/ui/app/#/laundry/finance'],
  ['statutory', '/ui/app/#/laundry/finance/statutory'],
  ['expenses', '/ui/app/#/laundry/expenses'],
  ['packages', '/ui/app/#/laundry/packages'],
  ['people-payroll', '/ui/app/#/laundry/management'],
  ['finance-setup', '/ui/app/#/laundry/finance-setup'],
  ['sync-status', '/ui/app/#/laundry/sync-status'],
  ['reports', '/ui/app/#/laundry/reports'],
  ['invoice-report', '/ui/app/#/laundry/reports/invoice'],
  ['customer-report', '/ui/app/#/laundry/reports/customer'],
  ['catalogue', '/ui/app/#/laundry/catalogue'],
  ['import-prices', '/ui/app/#/laundry/import-prices'],
  ['import-customers', '/ui/app/#/laundry/import-customers'],
  ['import-catalogue', '/ui/app/#/laundry/import-catalogue'],
  ['settings', '/ui/app/#/laundry/settings'],
] as const;

async function createDisposableWorkspace(page: Page) {
  await page.goto('/ui/app/?local-demo=1');
  const setupHeading = page.getByRole('heading', { name: 'Set up your workspace' });
  if (await setupHeading.isVisible()) {
    await page.getByRole('button', { name: /Production workspace/ }).click();
    await page.getByRole('textbox', { name: 'Business name' }).fill('Visual Route Audit');
    await page.getByRole('textbox', { name: 'Business phone' }).fill('9000000022');
    await page.getByRole('textbox', { name: 'Business email' }).fill('visual-route-audit@example.invalid');
    await page.getByRole('textbox', { name: 'Store address' }).fill('Disposable visual route workspace');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox', { name: 'Owner first name' }).fill('Visual');
    await page.getByRole('textbox', { name: 'Owner last name' }).fill('Auditor');
    await page.getByRole('textbox', { name: 'Username' }).fill(`visual.routes.${Date.now()}`);
    await page.getByRole('textbox', { name: /Secure password/ }).fill('VisualRoutePassword!2026');
    await page.getByRole('textbox', { name: 'Confirm password' }).fill('VisualRoutePassword!2026');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Finish secure setup' }).click();
  } else {
    await expect(page.getByText('Demo access')).toBeVisible();
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.locator('aside').first()).toBeVisible();
}

async function settleForVisualReview(page: Page) {
  await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    document.getAnimations().forEach((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      if (typeof endTime === 'number' && Number.isFinite(endTime)) animation.finish();
    });
  });
}

test('every major operator route renders a visual authenticated shell', async ({ page }, testInfo) => {
  await createDisposableWorkspace(page);
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of routes) {
      const demoRoute = route.replace('/ui/app/', '/ui/app/?local-demo=1');
      await page.goto(demoRoute, { waitUntil: 'domcontentloaded' });
      if (route.endsWith('/dashboard')) await expect(page.locator('aside').first()).toBeVisible();
      else {
        await expect(page.getByRole('button', { name: 'Back to dashboard' })).toBeVisible();
      }
      await expect(page.locator('body')).not.toContainText('Application error');
      await expect(page.locator('body')).not.toContainText('Cannot read properties');
      await settleForVisualReview(page);
      await testInfo.attach(`route-${width}-${name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
  }
});

test('every major operator route fits a phone viewport without page-level horizontal overflow', async ({ page }) => {
  await createDisposableWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, route] of routes) {
    const demoRoute = route.replace('/ui/app/', '/ui/app/?local-demo=1');
    await page.goto(demoRoute, { waitUntil: 'domcontentloaded' });
    if (name === 'dashboard') await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Back to dashboard' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
    await settleForVisualReview(page);
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      elements: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.right > window.innerWidth + 1 || rect.left < -1)
        .sort((a, b) => b.rect.right - a.rect.right)
        .slice(0, 4)
        .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 70)} [${Math.round(rect.left)},${Math.round(rect.right)}]`),
    }));
    expect(overflow.width, `${name} overflows at 390px: ${overflow.elements.join('; ')}`).toBeLessThanOrEqual(390);
  }
});

test('every major operator route retains dark theme and fits a phone viewport', async ({ page }) => {
  await createDisposableWorkspace(page);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [name, route] of routes) {
    const demoRoute = route.replace('/ui/app/', '/ui/app/?local-demo=1');
    await page.goto(demoRoute, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible();
    if (name === 'dashboard') await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Back to dashboard' })).toBeVisible();
    await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
    await settleForVisualReview(page);
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      elements: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.right > window.innerWidth + 1 || rect.left < -1)
        .sort((a, b) => b.rect.right - a.rect.right)
        .slice(0, 4)
        .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 70)} [${Math.round(rect.left)},${Math.round(rect.right)}]`),
    }));
    expect(overflow.width, `${name} in dark theme overflows at 390px: ${overflow.elements.join('; ')}`).toBeLessThanOrEqual(390);
  }
});

test('every major operator route gives each visible button an accessible name', async ({ page }) => {
  await createDisposableWorkspace(page);
  const reportRoutes = [
    ['collection-report', '/ui/app/#/laundry/reports/collection'],
    ['order-report', '/ui/app/#/laundry/reports/order'],
    ['consolidated-invoices', '/ui/app/#/laundry/reports/consolidated-invoices'],
    ['customer-package-report', '/ui/app/#/laundry/reports/customer-package'],
    ['customer-list-report', '/ui/app/#/laundry/reports/customer-list'],
    ['growth-report', '/ui/app/#/laundry/reports/growth'],
    ['discount-report', '/ui/app/#/laundry/reports/discount'],
    ['expense-report', '/ui/app/#/laundry/reports/expense'],
    ['balance-report', '/ui/app/#/laundry/reports/balance'],
    ['pickup-report', '/ui/app/#/laundry/reports/pickup'],
    ['rider-delivery-report', '/ui/app/#/laundry/reports/rider-delivery'],
    ['rider-collection-report', '/ui/app/#/laundry/reports/rider-collection'],
    ['warehouse-work-report', '/ui/app/#/laundry/reports/warehouse-user-work'],
  ] as const;
  const auditRoutes = [...routes, ...reportRoutes];

  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [name, route] of auditRoutes) {
      const demoRoute = route.replace('/ui/app/', '/ui/app/?local-demo=1');
      await page.goto(demoRoute, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main').first()).toBeVisible();
      await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0, { timeout: 30_000 });
      await settleForVisualReview(page);

      const unnamedButtons = await page.locator('button:visible, [role="button"]:visible').evaluateAll((elements) => elements
        .filter((element) => {
          const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) || [];
          const referencedText = labelledBy.map((id) => document.getElementById(id)?.textContent || '').join(' ');
          const imageText = Array.from(element.querySelectorAll('img[alt]')).map((image) => image.getAttribute('alt') || '').join(' ');
          const svgText = Array.from(element.querySelectorAll('svg title')).map((title) => title.textContent || '').join(' ');
          const name = element.getAttribute('aria-label') || referencedText || element.getAttribute('title') || element.textContent || imageText || svgText;
          return !name.trim();
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          testId: element.getAttribute('data-testid'),
          className: typeof element.className === 'string' ? element.className.slice(0, 100) : '',
          route: location.hash,
          width,
        })));

      expect(unnamedButtons, `${name} has visible buttons without accessible names at ${width}px`).toEqual([]);
    }
  }
});
