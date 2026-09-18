// Foreground self-test #2: CRM -> Inventory -> POS -> GSP (e-invoice/e-way/IMS).
// Runs the kernel directly (no server), uses an isolated tenant 'TSELF'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import {
  generateIrnForInvoice, generateEwbForInvoice, getImsSupplies, recordImsAction,
} from './modules/gst/irn-service.js';
import { needsEway } from './modules/gst/gstr1.js';

const T = 'TSELF';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  // ---- CRM ----
  const lead = createRow(T, 'test', 'lead', { name: 'Ravi', org: 'Ravi Constructions', phone: '919800000001', source: 'Website', stage: 'New', expected_value: 50000 });
  assert(!!lead.id, 'lead created');
  const party = createRow(T, 'test', 'party', { name: lead.data.org, phone: lead.data.phone, is_customer: true });
  lead.data.converted = true; lead.data.customer = party.id; lead.data.stage = 'Won'; store.updateRow(lead);
  assert(lead.data.converted === true && !!lead.data.customer, 'lead converted -> customer party linked');

  // ---- Inventory ----
  const item = createRow(T, 'test', 'item', { name: 'Tile Box', item_code: 'TILE-1', uom: 'NOS', rate: 100, hsn: '6907', gst_rate: 18, reorder_level: 10 });
  const wh = createRow(T, 'test', 'warehouse', { name: 'Main DC', code: 'DC1', state: '29' });
  const ste = createRow(T, 'test', 'stock_entry', { stock_type: 'Material Receipt', posting_date: '2026-07-13', to_warehouse: wh.id, items: [{ item: item.id, qty: 50, rate: 80 }] });
  submitRow(T, 'test', 'stock_entry', ste.id);
  const bal = store.stockOf(T).filter((s) => s.item === item.id && s.warehouse === wh.id).reduce((a, s) => a + s.qty, 0);
  assert(bal === 50, `opening stock posted to ledger (balance=${bal}, expect 50)`);

  // ---- POS ----
  const pos = createRow(T, 'test', 'pos_invoice', { counter: 'C1', payment_mode: 'UPI', warehouse: wh.id, posting_date: '2026-07-13', items: [{ item: item.id, qty: 3, rate: 100, gst_rate: 18 }] });
  submitRow(T, 'test', 'pos_invoice', pos.id);
  const posGl = store.glOf(T).filter((e) => e.voucher === pos.id);
  const upiDr = posGl.find((e) => e.account === 'Bank/UPI (Assets)');
  const salesCr = posGl.find((e) => e.account === 'Sales (Revenue)');
  assert(!!upiDr && upiDr.debit === 354, `POS UPI debit = 354 (3×100×1.18), got ${upiDr?.debit}`);
  assert(!!salesCr && salesCr.credit === 300, `POS sales credit = 300, got ${salesCr?.credit}`);
  const posStock = store.stockOf(T).filter((s) => s.voucher === pos.id);
  assert(posStock.length === 1 && posStock[0].qty === -3, 'POS deducted 3 from stock');
  assert(pos.data.grand_total === 354, `POS grand_total=354, got ${pos.data.grand_total}`);

  // ---- GSP: e-invoice (IRN) ----
  const irn = await generateIrnForInvoice(T, pos.id);
  assert(!!irn.irn && irn.irn.length === 64, `IRN generated (len=${irn.irn?.length})`);
  assert(irn.status === 'GENERATED', 'IRN status GENERATED');
  const stored = store.getRow(T, pos.id);
  assert(stored?.data?.__einvoice?.irn === irn.irn, 'IRN stored on invoice row');

  // ---- GSP: e-way (needs > ₹50,000) ----
  const big = createRow(T, 'test', 'sales_invoice', { customer: party.id, posting_date: '2026-07-13', place_of_supply: '29', items: [{ item: item.id, qty: 600, rate: 100, gst_rate: 18 }] });
  submitRow(T, 'test', 'sales_invoice', big.id);
  assert(needsEway(big.data.__gst) === true, `e-way required for ₹${big.data.grand_total} (>=50k)`);
  const ewb = await generateEwbForInvoice(T, big.id, { name: 'Self' });
  assert(!!ewb.ewbNo, `e-way bill generated (no=${ewb.ewbNo})`);
  assert(store.getRow(T, big.id)?.data?.__eway?.ewbNo === ewb.ewbNo, 'e-way stored on invoice row');

  // ---- GSP: IMS (inward supply 2A/2B) ----
  const ims = await getImsSupplies(T, '26-07');
  assert(ims.supplies.length >= 2, `IMS pulled ${ims.supplies.length} inward supplies`);
  const target = ims.supplies[0].irn;
  await recordImsAction(T, target, 'ACC', 'matches books', 'test');
  const ims2 = await getImsSupplies(T, '26-07');
  const after = ims2.supplies.find((s) => s.irn === target);
  assert(after?.status === 'ACCEPTED', `IMS accept persisted (status=${after?.status})`);

  console.log(`\nPhase-1 self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
