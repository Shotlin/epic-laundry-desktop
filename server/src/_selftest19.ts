// Epic BOS self-test 19 — Phase-15 Accounting dimensions: cost centers, journal entry, budgets.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getPnL, getTrialBalance } from './modules/accounting/reports.js';
import { getAlerts } from './modules/ops.js';

const T = 'TECO';
let fails = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

async function main() {
  const cc = createRow(T, 'test', 'cost_center', { name: 'Retail' });

  // Manual balanced journal entry, tagged to a cost center.
  const je = createRow(T, 'test', 'journal_entry', {
    posting_date: '2026-03-01', voucher_type: 'Journal Entry',
    entries: [
      { account: 'Cash (Assets)', debit: 1000, credit: 0, cost_center: cc.id },
      { account: 'Sales (Revenue)', debit: 0, credit: 1000, cost_center: cc.id },
    ],
  });
  submitRow(T, 'test', 'journal_entry', je.id);

  const legs = store.glOf(T).filter((e) => e.voucher === je.id);
  assert(legs.length === 2, 'journal entry posted 2 GL legs');
  assert(legs.every((l) => l.cost_center === cc.id), 'both legs tagged with cost center');
  assert(legs.some((l) => l.account === 'Cash (Assets)' && l.debit === 1000), 'cash debited 1000');
  assert(legs.some((l) => l.account === 'Sales (Revenue)' && l.credit === 1000), 'sales credited 1000');

  const tb = getTrialBalance(T);
  assert(tb.balanced, 'trial balance stays balanced after JE');

  // Cost-center filtered P&L isolates this center's income.
  const ccPnl = getPnL(T, cc.id);
  assert(ccPnl.income === 1000, 'P&L by cost center shows 1000 income');
  const allPnl = getPnL(T);
  assert(allPnl.income === 1000, 'company-wide P&L also shows 1000 income');

  // Budget breach surfaces in owner alerts (scoped to an expense account under the cost center).
  const je2 = createRow(T, 'test', 'journal_entry', {
    posting_date: '2026-03-02', voucher_type: 'Journal Entry',
    entries: [
      { account: 'Salary (Expense)', debit: 1000, credit: 0, cost_center: cc.id },
      { account: 'Cash (Assets)', debit: 0, credit: 1000, cost_center: cc.id },
    ],
  });
  submitRow(T, 'test', 'journal_entry', je2.id);
  createRow(T, 'test', 'budget', { name: 'Retail Mktg', fiscal_year: '2026-27', cost_center: cc.id, account: 'Salary (Expense)', budget_amount: 500, alert_at_pct: 80 });
  const alerts = getAlerts(T, '2026-03-05');
  assert(alerts.budgets.length >= 1, 'budget breach surfaced in alerts');
  assert(alerts.budgets.some((b: any) => b.name === 'Retail Mktg' && b.breached), 'Retail Mktg flagged breached (1000 > 500)');

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
