// Foreground self-test #3: Purchasing + Accounting reports (Phase 1 "books").
// Runs the kernel directly (no server) on isolated tenant 'TACC'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getTrialBalance, getPnL, getBalanceSheet } from './modules/accounting/reports.js';
import { computeGst } from './modules/gst/engine.js';

const T = 'TACC';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  // chart of accounts
  const coa: [string, string][] = [
    ['Debtors (Assets)', 'Asset'], ['Cash (Assets)', 'Asset'], ['Bank/UPI (Assets)', 'Asset'], ['Bank/Card (Assets)', 'Asset'],
    ['CGST (Asset)', 'Asset'], ['SGST (Asset)', 'Asset'], ['IGST (Asset)', 'Asset'],
    ['Creditors (Liabilities)', 'Liability'], ['CGST (Liability)', 'Liability'], ['SGST (Liability)', 'Liability'], ['IGST (Liability)', 'Liability'],
    ['Capital (Equity)', 'Equity'], ['Sales (Revenue)', 'Income'], ['Purchase (Expense)', 'Expense'],
  ];
  for (const [name, account_type] of coa) createRow(T, 'test', 'account', { name, account_type });

  const sup = createRow(T, 'test', 'party', { name: 'Bengaluru Plywood', gstin: '29UVX7843W1Z2', is_supplier: true });
  const cust = createRow(T, 'test', 'party', { name: 'Sharma Traders', gstin: '29ABCDE1234F1Z5', is_customer: true });
  const item = createRow(T, 'test', 'item', { name: 'Cement', item_code: 'CEM', uom: 'BORI', rate: 100, hsn: '252329', gst_rate: 18 });
  const wh = createRow(T, 'test', 'warehouse', { name: 'DC', code: 'DC', state: '29' });

  // PURCHASE (intra-state): 10 x 100 @18% -> taxable 1000, cgst 90, sgst 90, total 1180
  const pur = createRow(T, 'test', 'purchase_invoice', {
    supplier: sup.id, bill_no: 'B1', posting_date: '2026-07-13', place_of_supply: '29', warehouse: wh.id,
    items: [{ item: item.id, qty: 10, rate: 100, gst_rate: 18 }],
  });
  submitRow(T, 'test', 'purchase_invoice', pur.id);
  assert(pur.data.grand_total === 1180, `purchase grand_total=1180, got ${pur.data.grand_total}`);
  const pgl = store.glOf(T).filter((e) => e.voucher === pur.id);
  assert(pgl.find((e) => e.account === 'Purchase (Expense)')?.debit === 1000, 'purchase expense debited 1000');
  assert(pgl.find((e) => e.account === 'CGST (Asset)')?.debit === 90, 'input CGST (asset) debited 90');
  assert(pgl.find((e) => e.account === 'SGST (Asset)')?.debit === 90, 'input SGST (asset) debited 90');
  assert(pgl.find((e) => e.account === 'Creditors (Liabilities)')?.credit === 1180, 'creditors credited 1180');
  const grn = store.stockOf(T).filter((s) => s.voucher === pur.id);
  assert(grn.length === 1 && grn[0].qty === 10, 'GRN received 10 into stock');

  // SALES (intra-state): 5 x 350 @18% -> taxable 1750, cgst 157.5, sgst 157.5, total 2065
  const sale = createRow(T, 'test', 'sales_invoice', { customer: cust.id, posting_date: '2026-07-13', place_of_supply: '29', items: [{ item: item.id, qty: 5, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'sales_invoice', sale.id);

  // REPORTS
  const tb = getTrialBalance(T);
  assert(tb.balanced === true, `trial balance ties (dr=${tb.totalDebit} cr=${tb.totalCredit})`);

  const pnl = getPnL(T);
  assert(pnl.income === 1750, `P&L income=1750, got ${pnl.income}`);
  assert(pnl.expense === 1000, `P&L expense=1000, got ${pnl.expense}`);
  assert(pnl.netProfit === 750, `P&L net=750, got ${pnl.netProfit}`);

  const bs = getBalanceSheet(T);
  assert(bs.balanced === true, `balance sheet balances (assets=${bs.totalAssets} = liab+eq=${bs.totalEquityLiabilities})`);
  assert(bs.retainedEarnings === 750, `retained earnings=750, got ${bs.retainedEarnings}`);

  // sanity: computeGst still correct for the purchase line
  const g = computeGst([{ hsn: '252329', taxable: 1000, gstRate: 18 }], '29', '29');
  assert(g.intraState && g.totalCgst === 90 && g.totalSgst === 90, 'purchase GST split 90/90');

  console.log(`\nPhase-1 (books) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
