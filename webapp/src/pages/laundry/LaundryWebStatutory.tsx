import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileCheck2, Info, PlugZap, ShieldCheck } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '@/lib/api'
import { formatMoney } from '@/lib/utils'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'
import { FinanceFilterBar, channelName, useFinanceFilters } from '@/components/laundry/FinanceFilters'

/**
 * Statutory controls (website): GST for the chosen channel and period, from the tax saved on each order
 * and invoice. Nothing is invented — where the system holds no value (for example a SAC/HSN code) the
 * page says so.
 */

type Group = { ratePercent: number; orders: number; taxableValuePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number; invoiceValuePaise: number }
type Report = {
  period: { from: string; to: string }
  channel: 'ALL' | 'POS' | 'ONLINE'
  marketplace: { connected: boolean }
  notice: string | null
  registration: { legalName: string; gstin: string | null; gstRegistered: boolean; state: string | null; city: string | null }
  summary: null | (Record<string, number>)
  rates: Array<Group & { byChannel: Record<string, number> }>
  channels: Array<Group & { channel: string; noGstOrders: number; noGstValuePaise: number; creditNotePaise: number; creditTaxPaise: number; netTaxPaise: number }>
  invoices: null | {
    issued: number; void: number; taxPaise: number; valuePaise: number; deliveredWithoutInvoice: number
    byChannel: Array<{ channel: string; issued: number }>
    recent: Array<{ invoiceNumber: string; orderNumber: string | null; channel: string; date: string; status: string; taxablePaise: number; taxPaise: number; totalPaise: number; paymentStatus: string }>
  }
  compliance: Array<{ key: string; status: 'OK' | 'ACTION' | 'INFO'; label: string; detail: string | null }>
  basis?: { split: string; source: string; period: string }
}

const m = (paise?: number) => formatMoney((Number(paise) || 0) / 100)
const shortDate = (value: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`))

export default function LaundryWebStatutory() {
  const filters = useFinanceFilters()
  const { channel, from, to } = filters
  const query = useQuery({
    queryKey: ['finance-web-statutory', from, to, channel],
    queryFn: () => apiGet<Report>(`/finance/web-statutory?from=${from}&to=${to}&channel=${channel}`),
    staleTime: 15_000,
  })
  const data = query.data
  const connected = data ? data.marketplace.connected : true
  useEffect(() => { if (data && !data.marketplace.connected && channel !== 'POS') filters.setChannel('POS') }, [data, channel]) // eslint-disable-line react-hooks/exhaustive-deps

  const header = <header className="relative overflow-hidden rounded-[28px] border border-[#35216f]/25 bg-[radial-gradient(circle_at_86%_14%,rgba(218,210,255,.34),transparent_28%),linear-gradient(135deg,#2d1e65,#664cf0)] px-5 py-6 text-white shadow-[0_20px_54px_rgba(81,56,207,.22)] md:px-7">
    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <Link to="/laundry/finance" className="text-xs font-bold text-[#d6d0ff] hover:text-white">← Finance & compliance</Link>
        <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[.2em] text-[#d8d1ff]">Statutory controls</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-.045em] md:text-4xl">GST, from what was actually charged.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e7e3ff]">Taxable value, CGST / SGST / IGST, credit adjustments and invoice status, taken from the tax saved on each order and invoice.</p>
      </div>
      <div className="flex flex-wrap gap-2"><span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-extrabold">{channelName(data?.channel || channel)}</span><span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">{shortDate(from)} – {shortDate(to)}</span></div>
    </div>
    <FinanceFilterBar filters={filters} marketplace={data?.marketplace} />
  </header>

  if (query.isLoading) return <main>{header}<div className="mt-5"><VisualLoadingState title="Preparing statutory controls" detail="Reading the tax saved on orders and invoices for this business." icon={ShieldCheck} /></div></main>
  if (query.error || !data) return <main>{header}<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800"><AlertTriangle className="h-5 w-5" /><p className="mt-3 font-bold">Statutory report unavailable</p><p className="mt-1 text-sm">{query.error instanceof Error ? query.error.message : 'The statutory report could not load.'}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 rounded-xl bg-[#123039] px-3 py-2 text-xs font-bold text-white">Try again</button></div></main>

  const s = data.summary
  const inv = data.invoices
  const reg = data.registration
  const many = data.channels.length > 1

  return <main className="animate-in fade-in slide-in-from-bottom-2 space-y-5 pb-10 duration-500">
    {header}
    {!connected ? <div className="flex items-start gap-3 rounded-2xl border border-[#d9d2ff] bg-[#f6f3ff] p-4 text-sm text-[#4b3aa8]"><PlugZap className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-extrabold">LNDRY Online is not connected for this business.</p><p className="mt-0.5 text-xs leading-5 text-[#6a5cc0]">GST below covers your counter (POS) sales.</p></div></div> : null}

    <section className="grid gap-3 rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)] sm:grid-cols-2 lg:grid-cols-4" aria-label="Registration">
      <Fact label="Business" value={reg.legalName} />
      <Fact label="GSTIN" value={reg.gstin || 'Not on file'} tone={reg.gstin ? undefined : 'watch'} />
      <Fact label="State" value={reg.state || 'Not on file'} />
      <Fact label="Period" value={`${data.period.from} → ${data.period.to}`} />
    </section>

    {s ? <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Taxable value" value={m(s.taxableValuePaise)} note={`${s.orders} order${s.orders === 1 ? '' : 's'}`} />
        <Stat label="GST collected" value={m(s.taxCollectedPaise)} note="On orders counted here" />
        <Stat label="CGST" value={m(s.cgstPaise)} note="Within your state" />
        <Stat label="SGST" value={m(s.sgstPaise)} note="Within your state" />
        <Stat label="IGST" value={m(s.igstPaise)} note="Delivered to another state" />
        <Stat label="Credit adjustments" value={m(s.creditNotesPaise)} note={`${m(s.creditTaxPaise)} of it is GST`} />
        <Stat label="Net GST after credits" value={m(s.netTaxPaise)} note="Collected − credit GST" strong />
        <Stat label="Invoices issued" value={String(inv?.issued ?? 0)} note={inv?.void ? `${inv.void} void` : 'In this period'} />
      </section>

      <Panel eyebrow="GST rate breakdown" title="Taxable value and tax by rate">
        {data.rates.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-[#718087]"><th className="pb-2">GST rate</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Taxable value</th><th className="pb-2 text-right">CGST</th><th className="pb-2 text-right">SGST</th><th className="pb-2 text-right">IGST</th><th className="pb-2 text-right">Tax</th><th className="pb-2 text-right">Invoice value</th></tr></thead>
          <tbody className="tabular-nums">{data.rates.map((row) => <tr key={row.ratePercent} className="border-t border-[#e8edef]"><td className="py-2.5 font-bold text-[#17353c]">{row.ratePercent === 0 ? 'No GST charged' : `${row.ratePercent}%`}</td><td className="py-2.5 text-right">{row.orders}</td><td className="py-2.5 text-right">{m(row.taxableValuePaise)}</td><td className="py-2.5 text-right">{m(row.cgstPaise)}</td><td className="py-2.5 text-right">{m(row.sgstPaise)}</td><td className="py-2.5 text-right">{m(row.igstPaise)}</td><td className="py-2.5 text-right font-bold">{m(row.taxPaise)}</td><td className="py-2.5 text-right">{m(row.invoiceValuePaise)}</td></tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-[#263f44]/15 font-extrabold text-[#17353c]"><td className="pt-2.5">Total</td><td className="pt-2.5 text-right">{s.orders}</td><td className="pt-2.5 text-right">{m(s.taxableValuePaise)}</td><td className="pt-2.5 text-right">{m(s.cgstPaise)}</td><td className="pt-2.5 text-right">{m(s.sgstPaise)}</td><td className="pt-2.5 text-right">{m(s.igstPaise)}</td><td className="pt-2.5 text-right">{m(s.taxCollectedPaise)}</td><td className="pt-2.5 text-right">{m(s.invoiceValuePaise)}</td></tr></tfoot>
        </table></div> : <p className="text-sm text-[#718087]">No orders in this period.</p>}
        <p className="mt-3 text-[11px] leading-5 text-[#718087]">SAC / HSN: not recorded — services in LNDRY do not carry a SAC/HSN code, so none is reported.</p>
      </Panel>

      {many ? <Panel eyebrow="By channel" title="Offline vs online GST">
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-[#718087]"><th className="pb-2">Channel</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Taxable value</th><th className="pb-2 text-right">GST</th><th className="pb-2 text-right">Credit GST</th><th className="pb-2 text-right">Net GST</th></tr></thead><tbody className="tabular-nums">{data.channels.map((row) => <tr key={row.channel} className="border-t border-[#e8edef]"><td className="py-2.5 font-bold text-[#17353c]">{channelName(row.channel)}</td><td className="py-2.5 text-right">{row.orders}</td><td className="py-2.5 text-right">{m(row.taxableValuePaise)}</td><td className="py-2.5 text-right">{m(row.taxPaise)}</td><td className="py-2.5 text-right">{m(row.creditTaxPaise)}</td><td className="py-2.5 text-right font-bold">{m(row.netTaxPaise)}</td></tr>)}</tbody></table></div>
      </Panel> : null}

      <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Panel eyebrow="Invoices" title="Invoice status">
          {inv ? <>
            <div className="grid grid-cols-3 gap-3"><Fact label="Issued" value={String(inv.issued)} /><Fact label="Invoiced value" value={m(inv.valuePaise)} /><Fact label="Delivered, no invoice yet" value={String(inv.deliveredWithoutInvoice)} tone={inv.deliveredWithoutInvoice ? 'watch' : undefined} /></div>
            {inv.recent.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-xs"><thead><tr className="text-left text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718087]"><th className="pb-1.5">Invoice</th><th className="pb-1.5">Order</th><th className="pb-1.5">Channel</th><th className="pb-1.5">Date</th><th className="pb-1.5 text-right">Taxable</th><th className="pb-1.5 text-right">GST</th><th className="pb-1.5 text-right">Total</th></tr></thead><tbody className="tabular-nums">{inv.recent.map((row) => <tr key={row.invoiceNumber} className="border-t border-[#e8edef]"><td className="py-1.5 font-mono">{row.invoiceNumber}{row.status === 'VOID' ? ' (void)' : ''}</td><td className="py-1.5">{row.orderNumber || '—'}</td><td className="py-1.5">{row.channel === 'POS' ? 'Offline' : 'Online'}</td><td className="py-1.5">{row.date}</td><td className="py-1.5 text-right">{m(row.taxablePaise)}</td><td className="py-1.5 text-right">{m(row.taxPaise)}</td><td className="py-1.5 text-right font-bold">{m(row.totalPaise)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-[#718087]">No invoices were issued in this period.</p>}
          </> : null}
        </Panel>
        <Panel eyebrow="Compliance" title="Checks">
          <ul className="space-y-2.5">{data.compliance.map((item) => <li key={item.key} className={`flex gap-3 rounded-xl border p-3 ${item.status === 'ACTION' ? 'border-rose-200 bg-rose-50' : item.status === 'OK' ? 'border-[#cce2d9] bg-[#f2f8f4]' : 'border-[#e3e8ea] bg-[#fafbf9]'}`}>
            {item.status === 'OK' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#26826d]" /> : item.status === 'ACTION' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#6b7c84]" />}
            <div><p className="text-sm font-bold text-[#17353c]">{item.label}</p>{item.detail ? <p className="mt-0.5 text-xs leading-5 text-[#657681]">{item.detail}</p> : null}</div></li>)}</ul>
        </Panel>
      </section>

      {data.basis ? <p className="flex items-start gap-2 rounded-xl border border-[#263f44]/10 bg-white p-4 text-xs leading-5 text-[#718087]"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#39786f]" /><span><strong className="text-[#52676c]">How this is worked out.</strong> {data.basis.source} {data.basis.split} {data.basis.period} This is a working report, not a filed return — filing and payment are done on the GST portal.</span></p> : null}
    </> : <div className="rounded-2xl border border-dashed border-[#cbdcd5] bg-[#fafbf9] p-8 text-center text-sm text-[#718087]">{data.notice || 'No data for this selection.'}</div>}
  </main>
}

function Stat({ label, value, note, strong }: { label: string; value: string; note: string; strong?: boolean }) {
  return <article className={`rounded-[20px] border p-4 shadow-[0_8px_25px_rgba(37,48,43,.04)] ${strong ? 'border-[#664cf0]/30 bg-[#f6f3ff]' : 'border-[#263f44]/10 bg-white'}`}><p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#718087]">{label}</p><p className="mt-1.5 truncate font-display text-2xl font-semibold tracking-[-.035em] text-[#17353c]">{value}</p><p className="mt-1 truncate text-[11px] text-[#74848a]">{note}</p></article>
}
function Fact({ label, value, tone }: { label: string; value: string; tone?: 'watch' }) {
  return <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#718087]">{label}</p><p className={`mt-1 truncate text-sm font-bold ${tone === 'watch' ? 'text-[#a16a16]' : 'text-[#17353c]'}`}>{value}</p></div>
}
function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <section className="rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)] md:p-6"><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#4d8982]">{eyebrow}</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-.025em] text-[#17353c]">{title}</h2><div className="mt-5">{children}</div></section>
}
