// Epic BOS self-test 21 — Phase-17 Manufacturing depth: multi-level BOM explosion,
// workstations/operations, subcontracting fields, BOM costing and MRP planning.
import { createRow, submitRow } from './kernel/entity-service.js';
import { explodeBom, bomCost, planMaterials, defaultBom, createPlannedWorkOrders, createPlannedPurchaseOrder } from './modules/manufacturing/mrp.js';

const T = 'TMFG';
const MOD = 'manufacturing';
let fails = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  // ---- masters ----
  const wh = createRow(T, MOD, 'warehouse', { name: 'Factory', code: 'FC' });
  const subWh = createRow(T, MOD, 'warehouse', { name: 'Subcontractor WH', code: 'SUB' });
  const steel = createRow(T, MOD, 'item', { name: 'Steel', item_code: 'ST', uom: 'KG', rate: 50 });
  const paint = createRow(T, MOD, 'item', { name: 'Paint', item_code: 'PT', uom: 'NOS', rate: 30 });
  const frame = createRow(T, MOD, 'item', { name: 'Frame', item_code: 'FR', uom: 'NOS' });
  const bike = createRow(T, MOD, 'item', { name: 'Bike', item_code: 'BK', uom: 'NOS' });
  const supplier = createRow(T, MOD, 'party', { name: 'Steel Mart', party_type: 'Supplier' });
  const subcon = createRow(T, MOD, 'party', { name: 'CutTech', party_type: 'Supplier' });
  const ws = createRow(T, MOD, 'workstation', { name: 'Assembly Line', code: 'AL', hourly_rate: 600 });

  // ---- BOM for sub-assembly Frame (2 KG steel) ----
  const frameBom = createRow(T, MOD, 'bom', {
    item: frame.id, quantity: 1, is_default: true,
    items: [{ item: steel.id, qty: 2 }],
  });
  // ---- BOM for finished Bike (1 Frame + 1 Paint, 30 min assembly) ----
  const bikeBom = createRow(T, MOD, 'bom', {
    item: bike.id, quantity: 1, is_default: true,
    items: [{ item: frame.id, qty: 1 }, { item: paint.id, qty: 1 }],
    operations: [{ operation: 'Assemble', workstation: ws.id, time_in_minutes: 30 }],
  });

  // ---- explodeBom (multi-level) ----
  const ex = explodeBom(T, bike.id, 10);
  const steelLeaf = ex.leaves.find((l) => l.item === steel.id);
  const paintLeaf = ex.leaves.find((l) => l.item === paint.id);
  assert(ex.leaves.length === 2, 'explode yields exactly 2 leaf (raw) items');
  assert(!!steelLeaf && r2(steelLeaf.qty) === 20, 'explode: 10 bikes -> 20 KG steel (via Frame)');
  assert(!!paintLeaf && r2(paintLeaf.qty) === 10, 'explode: 10 bikes -> 10 paint');
  assert(ex.manufactured.some((m) => m.item === frame.id) && ex.manufactured.some((m) => m.item === bike.id), 'explode marks Frame + Bike as manufactured (sub-assembly)');

  // ---- bomCost (material + routing) ----
  const cost = bomCost(T, bike.id, 10);
  // Frame material = 20*50=1000 ; Bike material = 1000 + 10*30=1300 ; operating = (30/60)*600*10 = 3000
  assert(r2(cost.material) === 1300, 'bomCost material = 1300 (steel 1000 + paint 300)');
  assert(r2(cost.operating) === 3000, 'bomCost operating = 3000 (30 min @600/hr * 10)');
  assert(r2(cost.total) === 4300, 'bomCost total = 4300');
  assert(r2(cost.perUnit) === 430, 'bomCost per unit = 430');
  assert(cost.bom === bikeBom.id, 'bomCost references the bike BOM');

  // ---- MRP from an open Sales Order ----
  const so = createRow(T, MOD, 'sales_order', {
    customer: supplier.id, items: [{ item: bike.id, qty: 5, rate: 900, gst_rate: 18 }],
  });
  submitRow(T, MOD, 'sales_order', so.id);
  const plan = planMaterials(T);
  assert(plan.demand.length === 1 && plan.demand[0].qty === 5, 'MRP demand = 5 bikes from SO');
  const netSteel = plan.netLeaves.find((l) => l.item === steel.id);
  const netPaint = plan.netLeaves.find((l) => l.item === paint.id);
  assert(!!netSteel && r2(netSteel.qty) === 10, 'MRP net steel = 10 (no stock/on-order)');
  assert(!!netPaint && r2(netPaint.qty) === 5, 'MRP net paint = 5');
  assert(plan.plannedWorkOrders.length === 2, 'MRP plans 2 Work Orders (Bike + Frame)');
  assert(plan.plannedWorkOrders.find((w) => w.item === bike.id)?.qty === 5, 'MRP WO for Bike = 5');
  assert(plan.plannedWorkOrders.find((w) => w.item === frame.id)?.qty === 5, 'MRP WO for Frame (sub-assembly) = 5');
  assert(plan.plannedPurchaseOrders.length >= 1 && plan.plannedPurchaseOrders[0].items.length === 2, 'MRP groups raw buys into a planned PO');

  // ---- create planned WOs ----
  const wos = createPlannedWorkOrders(T, MOD, plan.plannedWorkOrders);
  assert(wos.length === 2 && wos.every((w) => w.status === 'Draft'), 'planned Work Orders created as Draft');

  // ---- subcontracting: subcontracted BOM + WO + subcontracted PO with supplied items ----
  const subBom = createRow(T, MOD, 'bom', {
    item: frame.id, quantity: 1, is_default: false, is_subcontracted: true, subcontractor: subcon.id,
    items: [{ item: steel.id, qty: 2 }],
  });
  const subWo = createRow(T, MOD, 'work_order', {
    production_item: frame.id, bom: subBom.id, qty: 3, warehouse: wh.id, subcontracting: true, subcontractor: subcon.id,
  });
  assert(subWo.data.subcontracting === true && subWo.data.subcontractor === subcon.id, 'Work Order carries subcontracting flag + subcontractor');
  const subPo = createPlannedPurchaseOrder(T, MOD, subcon.id, [{ item: frame.id, qty: 3, rate: 200 }], {
    isSubcontracted: true, suppliedItems: [{ item: steel.id, qty: 6, warehouse: wh.id }],
  });
  assert(subPo.data.is_subcontracted === true, 'subcontracted PO flagged');
  assert((subPo.data.supplied_items || []).length === 1, 'subcontracted PO carries supplied (raw) items');

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
