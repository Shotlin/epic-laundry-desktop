// Fixed Assets: depreciation computation + period run.
// Straight Line (SL) and Written Down Value (WDV), monthly, floored at salvage value.
import { store } from '../../kernel/store.js';
import { createRow, submitRow } from '../../kernel/entity-service.js';
import type { EntityRow } from '../../kernel/types.js';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeDepreciation(asset: EntityRow, period: string): number {
  const cost = Number(asset.data.purchase_value) || 0;
  const salvage = Number(asset.data.salvage_value) || 0;
  const life = Number(asset.data.useful_life) || 1;
  const acc = Number(asset.data.accumulated_depreciation) || 0;
  if (cost <= 0 || life <= 0) return 0;
  const method = String(asset.data.depreciation_method || 'Straight Line');
  let amount = 0;
  if (method === 'Written Down Value') {
    const rate = 1 - Math.pow(salvage / cost, 1 / life);
    const book = cost - acc;
    amount = (book * rate) / 12;
  } else {
    amount = (cost - salvage) / life / 12;
  }
  const bookAfter = cost - acc - amount;
  if (bookAfter <= salvage) amount = Math.max(0, cost - acc - salvage);
  return round2(amount);
}

export interface DepRunResult {
  period: string;
  entries: { asset: string; name: string; amount: number }[];
  total: number;
}

export function runDepreciation(tenant: string, actor: string, period: string): DepRunResult {
  const assets = store.rowsOf(tenant, 'asset').filter((a) => a.data.status === 'In Use');
  const entries: { asset: string; name: string; amount: number }[] = [];
  let total = 0;
  for (const a of assets) {
    const amount = computeDepreciation(a, period);
    if (amount <= 0) continue;
    const dep = createRow(tenant, actor, 'depreciation_entry', { asset: a.id, period, amount });
    submitRow(tenant, actor, 'depreciation_entry', dep.id);
    entries.push({ asset: a.id, name: a.data.name, amount });
    total += amount;
  }
  return { period, entries, total: round2(total) };
}
