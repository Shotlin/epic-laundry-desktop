// Foreground self-test #6: HR & Payroll — Phase 2 differentiator on the same kernel.
// Runs the kernel directly (no server) on isolated tenant 'THR'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getTrialBalance } from './modules/accounting/reports.js';
import { computePayroll } from './modules/hr/payroll.js';

const T = 'THR';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const coa: [string, string][] = [
    ['Debtors (Assets)', 'Asset'], ['Cash (Assets)', 'Asset'], ['Bank (Assets)', 'Asset'], ['Bank/UPI (Assets)', 'Asset'], ['Bank/Card (Assets)', 'Asset'],
    ['CGST (Asset)', 'Asset'], ['SGST (Asset)', 'Asset'], ['IGST (Asset)', 'Asset'],
    ['Creditors (Liabilities)', 'Liability'], ['CGST (Liability)', 'Liability'], ['SGST (Liability)', 'Liability'], ['IGST (Liability)', 'Liability'],
    ['PF Payable (Liability)', 'Liability'], ['ESI Payable (Liability)', 'Liability'], ['TDS Payable (Liability)', 'Liability'], ['PT Payable (Liability)', 'Liability'],
    ['Capital (Equity)', 'Equity'], ['Sales (Revenue)', 'Income'], ['Purchase (Expense)', 'Expense'], ['Salary (Expense)', 'Expense'],
  ];
  for (const [name, account_type] of coa) createRow(T, 'test', 'account', { name, account_type });

  // Computed payroll math
  const ss = { basic: 50000, hra: 20000, da: 5000, other_allowances: 3000, pf_pct: 12, esi_pct: 0.75, tds_pct: 5, professional_tax: 200 };
  const p = computePayroll(ss, 30, 30);
  const gross = 50000 + 20000 + 5000 + 3000;
  assert(p.gross === gross, `gross = ${gross} (got ${p.gross})`);
  const pf = Math.round(50000 * 0.12 * 100) / 100;
  assert(p.deductions.pf === pf, `PF = ${pf} (got ${p.deductions.pf})`);
  const esi = Math.round(gross * 0.0075 * 100) / 100;
  assert(p.deductions.esi === esi, `ESI = ${esi} (got ${p.deductions.esi})`);
  const tds5 = Math.round(gross * 0.05 * 100) / 100;
  assert(Math.abs(p.net_pay - (gross - pf - esi - 200 - tds5)) < 0.01, `net = ${gross - pf - esi - 200 - tds5} (got ${p.net_pay})`);
  // Proration: 15/30 days -> half earnings
  const half = computePayroll(ss, 15, 30);
  assert(Math.abs(half.gross - gross / 2) < 0.5, `prorated gross half = ${gross / 2} (got ${half.gross})`);

  // Entity flow: employee + structure + salary slip -> GL
  const structure = createRow(T, 'test', 'salary_structure', { name: 'S1', ...ss });
  const emp = createRow(T, 'test', 'employee', { name: 'Ravi', employee_code: 'E1', department: 'Sales', salary_structure: structure.id, is_active: true });
  const slip = createRow(T, 'test', 'salary_slip', { employee: emp.id, period: '2026-07', paid_days: 30, payment_mode: 'Bank' });
  submitRow(T, 'test', 'salary_slip', slip.id);
  assert(Number(slip.data.gross) === gross, 'slip gross computed');
  assert(Number(slip.data.net_pay) === p.net_pay, 'slip net computed');

  const gl = store.glOf(T).filter((e) => e.voucher === slip.id);
  assert(gl.find((e) => e.account === 'Salary (Expense)')?.debit === gross, 'posts Salary (Expense) debit');
  assert(gl.find((e) => e.account === 'Bank (Assets)')?.credit === p.net_pay, 'posts Bank credit = net pay');
  assert(gl.find((e) => e.account === 'PF Payable (Liability)')?.credit === pf, 'posts PF Payable');
  assert(gl.find((e) => e.account === 'ESI Payable (Liability)')?.credit === esi, 'posts ESI Payable');
  assert(gl.find((e) => e.account === 'PT Payable (Liability)')?.credit === 200, 'posts PT Payable');

  // TB still ties
  const tb = getTrialBalance(T);
  assert(tb.balanced === true, `trial balance ties after payroll (dr=${tb.totalDebit} cr=${tb.totalCredit})`);

  console.log(`\nPhase-2 (HR & Payroll) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
