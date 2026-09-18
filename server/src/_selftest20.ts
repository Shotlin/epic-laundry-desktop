// Epic BOS self-test 20 — Phase-16 Inventory depth: serial/batch tracking, reconciliation,
// landed cost, FIFO / moving-average valuation, and inventory on the Balance Sheet.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getBalanceSheet } from './modules/accounting/reports.js';
import { stockValuation, serialStock, batchStock, getStockBalance } from './modules/inventory/valuation.js';

const T = 'TINV';
let fails = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  const wh1 = createRow(T, 'test', 'warehouse', { name: 'Store A', code: 'SA' });
  const wh2 = createRow(T, 'test', 'warehouse', { name: 'Store B', code: 'SB' });
  const A = createRow(T, 'test', 'item', { name: 'Widget', item_code: 'W1', uom: 'NOS', rate: 100 });
  const B = createRow(T, 'test', 'item', { name: 'Box', item_code: 'B1', uom: 'NOS', rate: 20 });
  const C = createRow(T, 'test', 'item', { name: 'Gadget', item_code: 'G1', uom: 'NOS', rate: 100 });

  // ---- Serial tracking ----
  const recv = createRow(T, 'test', 'stock_entry', {
    stock_type: 'Material Receipt', posting_date: '2026-04-01', to_warehouse: wh1.id,
    items: [{ item: A.id, qty: 3, rate: 100, serial_nos: 'SN1 SN2 SN3' }],
  });
  submitRow(T, 'test', 'stock_entry', recv.id);
  let live = serialStock(T);
  assert(live.length === 3, '3 serials created In Stock');
  assert(live.every((s) => s.status === 'In Stock' && s.warehouse === wh1.id), 'serials In Stock at warehouse A');

  const issue = createRow(T, 'test', 'stock_entry', {
    stock_type: 'Stock Issue', posting_date: '2026-04-02', from_warehouse: wh1.id,
    items: [{ item: A.id, qty: 2, rate: 100, serial_nos: 'SN1 SN2' }],
  });
  submitRow(T, 'test', 'stock_entry', issue.id);
  live = serialStock(T);
  assert(live.length === 1 && live[0].serial_no === 'SN3', 'issuing SN1/SN2 leaves only SN3 live');
  assert(store.rowsOf(T, 'item_serial').filter((r) => r.data.status === 'Issued').length === 2, '2 serials marked Issued');

  // ---- Batch tracking ----
  const brecv = createRow(T, 'test', 'stock_entry', {
    stock_type: 'Material Receipt', posting_date: '2026-04-03', to_warehouse: wh1.id,
    items: [{ item: B.id, qty: 50, rate: 20, batch_no: 'BATCH-1' }],
  });
  submitRow(T, 'test', 'stock_entry', brecv.id);
  const batches = batchStock(T);
  assert(batches.length === 1 && batches[0].batch_no === 'BATCH-1' && batches[0].qty === 50, 'batch BATCH-1 shows 50 on hand');

  // ---- Landed cost: capitalize +50 freight into item C's valuation ----
  const crecv = createRow(T, 'test', 'stock_entry', {
    stock_type: 'Material Receipt', posting_date: '2026-04-04', to_warehouse: wh1.id,
    items: [{ item: C.id, qty: 10, rate: 100 }],
  });
  submitRow(T, 'test', 'stock_entry', crecv.id);
  const before = stockValuation(T, 'moving-average').lines.find((l) => l.item === C.id)?.value ?? 0;
  assert(r2(before) === 1000, 'C value before landed cost = 1000 (10 @ 100)');

  const lcv = createRow(T, 'test', 'landed_cost_voucher', {
    posting_date: '2026-04-05', receipt: crecv.id,
    items: [{ item: C.id, amount: 50, description: 'Freight' }],
  });
  submitRow(T, 'test', 'landed_cost_voucher', lcv.id);
  const after = stockValuation(T, 'moving-average').lines.find((l) => l.item === C.id)?.value ?? 0;
  assert(r2(after) === 1050, 'C value after landed cost = 1050 (freight capitalized)');

  // ---- Stock reconciliation: set C@A to a physical count of 7 ----
  const recon = createRow(T, 'test', 'stock_reconciliation', {
    posting_date: '2026-04-06',
    items: [{ item: C.id, warehouse: wh1.id, qty: 7, rate: 100 }],
  });
  submitRow(T, 'test', 'stock_reconciliation', recon.id);
  const cBal = getStockBalance(T).find((b) => b.item === C.id && b.warehouse === wh1.id)?.qty ?? 0;
  assert(cBal === 7, 'reconciliation set C@Store A to 7 (was 10)');

  // ---- Valuation methods agree and surface on the Balance Sheet ----
  const ma = stockValuation(T, 'moving-average');
  const fifo = stockValuation(T, 'fifo');
  assert(ma.total > 0 && fifo.total > 0, 'valuation totals are positive (MA & FIFO)');
  const bs = getBalanceSheet(T);
  assert(bs.inventory && bs.inventory.movingAverage.total === ma.total, 'Balance Sheet carries inventory memo (moving-average)');
  assert(bs.inventory.fifo.total === fifo.total, 'Balance Sheet carries inventory memo (FIFO)');
  assert(bs.balanced, 'Balance Sheet GL section stays balanced (inventory is a memo)');

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
