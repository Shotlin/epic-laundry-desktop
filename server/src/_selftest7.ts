// Foreground self-test #7: Migration import (Tally/Zoho/generic) — Phase 1 data acquisition.
// Runs the kernel directly (no server) on isolated tenant 'TMIG'.
import { store } from './kernel/store.js';
import { createRow } from './kernel/entity-service.js';
import { getTrialBalance } from './modules/accounting/reports.js';
import { runImport, PRESETS } from './modules/migration/import.js';

const T = 'TMIG';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const coa: [string, string][] = [
    ['Debtors (Assets)', 'Asset'], ['Cash (Assets)', 'Asset'], ['Bank (Assets)', 'Asset'], ['Bank/UPI (Assets)', 'Asset'], ['Bank/Card (Assets)', 'Asset'],
    ['CGST (Asset)', 'Asset'], ['SGST (Asset)', 'Asset'], ['IGST (Asset)', 'Asset'],
    ['Creditors (Liabilities)', 'Liability'], ['CGST (Liability)', 'Liability'], ['SGST (Liability)', 'Liability'], ['IGST (Liability)', 'Liability'],
    ['PF Payable (Liability)', 'Liability'], ['ESI Payable (Liability)', 'Liability'], ['TDS Payable (Liability)', 'Liability'], ['PT Payable (Liability)', 'Liability'],
    ['Capital (Equity)', 'Equity'], ['Opening Balance (Equity)', 'Equity'], ['Sales (Revenue)', 'Income'], ['Purchase (Expense)', 'Expense'], ['Salary (Expense)', 'Expense'],
  ];
  for (const [name, account_type] of coa) createRow(T, 'test', 'account', { name, account_type });

  assert(PRESETS.find((p) => p.key === 'tally_ledger')?.entity === 'account', 'tally_ledger preset exists');

  // Simulate a Tally ledger CSV export
  const tallyRows = [
    { Name: 'Sundry Debtors', Type: 'Assets', 'Opening Balance': 120000, 'Balance Type': 'Dr' },
    { Name: 'Sundry Creditors', Type: 'Liabilities', 'Opening Balance': 80000, 'Balance Type': 'Cr' },
    { Name: 'Capital Account', Type: 'Equity', 'Opening Balance': 40000, 'Balance Type': 'Cr' },
  ];
  const p = PRESETS.find((x) => x.key === 'tally_ledger')!;
  const res = runImport(T, 'test', p.entity, tallyRows, p.fieldMap);
  assert(res.filter((r) => r.ok).length === 3, 'imported 3 ledger accounts');
  assert(store.rowsOf(T, 'account').some((a) => a.data.name === 'Sundry Debtors' && a.data.account_type === 'Asset'), 'Tally type normalized to Asset');

  // Opening balances carried to GL, balancing via Opening Balance (Equity)
  const gl = store.glOf(T);
  assert(gl.some((e) => e.account === 'Sundry Debtors' && e.debit === 120000), 'Dr opening -> Debtors debit 120000');
  assert(gl.some((e) => e.account === 'Sundry Creditors' && e.credit === 80000), 'Cr opening -> Creditors credit 80000');
  const obGl = gl.filter((e) => e.account === 'Opening Balance (Equity)');
  const obCr = obGl.reduce((a, e) => a + (e.credit || 0), 0);
  const obDr = obGl.reduce((a, e) => a + (e.debit || 0), 0);
  assert(Math.abs(obCr - 120000) < 0.01 && Math.abs(obDr - 120000) < 0.01, `Opening Balance equity offsets (cr=${obCr} dr=${obDr})`);

  const tb = getTrialBalance(T);
  assert(tb.balanced === true, `trial balance ties after migration (dr=${tb.totalDebit} cr=${tb.totalCredit})`);

  // Party import via generic mapping
  const partyRows = [{ Name: 'Acme Pvt Ltd', 'Mobile No.': '919900000001', GSTIN: '29AAACA1234A1Z2' }];
  const pp = PRESETS.find((x) => x.key === 'tally_party')!;
  const pres = runImport(T, 'test', pp.entity, partyRows, pp.fieldMap);
  assert(pres[0].ok && store.rowsOf(T, 'party').some((x) => x.data.name === 'Acme Pvt Ltd'), 'party imported from Tally preset');

  console.log(`\nMigration self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
