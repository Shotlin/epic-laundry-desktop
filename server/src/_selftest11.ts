// Foreground self-test #11: Manufacturing — Phase 7.
// Runs the kernel directly (no server) on isolated tenant 'TMFG'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';

function balance(tenant: string, item: string, wh: string): number {
  return store.stockOf(tenant).filter((s) => s.item === item && s.warehouse === wh).reduce((a, s) => a + s.qty, 0);
}

const T = 'TMFG';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const raw = createRow(T, 'test', 'item', { name: 'Raw', item_code: 'RAW', uom: 'KG', rate: 50, gst_rate: 18 });
  const fg = createRow(T, 'test', 'item', { name: 'Chair', item_code: 'CHAIR', uom: 'NOS', rate: 500, gst_rate: 18 });
  const wh = createRow(T, 'test', 'warehouse', { name: 'Factory', code: 'FAC', state: '29' });

  // Stock raw material
  const recv = createRow(T, 'test', 'stock_entry', { stock_type: 'Material Receipt', posting_date: '2026-08-01', to_warehouse: wh.id, items: [{ item: raw.id, qty: 20, rate: 50 }] });
  submitRow(T, 'test', 'stock_entry', recv.id);
  assert(balance(T, raw.id, wh.id) === 20, `raw stock = 20 (got ${balance(T, raw.id, wh.id)})`);

  // BOM: 1 Chair = 2 KG Raw
  const bom = createRow(T, 'test', 'bom', { item: fg.id, quantity: 1, items: [{ item: raw.id, qty: 2 }] });
  assert(bom.data.name.startsWith('BOM-'), `BOM series (${bom.data.name})`);

  // Work Order: make 5 chairs
  const wo = createRow(T, 'test', 'work_order', { production_item: fg.id, bom: bom.id, qty: 5, warehouse: wh.id, planned_start_date: '2026-08-10' });
  submitRow(T, 'test', 'work_order', wo.id);
  assert(wo.data.name.startsWith('WO-'), `WO series (${wo.data.name})`);

  // Manufacture: produce 5 chairs -> consumes 10 KG raw, adds 5 chairs
  const mfg = createRow(T, 'test', 'stock_entry', { stock_type: 'Manufacture', posting_date: '2026-08-11', from_warehouse: wh.id, to_warehouse: wh.id, work_order: wo.id, items: [{ item: fg.id, qty: 5, rate: 500 }] });
  submitRow(T, 'test', 'stock_entry', mfg.id);
  assert(balance(T, fg.id, wh.id) === 5, `finished goods = 5 (got ${balance(T, fg.id, wh.id)})`);
  assert(balance(T, raw.id, wh.id) === 10, `raw consumed to 10 (got ${balance(T, raw.id, wh.id)})`);

  console.log(`\nPhase-7 (Manufacturing) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
