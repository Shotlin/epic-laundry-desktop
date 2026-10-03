import { useQuery } from '@tanstack/react-query'
import { Activity, BarChart3, CalendarDays, CircleDollarSign, Cloud, RefreshCw, Sparkles, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { lndryBrand } from '@/assets/generated/manifest'
import { apiGet } from '@/lib/api'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'
import { cn, formatINR } from '@/lib/utils'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'
import ChartAccessibility from '@/components/laundry/ChartAccessibility'
import StatisticsRangeFilter, { currentStatisticsRange } from '@/components/laundry/StatisticsRangeFilter'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom' | 'lifetime'
type DateRange = { from: string; to: string }
type Filter = DateRange & { period: Period }
type Filters = { ordersReview: Filter; collection: Filter; customerFrequency: Filter; newCustomer: Filter }
type Statistics = {
  period: Period; from: string; to: string
  ranges: Record<keyof Filters, Filter>
  ordersReview: { total: number; breakdown: Array<{ state: string; count: number }>; daily: Array<{ date: string; orders: number; amount: number }> }
  revenue: { total: number; averageOrderValue: number }
  collection: { total: number; daily: Array<{ date: string; amount: number }> }
  customerFrequency: { total: number; repeatCustomers: number; breakdown: Array<{ customer: string; visits: number }> }
  newCustomer: { total: number; daily: Array<{ date: string; count: number }> }
  serviceMix: Array<{ service: string; quantity: number; amount: number }>
  // Real mobile-app (marketplace) orders for this period — pre-finalization
  // estimates, deliberately kept separate from the counter-only figures
  // above, same split Dashboard already shows.
  online: { count: number; estimatedRevenue: number; topGarments: Array<{ name: string; quantity: number; amount: number }> }
}

// Overview is a brand surface, not a second teal application. Keep comparison
// colours deliberately related to the Lndry violet mark, with semantic colours
// reserved for actual success/warning/error states elsewhere in the product.
const palette = ['#664CF0', '#8D79FF', '#A857D4', '#5138CF', '#2E75D6', '#187B5C']

export default function LaundryStatistics() {
  const [filters, setFilters] = useState<Filters>(() => ({
    ordersReview: { period: 'today', ...currentStatisticsRange('today') },
    collection: { period: 'week', ...currentStatisticsRange('week') },
    customerFrequency: { period: 'today', ...currentStatisticsRange('today') },
    newCustomer: { period: 'week', ...currentStatisticsRange('week') },
  }))
  const statistics = useQuery({
    queryKey: ['laundry-statistics', filters],
    queryFn: () => {
      const params = new URLSearchParams()
      for (const key of Object.keys(filters) as Array<keyof Filters>) {
        const filter = filters[key]
        params.set(`${key}Period`, filter.period)
        if (filter.period === 'custom') {
          params.set(`${key}From`, filter.from)
          params.set(`${key}To`, filter.to)
        }
      }
      return apiGet<Statistics>(`/laundry/statistics?${params.toString()}`)
    },
  })
  const data = statistics.data
  const trend = useMemo(() => {
    if (!data) return []
    return data.ordersReview.daily.map((row) => ({ date: shortDate(row.date), orders: row.orders, revenue: row.amount }))
  }, [data])
  const trendSummary = useMemo(() => {
    const revenue = trend.reduce((total, row) => total + row.revenue, 0)
    const orders = trend.reduce((total, row) => total + row.orders, 0)
    return `${rangeLabelFor(filters.ordersReview.period)}: ${orders} orders and ${formatINR(revenue)} booked revenue across ${trend.length} days.`
  }, [filters.ordersReview.period, trend])
  if (statistics.isLoading) return <VisualLoadingState title="Preparing business overview" detail="Building truthful trends from posted orders, collections and customer records." />
  if (statistics.isError || !data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">Statistics could not be loaded.</div>

  const rangeLabel = rangeLabelFor(filters.ordersReview.period)
  const serviceSummary = data.serviceMix.length ? `${data.serviceMix.slice(0, 8).map((row) => `${row.service}: ${formatINR(row.amount)} from ${row.quantity} item(s)`).join(', ')}.` : 'No service demand records are available for this period.'
  const statCards = [
    { label: 'Revenue', value: formatINR(data.revenue.total), hint: 'Booked order value', icon: CircleDollarSign, tone: 'violet' as const },
    { label: 'Orders', value: String(data.ordersReview.total), hint: `${rangeLabel} bookings`, icon: BarChart3, tone: 'blue' as const },
    { label: 'Collections', value: formatINR(data.collection.total), hint: `${rangeLabelFor(filters.collection.period)} receipts`, icon: CalendarDays, tone: 'mint' as const },
    { label: 'Avg. order', value: formatINR(data.revenue.averageOrderValue), hint: 'Revenue per order', icon: Activity, tone: 'amber' as const },
    { label: 'Customers', value: String(data.customerFrequency.total), hint: `${data.customerFrequency.repeatCustomers} repeat · ${rangeLabelFor(filters.customerFrequency.period)}`, icon: UsersRound, tone: 'rose' as const },
    { label: 'New customers', value: String(data.newCustomer.total), hint: `${rangeLabelFor(filters.newCustomer.period)} profiles`, icon: UsersRound, tone: 'indigo' as const },
  ]
  return <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
    <div className="rounded-[26px] border border-brand-400/25 bg-[radial-gradient(ellipse_at_85%_0%,rgba(141,121,255,.42),transparent_44%),linear-gradient(135deg,#1d124b_0%,#2c1c70_58%,#5138cf_145%)] p-6 text-white shadow-[0_18px_45px_rgba(45,28,112,.24)] md:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/95 p-2 shadow-lg shadow-brand-950/20"><img src={lndryBrand.mark} alt="Lndry" className="h-full w-full object-contain" /></div><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-brand-200">Laundry intelligence</p><h1 className="mt-1 font-serif text-3xl md:text-4xl">Overview</h1><p className="mt-2 max-w-xl text-sm text-white/75">A live pulse of orders, revenue, collections, customers and garment demand.</p></div></div>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-brand-100/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85">Four independent date views</span><button type="button" onClick={() => void statistics.refetch()} className="grid h-10 w-10 place-items-center rounded-xl border border-brand-100/25 bg-white/10 text-white hover:bg-white/20" aria-label="Refresh statistics"><RefreshCw className="h-4 w-4" /></button></div>
      </div>
      <div className="mt-7 flex flex-wrap items-center gap-3 text-xs text-white/70"><span className="inline-flex items-center gap-2 rounded-full border border-brand-100/15 bg-white/10 px-3 py-1.5"><Sparkles className="h-3.5 w-3.5 text-brand-200" />Live from your posted records</span><span>Orders: {rangeLabelFor(filters.ordersReview.period)}</span><span>Collections: {rangeLabelFor(filters.collection.period)}</span><span>Customer frequency: {rangeLabelFor(filters.customerFrequency.period)}</span><span>New customers: {rangeLabelFor(filters.newCustomer.period)}</span><span className="hidden sm:inline">·</span><span>Updated just now</span></div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{statCards.map((card) => <StatCard key={card.label} {...card} />)}</div>

    <section data-metric-analytics-board className="grid gap-5 xl:grid-cols-3">
      <div data-metric-analytics><Panel eyebrow="Orders review" title="Revenue performance" action={<StatisticsRangeFilter label="Orders Review" period={filters.ordersReview.period as Exclude<Period, 'lifetime'>} options={['today', 'yesterday', 'week', 'month', 'year', 'custom']} range={data.ranges.ordersReview} onChange={(period, range) => setFilters((current) => ({ ...current, ordersReview: { period, ...range } }))} />}><TrendChart label="Revenue performance" data={trend.map((row) => ({ date: row.date, value: row.revenue }))} currency color="#664CF0" /></Panel></div>
      <div data-metric-analytics><Panel eyebrow="Orders review" title="Order volume" action={<RangeChip label={rangeLabelFor(filters.ordersReview.period)} />}><MetricBarChart label="Order volume" data={trend.map((row) => ({ date: row.date, value: row.orders }))} color="#287fde" /></Panel></div>
      <div data-metric-analytics><Panel eyebrow="Collection" title="Collection trend" action={<StatisticsRangeFilter label="Collection" period={filters.collection.period as Exclude<Period, 'lifetime'>} options={['week', 'month', 'quarter', 'year', 'custom']} range={data.ranges.collection} onChange={(period, range) => setFilters((current) => ({ ...current, collection: { period, ...range } }))} />}><TrendChart label="Collection trend" data={data.collection.daily.map((row) => ({ date: shortDate(row.date), value: row.amount }))} currency color="#159b89" /></Panel></div>
      <div data-metric-analytics><Panel eyebrow="Orders review" title="Average order value" action={<RangeChip label={rangeLabelFor(filters.ordersReview.period)} />}><TrendChart label="Average order value" data={trend.map((row) => ({ date: row.date, value: row.orders ? Math.round(row.revenue / row.orders) : 0 }))} currency color="#dc9019" /></Panel></div>
      <div data-metric-analytics><Panel eyebrow="Customer frequency" title="Customer base" action={<StatisticsRangeFilter label="Customer Frequency" period={filters.customerFrequency.period as Exclude<Period, 'lifetime'>} options={['today', 'yesterday', 'week', 'month', 'year', 'custom']} range={data.ranges.customerFrequency} onChange={(period, range) => setFilters((current) => ({ ...current, customerFrequency: { period, ...range } }))} />}><div className="space-y-3"><Donut rows={[{ name: 'Repeat customers', value: data.customerFrequency.repeatCustomers }, { name: 'First-time customers', value: Math.max(0, data.customerFrequency.total - data.customerFrequency.repeatCustomers) }]} /><Legend rows={[{ name: 'Repeat customers', value: data.customerFrequency.repeatCustomers }, { name: 'First-time customers', value: Math.max(0, data.customerFrequency.total - data.customerFrequency.repeatCustomers) }]} /></div></Panel></div>
      <div data-metric-analytics><Panel eyebrow="New customer" title="New customer acquisition" action={<StatisticsRangeFilter label="New Customer" period={filters.newCustomer.period as Exclude<Period, 'lifetime'>} options={['week', 'month', 'quarter', 'year', 'custom']} range={data.ranges.newCustomer} onChange={(period, range) => setFilters((current) => ({ ...current, newCustomer: { period, ...range } }))} />}><TrendChart label="New customer acquisition" data={data.newCustomer.daily.map((row) => ({ date: shortDate(row.date), value: row.count }))} color="#5965db" /></Panel></div>
    </section>

    <section data-executive-chart-board className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,.9fr)_minmax(280px,.9fr)]">
      <div data-executive-chart>
        <Panel eyebrow="Orders Review" title="Booked orders and value" action={<RangeChip label={rangeLabelFor(filters.ordersReview.period)} />}><ChartAccessibility label="Booked order value and order count by day" summary={trendSummary} className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={trend} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}><defs><linearGradient id="overview-revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#664CF0" stopOpacity={0.34} /><stop offset="100%" stopColor="#664CF0" stopOpacity={0.03} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ece8fb" /><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7b8b8d' }} axisLine={false} tickLine={false} /><YAxis yAxisId="money" tick={{ fontSize: 10, fill: '#7b8b8d' }} axisLine={false} tickLine={false} tickFormatter={(value) => `₹${value}`} /><YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 10, fill: '#7b8b8d' }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip content={<PerformanceTooltip />} /><Area yAxisId="money" type="monotone" dataKey="revenue" name="Revenue" stroke="#664CF0" strokeWidth={2.5} fill="url(#overview-revenue)" /><Bar yAxisId="orders" dataKey="orders" name="Orders" fill="#241A45" radius={[4, 4, 0, 0]} barSize={14} /></ComposedChart></ResponsiveContainer></ChartAccessibility><div className="mt-3 flex flex-wrap gap-4 text-xs text-[#718087]"><LegendDot color="#664CF0" label="Booked value" /><LegendDot color="#241A45" label="Orders" /></div></Panel>
      </div>
      <div data-executive-chart>
        <Panel eyebrow="Orders review" title="Lifecycle mix"><div className="space-y-3"><Donut rows={data.ordersReview.breakdown.map((row) => ({ name: row.state, value: row.count }))} /><Legend rows={data.ordersReview.breakdown.map((row) => ({ name: row.state, value: row.count }))} /></div></Panel>
      </div>
      <div data-executive-chart>
        <Panel eyebrow="Customer frequency" title="Visits by customer" action={<RangeChip label={rangeLabelFor(filters.customerFrequency.period)} />}><div className="space-y-3"><Donut rows={data.customerFrequency.breakdown.slice(0, 6).map((row) => ({ name: row.customer, value: row.visits }))} /><Legend rows={data.customerFrequency.breakdown.slice(0, 6).map((row) => ({ name: row.customer, value: row.visits }))} /></div></Panel>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-3">
      <Panel eyebrow="Marketplace" title="Online orders (mobile app)" action={<span className="inline-flex items-center gap-1.5 text-xs text-[#718087]"><Cloud className="h-3.5 w-3.5 text-brand-600" />{rangeLabel}</span>}>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-brand-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-brand-700">Orders</p><p className="mt-1 font-serif text-2xl text-[#17353c]">{data.online.count}</p></div><div className="rounded-2xl bg-brand-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-brand-700">Revenue (est.)</p><p className="mt-1 font-serif text-2xl text-[#17353c]">{formatINR(data.online.estimatedRevenue)}</p></div></div>
        <p className="mt-2 text-[11px] text-[#8b959a]">Pre-reconciliation estimate from real pulled orders — kept separate from the counter revenue above.</p>
        <div className="mt-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.13em] text-[#718087]">Top online garments</p><Legend rows={data.online.topGarments.map((row) => ({ name: row.name, value: row.amount }))} /></div>
      </Panel>
      <Panel eyebrow="Garment services" title="Service demand">{data.serviceMix.length ? <ChartAccessibility label="Revenue by laundry service" summary={serviceSummary} className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.serviceMix.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 8, left: 12, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#ece8fb" /><XAxis type="number" hide /><YAxis type="category" dataKey="service" width={92} tick={{ fontSize: 10, fill: '#5e7074' }} axisLine={false} tickLine={false} /><Tooltip formatter={(value: unknown) => formatINR(Number(value || 0))} /><Bar dataKey="amount" name="Revenue" fill="#664CF0" radius={[0, 5, 5, 0]} barSize={18}>{data.serviceMix.slice(0, 8).map((_, index) => <Cell key={index} fill={palette[index % palette.length]} />)}</Bar></BarChart></ResponsiveContainer></ChartAccessibility> : <VisualEmptyState kind="operations" compact title="No service sales in this range" detail="Choose another order period or book a service to see its demand." />}</Panel>
    </div>
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-xs text-[#5e7074] sm:flex-row sm:items-center sm:justify-between"><span><strong className="text-[#17353c]">Overview is powered by posted store records.</strong> Use Reports for invoice, balance, pickup and captain-level drill-downs.</span><Link to="/laundry/reports" className="font-bold text-brand-600 hover:text-brand-700">Open reports →</Link></div>
  </div>
}

type StatTone = 'violet' | 'blue' | 'mint' | 'amber' | 'rose' | 'indigo'
const statToneClass: Record<StatTone, string> = {
  violet: 'from-[#5138cf] via-[#664cf0] to-[#967fff]', blue: 'from-[#1169c7] via-[#287fde] to-[#62a6ef]',
  mint: 'from-[#087c70] via-[#159b89] to-[#58c8ad]', amber: 'from-[#b86a08] via-[#dc9019] to-[#f2bd4e]',
  rose: 'from-[#b63479] via-[#d65498] to-[#ef91bd]', indigo: 'from-[#3843b8] via-[#5965db] to-[#8994f0]',
}
function StatCard({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint: string; icon: typeof BarChart3; tone: StatTone }) {
  return <section data-stat-card className={cn('relative min-h-44 overflow-hidden rounded-[20px] bg-gradient-to-br p-4 text-white shadow-[0_14px_28px_rgba(52,41,95,.18)]', statToneClass[tone])}>
    <div className="absolute -right-7 -top-7 h-28 w-28 rounded-full bg-white/10" /><div className="relative flex items-start justify-between gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/18 text-white shadow-sm"><Icon className="h-4 w-4" /></div></div>
    <p className="relative mt-4 text-[10px] font-bold uppercase tracking-[.13em] text-white/75">{label}</p><p className="relative mt-1 truncate font-serif text-2xl text-white">{value}</p><p className="relative mt-1 text-[11px] text-white/80">{hint}</p>
  </section>
}
function Panel({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: ReactNode; children: ReactNode }) { return <section className="rounded-[22px] border border-brand-900/8 bg-white p-5 shadow-[0_8px_28px_rgba(52,41,95,.06)] md:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">{eyebrow}</p><h2 className="mt-1 font-serif text-2xl text-[#17353c]">{title}</h2></div>{action}</div><div className="mt-5">{children}</div></section> }
function RangeChip({ label }: { label: string }) { return <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-brand-700">{label}</span> }
function Donut({ rows }: { rows: Array<{ name: string; value: number }> }) {
  const positiveRows = rows.filter((row) => row.value > 0)
  const chartRows = positiveRows.length ? positiveRows : [{ name: 'No data', value: 1 }]
  const total = chartRows.reduce((sum, row) => sum + row.value, 0)
  let start = 0
  const slices = chartRows.map((row, index) => {
    const end = start + (row.value / total) * 100
    const slice = `${positiveRows.length ? palette[index % palette.length] : '#e3ddff'} ${start}% ${end}%`
    start = end
    return slice
  })
  const summary = rows.length ? `${rows.map((row) => `${row.name}: ${row.value}`).join(', ')}.` : 'No records are available for this period.'
  return <ChartAccessibility label="Distribution chart" summary={summary} className="h-44"><div className="grid h-full place-items-center"><div data-donut-ring aria-hidden="true" className="grid h-36 w-36 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(38,28,97,.08),0_10px_24px_rgba(81,56,207,.16)]" style={{ background: `conic-gradient(${slices.join(', ')})` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-sm"><strong className="font-serif text-2xl text-[#2d1f59]">{positiveRows.length ? total : '—'}</strong><span className="text-[9px] font-bold uppercase tracking-[.12em] text-[#718087]">{positiveRows.length === 1 ? positiveRows[0].name : positiveRows.length ? 'records' : 'No data'}</span></div></div></div></ChartAccessibility>
}
function Legend({ rows }: { rows: Array<{ name: string; value: number }> }) { return <div className="space-y-2">{rows.length ? rows.map((row, index) => <div key={row.name} className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2 text-[#4c6268]"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} /><span className="truncate">{row.name}</span></span><strong className="tabular-nums text-[#17353c]">{row.value}</strong></div>) : <VisualEmptyState kind="operations" compact title="No records in this period" detail="Choose another period or complete a booking to build the overview." />}</div> }
function TrendChart({ label, data, currency = false, color = '#664CF0' }: { label: string; data: Array<{ date: string; value: number }>; currency?: boolean; color?: string }) {
  const total = data.reduce((sum, row) => sum + row.value, 0)
  const peak = data.reduce((best, row) => row.value > best.value ? row : best, data[0] || { date: 'none', value: 0 })
  const summary = data.length ? `${data.length} points, total ${currency ? formatINR(total) : total}, highest ${currency ? formatINR(peak.value) : peak.value} on ${peak.date}.` : 'No records are available for this period.'
  const gradientId = `stat-fill-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  if (!data.length || data.every((point) => point.value === 0)) return <ChartAccessibility label={label} summary={summary} className="grid h-52 place-items-center"><div className="text-center"><p className="font-serif text-2xl text-[#2d1f59]">No activity yet</p><p className="mt-2 text-sm text-[#718087]">Try a wider date range to see the trend.</p></div></ChartAccessibility>
  if (data.length === 1) return <ChartAccessibility label={label} summary={summary} className="flex h-52 flex-col justify-between rounded-2xl bg-[#f8f7fd] p-4"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#718087]">{data[0].date}</p><p className="mt-2 font-serif text-3xl tabular-nums text-[#2d1f59]">{currency ? formatINR(data[0].value) : data[0].value}</p><p className="mt-1 text-xs text-[#718087]">One day selected</p></div><div className="h-4 overflow-hidden rounded-full bg-white"><div className="h-full w-full rounded-full" style={{ backgroundColor: color }} /></div></ChartAccessibility>
  return <ChartAccessibility label={label} summary={summary} className="h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.28} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7b8b8d' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: '#7b8b8d' }} axisLine={false} tickLine={false} tickFormatter={(value) => currency ? `₹${value}` : value} /><Tooltip formatter={(value: unknown) => currency ? formatINR(Number(value || 0)) : String(value ?? 0)} /><Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} /></AreaChart></ResponsiveContainer></ChartAccessibility>
}
function MetricBarChart({ label, data, color }: { label: string; data: Array<{ date: string; value: number }>; color: string }) {
  const summary = data.length ? `${data.map((row) => `${row.date}: ${row.value}`).join(', ')}.` : 'No records are available for this period.'
  return <ChartAccessibility label={label} summary={summary} className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#ece8fb" /><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7b8b8d' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#7b8b8d' }} axisLine={false} tickLine={false} /><Tooltip formatter={(value: unknown) => [String(value ?? 0), 'Orders']} /><Bar dataKey="value" name="Orders" fill={color} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></ChartAccessibility>
}
function PerformanceTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) { if (!active || !payload?.length) return null; return <div className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs shadow-lg shadow-brand-900/10"><p className="mb-1 font-bold text-[#17353c]">{label}</p>{payload.map((item) => <p key={item.name} className="flex justify-between gap-4 text-[#5e7074]"><span>{item.name}</span><strong style={{ color: item.color }}>{item.name === 'Orders' ? item.value : formatINR(Number(item.value || 0))}</strong></p>)}</div> }
function LegendDot({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span> }
function shortDate(value: string) { return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`)) }
function rangeLabelFor(period: Period) {
  if (period === 'today') return 'Today'
  if (period === 'yesterday') return 'Yesterday'
  if (period === 'week') return 'Week'
  if (period === 'month') return 'Month'
  if (period === 'quarter') return 'Quarter'
  if (period === 'year') return 'Year'
  if (period === 'custom') return 'Custom range'
  return 'Lifetime'
}
