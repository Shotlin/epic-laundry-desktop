// Foreground self-test #9: Buying & Supply Chain — Phase 5.
// Runs the kernel directly (no server) on isolated tenant 'TBUY'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { runPosting } from './kernel/posting.js';

const T = 'TBUY';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const sup = createRow(T, 'test', 'party', { name: 'VendorA', gstin: '29VVV1234W1Z2', is_supplier: true });
  const item = createRow(T, 'test', 'item', { name: 'Steel', item_code: 'STL', uom: 'KG', rate: 350, hsn: '7210', gst_rate: 18 });
  const wh = createRow(T, 'test', 'warehouse', { name: 'DC', code: 'DC', state: '29' });

  // RFQ (no posting hook)
  const rfq = createRow(T, 'test', 'request_for_quotation', { supplier: sup.id, validity_date: '2026-07-30', items: [{ item: item.id, qty: 10, target_rate: 340 }] });
  submitRow(T, 'test', 'request_for_quotation', rfq.id);
  assert(rfq.data.name.startsWith('RFQ-'), `RFQ series generated (${rfq.data.name})`);
  assert(rfq.status === 'Submitted', 'RFQ submitted');

  // Purchase Order -> posting computes grand_total (commitment only, no GL)
  const po = createRow(T, 'test', 'purchase_order', { supplier: sup.id, schedule_date: '2026-08-01', items: [{ item: item.id, qty: 5, rate: 350, gst_rate: 18 }] });
  const gl = await runPosting(T, po, 1);
  assert(gl.length === 0, 'PO posts no GL (commitment only)');
  assert(po.data.grand_total === 2065, `PO grand_total=2065 (got ${po.data.grand_total})`);
  submitRow(T, 'test', 'purchase_order', po.id);
  assert(po.data.name.startsWith('PO-'), `PO series generated (${po.data.name})`);

  // Quality inspection
  const pinv = createRow(T, 'test', 'purchase_invoice', { supplier: sup.id, warehouse: wh.id, posting_date: '2026-08-02', place_of_supply: '29', items: [{ item: item.id, qty: 5, rate: 350, gst_rate: 18 }] });
  submitRow(T, 'test', 'purchase_invoice', pinv.id);
  const qa = createRow(T, 'test', 'quality_inspection', { reference: pinv.id, item: item.id, qty: 5, accepted_qty: 4, rejected_qty: 1, status: 'Partial' });
  submitRow(T, 'test', 'quality_inspection', qa.id);
  assert(qa.data.name.startsWith('QA-'), `QA series generated (${qa.data.name})`);
  assert(qa.data.accepted_qty + qa.data.rejected_qty === qa.data.qty, 'QA accepted+rejected=qty');

  // Price list
  const pl = createRow(T, 'test', 'price_list', { name: 'Bulk', type: 'Buying', items: [{ item: item.id, rate: 330 }] });
  assert(pl.data.type === 'Buying' && pl.data.items.length === 1, 'price list saved with item');

  console.log(`\nPhase-5 (Buying & Supply Chain) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
