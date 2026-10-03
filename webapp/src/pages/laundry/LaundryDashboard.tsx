import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Banknote, BarChart3, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Cloud, Clock3, MessageCircle, PackageCheck, Plus, Scissors, Search, Shirt, Truck, UsersRound, X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Link, useNavigate } from 'react-router-dom'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'
import { isWebOnly, sessionFromStoredCloud } from '@/lib/cloudAuth'
import { apiGet } from '@/lib/api'
import type { LaundryDashboard as DashboardData, LaundryState } from '@/lib/laundry'
import { stateTone } from '@/lib/laundry'
import { cn, formatINR } from '@/lib/utils'

const stateLabels: Array<{ key: keyof DashboardData['kpis']; label: string; detail: string; icon: typeof ClipboardList; tone: string }> = [
  { key: 'booking', label: 'Booking', detail: 'New orders', icon: ClipboardList, tone: 'text-sky-700 bg-sky-100' },
  { key: 'delivery', label: 'Delivery', detail: 'Out with captain', icon: Truck, tone: 'text-orange-700 bg-orange-100' },
  { key: 'delivered', label: 'Delivered', detail: 'Completed', icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-100' },
]

export default function LaundryDashboard() {
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['laundry-dashboard'], queryFn: () => apiGet<DashboardData>('/laundry/dashboard') })
  const session = useQuery({ queryKey: ['auth-session'], queryFn: () => isWebOnly ? Promise.resolve(sessionFromStoredCloud()) : apiGet<{ user: { roles: string[] } | null }>('/auth/session') })
  const data = query.data
  const [whatsAppOpen, setWhatsAppOpen] = useState(false)
  const [customerLookupOpen, setCustomerLookupOpen] = useState(false)
  const canSearchCustomers = Boolean(session.isSuccess && !session.isFetching && session.data?.user?.roles.some((role) => role === 'owner' || role === 'counter_staff'))

  if (query.isError) return <Failure />
  if (!data) return <VisualLoadingState title="Preparing daily control" detail="Reading orders, collections, production and delivery signals for this store." />
  const trendSummary = data.trend.length
    ? `${data.trend.length}-day revenue and collection view: ${formatINR(data.trend.reduce((sum, point) => sum + point.orderValue, 0))} order value and ${formatINR(data.trend.reduce((sum, point) => sum + point.collected, 0))} collected.`
    : 'No revenue or collection records are available for the selected period.'

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 space-y-7 duration-500">
      <section className="relative overflow-hidden rounded-[26px] bg-[#664cf0] p-6 text-white shadow-[0_20px_45px_rgba(81,56,207,.25)] md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/10" />
        <div className="pointer-events-none absolute -bottom-24 right-44 h-52 w-52 rounded-full bg-[#b6a8ff]/20 blur-2xl" />
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ddd7ff]">Daily control · {prettyDate(data.asOf)}</p>
            <h1 className="mt-3 max-w-xl font-display text-3xl font-extrabold leading-tight md:text-4xl">See the next move at a glance.</h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-[#eeeaff]">Orders, pickup, production and delivery signals—one visual control surface.</p>
          </div>
          <Link to="/laundry/new-order" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-[#5138cf] transition hover:bg-[#f5f2ff]">
            <Plus className="h-4 w-4" /> Book an order
          </Link>
        </div>
        <div className="pointer-events-none absolute" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi to={`/laundry/reports/collection?period=today&from=${encodeURIComponent(data.asOf)}&to=${encodeURIComponent(data.asOf)}`} icon={Banknote} label="Collection amount" value={formatINR(data.kpis.collection)} note="Collected today" accent="#664cf0" />
        <Kpi to="/laundry/online-orders?filter=AwaitingAcceptance" icon={ClipboardList} label="Order requests" value={String(data.kpis.orderRequests)} note="Waiting for a response" accent="#8d79ff" />
        <Kpi to="/laundry/orders?queue=pending" icon={PackageCheck} label="Pending orders" value={String(data.kpis.pendingOrders)} note="Across the store" accent="#187b5c" />
        <Kpi to="/laundry/orders?queue=delivery-due" icon={CalendarClock} label="Upcoming delivery" value={String(data.kpis.upcomingDeliveries)} note="Due today or earlier" accent="#d88a22" />
      </section>

      <section aria-labelledby="dashboard-quick-actions-heading" aria-busy={session.isFetching} className="rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.05)] md:p-6">
        <SectionHeading eyebrow="Quick actions" title="Start the next task" titleId="dashboard-quick-actions-heading" />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <QuickAction to="/laundry/new-order" icon={Plus} title="New order" detail="Open the reversible order builder." />
          {canSearchCustomers ? <QuickAction onClick={() => setCustomerLookupOpen(true)} icon={UsersRound} title="Search customer" detail="Find a profile or add a customer." /> : null}
          <button type="button" onClick={() => setWhatsAppOpen(true)} className="group flex min-h-28 items-start gap-4 rounded-2xl border border-[#263f44]/10 bg-[#fbfcfa] p-4 text-left transition hover:border-[#4d8982]/40 hover:bg-[#f4fbf8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39786f]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf3ef] text-[#39786f]"><MessageCircle className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-[#17353c]">Send WhatsApp</span><span className="mt-1 block text-xs leading-5 text-[#718087]">Choose the recipient and review the message before opening WhatsApp.</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#39786f]">Prepare message <ArrowRight className="h-3.5 w-3.5" /></span></span></button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr]" aria-label="Counter vs online split">
        <div className="rounded-[20px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#718087]">Counter sales today</p><p className="mt-1 font-serif text-3xl tabular-nums text-[#17353c]">{formatINR(data.kpis.todayRevenue)}</p><p className="mt-1 text-xs text-[#74848a]">Booked at this counter</p></div>
        <div className="rounded-[20px] border border-[#664cf0]/15 bg-[#f6f4ff] p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#5138cf]">Online orders (est.)</p><p className="mt-1 font-serif text-3xl tabular-nums text-[#3a2b8f]">{formatINR(data.online.estimatedRevenue)}</p><p className="mt-1 text-xs text-[#6b5fb0]">{data.online.count} active · {data.online.todayCount} today · pre-reconciliation estimate</p></div>
        <RankPanel title="Top online garments" icon={Shirt} rows={data.online.topGarments} />
      </section>

      <section className="rounded-[22px] border border-[#263f44]/10 bg-[#f8fbf8] p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)] md:p-6" aria-labelledby="marketplace-operations-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Marketplace operations</p><h2 id="marketplace-operations-heading" className="mt-1 font-serif text-2xl text-[#17353c]">Online work that needs a decision</h2><p className="mt-1 text-sm text-[#718087]">Counts come from the local marketplace projections and sync ledger for this store.</p></div><Link to="/laundry/online-orders" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-[#2e716d]">Open online orders <ArrowRight className="h-3.5 w-3.5" /></Link></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <MarketplaceMetric label="New orders" value={data.marketplace.newOrders} icon={ClipboardList} tone="amber" />
          <MarketplaceMetric label="Pickup today" value={data.marketplace.pickupToday} icon={Truck} tone="blue" />
          <MarketplaceMetric label="Intake pending" value={data.marketplace.intakePending} icon={PackageCheck} tone="teal" />
          <MarketplaceMetric label="Approval needed" value={data.marketplace.customerApprovalRequired} icon={Clock3} tone="amber" />
          <MarketplaceMetric label="Production risk" value={data.marketplace.productionRisk} icon={AlertTriangle} tone="rose" />
          <MarketplaceMetric label="Sync issues" value={data.marketplace.syncIssues} icon={Cloud} tone={data.marketplace.syncIssues ? 'rose' : 'teal'} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#263f44]/10 pt-4 text-xs font-semibold text-[#617178]"><span>{data.marketplace.configured ? 'Marketplace device registered' : 'Marketplace not configured'}</span><span>Ready: {data.marketplace.ready}</span><span>Overdue: {data.marketplace.overdue}</span><span>Payment attention: {data.marketplace.paymentAttention}</span><span className="inline-flex items-center gap-2">Channels: {Object.entries(data.marketplace.channelBreakdown).map(([channel, count]) => <span key={channel} className="rounded-full bg-white px-2 py-1 text-[10px] ring-1 ring-inset ring-[#263f44]/10">{channel.replace(/_/g, ' ')} {count}</span>)}</span></div>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[1.55fr_.9fr]">
        <div className="min-w-0 rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.05)] md:p-6">
          <SectionHeading eyebrow="Live queue" title="Order pipeline" action={<Link to="/laundry/orders" className="text-sm font-semibold text-[#2e716d] hover:text-[#174945]">View orders <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link>} />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {stateLabels.map(({ key, label, detail, icon: Icon, tone }, index) => (
              <Link to={`/laundry/orders?queue=${key === 'booking' ? 'booking' : key === 'delivery' ? 'delivery' : 'delivered'}`} key={label} className="relative rounded-2xl border border-[#263f44]/10 bg-[#fcfcfa] p-4 text-left transition hover:border-[#664cf0]/35 hover:bg-[#f6f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#664cf0]">
                {index < 2 && <div className="absolute -right-4 top-1/2 z-10 hidden h-px w-5 bg-[#bed1c9] md:block" />}
                <span className={cn('mb-5 grid h-9 w-9 place-items-center rounded-xl', tone)}><Icon className="h-4 w-4" /></span>
                <p className="font-serif text-3xl tabular-nums text-[#15333a]">{data.kpis[key]}</p>
                <p className="mt-1 text-sm font-semibold">{label}</p>
                <p className="text-xs text-[#718087]">{detail}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#5d42e8]">View orders <ArrowRight className="h-3.5 w-3.5" /></span>
              </Link>
            ))}
          </div>
          <div className="mt-7 border-t border-[#263f44]/10 pt-5">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Recent orders</p><p className="text-xs text-[#718087]">Live records from this device</p></div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-[.12em] text-[#75858a]"><tr><th className="pb-3">Order</th><th className="pb-3">Customer</th><th className="pb-3">Delivery</th><th className="pb-3">Amount</th><th className="pb-3">Status</th></tr></thead>
                <tbody>{data.recent.length ? data.recent.map((order) => <tr key={order.id} className="border-t border-[#263f44]/8 transition hover:bg-[#f7fbf9]"><td className="py-3 font-semibold text-[#205660]"><Link className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#664cf0]" to={`/laundry/orders/${order.id}`}>{order.orderNumber}</Link></td><td className="py-3"><span className="block font-medium">{order.customer.name}</span><span className="text-xs text-[#718087]">{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</span></td><td className="py-3 text-[#617278]">{prettyDate(order.expectedDeliveryDate)}</td><td className="py-3 font-semibold tabular-nums">{formatINR(order.grandTotal)}</td><td className="py-3"><StatePill state={order.state} /></td></tr>) : <tr><td colSpan={5} className="py-10 text-center text-[#718087]">Your booked orders will appear here.</td></tr>}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="min-w-0 rounded-[22px] border border-[#263f44]/10 bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(37,48,43,.05)] md:p-6">
          <SectionHeading eyebrow="Action list" title="Needs attention" />
          <div className="mt-5 space-y-2">
            {data.attention.map((item) => <Link key={item.id} to={attentionDestination(item.id)} className="flex items-center gap-3 rounded-2xl border border-[#263f44]/8 bg-white px-3 py-3.5 transition hover:border-[#664cf0]/35 hover:bg-[#f6f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#664cf0]"><span className={cn('h-2.5 w-2.5 rounded-full', item.tone === 'amber' ? 'bg-amber-400' : item.tone === 'rose' ? 'bg-rose-400' : item.tone === 'blue' ? 'bg-sky-400' : 'bg-slate-400')} /><span className="flex-1 text-sm font-medium">{item.label}<span className="ml-2 text-xs font-bold text-[#5d42e8]">View</span></span><span className="grid h-7 min-w-7 place-items-center rounded-lg bg-[#eff2ee] px-1.5 text-sm font-bold tabular-nums">{item.count}</span></Link>)}
          </div>
          <div className="mt-6 rounded-2xl bg-[#eaf3ef] p-4 text-sm text-[#315d57]"><CircleAlert className="mr-2 inline h-4 w-4" /><span className="font-semibold">Tip:</span> Move ready orders to delivery before the next captain dispatch.</div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.8fr_.8fr]">
        <div className="rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.05)] md:p-6">
          <SectionHeading eyebrow="Business overview" title="Revenue & collection" action={<BarChart3 className="h-5 w-5 text-[#55938a]" />} />
          <div className="mt-6 flex h-36 items-end gap-2 border-b border-[#263f44]/10 sm:gap-3" role="img" aria-label="Seven day revenue and collection chart">
            {data.trend.map((point) => { const max = Math.max(...data.trend.map((item) => item.orderValue), 1); return <div key={point.date} className="group flex h-full min-w-0 flex-1 items-end justify-center gap-1" title={`${point.date}: ${formatINR(point.orderValue)} order value, ${formatINR(point.collected)} collected`}><div className="w-2.5 rounded-t-md bg-[#8d79ff] group-hover:bg-[#664cf0] sm:w-4" style={{ height: `${Math.max(4, point.orderValue / max * 100)}%` }} /><div className="w-2.5 rounded-t-md bg-[#e6bc65] group-hover:bg-[#d9a94b] sm:w-4" style={{ height: `${Math.max(4, point.collected / max * 100)}%` }} /></div> })}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#7b8b8d]">{data.trend.map((point) => <span key={point.date}>{shortDate(point.date)}</span>)}</div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-[#5d7073]"><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#8d79ff]" />Value</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#e6bc65]" />Collected</span></div>
          <p className="sr-only">{trendSummary}</p>
        </div>
        <RankPanel title="Top garments" icon={Shirt} rows={data.topGarments} />
        <RankPanel title="Top services" icon={Scissors} rows={data.topServices} />
      </section>
      {customerLookupOpen ? <CustomerLookupDialog
        onClose={() => setCustomerLookupOpen(false)}
        onOpenCustomer={(customerId) => navigate(`/laundry/orders?view=customers&customer=${encodeURIComponent(customerId)}`)}
        onAddCustomer={() => navigate('/laundry/customers?new=1')}
      /> : null}
      {whatsAppOpen ? <WhatsAppGuard onClose={() => setWhatsAppOpen(false)} /> : null}
    </div>
  )
}

function Kpi({ to, icon: Icon, label, value, note, accent }: { to: string; icon: typeof Banknote; label: string; value: string; note: string; accent: string }) {
  return <Link to={to} className="group rounded-[20px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)] transition hover:-translate-y-0.5 hover:border-[#664cf0]/35 hover:shadow-[0_12px_32px_rgba(102,76,240,.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#664cf0]"><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: `${accent}33`, color: accent }}><Icon className="h-5 w-5" /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.13em] text-[#718087]">{label}</p><p className="mt-1 font-serif text-3xl tabular-nums text-[#17353c]">{value}</p><p className="mt-1 text-xs text-[#74848a]">{note}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold" style={{ color: accent }}>View details <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></Link>
}
function QuickAction({ to, onClick, icon: Icon, title, detail }: { to?: string; onClick?: () => void; icon: typeof Plus; title: string; detail: string }) {
  const className = 'group flex min-h-28 items-start gap-4 rounded-2xl border border-[#263f44]/10 bg-[#fbfcfa] p-4 text-left transition hover:border-[#664cf0]/35 hover:bg-[#f6f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#664cf0]'
  const content = <><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eeeaff] text-[#664cf0]"><Icon className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-[#17353c]">{title}</span><span className="mt-1 block text-xs leading-5 text-[#718087]">{detail}</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#5d42e8]">{to ? 'Open' : 'Search'} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></span></>
  return to ? <Link to={to} className={className}>{content}</Link> : <button type="button" onClick={onClick} className={className}>{content}</button>
}
function CustomerLookupDialog({ onClose, onOpenCustomer, onAddCustomer }: { onClose: () => void; onOpenCustomer: (id: string) => void; onAddCustomer: () => void }) {
  const [search, setSearch] = useState('')
  const term = search.trim()
  const customers = useQuery({
    queryKey: ['laundry-dashboard-customer-lookup', term],
    queryFn: () => apiGet<Array<{ id: string; name: string; phone: string; email?: string }>>(`/laundry/customers?search=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
    staleTime: 30_000,
  })
  return <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17353c]/55 backdrop-blur-sm" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh,720px)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white text-[#17353c] shadow-2xl focus:outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-[#263f44]/10 px-5 py-4 sm:px-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#4d8982]">Customer lookup</p><DialogPrimitive.Title className="mt-1 font-serif text-2xl">Search Customer</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-[#718087]">Find a customer by name or phone, open their profile, or add a new customer.</DialogPrimitive.Description></div>
          <DialogPrimitive.Close aria-label="Close customer search" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#617178] hover:bg-[#f2f4f1]"><X className="h-5 w-5" /></DialogPrimitive.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <label htmlFor="dashboard-customer-search" className="text-xs font-semibold text-[#617178]">Customer name or phone</label>
          <div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8d90]" /><input id="dashboard-customer-search" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type at least 2 characters" className="h-11 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] pl-9 pr-3 text-sm outline-none transition focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /></div>
          <div className="mt-4 space-y-2" aria-live="polite">
            {term.length < 2 ? <p className="rounded-xl bg-[#f6f8f5] px-3 py-3 text-sm text-[#718087]">Enter at least 2 characters to search this store’s customer records.</p> : null}
            {term.length >= 2 && customers.isFetching ? <p role="status" className="px-1 py-3 text-sm text-[#718087]">Searching customers…</p> : null}
            {term.length >= 2 && customers.isError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-3 text-sm text-rose-700">Customer search failed. Check your connection and try again.</p> : null}
            {term.length >= 2 && customers.data?.length === 0 ? <div className="rounded-xl border border-dashed border-[#b9c9c3] bg-[#fffdf8] px-4 py-5 text-center"><p className="text-sm font-semibold text-[#315d57]">No matching customer</p><p className="mt-1 text-xs text-[#718087]">Check the spelling or phone number, or add a new customer.</p></div> : null}
            {customers.data?.map((customer) => <button type="button" key={customer.id} aria-label={`Open profile for ${customer.name || 'unnamed customer'}`} onClick={() => onOpenCustomer(customer.id)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-[#263f44]/10 bg-white px-3 py-3 text-left transition hover:border-[#438b82]/40 hover:bg-[#f4fbf8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#438b82]"><span className="min-w-0"><span className="block truncate text-sm font-bold text-[#17353c]">{customer.name || 'Unnamed customer'}</span><span className="mt-0.5 block truncate text-xs text-[#718087]">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</span></span><span className="shrink-0 text-xs font-bold text-[#39786f]">Open profile <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></span></button>)}
          </div>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-[#263f44]/10 bg-[#fafaf7] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#263f44]/15 bg-white px-4 py-2 text-sm font-bold text-[#315d57]">Close</button>
          <button type="button" onClick={onAddCustomer} className="min-h-10 rounded-xl bg-[#123039] px-4 py-2 text-sm font-bold text-white"><Plus className="mr-1.5 inline h-4 w-4" />Add Customer</button>
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
function attentionDestination(id: string) { return id === 'requests' ? '/laundry/online-orders?filter=AwaitingAcceptance' : `/laundry/orders?queue=${id === 'pickup' ? 'pickup-unassigned' : id === 'upcoming' ? 'delivery-due' : id === 'unassigned' ? 'delivery-unassigned' : 'express'}` }
function WhatsAppGuard({ onClose }: { onClose: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17353c]/50 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="whatsapp-guard-title" className="w-full max-w-md rounded-[22px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#39786f]">Outbound message</p><h2 id="whatsapp-guard-title" className="mt-1 font-serif text-2xl text-[#17353c]">Review before sending</h2></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-[#617178] hover:bg-[#f2f4f1]" aria-label="Close WhatsApp message dialog"><X className="h-5 w-5" /></button></div><p className="mt-3 text-sm leading-6 text-[#617178]">WhatsApp can send information outside Epic Laundry. Select the recipient and message from an order or customer screen, then confirm there before it opens an external conversation.</p><div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="rounded-xl bg-[#17353c] px-4 py-2.5 text-sm font-bold text-white">Back to dashboard</button></div></section></div> }
function MarketplaceMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof ClipboardList; tone: 'amber' | 'blue' | 'teal' | 'rose' }) {
  const styles = { amber: 'bg-[#fff3d8] text-[#9a6518]', blue: 'bg-[#e8f3f7] text-[#34708a]', teal: 'bg-[#eaf3ef] text-[#39786f]', rose: 'bg-rose-50 text-rose-600' }[tone];
  return <div className="rounded-2xl border border-[#263f44]/8 bg-white p-3.5"><span className={`grid h-8 w-8 place-items-center rounded-lg ${styles}`}><Icon className="h-4 w-4" /></span><p className="mt-3 text-[10px] font-bold uppercase tracking-[.1em] text-[#718087]">{label}</p><p className="mt-1 font-serif text-2xl tabular-nums text-[#17353c]">{value}</p></div>
}

function SectionHeading({ eyebrow, title, action, titleId }: { eyebrow: string; title: string; action?: React.ReactNode; titleId?: string }) { return <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">{eyebrow}</p><h2 id={titleId} className="mt-1 font-serif text-2xl text-[#17353c]">{title}</h2></div>{action}</div> }
function StatePill({ state }: { state: LaundryState }) { return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset', stateTone[state])}>{state}</span> }
function RankPanel({ title, rows, icon: Icon }: { title: string; rows: Array<{ name: string; quantity: number; amount: number }>; icon: typeof Shirt }) { const max = Math.max(...rows.map((row) => row.amount), 1); return <div className="rounded-[22px] border border-[#263f44]/10 bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(37,48,43,.05)] md:p-6"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf3ef] text-[#3a7d78]"><Icon className="h-4 w-4" /></span><h2 className="font-serif text-xl text-[#17353c]">{title}</h2></div><div className="mt-5 space-y-4">{rows.length ? rows.slice(0, 4).map((row) => <div key={row.name}><div className="flex justify-between gap-2 text-xs"><span className="truncate font-semibold text-[#315d57]">{row.name}</span><span className="font-bold tabular-nums">{formatINR(row.amount)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4ebe5]"><div className="h-full rounded-full bg-[#8fc1b5]" style={{ width: `${row.amount / max * 100}%` }} /></div><p className="mt-1 text-[11px] text-[#77878a]">{row.quantity} units</p></div>) : <VisualEmptyState compact title={`No ${title.toLowerCase()} yet`} detail="Book or complete an order and this live ranking will appear here." />}</div></div> }
function prettyDate(value: string) { return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function shortDate(value: string) { return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`)) }
function Failure() { return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">The laundry dashboard could not be loaded. Confirm the local server is running, then refresh.</div> }
