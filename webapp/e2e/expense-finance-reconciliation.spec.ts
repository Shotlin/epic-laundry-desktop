import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Expense = { id: string; expenseName: string; expenseDate: string; amount: number; financeCategory: string; paymentMode: string; status: string }
type ExpenseReport = { summary: { label: string; value: number }; rows: Array<{ expenseAmount: number; title: string }>; totalRows: number }
type CashShift = { status: string; register: string; openingCash: number; expenses: number; expectedCash: number; movementCounts: { expenses: number } }

async function signIntoDemo(page: Page) {
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses')
  await expect(page.getByText('Demo access')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Store expense', exact: true })).toBeVisible()
}

test('cash expense reconciles across the expense ledger, expense report, and drawer close', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = randomUUID().slice(0, 8)
  const expenseName = `Synthetic utility ${runId}`
  const invoiceNumber = `EXP-${runId}`
  const register = `Expense close ${runId}`
  const amount = 137.45
  await signIntoDemo(page)
  const expenseDate = await page.evaluate(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })

  await page.goto('/ui/app/?local-demo=1#/laundry/cash-closing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cash closing', exact: true })).toBeVisible()
  await page.getByLabel('Register').fill(register)
  await page.getByLabel('Opening float').fill('1000.00')
  const openResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/open' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Open shift' }).click()
  const openResponse = await openResponsePromise
  expect(openResponse.status(), await openResponse.text()).toBe(201)

  await page.goto('/ui/app/?local-demo=1#/laundry/expenses', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /add expense/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Add expense' })
  await dialog.getByRole('textbox', { name: /Expense Name/ }).fill(expenseName)
  await dialog.getByLabel('Expense Date').fill(expenseDate)
  await dialog.getByRole('spinbutton', { name: 'Amount Paid' }).fill(amount.toFixed(2))
  await dialog.getByLabel('Management category').selectOption('UTILITIES')
  await dialog.getByLabel('Payment Receiver').fill(`Synthetic Utility Vendor ${runId}`)
  await dialog.getByLabel('Invoice Number').fill(invoiceNumber)
  await dialog.getByLabel('Payment mode').selectOption('Cash')
  await dialog.getByLabel('Cash register').selectOption(register)
  const saveResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/expenses' && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Save expense' }).click()
  const saveResponse = await saveResponsePromise
  expect(saveResponse.status(), await saveResponse.text()).toBe(201)
  const savedExpense = await saveResponse.json() as Expense
  expect(savedExpense).toMatchObject({ expenseName, expenseDate, amount, financeCategory: 'UTILITIES', paymentMode: 'Cash', status: 'Paid' })
  await expect(dialog).toBeHidden()

  const expenseListResponse = await page.request.get(`/api/laundry/expenses?from=${expenseDate}&to=${expenseDate}&search=${encodeURIComponent(invoiceNumber)}`)
  expect(expenseListResponse.ok()).toBe(true)
  const expenseList = await expenseListResponse.json() as Expense[]
  expect(expenseList).toHaveLength(1)
  expect(expenseList[0]).toMatchObject({ id: savedExpense.id, expenseName, amount })

  await page.goto(`/ui/app/?local-demo=1#/laundry/reports/expense?from=${expenseDate}&to=${expenseDate}&search=${encodeURIComponent(invoiceNumber)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Expense Report', exact: true })).toBeVisible()
  const reportResponse = await page.request.get(`/api/laundry/reports/expense?from=${expenseDate}&to=${expenseDate}&search=${encodeURIComponent(invoiceNumber)}`)
  expect(reportResponse.ok()).toBe(true)
  const report = await reportResponse.json() as ExpenseReport
  expect(report.summary).toMatchObject({ label: 'Total Expense', value: amount })
  expect(report.totalRows).toBe(1)
  expect(report.rows[0].expenseAmount).toBe(amount)
  await expect(page.getByText('₹137.45', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('table').getByText('₹137.45', { exact: true })).toBeVisible()
  const evidenceDirectory = resolve(process.cwd(), '../docs/parity/evidence')
  mkdirSync(evidenceDirectory, { recursive: true })
  await page.screenshot({ path: resolve(evidenceDirectory, 'expense-finance-report.png'), fullPage: true })

  await page.goto('/ui/app/?local-demo=1#/laundry/cash-closing', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Register').fill(register)
  const shiftResponse = await page.request.get(`/api/laundry/cash-shift?register=${encodeURIComponent(register)}`)
  expect(shiftResponse.ok()).toBe(true)
  const shift = await shiftResponse.json() as CashShift
  expect(shift).toMatchObject({ status: 'Open', register, openingCash: 1000, expenses: amount, expectedCash: 1000 - amount, movementCounts: { expenses: 1 } })
  await expect(page.getByText('Cash expenses', { exact: true }).locator('..')).toContainText('₹137.45')
  await expect(page.getByText('Cash expenses', { exact: true }).locator('..')).toContainText('1 entries')
  await expect(page.getByText('Expected in drawer', { exact: true }).locator('..')).toContainText('₹862.55')
  await page.getByLabel('Counted cash').fill((1000 - amount).toFixed(2))
  await page.getByLabel('Close note').fill('Synthetic utility expense reconciles to drawer count.')
  await page.screenshot({ path: resolve(evidenceDirectory, 'expense-finance-cash-close.png'), fullPage: true })
  const closeResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/laundry/cash-shift/close' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Close shift' }).click()
  const closeResponse = await closeResponsePromise
  expect(closeResponse.status(), await closeResponse.text()).toBe(201)
  expect(await closeResponse.json() as CashShift).toMatchObject({ status: 'Closed', expenses: amount, expectedCash: 1000 - amount })
})
