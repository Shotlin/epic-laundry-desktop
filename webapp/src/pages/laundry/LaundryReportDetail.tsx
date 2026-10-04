import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileDown, LifeBuoy, Loader2, LockKeyhole, Printer, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { formatMoney, localDateKey } from '@/lib/utils'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'
import ReportDateFilter, { reportPeriodRange, type ReportPeriod } from '@/components/laundry/ReportDateFilter'
import ReportChartPeriod, { type ChartDateRange } from '@/components/laundry/ReportChartPeriod'
import { downloadReportPdf } from '@/lib/reportPdf'

const reports = [
  ['invoice', 'Invoice Report'], ['collection', 'Collection Report'], ['order', 'Order Report'], ['consolidated-invoices', 'Consolidated Invoices'], ['customer', 'Customer Report'], ['customer-package', 'Customer Package Report'], ['customer-list', 'Customer List'], ['growth', 'Growth Report'], ['discount', 'Discount Report'], ['expense', 'Expense Report'], ['balance', 'Balance Report'], ['pickup', 'Pickup Overview'], ['rider-delivery', 'Rider Delivery'], ['rider-collection', 'Rider Pickup Orders'], ['warehouse-user-work', 'Warehouse User Work Report'],
] as const

type Detail = {
  kind: string; from: string | null; to: string | null; columns: string[]; rows: Array<Record<string, unknown>>; totalRows: number; page: number; pageSize: number; totalPages: number; summary?: { label: string; value: number; format: 'currency' | 'count' }; exportCap?: number | null; exportTruncated?: boolean
}
type ReportChart = { kind: string; from: string; to: string; metric: string; points: Array<{ label: string; value: number }> }
type ReportExportJob = { id: string; status: 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Expired'; totalRows: number; fileName: string | null; error: string | null; expiresAt: string | null }
const paymentMethods = ['Cash', 'UPI', 'Card', 'Bank'] as const

export default function LaundryReportDetail() {
  const { kind = 'invoice' } = useParams();
  const [savedParams] = useSearchParams();
  const meta = reports.find(([id]) => id === kind) || reports[0];
  const hasSavedDateRange = Boolean(savedParams.get('from') || savedParams.get('to'));
  const warehouseWorkLocked = meta[0] === 'warehouse-user-work';
  const requestedPeriod = parseReportPeriod(savedParams.get('period'));
  const allowedPeriods: ReportPeriod[] = ['discount', 'expense'].includes(meta[0]) ? ['week', 'month', 'quarter', 'year', 'custom'] : ['today', 'yesterday', 'week', 'month', 'year', 'custom'];
  const linkedReportPeriod = requestedPeriod && allowedPeriods.includes(requestedPeriod) ? requestedPeriod : undefined;
  const defaultWeeklyReport = ['discount', 'expense'].includes(meta[0]) && !savedParams.get('from') && !savedParams.get('to') ? reportPeriodRange('week') : undefined;
  const defaultConsolidatedReport = meta[0] === 'consolidated-invoices' && !hasSavedDateRange ? reportPeriodRange('today') : undefined;
  const defaultReportPeriod = linkedReportPeriod || (['discount', 'expense'].includes(meta[0]) && !hasSavedDateRange ? 'week' : meta[0] === 'consolidated-invoices' && !hasSavedDateRange ? 'today' : 'custom');
  const linkedPeriodRange = linkedReportPeriod && linkedReportPeriod !== 'custom' && !hasSavedDateRange ? reportPeriodRange(linkedReportPeriod) : undefined;
  const [consolidatedPeriod, setConsolidatedPeriod] = useState<ReportPeriod>(defaultReportPeriod);
  const [from, setFrom] = useState(savedParams.get('from') || linkedPeriodRange?.from || defaultWeeklyReport?.from || defaultConsolidatedReport?.from || '');
  const [to, setTo] = useState(savedParams.get('to') || linkedPeriodRange?.to || defaultWeeklyReport?.to || defaultConsolidatedReport?.to || '');
  const [search, setSearch] = useState(savedParams.get('search') || '');
  const [paymentMethod, setPaymentMethod] = useState(savedParams.get('paymentMethod') || '');
  const [collectionView, setCollectionView] = useState<'invoice' | 'customer'>('invoice');
  const [orderView, setOrderView] = useState<'service' | 'invoice'>('service');
  const [balanceView, setBalanceView] = useState<'invoice' | 'customer'>('invoice');
  const [chartRange, setChartRange] = useState<ChartDateRange>(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { from: localDateKey(start), to: localDateKey(end) };
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportJob, setExportJob] = useState<ReportExportJob | null>(null);
  const activeCollectionView = meta[0] === 'collection' ? collectionView : 'invoice';
  const activeBalanceView = meta[0] === 'balance' ? balanceView : 'invoice';
  const activeReportView = meta[0] === 'collection' ? activeCollectionView : meta[0] === 'order' ? orderView : meta[0] === 'balance' ? activeBalanceView : 'invoice';
  const filters = () => `${meta[0] === 'balance' ? '' : `${from ? `from=${encodeURIComponent(from)}&` : ''}${to ? `to=${encodeURIComponent(to)}&` : ''}`}${search ? `search=${encodeURIComponent(search)}&` : ''}${meta[0] === 'collection' || meta[0] === 'order' || meta[0] === 'balance' ? `view=${activeReportView}&` : ''}${meta[0] === 'collection' && activeCollectionView === 'invoice' && paymentMethod ? `paymentMethod=${encodeURIComponent(paymentMethod)}&` : ''}`;
  const query = useQuery({ queryKey: ['laundry-report-detail', meta[0], from, to, search, paymentMethod, activeCollectionView, orderView, activeBalanceView, page, pageSize], enabled: !warehouseWorkLocked, queryFn: () => apiGet<Detail>(`/laundry/reports/${meta[0]}?${filters()}page=${page}&pageSize=${pageSize}`) });
  const chartQuery = useQuery({ queryKey: ['laundry-report-chart-detail', meta[0], chartRange.from, chartRange.to, paymentMethod], enabled: meta[0] !== 'customer-package' && !warehouseWorkLocked && (meta[0] !== 'consolidated-invoices' || Boolean(query.data?.totalRows)), queryFn: () => apiGet<ReportChart>(`/laundry/reports/${meta[0]}/chart?from=${chartRange.from}&to=${chartRange.to}${meta[0] === 'collection' && paymentMethod ? `&paymentMethod=${encodeURIComponent(paymentMethod)}` : ''}`) });
  const data = query.data;
  useEffect(() => { if (!exportJob || ['Completed', 'Failed', 'Expired'].includes(exportJob.status)) return; const timer = window.setInterval(() => { void apiGet<ReportExportJob>(`/laundry/report-exports/${exportJob.id}`).then((next) => { setExportJob(next); if (next.status === 'Completed') { setExportMessage(`Full export ready (${next.totalRows} rows). Starting CSV download…`); window.location.href = `/api/laundry/report-exports/${next.id}/download`; } else if (next.status === 'Failed' || next.status === 'Expired') setExportMessage(`Full export ${next.status.toLowerCase()}${next.error ? `: ${next.error}` : ''}.`); }).catch(() => undefined) }, 1000); return () => window.clearInterval(timer) }, [exportJob]);
  useEffect(() => {
    if (hasSavedDateRange) {
      setFrom(savedParams.get('from') || '');
      setTo(savedParams.get('to') || '');
    } else if (linkedPeriodRange) {
      setFrom(linkedPeriodRange.from);
      setTo(linkedPeriodRange.to);
    } else if (meta[0] === 'consolidated-invoices') {
      const range = reportPeriodRange('today');
      setFrom(range.from);
      setTo(range.to);
    } else if (['discount', 'expense'].includes(meta[0])) {
      const range = reportPeriodRange('week');
      setFrom(range.from);
      setTo(range.to);
    }
    setConsolidatedPeriod(defaultReportPeriod);
    setExportJob(null); setPaymentMethod(''); setCollectionView('invoice'); setOrderView('service'); setBalanceView('invoice'); setPage(1);
  }, [meta[0], savedParams, defaultReportPeriod, linkedPeriodRange?.from, linkedPeriodRange?.to]);
  const queueFullExport = async () => {
    if (!data || exportJob && ['Queued', 'Running'].includes(exportJob.status)) return;
    setExportMessage('Queueing full report export…');
    try { const job = await apiPost<ReportExportJob>('/laundry/report-exports', { kind: meta[0], view: activeReportView, from: meta[0] === 'balance' ? undefined : from || undefined, to: meta[0] === 'balance' ? undefined : to || undefined, search: search || undefined, paymentMethod: meta[0] === 'collection' && activeCollectionView === 'invoice' ? paymentMethod || undefined : undefined }); setExportJob(job); setExportMessage('Full export queued. This page will show when it is ready.'); }
    catch { setExportMessage('Full export could not be queued. Please retry.'); }
  };
  const download = async (all: boolean) => {
    if (!data || exporting) return;
    if (all && data.totalRows > 5000) {
      setExportMessage('Large report detected. Queueing a durable full export…');
      try { const job = await apiPost<ReportExportJob>('/laundry/report-exports', { kind: meta[0], view: activeReportView, from: meta[0] === 'balance' ? undefined : from || undefined, to: meta[0] === 'balance' ? undefined : to || undefined, search: search || undefined, paymentMethod: meta[0] === 'collection' && activeCollectionView === 'invoice' ? paymentMethod || undefined : undefined }); setExportJob(job); setExportMessage('Full export queued. The CSV download will start when processing completes.'); }
      catch { setExportMessage('Full export could not be queued. Please retry.'); }
      return;
    }
    setExporting(true); setExportMessage('');
    try {
      const exportData = all ? await apiGet<Detail & { exportAll: boolean }>(`/laundry/reports/${meta[0]}/export?${filters()}`) : data;
      await exportRows(meta[1], exportData);
      setExportMessage(all && exportData.exportTruncated ? `Exported first ${exportData.exportCap || 5000} of ${exportData.totalRows} rows.` : all ? `Exported ${exportData.totalRows} rows.` : 'Exported current page.');
    } catch { setExportMessage('Export failed. Please retry.'); }
    finally { setExporting(false); }
  };
  const downloadPdf = async () => {
    if (!data || pdfExporting) return;
    setPdfExporting(true); setExportMessage('Preparing the visible report page as PDF…');
    try {
      const period = meta[0] === 'balance' ? 'All outstanding balances' : `${data.from || 'All dates'}${data.to ? ` to ${data.to}` : ''}`;
      const contextParts = [period, `View: ${activeReportView}`, search ? `Search: ${search}` : '', meta[0] === 'collection' && activeCollectionView === 'invoice' && paymentMethod ? `Payment method: ${paymentMethod}` : ''].filter(Boolean);
      await downloadReportPdf({
        title: meta[1],
        context: contextParts.join(' · '),
        columns: data.columns.map(labelize),
        rows: data.rows.map((row) => data.columns.map((column) => formatCell(row[column], column))),
        summary: data.summary ? { label: data.summary.label, value: data.summary.format === 'currency' ? formatMoney(data.summary.value) : new Intl.NumberFormat('en-IN').format(data.summary.value) } : undefined,
        page: data.page,
        totalPages: data.totalPages,
        totalRows: data.totalRows,
      }, `epic-${meta[0]}-report-page-${data.page}-${localDateKey(new Date())}.pdf`);
      setExportMessage(`Downloaded page ${data.page} of ${data.totalPages} as PDF (${data.rows.length} rows).`);
    } catch {
      setExportMessage('PDF export failed. Please retry.');
    } finally {
      setPdfExporting(false);
    }
  };
 if (meta[0] === 'consolidated-invoices' && data && data.totalRows === 0) return <ConsolidatedInvoicesEmptyState from={from} to={to} period={consolidatedPeriod} onPeriodChange={setConsolidatedPeriod} onApply={(range) => { setFrom(range.from); setTo(range.to); setPage(1) }} />;
 return warehouseWorkLocked ? <WarehouseWorkReportLocked /> : <div className="report-print-page animate-in fade-in slide-in-from-bottom-2 duration-500"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><Link to="/laundry/reports" className="inline-flex items-center gap-1 text-xs font-bold text-[#39786f]"><ArrowLeft className="h-3.5 w-3.5" />Reports overview</Link><p className="mt-4 text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Epic report view</p><h1 className="mt-1 font-serif text-3xl text-[#17353c]">{meta[1]}</h1><p className="mt-1 text-sm text-[#718087]">{meta[0] === 'balance' ? 'Open invoice and package balances for the active store.' : 'Server-backed rows for the active store and selected date range.'}</p><p className="report-print-summary">Report period: {meta[0] === 'balance' ? 'All outstanding balances' : `${from || 'All dates'}${to ? ` to ${to}` : ''}`} · View: {activeReportView}{meta[0] === 'collection' && paymentMethod ? ` · Payment method: ${paymentMethod}` : ''}{search ? ` · Search: ${search}` : ''}</p></div><div className="report-print-toolbar flex flex-wrap items-end gap-2">{meta[0] === 'balance' ? null : <ReportDateFilter from={from} to={to} periodOptions={['discount', 'expense'].includes(meta[0]) ? ['week', 'month', 'quarter', 'year', 'custom'] : undefined} initialPeriod={defaultReportPeriod} selectedPeriod={meta[0] === 'consolidated-invoices' ? consolidatedPeriod : undefined} onSelectedPeriodChange={meta[0] === 'consolidated-invoices' ? setConsolidatedPeriod : undefined} onApply={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); setPage(1) }} onReset={() => { setFrom(''); setTo(''); setPaymentMethod(''); setPage(1) }} />}{meta[0] === 'collection' ? <label className="text-[10px] font-bold text-[#315d57]">Filter<select aria-label="Collection report view" value={activeCollectionView} onChange={(event) => { const view = event.target.value as 'invoice' | 'customer'; setCollectionView(view); setPage(1); setSearch(''); if (view === 'customer') setPaymentMethod('') }} className="ml-1 h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-semibold"><option value="invoice">Invoice</option><option value="customer">Customer</option></select></label> : null}{meta[0] === 'balance' ? <label className="text-[10px] font-bold text-[#315d57]">Filter<select aria-label="Balance report view" value={activeBalanceView} onChange={(event) => { setBalanceView(event.target.value as 'invoice' | 'customer'); setPage(1); setSearch('') }} className="ml-1 h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-semibold"><option value="invoice">Invoice</option><option value="customer">Customer</option></select></label> : null}{meta[0] === 'order' ? <label className="text-[10px] font-bold text-[#315d57]">Report View<select aria-label="Order report view" value={orderView} onChange={(event) => { setOrderView(event.target.value as 'service' | 'invoice'); setPage(1) }} className="ml-1 h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-semibold"><option value="service">Service Based</option><option value="invoice">Invoice Based</option></select></label> : null}{meta[0] === 'collection' && activeCollectionView === 'invoice' ? <label className="text-[10px] font-bold text-[#315d57]">Payment method<select aria-label="Payment method" value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setPage(1) }} className="ml-1 h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-semibold"><option value="">All methods</option>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label> : null}<input aria-label={meta[0] === 'balance' && activeBalanceView === 'customer' || meta[0] === 'collection' && activeCollectionView === 'customer' || meta[0] === 'customer' || meta[0] === 'customer-list' ? 'Search customer' : meta[0] === 'balance' ? 'Search invoice or customer' : meta[0] === 'collection' ? 'Search invoice or order' : 'Filter rows'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={meta[0] === 'balance' && activeBalanceView === 'customer' || meta[0] === 'collection' && activeCollectionView === 'customer' || meta[0] === 'customer' || meta[0] === 'customer-list' ? 'Search customer name or phone' : meta[0] === 'balance' ? 'Search invoice, order, customer or phone' : meta[0] === 'collection' ? 'Search invoice no or order no' : 'Filter rows'} className="h-9 w-40 rounded-lg border border-[#263f44]/15 bg-white px-3 text-xs" /><button type="button" onClick={() => query.refetch()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 text-xs font-bold text-[#315d57]"><RefreshCw className="h-3.5 w-3.5" />Refresh</button><button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 text-xs font-bold text-[#315d57]"><Printer className="h-3.5 w-3.5" />Print</button><button type="button" disabled={!data || exporting || pdfExporting} onClick={() => void downloadPdf()} title="Download the visible report page as a PDF" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 text-xs font-bold text-[#315d57] disabled:bg-[#d6dfda]"><FileDown className="h-3.5 w-3.5" />{pdfExporting ? 'Preparing PDF…' : 'Page PDF'}</button><button type="button" disabled={!data?.rows.length || exporting || pdfExporting} onClick={() => void download(false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-3 text-xs font-bold text-[#315d57] disabled:bg-[#d6dfda]"><Download className="h-3.5 w-3.5" />Page Excel</button><button type="button" disabled={!data?.totalRows || exporting || pdfExporting} onClick={() => void download(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#123039] px-3 text-xs font-bold text-white disabled:bg-[#a8b7b2]"><Download className="h-3.5 w-3.5" />{exporting ? 'Exporting…' : 'Export all'}</button></div></div>{exportMessage && <p className="mt-2 text-right text-xs font-semibold text-[#39786f]">{exportMessage}</p>}<div className="report-print-content mt-6 grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]"><nav className="h-fit rounded-[22px] border border-[#263f44]/10 bg-white p-2 shadow-[0_8px_28px_rgba(37,48,43,.04)]">{reports.map(([id, label]) => <Link key={id} to={`/laundry/reports/${id}`} className={`block rounded-xl px-3 py-2.5 text-xs font-semibold ${id === meta[0] ? 'bg-[#eaf3ef] text-[#205d55]' : 'text-[#617178] hover:bg-[#f5f7f3]'}`}>{label}</Link>)}</nav><section className="overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">{query.isLoading ? <div className="grid h-80 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#3a7d78]" /></div> : query.isError || !data ? <p className="p-8 text-center text-rose-700">This report could not be loaded.</p> : <><div className="flex items-center justify-between border-b border-[#263f44]/10 bg-[#fafaf7] px-5 py-4"><span className="text-xs text-[#617178]"><strong className="text-[#315d57]">{data.totalRows}</strong> rows · page {data.page} of {data.totalPages} · {meta[0] === 'balance' ? 'all outstanding balances' : `${data.from || 'all dates'}${data.to ? ` to ${data.to}` : ''}`}</span><span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#829092]">Current store data</span></div>{data.summary ? <div className="flex items-center justify-between border-b border-[#263f44]/10 bg-[#f4f8f5] px-5 py-4"><span className="text-xs font-semibold text-[#617178]">{data.summary.label}</span><strong className="text-lg tabular-nums text-[#17353c]">{data.summary.format === "currency" ? formatMoney(data.summary.value) : new Intl.NumberFormat("en-IN").format(data.summary.value)}</strong></div> : null}<div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#fbfbf8] text-[10px] font-bold uppercase tracking-[.13em] text-[#718087]"><tr>{data.columns.map((column) => <th key={column} className="px-4 py-3">{labelize(column)}</th>)}</tr></thead><tbody>{data.rows.length ? data.rows.map((row, index) => <tr key={index} className="border-t border-[#263f44]/8">{data.columns.map((column) => <td key={column} className="px-4 py-3.5 text-[#40565a]">{formatCell(row[column], column)}</td>)}</tr>) : <tr><td colSpan={Math.max(data.columns.length, 1)}><VisualEmptyState kind="finance" title="No rows in this view" detail={meta[0] === 'balance' ? 'Clear the search filter to see all open customer balances.' : 'Adjust the date range or clear the search filter to see authoritative records.'} /></td></tr>}</tbody></table></div><div className="report-table-pagination flex flex-wrap items-center justify-between gap-3 border-t border-[#263f44]/10 bg-[#fafaf7] px-5 py-3"><button type="button" disabled={data.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center gap-1 rounded-lg border border-[#263f44]/15 bg-white px-2.5 py-1.5 text-xs font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button><label className="inline-flex items-center gap-2 text-xs font-semibold text-[#617178]">Items per page<select aria-label="Items per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="h-8 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-semibold text-[#315d57]">{[10, 20, 50, 100, 500].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><span className="text-xs tabular-nums text-[#617178]">Page {data.page} of {data.totalPages}</span><button type="button" disabled={data.page >= data.totalPages} onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#263f44]/15 bg-white px-2.5 text-xs font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button></div></>}</section></div>{meta[0] === 'customer-package' ? null : <ReportTrendPanel title={meta[1]} range={chartRange} data={chartQuery.data} loading={chartQuery.isLoading} error={chartQuery.isError} onRangeChange={setChartRange} balanceReport={meta[0] === 'balance'} />}</div>
}

function parseReportPeriod(value: string | null): ReportPeriod | undefined {
  return value && ['today', 'yesterday', 'week', 'month', 'quarter', 'year', 'custom'].includes(value) ? value as ReportPeriod : undefined;
}

function ConsolidatedInvoicesEmptyState({ from, to, period, onPeriodChange, onApply }: { from: string; to: string; period: ReportPeriod; onPeriodChange: (period: ReportPeriod) => void; onApply: (range: { from: string; to: string }) => void }) {
  return <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
    <div><Link to="/laundry/reports" className="inline-flex items-center gap-1 text-xs font-bold text-[#39786f]"><ArrowLeft className="h-3.5 w-3.5" />Reports overview</Link><p className="mt-4 text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Invoice report</p><h1 className="mt-1 font-serif text-3xl text-[#17353c]">Consolidated Invoice Report</h1></div>
    <section className="rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]"><ReportDateFilter from={from} to={to} initialPeriod={period} selectedPeriod={period} onSelectedPeriodChange={onPeriodChange} applyLabel="Apply Filter" showReset={false} onApply={onApply} onReset={() => undefined} /></section>
    <section className="rounded-[22px] border border-[#263f44]/10 bg-white px-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]"><VisualEmptyState kind="finance" title="No Data Found" detail="No invoices match this date range. Choose another period or select a custom range." /></section>
  </div>
}

function WarehouseWorkReportLocked() {
  return <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
    <div><Link to="/laundry/reports" className="inline-flex items-center gap-1 text-xs font-bold text-[#39786f]"><ArrowLeft className="h-3.5 w-3.5" />Reports overview</Link><p className="mt-4 text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Operations report</p><h1 className="mt-1 font-serif text-3xl text-[#17353c]">Warehouse User Work Report</h1><p className="mt-1 text-sm text-[#718087]">Review work completed by a selected warehouse user.</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]"><label className="text-xs font-bold text-[#617178]">Select User<select aria-label="Select User" disabled className="mt-1.5 block h-10 min-w-64 rounded-xl border border-[#263f44]/15 bg-[#f7f8f5] px-3 text-sm font-semibold text-[#617178]"><option>Activation required</option></select></label><span className="text-xs text-[#718087]">User selection becomes available after activation.</span></div>
    <section className="rounded-[22px] border border-[#e7dfcb] bg-[#fffaf0] p-6 shadow-[0_8px_28px_rgba(37,48,43,.04)] md:p-8"><div className="mx-auto max-w-xl text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f5e8c9] text-[#855815]"><LockKeyhole className="h-6 w-6" /></span><h2 className="mt-4 font-serif text-2xl text-[#17353c]">This report needs activation</h2><p className="mt-2 text-sm leading-6 text-[#617178]">Warehouse User Work Report is locked for this store. Contact Us to activate it. Work activity and user details stay hidden until the report is enabled.</p><Link to="/laundry/settings" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#123039] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#205d55]"><LifeBuoy className="h-4 w-4" />Open support options</Link></div></section>
  </div>
}

function ReportTrendPanel({ title, range, data, loading, error, onRangeChange, balanceReport = false }: { title: string; range: ChartDateRange; data?: ReportChart; loading: boolean; error: boolean; onRangeChange: (range: ChartDateRange) => void; balanceReport?: boolean }) {
  const points = data?.points || []
  const maximum = Math.max(...points.map((point) => point.value), 1)
  const isDateChart = points.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.label))
  const minWidth = Math.max(540, points.length * (isDateChart ? 34 : 110))
  return <section aria-labelledby="report-trend-title" className="mt-5 rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)] md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#4d8982]">Trend chart</p><h2 id="report-trend-title" className="mt-1 font-serif text-xl text-[#17353c]">{title} by period</h2><p className="mt-1 text-xs text-[#718087]">{balanceReport ? 'The table shows every open balance; this chart can be narrowed by date.' : 'Chart dates are independent from the table’s Report By filter.'}</p></div><div className="flex flex-wrap items-center gap-3"><ReportChartPeriod onChange={onRangeChange} /><span className="rounded-full bg-[#eaf3ef] px-2.5 py-1 text-[11px] font-bold text-[#32695f]">{data ? `${shortChartDate(data.from)} – ${shortChartDate(data.to)}` : `${shortChartDate(range.from)} – ${shortChartDate(range.to)}`}</span></div></div>
    {error ? <p role="status" className="mt-5 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">Trend data could not be loaded. Refresh the page to retry.</p> : loading ? <div className="mt-5 grid h-44 place-items-center rounded-xl bg-[#fafbf8] text-xs text-[#718087]">Loading trend…</div> : points.length ? <div className="mt-5 overflow-x-auto pb-2"><div className="border-b border-[#263f44]/10" style={{ minWidth: `${minWidth}px` }}><div className="flex h-44 items-end gap-2" role="img" aria-label={`${title} ${data?.metric || 'records'} chart from ${range.from} to ${range.to}`}>
      {points.map((point) => <div key={point.label} title={`${point.label}: ${formatChartValue(point.value, data?.metric || '')}`} className="group flex h-full min-w-0 flex-1 items-end justify-center"><div className="w-3 rounded-t-md bg-[#8fc1b5] transition-colors group-hover:bg-[#6aa99b] sm:w-5" style={{ height: `${Math.max(3, point.value / maximum * 100)}%` }} /></div>)}
    </div><div className="mt-2 grid gap-2 text-center text-[10px] font-semibold text-[#7b8b8d]" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(${isDateChart ? 26 : 90}px, 1fr))` }}>{points.map((point) => <span key={point.label}>{isDateChart ? shortChartDate(point.label) : point.label}</span>)}</div></div></div> : <div className="mt-5 grid h-44 place-items-center rounded-xl bg-[#fafbf8] text-center text-xs text-[#718087]">No chart data is available for this report and date range.</div>}
    {data && points.length ? <p className="mt-3 text-[11px] font-semibold text-[#718087]">Measure: {data.metric}</p> : null}
  </section>
}

function labelize(value: string) { const labels: Record<string, string> = { invoiceNumber: 'Invoice No', orderNumber: 'Order No', orderDate: 'Order Date', amount: 'Amount (₹)', total: 'Total Amount (₹)', totalAmount: 'Total Amount (₹)', expenseAmount: 'Expense Amount (₹)', taxAmount: 'Tax Amount (₹)', amountBeforeTax: 'Amount Without Tax (₹)', discountAmount: 'Discount Amount (₹)', amountWithoutDiscount: 'Amount Without Discount (₹)', amountWithoutTax: 'Revenue Without Tax (₹)', title: 'Title', tax: 'Tax (₹)', totalGarments: 'Total Garments', garmentSummary: 'Garment Summary', serviceName: 'Service Name', customerName: 'Customer Name', paidInvoices: 'Total Paid Invoices', paidAmount: 'Total Paid Amount', revenue: 'Revenue (₹)', revenueWithoutTax: 'Revenue Without GST (₹)', visits: 'No of Times Visited', lastVisitedDate: 'Last Visited Date', daysSinceVisit: 'No Of Days Before', packageName: 'Package Name', packageAmount: 'Package Amount (₹)', invoiceAmount: 'Invoice Amount (₹)', balanceAmount: 'Balance Amount (₹)' }; return labels[value] || value.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase()) }
function formatCell(value: unknown, column: string) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'number' && /(amount|revenue|tax|discount|balance|value|expense|collected|grandtotal|^total$)/i.test(column)) return formatMoney(value); if (typeof value === 'object') return Array.isArray(value) ? value.join(', ') : JSON.stringify(value); return String(value) }
function shortChartDate(value: string) { return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`)) }
function formatChartValue(value: number, metric: string) { return /(amount|revenue|total|discount|tax|collected|expense)/i.test(metric) ? formatMoney(value) : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value) }
async function exportRows(title: string, data: Pick<Detail, 'rows'>) { const XLSX = await import('xlsx'); const sheet = XLSX.utils.json_to_sheet(data.rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, title.slice(0, 31)); XLSX.writeFile(workbook, `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true }) }
