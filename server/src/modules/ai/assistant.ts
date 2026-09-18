// Epic AI assistant — answers natural-language business questions over the tenant's data.
// Uses an LLM when EPIC_AI_KEY is configured (OpenAI-compatible /chat/completions), otherwise
// replies with deterministic heuristics derived from getInsights(). No external call is made
// without a key, so it always works offline.
import { getInsights } from './insights.js';

function money(n: number): string {
  return '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN');
}

function heuristic(tenant: string, question: string): string {
  const q = question.toLowerCase();
  const d = getInsights(tenant);
  if (/(receivable|outstanding|pending|unpaid).*(customer|sale|invoice)/.test(q) || q.includes('receivable'))
    return `Outstanding receivables (money customers owe you): ${money(d.outstanding_receivables)} across submitted sales invoices. Tip: use Banking → Outstanding to send reminders.`;
  if (q.includes('payable') || q.includes('supplier') || q.includes('vendor'))
    return `Outstanding payables (money you owe suppliers): ${money(d.outstanding_payables)}.`;
  if (q.includes('cash') || q.includes('bank') || q.includes('liquidity') || q.includes('position'))
    return `Current cash position (Cash + Bank): ${money(d.cash_position)}.`;
  if (q.includes('gst') || q.includes('tax'))
    return `Net GST payable (output minus input credit): ${money(d.gst_payable)}. File GSTR-3B by the 20th.`;
  if (q.includes('profit') || q.includes('loss') || q.includes('pnl') || q.includes('income'))
    return `Net profit (P&L): ${money(d.net_profit)}.`;
  if (q.includes('sale') || q.includes('revenue') || q.includes('turnover'))
    return `Total submitted sales: ${money(d.total_sales)}. Total purchases: ${money(d.total_purchase)}.`;
  if (q.includes('anomal') || q.includes('problem') || q.includes('alert') || q.includes('risk'))
    return d.anomalies.length ? `I found ${d.anomalies.length} item(s) to review:\n• ` + d.anomalies.join('\n• ') : 'No anomalies detected. Books look clean.';
  if (q.includes('top') && q.includes('item'))
    return `Top selling items:\n` + d.top_items.map((t) => `• ${t.name}: ${t.qty} units`).join('\n');
  if (q.includes('asset'))
    return `Total assets on the balance sheet: ${money(d.total_assets)}.`;
  return `Here's your business snapshot:\n• Sales: ${money(d.total_sales)}\n• Purchases: ${money(d.total_purchase)}\n• Receivables: ${money(d.outstanding_receivables)}\n• Payables: ${money(d.outstanding_payables)}\n• Cash: ${money(d.cash_position)}\n• GST payable: ${money(d.gst_payable)}\n• Net profit: ${money(d.net_profit)}\n• Anomalies: ${d.anomalies.length}`;
}

export async function ask(tenant: string, question: string): Promise<{ answer: string; mode: string }> {
  const key = process.env.EPIC_AI_KEY;
  const base = process.env.EPIC_AI_BASE || 'https://api.openai.com/v1';
  const model = process.env.EPIC_AI_MODEL || 'gpt-4o-mini';
  const d = getInsights(tenant);
  if (key) {
    try {
      const sys = `You are Epic AI, the assistant inside an Indian Business OS (ERP+CRM+HR+POS+GST). `
        + `Answer concisely, in Indian context. Use this live snapshot (JSON): ${JSON.stringify(d)}. `
        + `If asked for actions, suggest the right module. Never invent numbers beyond the snapshot.`;
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: question }], temperature: 0.2 }),
      });
      if (r.ok) {
        const j = await r.json() as any;
        const ans = j?.choices?.[0]?.message?.content;
        if (ans) return { answer: ans, mode: 'llm' };
      }
    } catch { /* fall through to heuristic */ }
  }
  return { answer: heuristic(tenant, question), mode: 'heuristic' };
}
