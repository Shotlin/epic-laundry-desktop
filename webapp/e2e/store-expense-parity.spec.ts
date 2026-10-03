import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('aside').first()).toBeVisible()
}

test('Expense form matches source labels, limits the name, and cancels without posting', async ({ page }) => {
  await signIntoDemo(page)
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })

  const expenseWrites: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/laundry/expenses' && request.method() !== 'GET') expenseWrites.push(request.method())
  })

  const addExpense = page.getByRole('button', { name: /add expense/i })
  await addExpense.click()
  const dialog = page.getByRole('dialog', { name: 'Add expense' })
  await expect(dialog).toBeVisible()

  const name = dialog.getByRole('textbox', { name: /Expense Name/ })
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('required', '')
  await expect(name).toHaveAttribute('maxlength', '100')
  await expect(dialog.getByText('0/100', { exact: true })).toBeVisible()
  await name.fill('x'.repeat(101))
  await expect(name).toHaveValue('x'.repeat(100))
  await expect(dialog.getByText('100/100', { exact: true })).toBeVisible()

  await expect(dialog.getByLabel('Expense Date')).toHaveAttribute('required', '')
  await expect(dialog.getByRole('spinbutton', { name: 'Amount Paid' })).toHaveAttribute('required', '')
  await expect(dialog.getByLabel('Payment Receiver')).toBeVisible()
  await expect(dialog.getByLabel('Invoice Number')).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: 'Is Tax Paid?' })).toBeVisible()
  await expect(dialog.getByLabel('Management category')).toBeVisible()
  await expect(dialog.getByLabel('Payment mode')).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(addExpense).toBeFocused()
  expect(expenseWrites).toEqual([])
})

test('Expense list provides spreadsheet and PDF exports, refresh, and list/grid views', async ({ page }) => {
  await signIntoDemo(page)
  const expenseFixture = [{
    id: 'expense-fixture-1', reference: 'EXP-1', expenseName: 'Washing supplies', expenseDate: '2026-09-29', amount: 250,
    financeCategory: 'MAINTENANCE', paymentReceiver: 'Supply Store', invoiceNumber: 'INV-1', isTaxPaid: true,
    paymentMode: 'UPI', notes: '', status: 'Paid',
  }]
  let getCount = 0
  const writes: string[] = []
  page.on('request', (request) => {
    if (!new URL(request.url()).pathname.endsWith('/api/laundry/expenses')) return
    if (request.method() === 'GET') getCount += 1
    else writes.push(request.method())
  })
  await page.route('**/api/laundry/expenses*', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(expenseFixture) })
    else await route.continue()
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'Store expense' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Download expense PDF' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Download expense spreadsheet' })).toBeEnabled()

  await page.getByRole('button', { name: 'Grid view' }).click()
  await expect(page.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Washing supplies' })).toBeVisible()
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page.getByRole('table').getByText('Washing supplies')).toBeVisible()

  const beforeRefresh = getCount
  await page.getByRole('button', { name: 'Refresh expenses' }).click()
  await expect.poll(() => getCount).toBeGreaterThan(beforeRefresh)

  const printWindow = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Print expense list' }).click()
  const printPage = await printWindow
  await expect(printPage.getByRole('heading', { name: 'Store Expense' })).toBeVisible()
  await expect(printPage.getByText('Washing supplies')).toBeVisible()
  await printPage.close()

  const spreadsheetDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download expense spreadsheet' }).click()
  expect((await spreadsheetDownload).suggestedFilename()).toMatch(/epic-store-expenses-.*\.csv/)

  const pdfDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download expense PDF' }).click()
  expect((await pdfDownload).suggestedFilename()).toMatch(/epic-store-expenses-.*\.pdf/)
  expect(writes).toEqual([])
})

test('Expense search and applied date filters keep the visible list in sync', async ({ page }) => {
  await signIntoDemo(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  const fixture = [
    { id: 'expense-harbor-1', reference: 'EXP-H1', expenseName: 'Harbor towels', expenseDate: '2026-09-30', amount: 900, financeCategory: 'MAINTENANCE', paymentReceiver: 'Harbor Supply', invoiceNumber: 'H-01', isTaxPaid: false, paymentMode: 'Cash', notes: '', status: 'Paid' },
    { id: 'expense-electricity', reference: 'EXP-E1', expenseName: 'Electricity', expenseDate: '2026-10-03', amount: 1200, financeCategory: 'UTILITIES', paymentReceiver: 'City Power', invoiceNumber: 'P-04', isTaxPaid: true, paymentMode: 'UPI', notes: '', status: 'Paid' },
  ]
  const requests: URL[] = []
  const writes: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/laundry/expenses') return
    if (request.method() !== 'GET') writes.push(request.method())
  })
  await page.route('**/api/laundry/expenses*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const needle = (url.searchParams.get('search') || '').trim().toLowerCase()
    const from = url.searchParams.get('from') || ''
    const to = url.searchParams.get('to') || ''
    const filtered = fixture.filter((expense) =>
      (!needle || `${expense.expenseName} ${expense.paymentReceiver} ${expense.invoiceNumber}`.toLowerCase().includes(needle))
      && (!from || expense.expenseDate >= from)
      && (!to || expense.expenseDate <= to),
    )
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) })
  })
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })

  const table = page.getByRole('table')
  const search = page.getByPlaceholder('Expense name, receiver, invoice no.')
  await expect(table.getByText('Harbor towels')).toBeVisible()
  await expect(table.getByText('Electricity')).toBeVisible()
  const capture = async (name: string, fullPage = true) => {
    const path = resolve(process.cwd(), `../docs/parity/evidence/${name}.png`)
    mkdirSync(dirname(path), { recursive: true })
    await page.screenshot({ path, fullPage })
  }
  await capture('expense-populated-desktop')

  await search.fill('harbor')
  await expect.poll(() => requests.at(-1)?.searchParams.get('search')).toBe('harbor')
  await expect(table.getByText('Harbor towels')).toBeVisible()
  await expect(table.getByText('Electricity')).toHaveCount(0)

  await page.getByLabel('Expense start date').fill('2026-10-01')
  await page.getByLabel('Expense end date').fill('2026-10-31')
  await page.getByRole('button', { name: 'Apply filter' }).click()
  await expect.poll(() => requests.at(-1)?.searchParams.get('from')).toBe('2026-10-01')
  expect(requests.at(-1)?.searchParams.get('to')).toBe('2026-10-31')
  expect(requests.at(-1)?.searchParams.get('search')).toBe('harbor')
  await expect(page.getByText('Date filter applied: 2026-10-01 to 2026-10-31.')).toBeVisible()
  await expect(page.getByText('No expenses in this view')).toBeVisible()
  await capture('expense-filtered-empty-desktop')

  await page.getByRole('button', { name: 'Clear dates' }).click()
  await expect.poll(() => requests.at(-1)?.searchParams.get('from')).toBeNull()
  expect(requests.at(-1)?.searchParams.get('to')).toBeNull()
  expect(requests.at(-1)?.searchParams.get('search')).toBe('harbor')
  await expect(table.getByText('Harbor towels')).toBeVisible()

  await search.fill('no matching expense')
  await expect.poll(() => requests.at(-1)?.searchParams.get('search')).toBe('no matching expense')
  await expect(page.getByText('No expenses in this view')).toBeVisible()
  await search.fill('')
  await expect(table.getByText('Harbor towels')).toBeVisible()
  await expect(table.getByText('Electricity')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture('expense-populated-mobile')
  expect(writes).toEqual([])
})
