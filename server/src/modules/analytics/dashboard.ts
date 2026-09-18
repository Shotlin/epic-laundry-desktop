// P-Analytics: the business-owner dashboard brain. Turns raw documents into the few numbers
// and trends an Indian SME owner actually acts on — today's sales, this month vs last, money
// in/out, what's selling, what needs attention. All derived live from the kernel (no stored
// aggregates), fully offline. Values in ₹. Fiscal year = Apr–Mar (India).
import { store } from '../../kernel/store.js';
import { getInsights } from '../ai/insights.js';
import { getAlerts } from '../ops.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

// A submitted "sale" is a sales_invoice or a pos_invoice. Returns a normalized shape.
function allSales(tenant: string) {
  const si = store.rowsOf(tenant, 'sales_invoice').filter((r) => r.status === 'Submitted')
    .map((r) => ({ id: r.id, kind: 'invoice' as const, total: Number(r.data.grand_total) || 0, date: String(r.data.posting_date || r.created_at.slice(0, 10)), created_at: r.created_at, payment_mode: 'Credit', items: (r.data.items || []) as any[], customer: r.data.customer }));
  const pos = store.rowsOf(tenant, 'pos_invoice').filter((r) => r.status === 'Submitted')
    .map((r) => ({ id: r.id, kind: 'pos' as const, total: Number(r.data.grand_total) || 0, date: String(r.data.posting_date || r.created_at.slice(0, 10)), created_at: r.created_at, payment_mode: r.data.payment_mode || 'Cash', items: (r.data.items || []) as any[], customer: r.data.customer }));
  return [...si, ...pos];
}

// Revenue time-series for the last N days (fills gaps with 0 so the chart has no holes).
export function revenueSeries(tenant: string, days = 14, asOf?: string) {
  const end = asOf ? new Date(asOf) : new Date();
  const sales = allSales(tenant);
  const byDay: Record<string, { revenue: number; orders: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i);
    byDay[dayStr(d)] = { revenue: 0, orders: 0 };
  }
  for (const s of sales) {
    if (byDay[s.date]) { byDay[s.date].revenue = r2(byDay[s.date].revenue + s.total); byDay[s.date].orders++; }
  }
  return Object.entries(byDay).map(([date, v]) => ({ date, label: date.slice(5), ...v }));
}

// Orders by hour of day (0–23) — when is the shop busy? Uses created_at (wall-clock capture).
export function ordersByHour(tenant: string) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, orders: 0, revenue: 0 }));
  for (const s of allSales(tenant)) {
    const h = new Date(s.created_at).getHours();
    buckets[h].orders++; buckets[h].revenue = r2(buckets[h].revenue + s.total);
  }
  return buckets;
}

// Payment-mode split (Cash / UPI / Card / Credit) across all sales — the money-mix donut.
export function paymentMix(tenant: string) {
  const mix: Record<string, { count: number; value: number }> = {};
  for (const s of allSales(tenant)) {
    const m = s.payment_mode || 'Cash';
    (mix[m] ||= { count: 0, value: 0 });
    mix[m].count++; mix[m].value = r2(mix[m].value + s.total);
  }
  return Object.entries(mix).map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.value - a.value);
}

// Top-selling items by revenue, across both invoice + POS lines.
export function topItems(tenant: string, limit = 6) {
  const byItem: Record<string, { qty: number; revenue: number }> = {};
  for (const s of allSales(tenant)) {
    for (const it of s.items) {
      const id = it.item; if (!id) continue;
      const qty = Number(it.qty) || 0; const rev = qty * (Number(it.rate) || 0);
      (byItem[id] ||= { qty: 0, revenue: 0 });
      byItem[id].qty += qty; byItem[id].revenue = r2(byItem[id].revenue + rev);
    }
  }
  return Object.entries(byItem)
    .map(([id, v]) => ({ item: id, name: store.getRow(tenant, id)?.data?.name || id, ...v }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

// Month-to-date vs previous full month (the headline "how are we doing" comparison).
function monthWindow(asOf?: string) {
  const now = asOf ? new Date(asOf) : new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return { thisStart: dayStr(thisStart), today: dayStr(now), prevStart: dayStr(prevStart), prevEnd: dayStr(prevEnd) };
}

export function salesKpis(tenant: string, asOf?: string) {
  const w = monthWindow(asOf);
  const sales = allSales(tenant);
  const sumBetween = (from: string, to: string) => r2(sales.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + s.total, 0));
  const today = r2(sales.filter((s) => s.date === w.today).reduce((a, s) => a + s.total, 0));
  const mtd = sumBetween(w.thisStart, w.today);
  const prevMonth = sumBetween(w.prevStart, w.prevEnd);
  const ordersToday = sales.filter((s) => s.date === w.today).length;
  const mtdOrders = sales.filter((s) => s.date >= w.thisStart && s.date <= w.today).length;
  const avgOrder = mtdOrders ? r2(mtd / mtdOrders) : 0;
  // MoM growth vs the same slice of the previous month (fair comparison).
  const dom = Number(w.today.slice(8, 10));
  const prevSlice = sumBetween(w.prevStart, dayStr(new Date(new Date(w.prevStart).getFullYear(), new Date(w.prevStart).getMonth(), dom)));
  const momPct = prevSlice > 0 ? r2(((mtd - prevSlice) / prevSlice) * 100) : (mtd > 0 ? 100 : 0);
  return { today, ordersToday, mtd, mtdOrders, avgOrder, prevMonth, prevSlice, momPct };
}

// The single call the dashboard makes — everything it needs in one shot.
export function dashboardSummary(tenant: string, asOf?: string) {
  const insights = getInsights(tenant);
  const alerts = getAlerts(tenant, asOf) as any;
  const kpis = salesKpis(tenant, asOf);
  return {
    kpis,
    finance: {
      receivables: insights.outstanding_receivables,
      payables: insights.outstanding_payables,
      cash_position: insights.cash_position,
      gst_payable: insights.gst_payable,
      net_profit: insights.net_profit,
    },
    revenueSeries: revenueSeries(tenant, 14, asOf),
    ordersByHour: ordersByHour(tenant),
    paymentMix: paymentMix(tenant),
    topItems: topItems(tenant, 6),
    alertCounts: alerts.counts,
    anomalies: insights.anomalies,
  };
}
