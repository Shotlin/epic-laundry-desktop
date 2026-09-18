// Migration importer: bring a SMB's historical data in from Tally / Zoho / generic CSV.
// Generic column-mapping + named presets; posts masters and (for documents) submits them;
// ledger opening balances are carried into the GL via an Opening Balance equity leg.
import { randomUUID } from 'node:crypto';
import { createRow, submitRow } from '../../kernel/entity-service.js';
import { store } from '../../kernel/store.js';

export interface Preset { key: string; label: string; entity: string; fieldMap: Record<string, string>; }
export interface ImportRow { ok: boolean; id?: string; name?: string; posted?: boolean; error?: string; row?: any; }

const DOCUMENTS = ['sales_invoice', 'purchase_invoice', 'pos_invoice', 'payment_entry', 'salary_slip', 'credit_note', 'debit_note'];

export const PRESETS: Preset[] = [
  { key: 'tally_ledger', label: 'Tally — Ledger Master', entity: 'account',
    fieldMap: { name: 'Name', account_type: 'Type', opening_balance: 'Opening Balance', opening_side: 'Balance Type' } },
  { key: 'zoho_ledger', label: 'Zoho — Chart of Accounts', entity: 'account',
    fieldMap: { name: 'Account Name', account_type: 'Account Type', opening_balance: 'Opening Balance', opening_side: 'Dr/Cr' } },
  { key: 'tally_party', label: 'Tally — Sundry Party', entity: 'party',
    fieldMap: { name: 'Name', phone: 'Mobile No.', email: 'Email', gstin: 'GSTIN' } },
  { key: 'zoho_item', label: 'Zoho — Items', entity: 'item',
    fieldMap: { name: 'Item Name', item_code: 'SKU', uom: 'Unit', rate: 'Sales Price', hsn: 'HSN', gst_rate: 'Tax Rate' } },
  { key: 'generic', label: 'Generic (use my own headers)', entity: 'account', fieldMap: {} },
];

function normType(t: string): string {
  const s = String(t || '').toLowerCase();
  if (s.includes('asset')) return 'Asset';
  if (s.includes('liab')) return 'Liability';
  if (s.includes('equity') || s.includes('capital')) return 'Equity';
  if (s.includes('income') || s.includes('revenue')) return 'Income';
  if (s.includes('exp') || s.includes('expense')) return 'Expense';
  return 'Asset';
}

export function runImport(tenant: string, actor: string, entity: string, rows: Record<string, any>[], fieldMap?: Record<string, string>, openBalAcct = 'Opening Balance (Equity)'): ImportRow[] {
  const out: ImportRow[] = [];
  for (const r of rows) {
    try {
      const data: Record<string, any> = {};
      if (fieldMap && Object.keys(fieldMap).length) {
        for (const [our, src] of Object.entries(fieldMap)) {
          if (src && r[src] !== undefined && r[src] !== '') data[our] = r[src];
        }
      } else {
        Object.assign(data, r);
      }
      if (entity === 'account' && data.account_type) data.account_type = normType(data.account_type);

      const row = createRow(tenant, actor, entity, data);
      let posted = false;
      if (DOCUMENTS.includes(entity)) { submitRow(tenant, actor, entity, row.id); posted = true; }

      // Carry ledger opening balances into the GL so the TB reflects history.
      if (entity === 'account' && data.opening_balance) {
        const amt = Math.round((Number(data.opening_balance) || 0) * 100) / 100;
        const side = String(data.opening_side || 'Dr').toUpperCase().includes('C') ? 'Cr' : 'Dr';
        const now = new Date().toISOString();
        const base = { id: randomUUID(), tenant, posting_date: now.slice(0, 10), voucher_type: 'opening', voucher: 'OPEN-' + now, party: undefined, created_at: now };
        store.appendGL({ ...base, account: data.name, debit: side === 'Dr' ? amt : 0, credit: side === 'Cr' ? amt : 0 });
        store.appendGL({ ...base, account: openBalAcct, debit: side === 'Cr' ? amt : 0, credit: side === 'Dr' ? amt : 0 });
      }
      out.push({ ok: true, id: row.id, name: row.id, posted });
    } catch (e: any) { out.push({ ok: false, error: e.message, row: r }); }
  }
  return out;
}
