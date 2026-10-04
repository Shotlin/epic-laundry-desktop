import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileDown, FileSpreadsheet, Grid2X2, Loader2, List, Pencil, Plus, Printer, ReceiptText, RefreshCw, Search, WalletCards, X } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useEffect, useRef, useState, type Ref } from 'react'
import { apiGet, apiPatch, apiPost, apiPostOffline } from '@/lib/api'
import { formatMoney, localDateKey } from '@/lib/utils'
import { downloadReportPdf } from '@/lib/reportPdf'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'

type Expense = { id: string; reference: string; expenseName: string; expenseDate: string; amount: number; financeCategory: string; paymentReceiver: string; invoiceNumber: string; isTaxPaid: boolean; paymentMode: string; cashRegister?: string; notes: string; status?: string; attachment?: string }
type ReasonRequest = { kind: 'cancel'; id: string } | { kind: 'edit'; id: string; body: Record<string, unknown> }

export default function LaundryExpenses() {
  const client = useQueryClient(); const refreshCash = () => { client.invalidateQueries({ queryKey: ['cash-shift-current'] }); client.invalidateQueries({ queryKey: ['cash-shifts'] }); client.invalidateQueries({ queryKey: ['cash-close-drill'] }) }; const [search, setSearch] = useState(''); const [fromInput, setFromInput] = useState(''); const [toInput, setToInput] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [filterRevision, setFilterRevision] = useState(0); const fromInputRef = useRef<HTMLInputElement>(null); const toInputRef = useRef<HTMLInputElement>(null); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Expense | null>(null); const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null); const [view, setView] = useState<'list' | 'grid'>('list'); const [exportMessage, setExportMessage] = useState(''); const [pdfExporting, setPdfExporting] = useState(false)
  const expenses = useQuery({ queryKey: ['laundry-expenses', search, from, to, filterRevision], queryFn: () => { const params = new URLSearchParams(); if (search) params.set('search', search); if (from) params.set('from', from); if (to) params.set('to', to); return apiGet<Expense[]>(`/laundry/expenses?${params.toString()}`) } })
  const cashShifts = useQuery({ queryKey: ['cash-shifts'], queryFn: () => apiGet<Array<{ id: string; status: string; register: string }>>('/laundry/cash-shifts'), retry: false })
  const create = useMutation({ mutationFn: (body: Record<string, unknown>) => apiPostOffline<Expense>('/laundry/expenses', body, 'laundry_expense'), onSuccess: () => { client.invalidateQueries({ queryKey: ['laundry-expenses'] }); client.invalidateQueries({ queryKey: ['laundry-reports'] }); refreshCash(); setOpen(false) } })
  const cancel = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => apiPost<Expense>(`/laundry/expenses/${id}/cancel`, { reason }), onSuccess: () => { setReasonRequest(null); client.invalidateQueries({ queryKey: ['laundry-expenses'] }); client.invalidateQueries({ queryKey: ['laundry-reports'] }); refreshCash() } })
  const edit = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiPatch<Expense>(`/laundry/expenses/${id}`, body), onSuccess: () => { setReasonRequest(null); client.invalidateQueries({ queryKey: ['laundry-expenses'] }); client.invalidateQueries({ queryKey: ['laundry-reports'] }); refreshCash(); setEditing(null) } })
  const total = expenses.data?.reduce((sum, expense) => sum + expense.amount, 0) || 0
  const categoryChart = Object.entries((expenses.data || []).filter((expense) => expense.status !== 'Cancelled').reduce<Record<string, number>>((result, expense) => { const category = expense.financeCategory || 'UNCLASSIFIED'; result[category] = (result[category] || 0) + expense.amount; return result }, {})).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }))
  const expensePalette = ['#3a7d78', '#e6bc65', '#d86b4d', '#6d5b96', '#8fc1b5', '#8797a0']
  const expenseChartSummary = categoryChart.length ? categoryChart.map((item) => `${item.name.replace(/_/g, ' ')}: ${formatMoney(item.value)}`).join(' · ') : 'No posted expense categories in this view.'
  function requestSave(body: Record<string, unknown>) { if (editing) setReasonRequest({ kind: 'edit', id: editing.id, body }); else create.mutate(body) }
  function exportSpreadsheet() {
    const rows = [['Expense', 'Category', 'Date', 'Receiver', 'Invoice Number', 'Status', 'Payment Mode', 'Tax Paid', 'Amount'], ...(expenses.data || []).map((expense) => [expense.expenseName, expense.financeCategory.replace(/_/g, ' '), date(expense.expenseDate), expense.paymentReceiver, expense.invoiceNumber || expense.reference, expense.status || 'Paid', expense.paymentMode, expense.isTaxPaid ? 'Yes' : 'No', String(expense.amount)])]
    const csv = `\ufeff${rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `epic-store-expenses-${localDateKey(new Date())}.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setExportMessage(`Downloaded ${expenses.data?.length || 0} filtered expense rows as a spreadsheet file.`)
  }
  async function exportPdf() {
    const rows = expenses.data || []
    if (!rows.length || pdfExporting) return
    setPdfExporting(true); setExportMessage('Preparing the filtered expense list as PDF…')
    try {
      await downloadReportPdf({
        title: 'Store Expense',
        context: [from || to ? `${from || 'All dates'}${to ? ` to ${to}` : ''}` : 'All dates', search ? `Search: ${search}` : 'All expenses'].join(' · '),
        columns: ['Expense', 'Category', 'Date', 'Receiver', 'Invoice Number', 'Status', 'Amount'],
        rows: rows.map((expense) => [expense.expenseName, expense.financeCategory.replace(/_/g, ' '), date(expense.expenseDate), expense.paymentReceiver || '—', expense.invoiceNumber || expense.reference, expense.status || 'Paid', formatMoney(expense.amount)]),
        summary: { label: 'Filtered total', value: formatMoney(total) },
        page: 1,
        totalPages: 1,
        totalRows: rows.length,
      }, `epic-store-expenses-${localDateKey(new Date())}.pdf`)
      setExportMessage(`Downloaded ${rows.length} filtered expense rows as PDF.`)
    } catch { setExportMessage('PDF export failed. Please retry.') }
    finally { setPdfExporting(false) }
  }
  function printLedger() {
    const rows = expenses.data || []
    const printable = window.open('', '_blank', 'width=1000,height=720')
    if (!printable) { setExportMessage('Allow pop-ups for this site to print the expense list.'); return }
    const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
    const bodyRows = rows.map((expense) => `<tr><td>${escape(expense.expenseName)}</td><td>${escape(expense.financeCategory.replace(/_/g, ' '))}</td><td>${escape(date(expense.expenseDate))}</td><td>${escape(expense.paymentReceiver || '—')}</td><td>${escape(expense.invoiceNumber || expense.reference)}</td><td>${escape(expense.status || 'Paid')}</td><td class="amount">${escape(formatMoney(expense.amount))}</td></tr>`).join('')
    printable.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Store Expense</title><style>body{font:14px Arial,sans-serif;color:#17353c;margin:28px}h1{font-size:22px;margin:0 0 6px}p{color:#617178;margin:0 0 18px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #d9e0dc;padding:9px 7px;text-align:left}th{background:#f2f6f3;font-size:11px;text-transform:uppercase}.amount{text-align:right;white-space:nowrap}@media print{body{margin:12mm}}</style></head><body><h1>Store Expense</h1><p>${escape([from || to ? `${from || 'All dates'}${to ? ` to ${to}` : ''}` : 'All dates', search ? `Search: ${search}` : 'All expenses'].join(' · '))} · ${rows.length} rows · Total ${escape(formatMoney(total))}</p><table><thead><tr><th>Expense</th><th>Category</th><th>Date</th><th>Receiver</th><th>Invoice Number</th><th>Status</th><th>Amount</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="7">No expenses in this view</td></tr>'}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
    printable.document.close()
    setExportMessage('Opened a print-ready copy of the filtered expense list.')
  }
  return <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
    <p className="sr-only" aria-label="Expense composition chart summary">Filtered expense composition: {expenseChartSummary}.</p>
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Store ledger</p><h1 className="mt-1 font-serif text-3xl text-[#17353c]">Store expense</h1><p className="mt-1 text-sm text-[#718087]">Every expense writes through to the accounting journal.</p></div>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#123039] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Add expense</button>
    </header>
    <div className="grid gap-4 sm:grid-cols-2"><Metric label="Filtered expenses" value={formatMoney(total)} icon={WalletCards} /><Metric label="Recorded entries" value={String(expenses.data?.length || 0)} icon={ReceiptText} /></div>
    <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <section className="rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,25,43,.04)]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#4d8982]">Management view</p><h2 className="mt-1 font-serif text-2xl text-[#17353c]">Where the filtered spend goes</h2><p className="mt-1 text-xs text-[#718087]">Category totals come from the same expense rows below. Cancelled records remain in the ledger and are excluded here.</p>{categoryChart.length ? <div className="mt-4 grid gap-4 md:grid-cols-[.9fr_1.1fr] md:items-center"><div className="h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryChart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={3}>{categoryChart.map((item, index) => <Cell key={item.name} fill={expensePalette[index % expensePalette.length]} />)}</Pie><Tooltip formatter={(value: unknown) => formatMoney(Number(value || 0))} /></PieChart></ResponsiveContainer></div><div className="space-y-2">{categoryChart.slice(0, 6).map((item, index) => <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f8f5] px-3 py-2.5 text-sm"><span className="flex min-w-0 items-center gap-2 text-[#52676b]"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: expensePalette[index % expensePalette.length] }} /><span className="truncate">{item.name.replace(/_/g, ' ')}</span></span><strong className="tabular-nums text-[#17353c]">{formatMoney(item.value)}</strong></div>)}</div></div> : <VisualEmptyState kind="finance" compact title="No expense mix yet" detail="Add an expense to see category totals here." />}</section>
      <section className="rounded-[22px] border border-[#263f44]/10 bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#4d8982]">Largest drivers</p><h2 className="mt-1 font-serif text-2xl text-[#17353c]">Spend to review first</h2><div className="mt-5 space-y-3">{categoryChart.length ? categoryChart.slice(0, 5).map((item, index) => <div key={item.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-[#315d57]">{index + 1}. {item.name.replace(/_/g, ' ')}</span><strong className="tabular-nums text-[#17353c]">{formatMoney(item.value)}</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#eaf0eb]"><div className="h-full rounded-full bg-[#3a7d78]" style={{ width: `${Math.min(100, total ? item.value / total * 100 : 0)}%` }} /></div></div>) : <VisualEmptyState kind="finance" compact title="No drivers to review" detail="Spend drivers appear after the first expense is recorded." />}</div></section>
    </section>
    <section className="overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">
      <div className="flex flex-wrap items-end gap-3 border-b border-[#263f44]/10 p-4">
        <label className="relative min-w-[240px] max-w-md flex-1"><span className="sr-only">Search expenses</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8d90]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Expense name, receiver, invoice no." className="h-10 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] pl-9 pr-3 text-sm outline-none focus:border-[#438b82]" /></label>
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617178]">From<input aria-label="Expense start date" ref={fromInputRef} type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="mt-1 block h-10 rounded-xl border border-[#263f44]/15 bg-white px-2 text-sm font-normal normal-case tracking-normal" /></label>
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617178]">To<input aria-label="Expense end date" ref={toInputRef} type="date" min={fromInput || undefined} value={toInput} onChange={(event) => setToInput(event.target.value)} className="mt-1 block h-10 rounded-xl border border-[#263f44]/15 bg-white px-2 text-sm font-normal normal-case tracking-normal" /></label>
        <button type="button" onClick={() => { const nextFrom = fromInputRef.current?.value || fromInput; const nextTo = toInputRef.current?.value || toInput; setFromInput(nextFrom); setToInput(nextTo); setFrom(nextFrom); setTo(nextTo); setFilterRevision((value) => value + 1) }} className="h-10 rounded-xl bg-[#123039] px-3 text-xs font-bold text-white">Apply filter</button>
        {from || to || fromInput || toInput ? <button type="button" onClick={() => { setFromInput(''); setToInput(''); setFrom(''); setTo(''); setFilterRevision((value) => value + 1) }} className="h-10 rounded-xl border border-[#263f44]/15 px-3 text-xs font-bold text-[#315d57]">Clear dates</button> : null}
      </div>
      {from || to ? <p className="border-b border-[#263f44]/10 bg-[#f7fbf7] px-4 py-2 text-xs font-semibold text-[#315d57]" aria-live="polite">Date filter applied: {from || 'earliest'} to {to || 'latest'}.</p> : null}
      {expenses.isError ? <p className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">The expense ledger could not be filtered. Please retry.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263f44]/10 px-4 py-3"><div className="flex flex-wrap items-center gap-2" aria-label="Expense list tools"><button type="button" aria-label="Download expense PDF" title="Download the filtered expenses as PDF" disabled={!expenses.data?.length || pdfExporting} onClick={() => void exportPdf()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-2.5 text-xs font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-50"><FileDown className="h-4 w-4" />PDF</button><button type="button" aria-label="Download expense spreadsheet" title="Download the filtered expenses as CSV for spreadsheet apps" disabled={!expenses.data?.length} onClick={exportSpreadsheet} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-2.5 text-xs font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" />Spreadsheet</button><button type="button" aria-label="Print expense list" onClick={printLedger} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-2.5 text-xs font-bold text-[#315d57]"><Printer className="h-4 w-4" />Print</button><button type="button" aria-label="Refresh expenses" disabled={expenses.isFetching} onClick={() => void expenses.refetch()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-2.5 text-xs font-bold text-[#315d57] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${expenses.isFetching ? 'animate-spin' : ''}`} />Refresh</button></div><div className="flex items-center gap-2"><span className="text-xs font-semibold text-[#617178]">View as:</span><button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold ${view === 'grid' ? 'bg-[#eaf3ef] text-[#205d55]' : 'text-[#617178] hover:bg-[#f5f7f3]'}`}><Grid2X2 className="h-4 w-4" />Grid</button><button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold ${view === 'list' ? 'bg-[#eaf3ef] text-[#205d55]' : 'text-[#617178] hover:bg-[#f5f7f3]'}`}><List className="h-4 w-4" />List</button></div></div>
      {exportMessage ? <p className="border-b border-[#263f44]/10 px-4 py-2 text-xs text-[#315d57]" role="status">{exportMessage}</p> : null}
      {view === 'list' ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#fafaf7] text-[10px] font-bold uppercase tracking-[.14em] text-[#718087]"><tr><th className="px-5 py-3">Expense</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Receiver</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Status</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{expenses.isLoading ? <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[#3a7d78]" /></td></tr> : expenses.data?.length ? expenses.data.map((expense) => <tr key={expense.id} className="border-t border-[#263f44]/8"><td className="px-5 py-3.5"><span className="block font-semibold">{expense.expenseName}</span><span className="text-xs text-[#718087]">{expense.paymentMode} · {expense.isTaxPaid ? 'Tax paid' : 'No tax'}{expense.attachment ? ' · Attachment' : ''}</span></td><td className="px-3 py-3.5"><span className={expense.financeCategory === 'UNCLASSIFIED' ? 'rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800' : 'rounded-full bg-[#eaf3ef] px-2 py-1 text-[10px] font-bold text-[#32695f]'}>{expense.financeCategory.replace(/_/g, ' ')}</span></td><td className="px-3 py-3.5 text-[#617178]">{date(expense.expenseDate)}</td><td className="px-3 py-3.5">{expense.paymentReceiver || '—'}</td><td className="px-3 py-3.5 text-[#617178]">{expense.invoiceNumber || expense.reference}</td><td className="px-3 py-3.5"><span className={expense.status === 'Cancelled' ? 'rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700' : 'rounded-full bg-[#eaf3ef] px-2 py-1 text-[10px] font-bold text-[#32695f]'}>{expense.status || 'Paid'}</span></td><td className="px-5 py-3.5 text-right font-bold tabular-nums">{formatMoney(expense.amount)}</td><td className="px-5 py-3.5 text-right">{expense.status !== 'Cancelled' ? <span className="inline-flex items-center gap-3"><button type="button" onClick={() => setEditing(expense)} className="inline-flex items-center gap-1 text-xs font-bold text-[#39786f] hover:underline"><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" disabled={cancel.isPending} onClick={() => setReasonRequest({ kind: 'cancel', id: expense.id })} className="text-xs font-bold text-rose-700 hover:underline">Cancel</button></span> : null}</td></tr>) : <tr><td colSpan={8}><VisualEmptyState kind="finance" title="No expenses in this view" detail="Add an expense or clear the search and date filters to see the store ledger." /></td></tr>}</tbody></table></div> : <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{expenses.isLoading ? <p className="col-span-full py-12 text-center text-sm text-[#718087]">Loading expenses…</p> : expenses.data?.length ? expenses.data.map((expense) => <article key={expense.id} className="rounded-2xl border border-[#263f44]/10 bg-[#fffdf8] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold text-[#17353c]">{expense.expenseName}</h3><p className="mt-1 text-xs text-[#718087]">{date(expense.expenseDate)}</p></div><strong className="shrink-0 text-sm tabular-nums text-[#17353c]">{formatMoney(expense.amount)}</strong></div><p className="mt-3 text-xs text-[#617178]">{expense.financeCategory.replace(/_/g, ' ')} · {expense.paymentMode} · {expense.status || 'Paid'}</p>{expense.paymentReceiver ? <p className="mt-1 text-xs text-[#718087]">Paid to {expense.paymentReceiver}</p> : null}{expense.status !== 'Cancelled' ? <div className="mt-4 flex gap-4 border-t border-[#263f44]/10 pt-3"><button type="button" onClick={() => setEditing(expense)} className="inline-flex items-center gap-1 text-xs font-bold text-[#39786f] hover:underline"><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" disabled={cancel.isPending} onClick={() => setReasonRequest({ kind: 'cancel', id: expense.id })} className="text-xs font-bold text-rose-700 hover:underline">Cancel</button></div> : null}</article>) : <div className="col-span-full"><VisualEmptyState kind="finance" title="No expenses in this view" detail="Add an expense or clear the search and date filters to see the store ledger." /></div>}</div>}
    </section>
    {open || editing ? <ExpenseDialog key={editing?.id || 'new'} initial={editing || undefined} pending={create.isPending || edit.isPending} error={create.error || edit.error} cashShifts={cashShifts.data || []} onClose={() => { setOpen(false); setEditing(null); create.reset(); edit.reset() }} onSave={requestSave} /> : null}
    {reasonRequest ? <ReasonDialog kind={reasonRequest.kind} pending={cancel.isPending || edit.isPending} error={cancel.error || edit.error} onClose={() => setReasonRequest(null)} onConfirm={(reason) => { if (reasonRequest.kind === 'cancel') cancel.mutate({ id: reasonRequest.id, reason }); else edit.mutate({ id: reasonRequest.id, body: { ...reasonRequest.body, reason } }) }} /> : null}
  </div>
}
function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof WalletCards }) { return <div className="rounded-[20px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]"><Icon className="h-5 w-5 text-[#3a7d78]" /><p className="mt-4 text-xs font-bold uppercase tracking-[.13em] text-[#718087]">{label}</p><p className="mt-1 font-serif text-3xl text-[#17353c]">{value}</p></div> }
function ExpenseDialog({ initial, pending, error, cashShifts, onClose, onSave }: { initial?: Expense; pending: boolean; error: unknown; cashShifts: Array<{ id: string; status: string; register: string }>; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [name, setName] = useState(initial?.expenseName || '');
  const [expenseDate, setExpenseDate] = useState(initial?.expenseDate || localDateKey());
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial?.financeCategory || 'UNCLASSIFIED');
  const [receiver, setReceiver] = useState(initial?.paymentReceiver || '');
  const [invoice, setInvoice] = useState(initial?.invoiceNumber || '');
  const [paymentMode, setPaymentMode] = useState(initial?.paymentMode || 'Cash');
  const [cashRegister, setCashRegister] = useState(initial?.cashRegister || '');
  const [tax, setTax] = useState(initial?.isTaxPaid || false);
  const [attachment, setAttachment] = useState(initial?.attachment || '');
  const [attachmentError, setAttachmentError] = useState('');
  const editing = Boolean(initial);
  const openRegisters = cashShifts.filter((shift) => shift.status === 'Open').map((shift) => shift.register);
  const singleOpenRegister = openRegisters.length === 1 ? openRegisters[0] : '';
  useEffect(() => {
    if (paymentMode !== 'Cash') return;
    if (cashRegister && openRegisters.includes(cashRegister)) return;
    if (singleOpenRegister !== cashRegister) setCashRegister(singleOpenRegister);
  }, [cashRegister, openRegisters.join('|'), paymentMode, singleOpenRegister]);
  const { dialogRef, initialFocusRef, onKeyDown } = useDialogFocus<HTMLFormElement, HTMLInputElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#102b33]/55 p-4 backdrop-blur-sm">
      <form
        ref={dialogRef}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            expenseName: name,
            expenseDate,
            amount: Number(amount),
            financeCategory: category,
            paymentReceiver: receiver,
            invoiceNumber: invoice,
            paymentMode,
            cashRegister: paymentMode === 'Cash' ? cashRegister || undefined : undefined,
            isTaxPaid: tax,
            attachment,
          });
        }}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[24px] bg-[#fffdf8] p-5 shadow-2xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#4d8982]">
              {editing ? 'Controlled accounting adjustment' : 'New accounting record'}
            </p>
            <h2 id="expense-dialog-title" className="mt-1 font-serif text-2xl text-[#17353c]">{editing ? 'Edit expense' : 'Add expense'}</h2>
          </div>
          <button type="button" aria-label="Close expense dialog" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#f0eee9]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <Field label="Expense Name" value={name} onChange={setName} required maxLength={100} inputRef={initialFocusRef} />
          <label className="text-xs font-semibold text-[#617178]">
            Expense Date
            <input required type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm" />
          </label>
          <Field label="Amount Paid" value={amount} onChange={setAmount} type="number" required />
          <label className="text-xs font-semibold text-[#617178]">
            Management category
            <select aria-label="Management category" value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm">
              {['UNCLASSIFIED', 'PROCESSING', 'LOGISTICS', 'MARKETPLACE', 'PAYROLL', 'RENT', 'UTILITIES', 'SOFTWARE', 'MARKETING', 'MAINTENANCE', 'ADMIN', 'FINANCE', 'TAX', 'CAPEX', 'OTHER'].map((item) => (
                <option key={item} value={item}>{CATEGORY_NAMES[item] || item.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <Field label="Payment Receiver" value={receiver} onChange={setReceiver} />
          <Field label="Invoice Number" value={invoice} onChange={setInvoice} />
          <select aria-label="Payment mode" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} className="h-10 rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm">
            {['Cash', 'UPI', 'Card', 'Bank'].map((mode) => <option key={mode}>{mode}</option>)}
          </select>
          {paymentMode === 'Cash' && openRegisters.length > 0 ? <label className="text-xs font-semibold text-[#617178]">Cash register
            <select aria-label="Cash register" required value={cashRegister} onChange={(event) => setCashRegister(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm">
              <option value="">{openRegisters.length === 1 ? 'Select open register' : 'Choose an open register'}</option>
              {openRegisters.map((register) => <option key={register} value={register}>{register}</option>)}
            </select>
          </label> : null}
          {paymentMode === 'Cash' && cashShifts.length > 0 && openRegisters.length === 0 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No cash register is open. This expense will be recorded outside drawer closing.</p> : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tax} onChange={(event) => setTax(event.target.checked)} />
            Is Tax Paid?
          </label>
          <label className="cursor-pointer rounded-xl border border-dashed border-[#79a59b] bg-[#f5faf6] p-2.5 text-center text-xs font-semibold text-[#39786f]">
            {attachment ? 'Attachment selected' : 'Attach receipt (PDF/image, optional)'}
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 1_000_000) {
                  setAttachmentError('Attachment must be under 1 MB.');
                  setAttachment('');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  setAttachment(String(reader.result || ''));
                  setAttachmentError('');
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {attachmentError ? <p className="text-xs text-rose-700">{attachmentError}</p> : null}
        </div>
        {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error instanceof Error ? error.message : 'Could not save expense.'}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-xl border border-[#263f44]/15 px-4 text-sm font-semibold text-[#617178] disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={pending || (paymentMode === 'Cash' && openRegisters.length > 1 && !cashRegister)} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#3a7d78] px-4 text-sm font-bold text-white disabled:bg-[#a8b7b2]">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? 'Saving…' : editing ? 'Save controlled edit' : 'Save expense'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, maxLength, inputRef }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; maxLength?: number; inputRef?: Ref<HTMLInputElement> }) {
  const characterCountId = maxLength ? 'expense-name-character-count' : undefined;

  return (
    <label className="text-xs font-semibold text-[#617178]">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        {maxLength ? <span id={characterCountId} aria-live="polite" className="font-medium text-[#718087]">{value.length}/{maxLength}</span> : null}
      </span>
      <input ref={inputRef} required={required} maxLength={maxLength} aria-describedby={characterCountId} type={type} min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm" />
    </label>
  );
}
function ReasonDialog({ kind, pending, error, onClose, onConfirm }: { kind: 'cancel' | 'edit'; pending: boolean; error: unknown; onClose: () => void; onConfirm: (reason: string) => void }) { const [reason, setReason] = useState(''); const editing = kind === 'edit'; const { dialogRef, initialFocusRef, onKeyDown } = useDialogFocus<HTMLFormElement, HTMLTextAreaElement>(onClose); return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#102b33]/55 p-4 backdrop-blur-sm"><form ref={dialogRef} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-labelledby="expense-reason-title" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 3) onConfirm(reason.trim()) }} className="w-full max-w-md rounded-[24px] bg-[#fffdf8] p-5 shadow-2xl"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#9a513b]">Controlled accounting action</p><h2 id="expense-reason-title" className="mt-1 font-serif text-2xl text-[#17353c]">{editing ? 'Explain this expense edit' : 'Cancel this expense?'}</h2><p className="mt-2 text-sm leading-5 text-[#617178]">{editing ? 'A reason is required before the corrected ledger entry is posted.' : 'The cancellation remains auditable; record why this expense should be voided.'}</p><label className="mt-4 block text-xs font-bold uppercase tracking-[.12em] text-[#617178]">Required reason<textarea ref={initialFocusRef} aria-label="Expense action reason" minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:ring-2 focus:ring-[#3a7d78]" /></label>{error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error instanceof Error ? error.message : 'The accounting action could not be completed.'}</p> : null}<div className="mt-4 flex justify-end gap-2"><button type="button" disabled={pending} onClick={onClose} className="rounded-xl border border-[#263f44]/15 px-3 py-2 text-sm font-semibold text-[#617178]">Keep record</button><button type="submit" disabled={pending || reason.trim().length < 3} className="rounded-xl bg-rose-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? 'Saving…' : editing ? 'Confirm controlled edit' : 'Confirm cancellation'}</button></div></form></div> }
function date(value: string) { return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }

const CATEGORY_NAMES: Record<string, string> = { UNCLASSIFIED: 'Not sure yet', PROCESSING: 'Cleaning supplies & processing', LOGISTICS: 'Transport & delivery', MARKETPLACE: 'Online platform fees', PAYROLL: 'Staff pay', RENT: 'Rent', UTILITIES: 'Electricity, water & gas', SOFTWARE: 'Software & subscriptions', MARKETING: 'Marketing', MAINTENANCE: 'Repairs & maintenance', ADMIN: 'Office & admin', FINANCE: 'Bank & finance charges', TAX: 'Taxes', CAPEX: 'Equipment purchase', OTHER: 'Other' }
