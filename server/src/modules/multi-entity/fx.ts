// Multi-currency: resolve an FX rate (INR per 1 unit of currency) from the currency master.
import { store } from '../../kernel/store.js';

// rate = INR per 1 unit of `code`. INR is the base/ledger currency (rate 1).
export function getRate(tenant: string, code?: string): number {
  const c = (code || 'INR').toUpperCase();
  if (c === 'INR') return 1;
  const cur = store.rowsOf(tenant, 'currency').find((x) => String(x.data.code).toUpperCase() === c);
  return cur ? Number(cur.data.exchange_rate) || 1 : 1;
}

// Resolve the rate to use for a document: explicit exchange_rate wins, else the currency master.
export function docRate(tenant: string, data: Record<string, any>): number {
  if (data.exchange_rate != null && Number(data.exchange_rate) > 0) return Number(data.exchange_rate);
  return getRate(tenant, data.currency);
}

export function convert(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
