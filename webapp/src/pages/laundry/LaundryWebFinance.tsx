import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, Banknote, CircleDollarSign, Globe2, Landmark, PlugZap, ReceiptText, Store, Users, WalletCards } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiGet } from '@/lib/api'
import { formatMoney } from '@/lib/utils'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'
import { FinanceFilterBar, channelName, useFinanceFilters } from '@/components/laundry/FinanceFilters'

/**
 * Finance & compliance (website). Every figure comes from the backend finance report for the signed-in
 * business — persisted orders, payments, expenses and settlement records — for the chosen channel and
 * period. Nothing here is calculated from anything but what the report returns.
 */

type Kpis = Record<string, number>
type Report = {
  period: { from: string; to: string; days: number }
  requestedChannel: 'ALL' | 'POS' | 'ONLINE'
  channel: 'ALL' | 'POS' | 'ONLINE'
  marketplace: { connected: boolean; reason?: string | null; published: boolean; commissionRatePercent: number | null }
  notice: string | null
  summary: (Kpis & { netRevenuePaise: number; netCashPaise: number }) | null
  channels: Array<Kpis & { channel: 'POS' | 'LNDRY_ONLINE'; netRevenuePaise: number; netCashPaise: number }>
  trend: Array<{ date: string; orders: number; netSalesPaise: number; collectedPaise: number; expensesPaise: number; refundsPaise: number; netSalesByChannel: Record<string, number> }>
  payments: Array<{ mode: string; label: string; amountPaise: number; count: number; byChannel: Record<string, number> }>
  topItems: Array<{ name: string; amountPaise: number; orders: number }>
  expenses: { totalPaise: number; byCategory: Array<{ category: string; amountPaise: number; count: number }> } | null
  pos: any
  online: any
  integrity: { mirroredOrdersExcluded: number; note: string } | null
}

const m = (paise?: number) => formatMoney((Number(paise) || 0) / 100)
const shortDate = (value: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`))
const compact = (paise: number) => { const rupees = paise / 100; return rupees >= 100000 ? `₹${(rupees / 100000).toFixed(1)}L` : rupees >= 1000 ? `₹${Math.round(rupees / 1000)}k` : `₹${Math.round(rupees)}` }
const label = (text: string) => text.charAt(0) + text.slice(1).toLowerCase().replace(/_/g, ' ')

export default function LaundryWebFinance() {
  const filters = useFinanceFilters()
  const { channel, from, to } = filters
  const query = useQuery({
    queryKey: ['finance-web-overview', from, to, channel],
    queryFn: () => apiGet<Report>(`/finance/web-overview?from=${from}&to=${to}&channel=${channel}`),
    staleTime: 15_000,
  })
  const data = query.data
  const connected = data ? data.marketplace.connected : true
  // A saved Online / All choice cannot apply to a business that is not on LNDRY: fall back to the counter.
  useEffect(() => { if (data && !data.marketplace.connected && channel !== 'POS') filters.setChannel('POS') }, [data, channel]) // eslint-disable-line react-hooks/exhaustive-deps

  const header = <header className="relative overflow-hidden rounded-[28px] border border-[#193b42]/10 bg-[#664cf0] px-5 py-6 text-white shadow-[0_18px_48px_rgba(81,56,207,.23)] md:px-7">
    <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full border-[42px] border-white/10" />
    <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#e5e0ff]">Finance & compliance</p>
        <h1 className="mt-2 max-w-2xl font-display text-3xl font-extrabold tracking-[-.04em] md:text-4xl">Every rupee, from your own records.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#eeeaff]">Sales, GST, discounts, collections, refunds and expenses — read from orders, payments and invoices saved for this business. No estimates, no sample data.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-extrabold" data-testid="finance-channel-badge">{channelName(data?.channel || channel)}</span>
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">{shortDate(from)} – {shortDate(to)}</span>
        <Link to="/laundry/finance/statutory" className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-[#5138cf]">GST & statutory →</Link>
      </div>
    </div>
    <FinanceFilterBar filters={filters} marketplace={data?.marketplace} />
  </header>

  if (query.isLoading) return <main>{header}<div className="mt-5"><VisualLoadingState title="Preparing your finance report" detail="Reading orders, payments, expenses and settlement records for this business." icon={Landmark} /></div></main>
  if (query.error || !data) {
    return <main>{header}<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800"><AlertTriangle className="h-5 w-5" /><p className="mt-3 font-bold">Finance report unavailable</p><p className="mt-1 text-sm">{query.error instanceof Error ? query.error.message : 'The finance report could not load.'}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 rounded-xl bg-[#123039] px-3 py-2 text-xs font-bold text-white">Try again</button></div></main>
  }

  const s = data.summary
  const showPos = data.channel !== 'ONLINE'
  const showOnline = data.channel !== 'POS' && connected
  const both = data.channels.length > 1
  const chartRows = data.trend.map((point) => ({ ...point, pos: point.netSalesByChannel.POS || 0, online: point.netSalesByChannel.LNDRY_ONLINE || 0 }))

  return <main className="animate-in fade-in slide-in-from-bottom-2 space-y-5 pb-10 duration-500">
    {header}
    {!connected ? <div className="flex items-start gap-3 rounded-2xl border border-[#d9d2ff] bg-[#f6f3ff] p-4 text-sm text-[#4b3aa8]" data-testid="online-not-connected"><PlugZap className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-extrabold">LNDRY Online is not connected for this business.</p><p className="mt-0.5 text-xs leading-5 text-[#6a5cc0]">Finance below is your complete counter (POS) business. Online and All become available once this business is approved as an LNDRY marketplace vendor.</p></div></div> : null}

    {s ? <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Key figures">
        <Metric icon={ReceiptText} label="Orders" value={String(s.orderCount)} hint={s.cancelledOrderCount ? `${s.cancelledOrderCount} cancelled, not counted` : 'Cancelled orders are not counted'} />
        <Metric icon={CircleDollarSign} label="Net sales" value={m(s.netSalesPaise)} hint="Before GST, after discounts" />
        <Metric icon={Landmark} label="GST collected" value={m(s.gstPaise)} hint="As charged on each order" />
        <Metric icon={Banknote} label="Amount collected" value={m(s.collectedPaise)} hint="Payments received in the period" />
        <Metric icon={ReceiptText} label="Outstanding" value={m(s.outstandingPaise)} hint="Unpaid on orders in the period" tone={s.outstandingPaise > 0 ? 'watch' : undefined} />
        <Metric icon={ArrowDownRight} label="Refunds" value={m(s.refundsPaise)} hint={`${m(s.refundsOnSalesPaise)} against counted sales`} />
        <Metric icon={WalletCards} label="Expenses" value={m(s.expensesPaise)} hint={showPos ? 'Store expenses paid' : 'Store expenses sit with the counter'} />
        <Metric icon={CircleDollarSign} label="Net revenue" value={m(s.netRevenuePaise)} hint="Net sales − refunds on those sales" />
        <Metric icon={Banknote} label="Net cash movement" value={m(s.netCashPaise)} hint="Collected − refunds − expenses" tone={s.netCashPaise < 0 ? 'watch' : undefined} />
        <Metric icon={ReceiptText} label="Total billed" value={m(s.totalBilledPaise)} hint="Grand total incl. GST" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.9fr)]">
        <Panel eyebrow="Trend" title="Sales, collections and expenses by day">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e9efec" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: '#718087' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: '#718087' }} axisLine={false} tickLine={false} />
                <Tooltip content={<MoneyTooltip />} />
                {showPos ? <Bar dataKey="pos" name="POS net sales" stackId="s" fill="#664cf0" /> : null}
                {showOnline ? <Bar dataKey="online" name="LNDRY online net sales" stackId="s" fill="#2d7b72" radius={[4, 4, 0, 0]} /> : null}
                <Line type="monotone" dataKey="collectedPaise" name="Collected" stroke="#d88a22" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expensesPaise" name="Expenses" stroke="#d46259" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="sr-only">{`${chartRows.length}-day trend: ${m(s.netSalesPaise)} net sales, ${m(s.collectedPaise)} collected, ${m(s.expensesPaise)} expenses.`}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#718087]">
            {showPos ? <Dot color="#664cf0" text="POS net sales" /> : null}{showOnline ? <Dot color="#2d7b72" text="LNDRY online net sales" /> : null}<Dot color="#d88a22" text="Collected" /><Dot color="#d46259" text="Expenses" />
          </div>
        </Panel>

        <Panel eyebrow="How the bill builds up" title="From sales to grand total">
          <dl className="space-y-2.5 text-sm">
            <Line2 label="Gross sales" value={m(s.subtotalPaise)} />
            {s.additionalChargesPaise ? <Line2 label="+ Additional charges" value={m(s.additionalChargesPaise)} /> : null}
            {s.discountsPaise ? <Line2 label="− Discounts" value={`− ${m(s.discountsPaise)}`} /> : null}
            <Line2 label="Net sales" value={m(s.netSalesPaise)} strong />
            <Line2 label="+ GST" value={m(s.gstPaise)} />
            {s.otherAdjustmentsPaise ? <Line2 label="± Rounding / other" value={m(s.otherAdjustmentsPaise)} /> : null}
            <Line2 label="Total billed" value={m(s.totalBilledPaise)} strong />
          </dl>
          <p className="mt-4 rounded-xl bg-[#f4f8f5] p-3 text-xs leading-5 text-[#617178]">These are the same lines shown on the order, the receipt and the invoice. Additional charges on online orders are delivery, platform and express fees.</p>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel eyebrow="Collections" title="How customers paid">
          {data.payments.length ? <ul className="space-y-3">
            {data.payments.map((item) => { const max = data.payments[0].amountPaise || 1; return <li key={item.mode}>
              <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-bold text-[#17353c]">{item.label}</span><span className="tabular-nums font-bold text-[#17353c]">{m(item.amountPaise)}</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#edf2ef]"><div className="h-full rounded-full bg-[#664cf0]" style={{ width: `${Math.max(2, (item.amountPaise / max) * 100)}%` }} /></div>
              <p className="mt-1 text-[11px] text-[#718087]">{item.count} payment{item.count === 1 ? '' : 's'}{both ? ` · POS ${m(item.byChannel.POS)} · Online ${m(item.byChannel.LNDRY_ONLINE)}` : ''}{item.mode === 'WALLET' ? ' · paid from the customer\'s LNDRY wallet' : ''}{item.mode === 'ONLINE' ? ' · collected by LNDRY, settled to you' : ''}</p>
            </li> })}
          </ul> : <Empty text="No payments were recorded in this period." />}
        </Panel>

        {both && s ? <Panel eyebrow="Channels" title="Offline vs online, side by side">
          <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-sm">
            <thead><tr className="text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-[#718087]"><th className="pb-2">&nbsp;</th><th className="pb-2 text-right">Offline / POS</th><th className="pb-2 text-right">Online / LNDRY</th><th className="pb-2 text-right">Total</th></tr></thead>
            <tbody className="tabular-nums">
              {([['Orders', 'orderCount', true], ['Net sales', 'netSalesPaise'], ['GST', 'gstPaise'], ['Discounts', 'discountsPaise'], ['Collected', 'collectedPaise'], ['Refunds', 'refundsPaise'], ['Outstanding', 'outstandingPaise'], ['Expenses', 'expensesPaise'], ['Net cash', 'netCashPaise']] as Array<[string, string, boolean?]>).map(([name, key, plain]) => {
                const pos = data.channels.find((c) => c.channel === 'POS'), online = data.channels.find((c) => c.channel === 'LNDRY_ONLINE')
                const fmt = (value?: number) => (plain ? String(value ?? 0) : m(value))
                return <tr key={key} className="border-t border-[#e8edef]"><td className="py-2 font-semibold text-[#52676c]">{name}</td><td className="py-2 text-right">{fmt(pos?.[key])}</td><td className="py-2 text-right">{fmt(online?.[key])}</td><td className="py-2 text-right font-bold text-[#17353c]">{fmt(s[key])}</td></tr>
              })}
            </tbody>
          </table></div>
          <p className="mt-3 text-[11px] leading-5 text-[#718087]">An order lives in exactly one channel, so the total is a plain sum — nothing is counted twice. Store expenses belong to the counter.</p>
        </Panel> : <Panel eyebrow="Top services" title="What earned the most">
          <TopItems items={data.topItems} />
        </Panel>}
      </section>

      {both ? <Panel eyebrow="Top services" title="What earned the most"><TopItems items={data.topItems} /></Panel> : null}

      {showPos && data.pos ? <section className="grid gap-5 xl:grid-cols-3" aria-label="Offline / POS">
        <Panel eyebrow="Offline / POS" title="Expenses by category" action={<Link to="/laundry/expenses" className="text-xs font-bold text-[#277267]">Store expenses →</Link>}>
          {data.expenses?.byCategory.length ? <ul className="space-y-2">{data.expenses.byCategory.map((row) => <li key={row.category} className="flex justify-between gap-3 text-sm"><span className="text-[#52676c]">{label(row.category)} <span className="text-[11px] text-[#9aa6ab]">· {row.count}</span></span><strong className="tabular-nums text-[#17353c]">{m(row.amountPaise)}</strong></li>)}</ul> : <Empty text="No expenses recorded in this period." />}
        </Panel>
        <Panel eyebrow="Offline / POS" title="Cash closing" action={<Link to="/laundry/cash-closing" className="text-xs font-bold text-[#277267]">Cash closing →</Link>}>
          <dl className="space-y-2 text-sm">
            <Line2 label="Shifts closed" value={String(data.pos.cashClosing.shiftsClosed)} />
            <Line2 label="Net cash variance" value={m(data.pos.cashClosing.totalVariancePaise)} />
            <Line2 label="Open registers" value={String(data.pos.cashClosing.openShifts.length)} />
          </dl>
          {data.pos.cashClosing.recent.length ? <ul className="mt-3 space-y-1.5 border-t border-[#e8edef] pt-3 text-xs text-[#617178]">{data.pos.cashClosing.recent.map((shift: any) => <li key={shift.id} className="flex justify-between gap-2"><span>{shift.register} · {shift.businessDate}</span><span className="tabular-nums">counted {m(shift.countedCashPaise)} ({shift.variancePaise >= 0 ? '+' : ''}{m(shift.variancePaise)})</span></li>)}</ul> : null}
        </Panel>
        <Panel eyebrow="Offline / POS" title="Refunds, unpaid and captains" action={<Link to="/laundry/settlements" className="text-xs font-bold text-[#277267]">Captain settlements →</Link>}>
          <dl className="space-y-2 text-sm">
            <Line2 label="Approved returns" value={`${data.pos.approvedReturns.count} · ${m(data.pos.approvedReturns.amountPaise)}`} />
            <Line2 label="Paid on cancelled orders" value={m(data.pos.cancelledPaidPaise)} />
            <Line2 label="Unpaid right now (all dates)" value={`${m(data.pos.outstandingNow.amountPaise)} · ${data.pos.outstandingNow.orders}`} />
            <Line2 label="Captain handovers pending" value={`${data.pos.captainSettlements.pending.count} · ${m(data.pos.captainSettlements.pending.amountPaise)}`} />
            <Line2 label="Captain handovers reconciled" value={`${data.pos.captainSettlements.reconciled.count} · ${m(data.pos.captainSettlements.reconciled.amountPaise)}`} />
          </dl>
          <p className="mt-3 text-[11px] leading-5 text-[#718087]">An approved return records the refund; it does not move money by itself.</p>
        </Panel>
      </section> : null}

      {showOnline && data.online ? <section className="grid gap-5 xl:grid-cols-2" aria-label="Online / LNDRY">
        <Panel eyebrow="Online / LNDRY" title="Orders and platform charges">
          <dl className="space-y-2 text-sm">
            <Line2 label="Counted as sales" value={String(data.online.statusCounts.sales)} />
            <Line2 label="Waiting for your acceptance" value={String(data.online.statusCounts.awaitingVendor)} />
            <Line2 label="Cancelled / rejected" value={String(data.online.statusCounts.cancelled)} />
            <Line2 label="Refunded" value={String(data.online.statusCounts.refunded)} />
            <Line2 label="Delivery fees charged" value={m(data.online.platformCharges.deliveryFeesPaise)} />
            <Line2 label="Platform fees charged" value={m(data.online.platformCharges.platformFeesPaise)} />
            {data.online.platformCharges.expressFeesPaise ? <Line2 label="Express fees charged" value={m(data.online.platformCharges.expressFeesPaise)} /> : null}
            <Line2 label="Unpaid right now (all dates)" value={`${m(data.online.outstandingNow.amountPaise)} · ${data.online.outstandingNow.orders}`} />
          </dl>
        </Panel>
        <Panel eyebrow="Online / LNDRY" title="Commission and settlements">
          <dl className="space-y-2 text-sm">
            <Line2 label="Commission rate" value={data.online.commission.ratePercent == null ? 'Not set' : `${data.online.commission.ratePercent}%`} />
            <Line2 label="Commission on delivered orders (estimate)" value={data.online.commission.estimatedOnDeliveredPaise == null ? '—' : m(data.online.commission.estimatedOnDeliveredPaise)} />
            {data.online.settlement.recorded ? <>
              <Line2 label="Settled gross" value={m(data.online.settlement.grossPaise)} />
              <Line2 label="Settled commission" value={m(data.online.settlement.commissionPaise)} />
              <Line2 label="Delivery costs" value={m(data.online.settlement.deliveryCostPaise)} />
              <Line2 label="Payout for the period" value={m(data.online.settlement.payoutPaise)} strong />
              {Object.entries(data.online.settlement.byStatus as Record<string, { payoutPaise: number; days: number }>).map(([status, row]) => <Line2 key={status} label={`  ${label(status)}`} value={`${m(row.payoutPaise)} · ${row.days} day${row.days === 1 ? '' : 's'}`} />)}
            </> : <p className="rounded-xl bg-[#f4f8f5] p-3 text-xs leading-5 text-[#617178]">No settlement records exist for this period yet. Settlements are written by the platform after orders are delivered.</p>}
          </dl>
          {data.online.settlement.recent.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-xs"><thead><tr className="text-left text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718087]"><th className="pb-1.5">Day</th><th className="pb-1.5 text-right">Orders</th><th className="pb-1.5 text-right">Gross</th><th className="pb-1.5 text-right">Commission</th><th className="pb-1.5 text-right">Payout</th><th className="pb-1.5 text-right">Status</th></tr></thead><tbody className="tabular-nums">{data.online.settlement.recent.map((row: any) => <tr key={row.date} className="border-t border-[#e8edef]"><td className="py-1.5">{row.date}</td><td className="py-1.5 text-right">{row.orders}</td><td className="py-1.5 text-right">{m(row.grossPaise)}</td><td className="py-1.5 text-right">{m(row.commissionPaise)}</td><td className="py-1.5 text-right font-bold">{m(row.payoutPaise)}</td><td className="py-1.5 text-right">{label(row.status || 'PENDING')}</td></tr>)}</tbody></table></div> : null}
        </Panel>
      </section> : null}

      {data.integrity ? <p className="flex items-start gap-2 rounded-xl border border-[#263f44]/10 bg-white p-3 text-xs leading-5 text-[#718087]"><Users className="mt-0.5 h-4 w-4 shrink-0 text-[#39786f]" />{data.integrity.note}{data.integrity.mirroredOrdersExcluded ? ` ${data.integrity.mirroredOrdersExcluded} mirrored counter row(s) were left out.` : ''}</p> : null}
    </> : <div className="rounded-2xl border border-dashed border-[#cbdcd5] bg-[#fafbf9] p-8 text-center text-sm text-[#718087]">{data.notice || 'No data for this selection.'}</div>}
  </main>
}

function Metric({ icon: Icon, label: name, value, hint, tone }: { icon: typeof Store; label: string; value: string; hint?: string; tone?: 'watch' }) {
  return <article className="rounded-[20px] border border-[#263f44]/10 bg-white p-4 shadow-[0_8px_25px_rgba(37,48,43,.04)]"><Icon className="h-4 w-4 text-[#39786f]" /><p className="mt-3 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#718087]">{name}</p><p className={`mt-1 truncate font-display text-2xl font-semibold tracking-[-.035em] ${tone === 'watch' ? 'text-[#a16a16]' : 'text-[#17353c]'}`}>{value}</p><p className="mt-1 truncate text-[11px] text-[#74848a]" title={hint}>{hint}</p></article>
}
function Panel({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)] md:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#4d8982]">{eyebrow}</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-.025em] text-[#17353c]">{title}</h2></div>{action}</div><div className="mt-5">{children}</div></section>
}
function Line2({ label: name, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 ${strong ? 'border-t border-[#263f44]/10 pt-2.5 font-extrabold text-[#17353c]' : 'text-[#52676c]'}`}><dt className="whitespace-pre">{name}</dt><dd className="tabular-nums font-bold text-[#17353c]">{value}</dd></div>
}
const Dot = ({ color, text }: { color: string; text: string }) => <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{text}</span>
const Empty = ({ text }: { text: string }) => <p className="text-sm text-[#718087]">{text}</p>
function TopItems({ items }: { items: Report['topItems'] }) {
  if (!items.length) return <Empty text="No sales in this period." />
  const max = items[0].amountPaise || 1
  return <ul className="space-y-3">{items.map((item) => <li key={item.name}><div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate font-bold text-[#17353c]">{item.name}</span><span className="tabular-nums font-bold text-[#17353c]">{m(item.amountPaise)}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#edf2ef]"><div className="h-full rounded-full bg-[#2d7b72]" style={{ width: `${Math.max(2, (item.amountPaise / max) * 100)}%` }} /></div><p className="mt-1 text-[11px] text-[#718087]">{item.orders} order{item.orders === 1 ? '' : 's'}</p></li>)}</ul>
}
function MoneyTooltip({ active, payload, label: day }: any) {
  if (!active || !payload?.length) return null
  return <div className="rounded-xl border border-[#dbe7e1] bg-white px-3 py-2 text-xs shadow-xl"><p className="mb-1 font-bold text-[#17353c]">{day ? shortDate(day) : ''}</p>{payload.map((row: any) => <p key={row.name} className="flex justify-between gap-6 text-[#617178]"><span>{row.name}</span><strong style={{ color: row.color }}>{m(Number(row.value || 0))}</strong></p>)}</div>
}
