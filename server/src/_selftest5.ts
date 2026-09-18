// Foreground self-test #5: Banking & Payments — Phase 1 (clear Debtors/Creditors in the books).
// Runs the kernel directly (no server) on isolated tenant 'TBANK'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getTrialBalance } from './modules/accounting/reports.js';

const T = 'TBANK';
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

  // SALES (Debtors 2065) + PURCHASE (Creditors 1180)
  const sale = createRow(T, 'test', 'sales_invoice', { customer: cust.id, posting_date: '2026-07-13', place_of_supply: '29', items: [{ item: item.id, qty: 5, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'sales_invoice', sale.id);
  const pur = createRow(T, 'test', 'purchase_invoice', { supplier: sup.id, bill_no: 'B1', posting_date: '2026-07-13', place_of_supply: '29', warehouse: wh.id, items: [{ item: item.id, qty: 10, rate: 100, gst_rate: 18 }] });
  submitRow(T, 'test', 'purchase_invoice', pur.id);
  assert(store.glOf(T).find((e) => e.voucher === sale.id && e.account === 'Debtors (Assets)')?.debit === 2065, 'sales booked Debtors 2065');
  assert(store.glOf(T).find((e) => e.voucher === pur.id && e.account === 'Creditors (Liabilities)')?.credit === 1180, 'purchase booked Creditors 1180');

  // RECEIVE payment (against sale) -> Bank debit, Debtors credit, sale Paid
  const recv = createRow(T, 'test', 'payment_entry', { payment_type: 'Receive', party: cust.id, posting_date: '2026-07-20', mode: 'Bank', amount: 2065, against_sales: sale.id, remarks: 'NEFT' });
  submitRow(T, 'test', 'payment_entry', recv.id);
  const recvGl = store.glOf(T).filter((e) => e.voucher === recv.id);
  assert(recvGl.find((e) => e.account === 'Bank (Assets)')?.debit === 2065, 'receive debits Bank 2065');
  assert(recvGl.find((e) => e.account === 'Debtors (Assets)')?.credit === 2065, 'receive credits Debtors 2065');
  assert(store.getRow(T, sale.id)?.data.status === 'Paid', 'sales invoice marked Paid');

  // PAY payment (against purchase) -> Creditors debit, Bank credit, purchase Paid
  const pay = createRow(T, 'test', 'payment_entry', { payment_type: 'Pay', party: sup.id, posting_date: '2026-07-21', mode: 'Bank', amount: 1180, against_purchase: pur.id, remarks: 'RTGS' });
  submitRow(T, 'test', 'payment_entry', pay.id);
  const payGl = store.glOf(T).filter((e) => e.voucher === pay.id);
  assert(payGl.find((e) => e.account === 'Creditors (Liabilities)')?.debit === 1180, 'pay debits Creditors 1180');
  assert(payGl.find((e) => e.account === 'Bank (Assets)')?.credit === 1180, 'pay credits Bank 1180');
  assert(store.getRow(T, pur.id)?.data.status === 'Paid', 'purchase invoice marked Paid');

  // Bank net = 2065 - 1180 = 885; Debtors/Creditors now zero
  const bankNet = recvGl.find((e) => e.account === 'Bank (Assets)')!.debit!
    - payGl.find((e) => e.account === 'Bank (Assets)')!.credit!;
  assert(Math.abs(bankNet - 885) < 0.01, `Bank net after payments = 885 (got ${bankNet})`);

  // Trial balance still ties
  const tb = getTrialBalance(T);
  assert(tb.balanced === true, `trial balance ties after payments (dr=${tb.totalDebit} cr=${tb.totalCredit})`);

  // BANK STATEMENT import + reconcile
  const stmt = createRow(T, 'test', 'bank_statement', { bank_name: 'SBI', account_no: 'XXXX1234', period: '2026-07', lines: [
    { date: '2026-07-25', narration: 'CUSTOMER-NEFT', withdrawal: 0, deposit: 5000, balance: 5885, reconciled: false },
  ] });
  assert((stmt.data.lines || []).length === 1, 'bank statement imported 1 line');

  // Simulate reconcile via the same logic the API uses
  const lines = (stmt.data.lines || []) as any[];
  const line = lines[0];
  const recAmt = Number(line.deposit) || 0;
  const recPay = createRow(T, 'test', 'payment_entry', { payment_type: 'Receive', posting_date: line.date, mode: 'Bank', bank_account: stmt.data.account_no, amount: recAmt, remarks: line.narration });
  submitRow(T, 'test', 'payment_entry', recPay.id);
  line.reconciled = true;
  store.updateRow(stmt);
  assert(store.glOf(T).find((e) => e.voucher === recPay.id && e.account === 'Bank (Assets)')?.debit === 5000, 'reconcile debits Bank 5000');
  assert((store.getRow(T, stmt.id)?.data.lines || [])[0].reconciled === true, 'reconciled line marked reconciled');

  // Payment mode mapping: Cash/UPI/Card
  const cash = createRow(T, 'test', 'payment_entry', { payment_type: 'Receive', posting_date: '2026-07-22', mode: 'Cash', amount: 500 });
  submitRow(T, 'test', 'payment_entry', cash.id);
  assert(!!store.glOf(T).find((e) => e.voucher === cash.id && e.account === 'Cash (Assets)'), 'Cash mode posts to Cash (Assets)');
  const upi = createRow(T, 'test', 'payment_entry', { payment_type: 'Receive', posting_date: '2026-07-22', mode: 'UPI', amount: 300 });
  submitRow(T, 'test', 'payment_entry', upi.id);
  assert(!!store.glOf(T).find((e) => e.voucher === upi.id && e.account === 'Bank/UPI (Assets)'), 'UPI mode posts to Bank/UPI (Assets)');

  console.log(`\nPhase-1 (banking) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
