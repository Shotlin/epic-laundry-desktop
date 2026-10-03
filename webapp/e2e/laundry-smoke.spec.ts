import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

test('operator can complete the core laundry desk journeys in a disposable workspace', async ({ page }) => {
  await page.goto('/ui/app/?local-demo=1');
  const setupHeading = page.getByRole('heading', { name: 'Set up your workspace' });
  if (await setupHeading.isVisible()) {
    await page.getByRole('button', { name: /Production workspace/ }).click();
    await page.getByRole('textbox', { name: 'Business name' }).fill('UI Audit Laundry');
    await page.getByRole('textbox', { name: 'Business phone' }).fill('9000000001');
    await page.getByRole('textbox', { name: 'Business email' }).fill('ui-audit@example.invalid');
    await page.getByRole('textbox', { name: 'Store address' }).fill('Disposable UI test workspace');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('textbox', { name: 'Owner first name' }).fill('UI');
    await page.getByRole('textbox', { name: 'Owner last name' }).fill('Auditor');
    await page.getByRole('textbox', { name: 'Username' }).fill(`ui.audit.${Date.now()}`);
    await page.getByRole('textbox', { name: /Secure password/ }).fill('UIAuditPassword!2026');
    await page.getByRole('textbox', { name: 'Confirm password' }).fill('UIAuditPassword!2026');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Finish secure setup' }).click();
  } else {
    await expect(page.getByText('Demo access')).toBeVisible();
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible();
  await page.goto('/ui/app/?local-demo=1#/laundry/online-orders');
  await expect(page.getByRole('heading', { name: 'Online orders' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Online order queue' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search online orders' })).toBeVisible();
  await expect(page.getByText(/Configured|Not configured/).first()).toBeVisible();
  await page.goto('/ui/app/?local-demo=1#/laundry/dashboard');
  await expect(page.getByRole('heading', { name: /See the next move at a glance/ })).toBeVisible();
  const sidebarNav = page.locator('aside nav');
  await expect(sidebarNav.getByRole('button', { name: 'Counter' })).toBeVisible();
  await sidebarNav.getByRole('button', { name: 'Counter' }).click();
  await expect(sidebarNav.getByRole('link', { name: 'Order booking' })).toBeVisible();
  await sidebarNav.getByRole('button', { name: 'Production' }).click();
  await expect(sidebarNav.getByRole('link', { name: 'Garment tracking' })).toBeVisible();
  await sidebarNav.getByRole('button', { name: 'Business Controls' }).click();
  await expect(sidebarNav.getByRole('link', { name: 'Store settings' })).toBeAttached();
  await sidebarNav.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(sidebarNav.getByRole('link', { name: 'Store settings' })).toBeVisible();

  await page.goto('/ui/app/?local-demo=1#/laundry/finance');
  await expect(page.getByRole('heading', { name: 'See every rupee, without a spreadsheet.' })).toBeVisible();
  await expect(page.getByText('Net revenue').first()).toBeVisible();
  await expect(page.getByText('From booked service to operating result')).toBeVisible();
  await expect(page.getByText('Operating result waterfall')).toBeVisible();
  await expect(page.getByText('What customers still owe')).toBeVisible();
  await expect(page.getByText('Output GST by day')).toBeVisible();
  await expect(page.getByText('Recorded customer-impact signals')).toBeVisible();
  await expect(page.getByText('Customer value to vendor settlement')).toBeVisible();
  await expect(page.getByText('Revenue, volume and quality load')).toBeVisible();
  await page.goto('/ui/app/?local-demo=1#/laundry/finance/statutory');
  await expect(page.getByRole('heading', { name: 'Know what needs action.' })).toBeVisible();
  await expect(page.getByText('Post TDS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Returns', exact: true }).click();
  await expect(page.getByText('Prepare return', { exact: true })).toBeVisible();

  await page.goto('/ui/app/?local-demo=1#/laundry/print-centre');
  // The first "Today" demo order is weight-based and intentionally has no
  // garment-piece tags. Select the seeded piece-based order for tag/PDF QA.
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const order = page.getByRole('button', { name: /INV-\d+-\d+/ }).filter({ hasText: 'Demo Nisha' }).first();
  await expect(order).toBeVisible();
  await order.click();
  await expect(page.getByRole('button', { name: /Garment tags \(\d+\)/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Code 128 barcode for tag/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByText(/\d+ selected/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print selected' })).toBeVisible();
  const pdfDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toMatch(/LND-\d+-\d+-garment-tags\.pdf/);
  await expect(page.getByText(/PDF downloaded — 2 garment tags, Code 128 barcodes/)).toBeVisible();

  const tag = (await page.getByText(/ELT-\d{8}-\d{6}/).first().textContent() || '').trim();
  await page.goto('/ui/app/?local-demo=1#/laundry/garment-tracking');
  await expect(page.getByRole('heading', { name: 'Garment tracking' })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.type(tag, { delay: 4 });
  await page.keyboard.press('Enter');
  await expect(page.getByText('Scan recorded in the garment audit trail.')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('textbox', { name: 'Operator note' }).fill('UI reprint audit');
  await page.getByRole('button', { name: 'Print again' }).click();
  await expect(page.getByText(/Same tag printed again/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('textbox', { name: 'Operator note' }).fill('UI replacement audit');
  await page.getByRole('button', { name: 'Replace tag' }).click();
  await expect(page.getByText(/Tag replaced and the new active tag was printed/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Open command search' }).click();
  await expect(page.getByRole('textbox', { name: 'Command search' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Command search' }).fill('Demo');
  await expect(page.getByText('Workspace records')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.goto('/ui/app/?local-demo=1#/laundry/new-order');
  await expect(page.getByRole('heading', { name: 'Build the order visually.' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search customers by name or phone' }).fill('Demo Priya');
  await page.getByRole('button', { name: /Demo Priya 9000000101/ }).click();
  await page.locator('article').first().getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Hold current order' }).click();
  await page.getByRole('button', { name: /Demo Priya · 1 item/ }).click();
  await expect(page.getByRole('button', { name: 'Book order' })).toBeEnabled();
  await page.getByRole('button', { name: 'Book order' }).click();
  await expect(page.getByText('Order booked')).toBeVisible();
  const journeyOrder = (await page.getByText(/LND-\d{2}-\d{5}/).last().textContent() || '').match(/LND-\d{2}-\d{5}/)?.[0] || '';
  const journeyTag = (await page.getByText(/ELT-\d{8}-\d{6}/).last().textContent() || '').match(/ELT-\d{8}-\d{6}/)?.[0] || '';
  await page.getByRole('button', { name: 'Close receipt' }).click();

  await page.goto('/ui/app/?local-demo=1#/laundry/production-queue');
  await expect(page.getByRole('heading', { name: 'Work queue' })).toBeVisible();
  const startButton = page.getByRole('button', { name: 'Start' }).first();
  if (await startButton.count()) {
    await startButton.click();
    await expect(page.getByText('In Progress').first()).toBeVisible();
  }

  await page.goto('/ui/app/?local-demo=1#/laundry/quality-claims');
  await expect(page.getByRole('heading', { name: 'Claims & exceptions' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('TAG-20260829-000001').fill(journeyTag);
  await page.getByPlaceholder('What did the operator observe?').fill('Journey test quality observation');
  await page.getByRole('button', { name: 'Open claim' }).click();
  await expect(page.getByText('Quality claim opened for supervisor review.')).toBeVisible();

  await page.goto(`/ui/app/?local-demo=1#/laundry/orders?order=${encodeURIComponent(journeyOrder)}`);
  await expect(page.getByText('Order work card')).toBeVisible();
  await expect(page.getByText('Assembly safety · garment traceability')).toBeVisible();
  const amountInput = page.locator('aside label').filter({ hasText: 'Amount' }).locator('input');
  if (await amountInput.count() && await amountInput.isVisible()) {
    await page.locator('aside label').filter({ hasText: 'Method' }).locator('select').selectOption({ label: 'UPI' });
    await amountInput.fill('1');
    await page.getByRole('button', { name: 'Record collection' }).click();
    await expect(page.getByText(/Recorded|Paid|Collection/).first()).toBeVisible({ timeout: 10000 });
  }

  await page.goto('/ui/app/?local-demo=1#/laundry/orders?view=customers');
  await expect(page.getByRole('heading', { name: 'Store orders & customers' })).toBeVisible();
  await page.getByPlaceholder('Search name, phone or email').fill('Demo');
  await expect(page.getByText(/Demo/).first()).toBeVisible();

  await page.goto('/ui/app/?local-demo=1#/laundry/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Financial controls')).toBeVisible();

  await page.goto('/ui/app/?local-demo=1#/laundry/routes');
  await expect(page.getByRole('heading', { name: 'Route runs' })).toBeVisible();
  await page.goto('/ui/app/?local-demo=1#/laundry/cash-closing');
  await expect(page.getByRole('heading', { name: 'Cash closing' })).toBeVisible();
});
