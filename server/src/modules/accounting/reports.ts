// Accounting reports (docs/05-india-compliance + platform-core §books). All reports are derived
// deterministically from the GL (never recomputed from source documents) so the posting engine
// remains the single source of truth. Account types come from the Chart of Accounts; a fallback
// map covers the standard accounts used by the posting hooks.
import { store } from '../../kernel/store.js';
import { stockValuation } from '../inventory/valuation.js';
import type { GLEntry } from '../../kernel/types.js';

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

const DEFAULT_TYPES: Record<string, AccountType> = {
  'Debtors (Assets)': 'Asset', 'Cash (Assets)': 'Asset', 'Bank/UPI (Assets)': 'Asset',
  'Bank/Card (Assets)': 'Asset', 'CGST (Asset)': 'Asset', 'SGST (Asset)': 'Asset', 'IGST (Asset)': 'Asset',
  'Accumulated Depreciation (Asset)': 'Asset',
  'Creditors (Liabilities)': 'Liability', 'CGST (Liability)': 'Liability', 'SGST (Liability)': 'Liability', 'IGST (Liability)': 'Liability',
  'PF Payable (Liability)': 'Liability', 'ESI Payable (Liability)': 'Liability', 'TDS Payable (Liability)': 'Liability',
  'PT Payable (Liability)': 'Liability', 'TCS Payable (Liability)': 'Liability',
  'Capital (Equity)': 'Equity',
  'Sales (Revenue)': 'Income',
  'Purchase (Expense)': 'Expense', 'Salary (Expense)': 'Expense', 'Depreciation Expense': 'Expense', 'Rent (Expense)': 'Expense',
};

function typeOf(tenant: string, name: string): AccountType {
  const acc = store.rowsOf(tenant, 'account').find((a) => a.data.name === name);
  if (acc?.data?.account_type) return acc.data.account_type as AccountType;
  return DEFAULT_TYPES[name] || 'Asset';
}

interface Accum { debit: number; credit: number; type: AccountType; }
type Index = Map<string, Accum>;

function buildIndex(tenant: string, cc?: string): Index {
  const idx: Index = new Map();
  const gl = store.glOf(tenant).filter((e) => !cc || e.cost_center === cc);
  // seed from GL accounts actually used
  for (const e of gl) {
    if (!idx.has(e.account)) idx.set(e.account, { debit: 0, credit: 0, type: typeOf(tenant, e.account) });
    const a = idx.get(e.account)!;
    a.debit += e.debit; a.credit += e.credit;
  }
  // also include CoA accounts with zero balance (only for the whole-company view)
  if (!cc) for (const a of store.rowsOf(tenant, 'account')) {
    if (!idx.has(a.data.name)) idx.set(a.data.name, { debit: 0, credit: 0, type: a.data.account_type });
  }
  return idx;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// Normal-balance helper: Asset/Expense are debit-normal; Liability/Equity/Income are credit-normal.
function balance(acc: Accum): number {
  const sign = (acc.type === 'Asset' || acc.type === 'Expense') ? 1 : -1;
  return r2((acc.debit - acc.credit) * sign);
}

export function getTrialBalance(tenant: string, cc?: string) {
  const idx = buildIndex(tenant, cc);
  const lines = [...idx.entries()].map(([name, a]) => ({
    account: name, type: a.type, debit: r2(a.debit), credit: r2(a.credit), balance: balance(a),
  })).sort((x, y) => x.account.localeCompare(y.account));
  const totalDebit = r2([...idx.values()].reduce((s, a) => s + a.debit, 0));
  const totalCredit = r2([...idx.values()].reduce((s, a) => s + a.credit, 0));
  return { lines, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function getPnL(tenant: string, cc?: string) {
  const idx = buildIndex(tenant, cc);
  let income = 0, expense = 0;
  for (const [name, a] of idx) {
    if (a.type === 'Income') income += balance(a);
    if (a.type === 'Expense') expense += balance(a);
  }
  const net = r2(income - expense);
  return { income: r2(income), expense: r2(expense), netProfit: net };
}

export function getBalanceSheet(tenant: string, cc?: string) {
  const idx = buildIndex(tenant, cc);
  const pnl = getPnL(tenant);
  const assets: any[] = [], liabilities: any[] = [], equity: any[] = [];
  for (const [name, a] of idx) {
    const b = balance(a);
    if (a.type === 'Asset') assets.push({ account: name, amount: b });
    else if (a.type === 'Liability') liabilities.push({ account: name, amount: b });
    else if (a.type === 'Equity') equity.push({ account: name, amount: b });
  }
  assets.sort((x, y) => y.amount - x.amount);
  liabilities.sort((x, y) => y.amount - x.amount);
  equity.sort((x, y) => y.amount - x.amount);
  const totalAssets = r2(assets.reduce((s, a) => s + a.amount, 0));
  const totalLiabilities = r2(liabilities.reduce((s, a) => s + a.amount, 0));
  const totalEquity = r2(equity.reduce((s, a) => s + a.amount, 0));
  const retainedEarnings = pnl.netProfit;
  const totalEquityLiab = r2(totalLiabilities + totalEquity + retainedEarnings);
  // Inventory valuation (from the stock ledger, FIFO / moving-average) is shown as a memo
  // disclosure so the GL-based Balance Sheet stays balanced (periodic inventory model).
  const valMa = stockValuation(tenant, 'moving-average');
  const valFifo = stockValuation(tenant, 'fifo');
  return {
    assets, totalAssets,
    liabilities, totalLiabilities,
    equity, totalEquity,
    retainedEarnings,
    totalEquityLiabilities: totalEquityLiab,
    balanced: totalAssets === totalEquityLiab,
    inventory: {
      movingAverage: { total: valMa.total, lines: valMa.lines },
      fifo: { total: valFifo.total, lines: valFifo.lines },
    },
  };
}

export function getLedger(tenant: string, account: string): GLEntry[] {
  return store.glOf(tenant).filter((e) => e.account === account);
}
