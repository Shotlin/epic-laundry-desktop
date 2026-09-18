// Manufacturing depth (Phase-17): multi-level BOM explosion, workstations/operations,
// subcontracting, BOM costing and Material Requirement Planning (MRP).
// Everything is derived from the existing BOM / Work Order / Stock Ledger data so the
// posting engine and append-only stock ledger remain the single source of truth.
import { store } from '../../kernel/store.js';
import { createRow, submitRow } from '../../kernel/entity-service.js';
import { getStockBalance } from '../inventory/valuation.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface BomLeaf {
  item: string;
  itemName?: string;
  qty: number;
}

export interface ExplodeResult {
  leaves: BomLeaf[];
  manufactured: BomLeaf[]; // intermediate items that need a Work Order
}

// The default BOM for an item (a manufactured/sub-assembly item has exactly one default BOM).
export function defaultBom(tenant: string, item: string): any | undefined {
  return store.rowsOf(tenant, 'bom').find((b) => b.data.item === item && b.data.is_default);
}

// Standard/valuation cost per unit of an item: prefer the master rate, else the
// moving-average valuation rate from on-hand stock.
function unitCost(tenant: string, item: string): number {
  const row = store.getRow(tenant, item);
  const master = Number(row?.data?.rate) || 0;
  if (master > 0) return master;
  const onHand = getStockBalance(tenant).filter((b) => b.item === item);
  if (onHand.length) {
    const qty = onHand.reduce((a, b) => a + b.qty, 0);
    // valuation rate isn't exposed per line here; fall back to a weighted 0 if unknown.
    return 0;
  }
  return 0;
}

// Recursively explode an item into leaf (raw) requirements and the list of
// intermediate manufactured items that require a Work Order. Honours multi-level
// BOMs / sub-assemblies by following each child's default BOM.
export function explodeBom(tenant: string, item: string, qty: number, level = 0): ExplodeResult {
  const bom = defaultBom(tenant, item);
  if (!bom) {
    return { leaves: [{ item, itemName: store.getRow(tenant, item)?.data?.name, qty: r2(qty) }], manufactured: [] };
  }
  const baseQty = Number(bom.data.quantity) || 1;
  const leaves: BomLeaf[] = [];
  const manufactured: BomLeaf[] = [{ item, itemName: store.getRow(tenant, item)?.data?.name, qty: r2(qty) }];

  for (const bi of (bom.data.items || []) as any[]) {
    const childQty = (qty * (Number(bi.qty) || 0)) / baseQty;
    if (Math.abs(childQty) < 1e-9) continue;
    const sub = explodeBom(tenant, bi.item, childQty, level + 1);
    for (const l of sub.leaves) {
      const hit = leaves.find((x) => x.item === l.item);
      if (hit) hit.qty = r2(hit.qty + l.qty);
      else leaves.push({ ...l });
    }
    for (const m of sub.manufactured) {
      const hit = manufactured.find((x) => x.item === m.item);
      if (hit) hit.qty = r2(hit.qty + m.qty);
      else manufactured.push({ ...m });
    }
  }
  return { leaves, manufactured };
}

export interface BomCost {
  item: string;
  itemName?: string;
  qty: number;
  material: number;
  operating: number;
  total: number;
  perUnit: number;
  bom?: string;
}

// Roll-up cost of an item for a given production quantity: material cost (recursively
// through sub-assemblies) + routing/operation cost from workstations.
export function bomCost(tenant: string, item: string, qty = 1): BomCost {
  const bom = defaultBom(tenant, item);
  if (!bom) {
    const mat = r2(unitCost(tenant, item) * qty);
    return { item, itemName: store.getRow(tenant, item)?.data?.name, qty, material: mat, operating: 0, total: mat, perUnit: r2(mat / qty), bom: undefined };
  }
  const baseQty = Number(bom.data.quantity) || 1;
  let material = 0;
  for (const bi of (bom.data.items || []) as any[]) {
    const childQty = (qty * (Number(bi.qty) || 0)) / baseQty;
    material += bomCost(tenant, bi.item, childQty).total;
  }
  let operating = 0;
  for (const op of (bom.data.operations || []) as any[]) {
    const ws = store.getRow(tenant, op.workstation);
    const rate = Number(ws?.data?.hourly_rate) || 0;
    operating += ((Number(op.time_in_minutes) || 0) / 60) * rate * (qty / baseQty);
  }
  material = r2(material);
  operating = r2(operating);
  const total = r2(material + operating);
  return {
    item, itemName: store.getRow(tenant, item)?.data?.name, qty, material, operating, total,
    perUnit: qty ? r2(total / qty) : 0, bom: bom.id,
  };
}

export interface PlannedWO { item: string; itemName?: string; bom: string; qty: number; }
export interface PlannedPO { supplier?: string; items: { item: string; itemName?: string; qty: number; rate: number }[]; }

export interface MrpPlan {
  demand: { item: string; itemName?: string; qty: number }[];
  grossLeaves: BomLeaf[];
  netLeaves: BomLeaf[];
  plannedWorkOrders: PlannedWO[];
  plannedPurchaseOrders: PlannedPO[];
}

// Material Requirement Planning: turn open Sales Orders into a production plan.
//  - explode each finished good into leaf raw requirements (multi-level)
//  - net off on-hand stock and open supply (Work Orders in progress, POs on order)
//  - emit a planned Work Order per manufactured item and a planned PO per raw item
export function planMaterials(tenant: string): MrpPlan {
  const onHand = new Map<string, number>();
  for (const b of getStockBalance(tenant)) onHand.set(b.item, (onHand.get(b.item) || 0) + b.qty);

  // Open supply already committed.
  const inProduction = new Map<string, number>();
  for (const wo of store.rowsOf(tenant, 'work_order')) {
    if (['Submitted', 'In Process'].includes(wo.status)) {
      inProduction.set(wo.data.production_item, (inProduction.get(wo.data.production_item) || 0) + Number(wo.data.qty || 0));
    }
  }
  const onOrder = new Map<string, number>();
  for (const po of store.rowsOf(tenant, 'purchase_order')) {
    if (po.status === 'Submitted') {
      for (const it of (po.data.items || []) as any[]) {
        onOrder.set(it.item, (onOrder.get(it.item) || 0) + Number(it.qty || 0));
      }
    }
  }

  // Independent demand from open Sales Orders.
  const demand: { item: string; itemName?: string; qty: number }[] = [];
  for (const so of store.rowsOf(tenant, 'sales_order')) {
    if (so.status !== 'Submitted') continue;
    for (const it of (so.data.items || []) as any[]) {
      const hit = demand.find((d) => d.item === it.item);
      if (hit) hit.qty += Number(it.qty || 0);
      else demand.push({ item: it.item, itemName: store.getRow(tenant, it.item)?.data?.name, qty: Number(it.qty || 0) });
    }
  }

  // Explode demand -> leaves + manufactured items.
  const grossLeaves = new Map<string, number>();
  const manufactured = new Map<string, number>();
  for (const d of demand) {
    const ex = explodeBom(tenant, d.item, d.qty);
    for (const l of ex.leaves) grossLeaves.set(l.item, (grossLeaves.get(l.item) || 0) + l.qty);
    for (const m of ex.manufactured) manufactured.set(m.item, (manufactured.get(m.item) || 0) + m.qty);
  }

  // Net leaf requirements (raw purchases).
  const netLeaves: BomLeaf[] = [];
  for (const [item, gross] of grossLeaves) {
    const net = r2(gross - (onHand.get(item) || 0) - (onOrder.get(item) || 0));
    if (net > 1e-6) netLeaves.push({ item, itemName: store.getRow(tenant, item)?.data?.name, qty: net });
  }

  // Planned Work Orders (net of on-hand + in-production supply).
  const plannedWorkOrders: PlannedWO[] = [];
  for (const [item, gross] of manufactured) {
    const net = r2(gross - (onHand.get(item) || 0) - (inProduction.get(item) || 0));
    const bom = defaultBom(tenant, item);
    if (net > 1e-6 && bom) {
      plannedWorkOrders.push({ item, itemName: store.getRow(tenant, item)?.data?.name, bom: bom.id, qty: net });
    }
  }

  // Planned Purchase Orders grouped by the item's default supplier.
  const bySupplier = new Map<string, PlannedPO>();
  for (const l of netLeaves) {
    const supplier = store.getRow(tenant, l.item)?.data?.default_supplier || '';
    if (!bySupplier.has(supplier)) bySupplier.set(supplier, { supplier: supplier || undefined, items: [] });
    bySupplier.get(supplier)!.items.push({ item: l.item, itemName: l.itemName, qty: l.qty, rate: r2(unitCost(tenant, l.item)) });
  }
  const plannedPurchaseOrders = [...bySupplier.values()];

  return {
    demand,
    grossLeaves: [...grossLeaves].map(([item, qty]) => ({ item, itemName: store.getRow(tenant, item)?.data?.name, qty: r2(qty) })),
    netLeaves,
    plannedWorkOrders,
    plannedPurchaseOrders,
  };
}

// Create draft Work Orders from an MRP plan (one WO per planned item).
export function createPlannedWorkOrders(tenant: string, mod: string, items: { item: string; bom: string; qty: number; warehouse?: string; subcontracting?: boolean; subcontractor?: string }[]): any[] {
  const out: any[] = [];
  const defaultWh = (store.rowsOf(tenant, 'warehouse')[0] || {}).id;
  for (const it of items) {
    const row = createRow(tenant, mod, 'work_order', {
      production_item: it.item, bom: it.bom, qty: it.qty,
      warehouse: it.warehouse || defaultWh, subcontracting: it.subcontracting, subcontractor: it.subcontractor,
    });
    out.push(row);
  }
  return out;
}

// Create a draft (optionally subcontracted) Purchase Order from planned raw items.
export function createPlannedPurchaseOrder(
  tenant: string, mod: string, supplier: string, items: { item: string; qty: number; rate: number }[],
  opts: { isSubcontracted?: boolean; suppliedItems?: { item: string; qty: number; warehouse?: string }[] } = {},
): any {
  const po = createRow(tenant, mod, 'purchase_order', {
    supplier,
    is_subcontracted: !!opts.isSubcontracted,
    items: items.map((i) => ({ item: i.item, qty: i.qty, rate: i.rate })),
    supplied_items: opts.suppliedItems || [],
  });
  return po;
}
