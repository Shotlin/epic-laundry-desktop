import { randomUUID } from 'node:crypto';
import { audit } from '../../kernel/audit.js';
import { store } from '../../kernel/store.js';

export type OrderNoSeries = { id: string; name: string; prefix: string; createdAt: string };

export function listOrderNoSeries(tenant: string, storeId = store.currentStore(tenant)): OrderNoSeries[] {
  return store.getStoreSettings(tenant, storeId).orderNoSeries;
}

export function createOrderNoSeries(tenant: string, actor: string, input: { name?: unknown; prefix?: unknown }, storeId = store.currentStore(tenant)): OrderNoSeries {
  const name = String(input.name ?? '').trim();
  const prefix = String(input.prefix ?? '').trim();
  if (!name) throw new Error('Series name is required');
  if (!prefix) throw new Error('Prefix is required');
  if (name.length > 100) throw new Error('Series name must be 100 characters or fewer');
  if (prefix.length > 20) throw new Error('Prefix must be 20 characters or fewer');

  const before = store.getStoreSettings(tenant, storeId);
  if (before.orderNoSeries.some((series) => series.prefix.toLocaleLowerCase('en') === prefix.toLocaleLowerCase('en'))) {
    throw new Error('This prefix is already used by another order number series');
  }
  const series: OrderNoSeries = { id: `ons_${randomUUID()}`, name, prefix, createdAt: new Date().toISOString() };
  const after = store.saveStoreSettings(tenant, actor, { orderNoSeries: [...before.orderNoSeries, series] }, storeId);
  audit(tenant, actor, 'settings:order-no-series-created', { entity: 'store_settings', row_id: storeId, before: { orderNoSeries: before.orderNoSeries }, after: { orderNoSeries: after.orderNoSeries } });
  return series;
}
