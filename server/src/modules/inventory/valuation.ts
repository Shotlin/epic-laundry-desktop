// Inventory depth (Phase-16): stock valuation (moving-average + FIFO), serial/batch tracking
// helpers, reconciliation and landed-cost support. All derived deterministically from the
// append-only stock ledger so the posting engine stays the single source of truth.
import { store } from '../../kernel/store.js';
import type { StockLedgerEntry } from '../../kernel/types.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type ValuationMethod = 'moving-average' | 'fifo';

export interface StockVal {
  item: string;
  itemName?: string;
  warehouse: string;
  qty: number;
  rate: number;   // per-unit valuation
  value: number;  // qty * rate
}

export interface StockBalance {
  item: string;
  itemName?: string;
  warehouse: string;
  qty: number;
}

// Current on-hand quantity per (item, warehouse).
export function getStockBalance(tenant: string): StockBalance[] {
  const map = new Map<string, number>();
  for (const s of store.stockOf(tenant)) {
    const key = s.item + '|' + s.warehouse;
    map.set(key, (map.get(key) || 0) + s.qty);
  }
  const out: StockBalance[] = [];
  for (const [key, qty] of map) {
    if (Math.abs(qty) < 1e-9) continue;
    const [item, warehouse] = key.split('|');
    out.push({ item, itemName: store.getRow(tenant, item)?.data?.name, warehouse, qty: r2(qty) });
  }
  return out;
}

// Valuation of on-hand stock under the requested method.
export function stockValuation(tenant: string, method: ValuationMethod = 'moving-average'): { lines: StockVal[]; total: number } {
  const byKey = new Map<string, StockLedgerEntry[]>();
  for (const s of store.stockOf(tenant)) {
    const key = s.item + '|' + s.warehouse;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(s);
  }

  const lines: StockVal[] = [];
  let total = 0;

  for (const [key, entries] of byKey) {
    const [item, warehouse] = key.split('|');
    let qty = 0;
    let value = 0;

    if (method === 'moving-average') {
      let extraAdj = 0;
      for (const s of entries) {
        if (s.qty > 0) {
          value += s.qty * (s.valuation_rate ?? 0) + (s.valuation_adjustment ?? 0);
          qty += s.qty;
        } else if (s.qty < 0) {
          const avg = qty > 0 ? value / qty : 0;
          value -= -s.qty * avg;
          qty += s.qty;
        } else {
          extraAdj += s.valuation_adjustment ?? 0; // zero-qty revaluation (e.g. landed cost)
        }
      }
      value = r2(value + extraAdj);
      qty = r2(qty);
    } else {
      // FIFO: keep receipt layers (qty, rate), consume oldest first on issue.
      const layers: { qty: number; rate: number; adj: number }[] = [];
      let extraAdj = 0;
      for (const s of entries) {
        if (s.qty > 0) {
          layers.push({ qty: s.qty, rate: s.valuation_rate ?? 0, adj: s.valuation_adjustment ?? 0 });
          qty += s.qty;
        } else if (s.qty < 0) {
          let need = -s.qty;
          while (need > 0 && layers.length) {
            const l = layers[0];
            const take = Math.min(l.qty, need);
            l.qty -= take;
            need -= take;
            if (l.qty <= 1e-9) layers.shift();
          }
          qty += s.qty;
        } else {
          extraAdj += s.valuation_adjustment ?? 0; // zero-qty revaluation (e.g. landed cost)
        }
      }
      value = r2(layers.reduce((a, l) => a + l.qty * l.rate + l.adj, 0) + extraAdj);
      qty = r2(qty);
    }

    if (Math.abs(qty) < 1e-6) continue;
    const rate = qty > 0 ? r2(value / qty) : 0;
    lines.push({
      item,
      itemName: store.getRow(tenant, item)?.data?.name,
      warehouse,
      qty,
      rate,
      value: r2(value),
    });
    total += value;
  }

  lines.sort((a, b) => (b.value) - (a.value));
  return { lines, total: r2(total) };
}

export interface SerialRec {
  id: string;
  name: string;
  serial_no: string;
  item: string;
  itemName?: string;
  warehouse: string;
  status: string;
  stock_entry: string;
}

// Live serial numbers (status != Issued / Scrapped).
export function serialStock(tenant: string): SerialRec[] {
  return store.rowsOf(tenant, 'item_serial')
    .filter((r) => r.data.status !== 'Issued' && r.data.status !== 'Scrapped')
    .map((r) => ({
      id: r.id, name: r.data.name, serial_no: r.data.serial_no, item: r.data.item,
      itemName: store.getRow(tenant, r.data.item)?.data?.name,
      warehouse: r.data.warehouse, status: r.data.status, stock_entry: r.data.stock_entry,
    }));
}

// Batch summary: remaining qty per (item, warehouse, batch).
export function batchStock(tenant: string): { item: string; itemName?: string; warehouse: string; batch_no: string; qty: number }[] {
  const map = new Map<string, number>();
  for (const s of store.stockOf(tenant)) {
    if (!s.batch_no) continue;
    const key = s.item + '|' + s.warehouse + '|' + s.batch_no;
    map.set(key, (map.get(key) || 0) + s.qty);
  }
  const out: any[] = [];
  for (const [key, qty] of map) {
    if (Math.abs(qty) < 1e-9) continue;
    const [item, warehouse, batch_no] = key.split('|');
    out.push({ item, itemName: store.getRow(tenant, item)?.data?.name, warehouse, batch_no, qty: r2(qty) });
  }
  return out;
}
