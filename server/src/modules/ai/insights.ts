// Epic AI & Analytics — turns all the ledger/transaction data into decisions.
// Deterministic insights (no external dependency) + a pluggable assistant that uses an LLM
// when EPIC_AI_KEY is set, and falls back to heuristic answers otherwise.
import { store } from '../../kernel/store.js';
import { getTrialBalance, getPnL, getBalanceSheet } from '../accounting/reports.js';

const ASSET_CASH_ACCOUNTS = ['Cash (Assets)', 'Bank (Assets)', 'Bank/UPI (Assets)', 'Bank/Card (Assets)'];

function accountBalance(tenant: string, name: string): number {
  return store.glOf(tenant)
    .filter((e) => e.account === name)
    .reduce((acc, e) => acc + (e.debit || 0) - (e.credit || 0), 0);
}

function cashPosition(tenant: string): number {
  return ASSET_CASH_ACCOUNTS.reduce((acc, a) => acc + accountBalance(tenant, a), 0);
}

function gstPayable(tenant: string): number {
  const liab = ['CGST (Liability)', 'SGST (Liability)', 'IGST (Liability)']
    .reduce((acc, a) => acc + accountBalance(tenant, a), 0);
  const asset = ['CGST (Asset)', 'SGST (Asset)', 'IGST (Asset)']
    .reduce((acc, a) => acc + accountBalance(tenant, a), 0);
  return Math.round((liab - asset) * 100) / 100; // +ve = payable to gov, -ve = credit
}

export function getInsights(tenant: string) {
  const sales = store.rowsOf(tenant, 'sales_invoice').filter((r) => r.status === 'Submitted');
  const purchases = store.rowsOf(tenant, 'purchase_invoice').filter((r) => r.status === 'Submitted');
  const totalSales = Math.round(sales.reduce((a, r) => a + (Number(r.data.grand_total) || 0), 0) * 100) / 100;
  const totalPurchase = Math.round(purchases.reduce((a, r) => a + (Number(r.data.grand_total) || 0), 0) * 100) / 100;

  const paidFor = (invId: string) =>
    store.rowsOf(tenant, 'payment_entry').filter((p) => p.status === 'Submitted')
      .reduce((acc, p) => acc + ((p.data.against_sales === invId || p.data.against_purchase === invId) ? (Number(p.data.amount) || 0) : 0), 0);
  const receivables = sales.reduce((acc, r) => acc + Math.max(0, (Number(r.data.grand_total) || 0) - paidFor(r.id)), 0);
  const payables = purchases.reduce((acc, r) => acc + Math.max(0, (Number(r.data.grand_total) || 0) - paidFor(r.id)), 0);

  // Top selling items (by qty) from submitted sales invoices
  const qtyByItem: Record<string, number> = {};
  for (const r of sales) for (const it of (r.data.items || []) as any[]) qtyByItem[it.item] = (qtyByItem[it.item] || 0) + (Number(it.qty) || 0);
  const topItems = Object.entries(qtyByItem)
    .map(([id, q]) => ({ item: id, name: store.getRow(tenant, id)?.data?.name || id, qty: q }))
    .sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Anomalies
  const anomalies: string[] = [];
  const neg: Record<string, number> = {};
  for (const s of store.stockOf(tenant)) neg[s.item] = (neg[s.item] || 0) + s.qty;
  for (const [id, q] of Object.entries(neg)) if (q < 0) anomalies.push(`Negative stock: ${store.getRow(tenant, id)?.data?.name || id} (${Math.round(q * 1000) / 1000})`);
  for (const r of sales) {
    const p = store.getRow(tenant, r.data.customer);
    if (p && !p.data.gstin) anomalies.push(`Invoice ${r.data.name} has no customer GSTIN`);
  }
  const big = sales.filter((r) => (Number(r.data.grand_total) || 0) > 100000);
  if (big.length) anomalies.push(`${big.length} large invoice(s) over ₹1L need review`);

  const tb = getTrialBalance(tenant);
  const pnl = getPnL(tenant);
  const bs = getBalanceSheet(tenant);

  return {
    generated_at: new Date().toISOString(),
    total_sales: totalSales,
    total_purchase: totalPurchase,
    outstanding_receivables: Math.round(receivables * 100) / 100,
    outstanding_payables: Math.round(payables * 100) / 100,
    cash_position: Math.round(cashPosition(tenant) * 100) / 100,
    gst_payable: gstPayable(tenant),
    net_profit: pnl.netProfit,
    total_assets: bs.totalAssets,
    trial_balanced: tb.balanced,
    top_items: topItems,
    anomalies,
  };
}
