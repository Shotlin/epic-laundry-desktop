// Foreground self-test #10: Advanced Selling — Phase 6.
// Runs the kernel directly (no server) on isolated tenant 'TSELL'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { runPosting } from './kernel/posting.js';
import { store } from './kernel/store.js';

function balance(tenant: string, item: string, wh: string): number {
  return store.stockOf(tenant).filter((s) => s.item === item && s.warehouse === wh).reduce((a, s) => a + s.qty, 0);
}

const T = 'TSELL';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const cust = createRow(T, 'test', 'party', { name: 'Buyer', gstin: '29BBB1234W1Z2', is_customer: true });
  const item = createRow(T, 'test', 'item', { name: 'Widget', item_code: 'WID', uom: 'NOS', rate: 350, hsn: '8471', gst_rate: 18 });
  const wh = createRow(T, 'test', 'warehouse', { name: 'DC', code: 'DC', state: '29' });

  // Quotation: commitment = compute grand_total, no GL
  const q = createRow(T, 'test', 'quotation', { customer: cust.id, valid_till: '2026-08-01', items: [{ item: item.id, qty: 3, rate: 350, gst_rate: 18 }] });
  const qgl = await runPosting(T, q, 1);
  assert(qgl.length === 0, 'quotation posts no GL');
  assert(q.data.grand_total === 1239, `quotation grand_total=1239 (got ${q.data.grand_total})`);
  submitRow(T, 'test', 'quotation', q.id);
  assert(q.data.name.startsWith('QTN-'), `QTN series (${q.data.name})`);

  // Sales Order: commitment = compute grand_total, no GL
  const so = createRow(T, 'test', 'sales_order', { customer: cust.id, delivery_date: '2026-08-05', items: [{ item: item.id, qty: 3, rate: 350, gst_rate: 18 }] });
  const sogl = await runPosting(T, so, 1);
  assert(sogl.length === 0, 'sales order posts no GL');
  assert(so.data.grand_total === 1239, `SO grand_total=1239 (got ${so.data.grand_total})`);
  submitRow(T, 'test', 'sales_order', so.id);
  assert(so.data.name.startsWith('SO-'), `SO series (${so.data.name})`);

  // Give stock so delivery can issue out
  const pinv = createRow(T, 'test', 'purchase_invoice', { supplier: cust.id, warehouse: wh.id, posting_date: '2026-08-02', place_of_supply: '29', items: [{ item: item.id, qty: 10, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'purchase_invoice', pinv.id);
  assert(balance(T, item.id, wh.id) === 10, `stock after GRN = 10 (got ${balance(T, item.id, wh.id)})`);

  // Delivery Note: stock out, no GL
  const dn = createRow(T, 'test', 'delivery_note', { customer: cust.id, sales_order: so.id, warehouse: wh.id, items: [{ item: item.id, qty: 3 }] });
  const dgl = await runPosting(T, dn, 1);
  assert(dgl.length === 0, 'delivery note posts no GL (stock only)');
  assert(balance(T, item.id, wh.id) === 7, `stock after delivery = 7 (got ${balance(T, item.id, wh.id)})`);
  submitRow(T, 'test', 'delivery_note', dn.id);
  assert(dn.data.name.startsWith('DEL-'), `DEL series (${dn.data.name})`);

  console.log(`\nPhase-6 (Advanced Selling) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
