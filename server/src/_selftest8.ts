// Foreground self-test #8: Epic AI & Analytics — Phase 4 differentiator.
// Runs the kernel directly (no server) on isolated tenant 'TAI'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getInsights } from './modules/ai/insights.js';
import { ask } from './modules/ai/assistant.js';

const T = 'TAI';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const coa: [string, string][] = [
    ['Debtors (Assets)', 'Asset'], ['Cash (Assets)', 'Asset'], ['Bank (Assets)', 'Asset'], ['Bank/UPI (Assets)', 'Asset'], ['Bank/Card (Assets)', 'Asset'],
    ['CGST (Asset)', 'Asset'], ['SGST (Asset)', 'Asset'], ['IGST (Asset)', 'Asset'],
    ['Creditors (Liabilities)', 'Liability'], ['CGST (Liability)', 'Liability'], ['SGST (Liability)', 'Liability'], ['IGST (Liability)', 'Liability'],
    ['Capital (Equity)', 'Equity'], ['Sales (Revenue)', 'Income'], ['Purchase (Expense)', 'Expense'],
  ];
  for (const [name, account_type] of coa) createRow(T, 'test', 'account', { name, account_type });

  const cust = createRow(T, 'test', 'party', { name: 'Sharma', gstin: '29ABCDE1234F1Z5', is_customer: true });
  const sup = createRow(T, 'test', 'party', { name: 'Plywood', gstin: '29UVX7843W1Z2', is_supplier: true });
  const item = createRow(T, 'test', 'item', { name: 'Cement', item_code: 'CEM', uom: 'BORI', rate: 350, hsn: '252329', gst_rate: 18 });
  const wh = createRow(T, 'test', 'warehouse', { name: 'DC', code: 'DC', state: '29' });

  // Sale 2065 + full receipt 2065 -> receivables 0, cash +2065
  const sale = createRow(T, 'test', 'sales_invoice', { customer: cust.id, posting_date: '2026-07-13', place_of_supply: '29', items: [{ item: item.id, qty: 5, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'sales_invoice', sale.id);
  const recv = createRow(T, 'test', 'payment_entry', { payment_type: 'Receive', party: cust.id, posting_date: '2026-07-20', mode: 'Bank', amount: 2065, against_sales: sale.id });
  submitRow(T, 'test', 'payment_entry', recv.id);

  const d = getInsights(T);
  assert(d.total_sales === 2065, `insights total_sales=2065 (got ${d.total_sales})`);
  assert(d.outstanding_receivables === 0, `receivables cleared by payment (got ${d.outstanding_receivables})`);
  assert(Math.abs(d.cash_position - 2065) < 0.01, `cash position = 2065 (got ${d.cash_position})`);
  assert(d.gst_payable < 0, `input GST credit > output -> negative payable (got ${d.gst_payable})`);

  // Anomaly: customer without GSTIN on a submitted invoice
  const cust2 = createRow(T, 'test', 'party', { name: 'NoGST', is_customer: true });
  const sale2 = createRow(T, 'test', 'sales_invoice', { customer: cust2.id, posting_date: '2026-07-13', place_of_supply: '29', items: [{ item: item.id, qty: 1, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'sales_invoice', sale2.id);
  const d2 = getInsights(T);
  assert(d2.anomalies.some((a) => a.includes('no customer GSTIN')), 'detects missing customer GSTIN anomaly');

  // Assistant (heuristic, no key)
  const a1 = await ask(T, 'what are my outstanding receivables?');
  assert(a1.mode === 'heuristic' && /receivab/i.test(a1.answer), 'assistant answers receivables (heuristic)');
  const a2 = await ask(T, 'show anomalies');
  assert(a2.answer.includes('GSTIN'), 'assistant lists anomalies');
  const a3 = await ask(T, 'what is my cash position');
  assert(/cash/i.test(a3.answer), 'assistant answers cash position');

  console.log(`\nPhase-4 (Epic AI) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
