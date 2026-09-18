// Foreground self-test #4: Returns (Credit Note / Debit Note) — Phase 1 GST billing cycle close.
// Runs the kernel directly (no server) on isolated tenant 'TRET'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getTrialBalance, getPnL, getBalanceSheet } from './modules/accounting/reports.js';
import { buildGstr1, buildCdnr } from './modules/gst/gstr1.js';

const T = 'TRET';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const coa: [string, string][] = [
    ['Debtors (Assets)', 'Asset'], ['Cash (Assets)', 'Asset'], ['Bank/UPI (Assets)', 'Asset'], ['Bank/Card (Assets)', 'Asset'],
    ['CGST (Asset)', 'Asset'], ['SGST (Asset)', 'Asset'], ['IGST (Asset)', 'Asset'],
    ['Creditors (Liabilities)', 'Liability'], ['CGST (Liability)', 'Liability'], ['SGST (Liability)', 'Liability'], ['IGST (Liability)', 'Liability'],
    ['Capital (Equity)', 'Equity'], ['Sales (Revenue)', 'Income'], ['Purchase (Expense)', 'Expense'],
  ];
  for (const [name, account_type] of coa) createRow(T, 'test', 'account', { name, account_type });

  const cust = createRow(T, 'test', 'party', { name: 'Sharma', gstin: '29ABCDE1234F1Z5', is_customer: true });
  const sup = createRow(T, 'test', 'party', { name: 'Plywood', gstin: '29UVX7843W1Z2', is_supplier: true });
  const item = createRow(T, 'test', 'item', { name: 'Cement', item_code: 'CEM', uom: 'BORI', rate: 350, hsn: '252329', gst_rate: 18 });
  const wh = createRow(T, 'test', 'warehouse', { name: 'DC', code: 'DC', state: '29' });

  // SALES + full CREDIT NOTE (return)
  const sale = createRow(T, 'test', 'sales_invoice', { customer: cust.id, posting_date: '2026-07-13', place_of_supply: '29', items: [{ item: item.id, qty: 5, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'sales_invoice', sale.id);
  const cn = createRow(T, 'test', 'credit_note', { reference_invoice: sale.id, posting_date: '2026-07-14', warehouse: wh.id, reason: 'damaged', items: [{ item: item.id, qty: 5, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'credit_note', cn.id);
  assert(cn.data.grand_total === 2065, `credit note grand_total=2065, got ${cn.data.grand_total}`);
  const cngl = store.glOf(T).filter((e) => e.voucher === cn.id);
  assert(cngl.find((e) => e.account === 'Sales (Revenue)')?.debit === 1750, 'CN reverses Sales (debit 1750)');
  assert(cngl.find((e) => e.account === 'Debtors (Assets)')?.credit === 2065, 'CN credits Debtors 2065');
  assert(cngl.find((e) => e.account === 'CGST (Liability)')?.debit === 157.5, 'CN reverses output CGST (debit 157.5)');
  assert(cngl.find((e) => e.account === 'SGST (Liability)')?.debit === 157.5, 'CN reverses output SGST (debit 157.5)');
  const cnStock = store.stockOf(T).filter((s) => s.voucher === cn.id);
  assert(cnStock.length === 1 && cnStock[0].qty === 5, 'CN returns 5 units to stock');

  // PURCHASE + full DEBIT NOTE (return to supplier)
  const pur = createRow(T, 'test', 'purchase_invoice', { supplier: sup.id, bill_no: 'B1', posting_date: '2026-07-13', place_of_supply: '29', warehouse: wh.id, items: [{ item: item.id, qty: 10, rate: 100, gst_rate: 18 }] });
  submitRow(T, 'test', 'purchase_invoice', pur.id);
  const dn = createRow(T, 'test', 'debit_note', { reference_invoice: pur.id, posting_date: '2026-07-14', reason: 'defective', items: [{ item: item.id, qty: 10, rate: 100, gst_rate: 18 }] });
  submitRow(T, 'test', 'debit_note', dn.id);
  assert(dn.data.grand_total === 1180, `debit note grand_total=1180, got ${dn.data.grand_total}`);
  const dngl = store.glOf(T).filter((e) => e.voucher === dn.id);
  assert(dngl.find((e) => e.account === 'Purchase (Expense)')?.credit === 1000, 'DN reverses Purchase (credit 1000)');
  assert(dngl.find((e) => e.account === 'Creditors (Liabilities)')?.debit === 1180, 'DN debits Creditors 1180');
  assert(dngl.find((e) => e.account === 'CGST (Asset)')?.credit === 90, 'DN reverses input CGST (credit 90)');
  assert(dngl.find((e) => e.account === 'SGST (Asset)')?.credit === 90, 'DN reverses input SGST (credit 90)');
  const dnStock = store.stockOf(T).filter((s) => s.voucher === dn.id);
  assert(dnStock.length === 1 && dnStock[0].qty === -10, 'DN returns 10 units out of stock');

  // After full returns, books net to zero
  const tb = getTrialBalance(T);
  assert(tb.balanced === true, `trial balance ties after returns (dr=${tb.totalDebit} cr=${tb.totalCredit})`);
  const pnl = getPnL(T);
  assert(Math.abs(pnl.netProfit) < 0.01, `P&L nets to zero after full returns (net=${pnl.netProfit})`);
  const bs = getBalanceSheet(T);
  assert(bs.balanced === true, `balance sheet balances (assets=${bs.totalAssets} = liab+eq=${bs.totalEquityLiabilities})`);

  // GSTR-1 now carries a CDNR line
  const invs = store.rowsOf(T, 'sales_invoice').filter((r) => r.status === 'Submitted').map((r) => ({ data: r.data, gst: r.data.__gst }));
  const cns = store.rowsOf(T, 'credit_note').filter((r) => r.status === 'Submitted').map((r) => ({ data: r.data, gst: r.data.__gst }));
  const g1 = { ...buildGstr1(invs, () => true), ...buildCdnr(cns, (d) => store.getRow(T, d.reference_invoice)?.data?.name || '') };
  assert(g1.cdnr.length === 1 && g1.cdnr[0].taxable === 1750, `GSTR-1 CDNR has 1 note, taxable 1750 (got ${g1.cdnr[0]?.taxable})`);

  console.log(`\nPhase-1 (returns) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
