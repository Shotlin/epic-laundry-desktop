import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, FileText, Loader2, MapPin, PackageCheck, Phone, Shirt, Tag, Truck, User, WashingMachine, Wallet } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api'
import { garmentVisuals } from '@/assets/generated/manifest'
import { OrderStatusDialog, type StatusMove, type StatusOverride } from '@/components/laundry/OrderStatusDialog'
import { summaryRows } from '@/lib/priceBreakdown'
import { nextLaundryState, type LaundryCatalogue, type LaundryOrder, type LaundryPaymentSummary, type LaundryState } from '@/lib/laundry'
import { cn, formatMoney } from '@/lib/utils'
import { canUseUi } from '@/lib/permissions'
import { isWebOnly, sessionFromStoredCloud } from '@/lib/cloudAuth'

type Detail = LaundryOrder & { timeline?: Array<{ id: string; ts: string; action: string }>; notes?: string }

const PLAIN: Record<LaundryState, { words: string; hint: string; tone: string }> = {
  Booked: { words: 'Booked', hint: 'Order taken. Waiting to start washing.', tone: 'bg-sky-100 text-sky-900 ring-sky-300' },
  'Picked Up': { words: 'Picked up', hint: 'Clothes collected from the customer.', tone: 'bg-amber-100 text-amber-900 ring-amber-300' },
  'In Process': { words: 'Being washed', hint: 'Work is going on now.', tone: 'bg-violet-100 text-violet-900 ring-violet-300' },
  Ready: { words: 'Ready', hint: 'Clean and packed. Customer can take it.', tone: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  'Out for Delivery': { words: 'Out for delivery', hint: 'A rider is taking it to the customer.', tone: 'bg-orange-100 text-orange-900 ring-orange-300' },
  Delivered: { words: 'Given to customer', hint: 'Order is complete.', tone: 'bg-green-100 text-green-900 ring-green-300' },
  Cancelled: { words: 'Cancelled', hint: 'This order was cancelled.', tone: 'bg-rose-100 text-rose-900 ring-rose-300' },
}
const NEXT_WORDS: Partial<Record<LaundryState, string>> = { Booked: 'Start washing', 'Picked Up': 'Start washing', 'In Process': 'Mark as ready', Ready: 'Send for delivery', 'Out for Delivery': 'Mark as delivered' }

/** What the vendor typed about each bag (kg line) is stored in the order notes: "Name 2.5 kg — bag "x"; inside: Shirt x2; stains A". */
function parseBagNotes(notes: string | undefined) {
  const map = new Map<string, { alias?: string; inside: Array<{ name: string; count: number }>; stains?: string; extra: string[] }>()
  for (const line of String(notes || '').split('\n')) {
    const match = /^(.+?) [\d.]+ kg — (.*)$/.exec(line.trim())
    if (!match) continue
    const entry = { inside: [] as Array<{ name: string; count: number }>, extra: [] as string[] } as { alias?: string; inside: Array<{ name: string; count: number }>; stains?: string; extra: string[] }
    for (const part of match[2].split('; ')) {
      const bag = /^bag "(.*)"$/.exec(part); const inside = /^inside: (.*)$/.exec(part); const stains = /^stains (.*)$/.exec(part)
      if (bag) entry.alias = bag[1]
      else if (inside) entry.inside = inside[1].split(', ').map((chunk) => { const m = /^(.*) x(\d+)$/.exec(chunk); return { name: m ? m[1] : chunk, count: m ? Number(m[2]) : 1 } })
      else if (stains) entry.stains = stains[1]
      else entry.extra.push(part)
    }
    map.set(match[1].trim().toLowerCase(), entry)
  }
  return map
}

export default function OrderSummaryPage({ id }: { id: string }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const session = useQuery({ queryKey: ['auth-session'], queryFn: () => isWebOnly ? Promise.resolve(sessionFromStoredCloud()) : apiGet<{ user: { roles: string[] } | null }>('/auth/session') })
  const roles = session.data?.user?.roles
  const canMove = canUseUi(roles, 'orders.transition')
  const canPay = canUseUi(roles, 'payments.collect')
  const canEdit = canUseUi(roles, 'orders.edit')
  const detail = useQuery({ queryKey: ['laundry-order', id], queryFn: () => apiGet<Detail>(`/laundry/orders/${id}`), retry: false })
  const payments = useQuery({ queryKey: ['laundry-order-payments', id], queryFn: () => apiGet<LaundryPaymentSummary>(`/laundry/orders/${id}/payments`), enabled: Boolean(detail.data) })
  const catalogue = useQuery({ queryKey: ['laundry-catalogue'], queryFn: () => apiGet<LaundryCatalogue>('/laundry/catalogue'), staleTime: 60_000 })
  const [move, setMove] = useState<StatusMove | null>(null)
  const [notice, setNotice] = useState('')
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('Cash')
  const [reference, setReference] = useState('')
  const [payError, setPayError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const order = detail.data
  const bags = useMemo(() => parseBagNotes(order?.notes), [order?.notes])
  const garmentById = useMemo(() => new Map((catalogue.data?.garments || []).map((item) => [item.id, item])), [catalogue.data])

  const refresh = () => { for (const key of ['laundry-orders', 'laundry-order', 'laundry-dashboard', 'laundry-dispatch', 'laundry-order-payments']) client.invalidateQueries({ queryKey: [key] }) }
  const transition = useMutation({
    mutationFn: ({ move: m, override }: { move: StatusMove; override?: StatusOverride }) => apiPost<LaundryOrder>(`/laundry/orders/${m.order.id}/transition`, { state: m.next, expectedVersion: m.order.version, ...override }),
    onSuccess: (updated) => { setMove(null); setNotice(`Done. This order is now: ${PLAIN[updated.state]?.words || updated.state}.`); refresh() },
  })
  const collect = useMutation({
    mutationFn: () => apiPost(`/laundry/orders/${id}/payments`, { amount: Number(amount), mode, reference }),
    onSuccess: () => { setAmount(''); setReference(''); setPaying(false); setPayError(''); setNotice('Payment saved.'); refresh() },
    onError: (cause) => setPayError(cause instanceof Error ? cause.message : 'The payment could not be saved.'),
  })
  const cancel = useMutation({
    mutationFn: () => apiPost(`/laundry/orders/${id}/cancel`, { reason: reason.trim(), expectedVersion: order?.version }),
    onSuccess: () => { setCancelling(false); setReason(''); setNotice('This order is cancelled.'); refresh() },
    onError: (cause) => setNotice(cause instanceof Error ? cause.message : 'The order could not be cancelled.'),
  })

  if (detail.isLoading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[#2563c2]" /></div>
  if (detail.isError || !order) return <section role="alert" className="mx-auto mt-10 max-w-xl rounded-2xl border border-rose-200 bg-white p-6 text-center"><h1 className="text-xl font-extrabold text-[#17353c]">We could not open this order</h1><p className="mt-2 text-[#617178]">It may have been removed. Go back and search for the order number again.</p><button type="button" onClick={() => navigate('/laundry/orders')} className="mt-4 h-12 rounded-xl bg-[#2563c2] px-6 font-bold text-white">Back to orders</button></section>

  const plain = PLAIN[order.state]
  const nextState = nextLaundryState[order.state]
  const closed = order.state === 'Delivered' || order.state === 'Cancelled'
  const outstanding = payments.data?.outstanding ?? Math.max(0, order.grandTotal - (payments.data?.paid || 0))
  const paid = payments.data?.paid ?? 0
  const rows = summaryRows({ subtotal: order.subtotal, charges: order.charges, discounts: order.discounts, taxAmount: order.taxAmount, taxRate: order.taxRate, breakdown: order.breakdown })
  const pieces = order.items.reduce((sum, item) => ['Piece', 'Pair'].includes(item.unit) ? sum + item.qty : sum, 0)
  const qtyWords = (item: LaundryOrder['items'][number]) => item.unit === 'Kilogram' ? `${Math.floor(item.qty)} kg ${Math.round((item.qty % 1) * 1000) ? `${Math.round((item.qty % 1) * 1000)} g` : ''}`.trim() : `${item.qty} ${item.unit === 'Pair' ? 'pair' : 'piece'}${item.qty === 1 ? '' : 's'}`
  const Tile = ({ icon, label, onClick, to, tone = 'text-[#17353c]', disabled }: { icon: React.ReactNode; label: string; onClick?: () => void; to?: string; tone?: string; disabled?: boolean }) => {
    const cls = cn('flex h-24 w-28 flex-col items-center justify-center gap-2 rounded-2xl border border-[#263f44]/10 bg-white px-2 text-center text-sm font-bold shadow-sm transition hover:bg-[#f4f8ff] disabled:opacity-40', tone)
    return to ? <Link to={to} className={cls}>{icon}{label}</Link> : <button type="button" disabled={disabled} onClick={onClick} className={cls}>{icon}{label}</button>
  }

  return <div className="mx-auto w-full max-w-[1280px] space-y-4 px-3 py-4 sm:px-5">
    <button type="button" onClick={() => navigate('/laundry/orders')} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#263f44]/15 bg-white px-4 font-bold text-[#2563c2]"><ArrowLeft className="h-5 w-5" />All orders</button>
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-bold text-emerald-800">{notice}</p> : null}

    <section className="rounded-3xl border border-[#263f44]/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-extrabold text-[#17353c]">Order {order.orderNumber}</h1><span className={cn('rounded-full px-4 py-1.5 text-base font-extrabold ring-2 ring-inset', plain.tone)}>{plain.words}</span></div>
          <p className="mt-1 text-base text-[#617178]">{plain.hint}</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#2563c2]"><FileText className="h-4 w-4" />Bill no: {order.invoiceNumber || order.orderNumber}<span className="text-[#9aa7ab]">|</span><CalendarDays className="h-4 w-4 text-[#617178]" /><span className="text-[#617178]">{order.orderDate}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canMove && !closed && nextState ? <Tile icon={<WashingMachine className="h-7 w-7 text-[#2563c2]" />} label={NEXT_WORDS[order.state] || `Mark ${nextState}`} onClick={() => setMove({ order, next: nextState })} /> : null}
          {canMove && order.state === 'Ready' ? <Tile icon={<CheckCircle2 className="h-7 w-7 text-green-600" />} label="Customer took it" onClick={() => setMove({ order, next: 'Delivered' })} /> : null}
          {canPay && !closed && outstanding > 0 ? <Tile icon={<Wallet className="h-7 w-7 text-emerald-600" />} label="Collect Payment" onClick={() => { setPaying(true); setAmount(String(outstanding)) }} /> : null}
          {canEdit && !closed ? <Tile icon={<Ban className="h-7 w-7 text-rose-600" />} label="Cancel order" tone="text-rose-700" onClick={() => setCancelling(true)} /> : null}
          <Tile icon={<FileText className="h-7 w-7 text-[#2563c2]" />} label="See bill" to={`/laundry/print-centre?order=${encodeURIComponent(order.id)}`} />
          <Tile icon={<Tag className="h-7 w-7 text-[#2563c2]" />} label="See tags" to={`/laundry/print-centre?order=${encodeURIComponent(order.id)}`} />
        </div>
      </div>
      {cancelling ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4"><p className="font-bold text-rose-800">Why are you cancelling this order?</p><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Write the reason" className="mt-2 h-12 w-full rounded-xl border border-rose-300 bg-white px-4 text-base" /><div className="mt-3 flex gap-2"><button type="button" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate()} className="h-11 rounded-xl bg-rose-600 px-5 font-bold text-white disabled:opacity-40">Yes, cancel it</button><button type="button" onClick={() => setCancelling(false)} className="h-11 rounded-xl border border-rose-300 bg-white px-5 font-bold text-rose-700">No, keep it</button></div></div> : null}
    </section>

    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <section className="rounded-3xl border border-[#263f44]/10 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#17353c]"><User className="h-6 w-6 text-[#2563c2]" />Customer</h2>
        <div className="mt-3 flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#2563c2] text-2xl font-extrabold text-white">{order.customer.name.slice(0, 1).toUpperCase()}</span>
          <div><p className="text-xl font-extrabold text-[#17353c]">{order.customer.name}</p><p className="flex items-center gap-2 text-base text-[#617178]"><Phone className="h-4 w-4" />{order.customer.phone}</p>{order.deliveryAddress ? <p className="flex items-center gap-2 text-sm text-[#617178]"><MapPin className="h-4 w-4" />{order.deliveryAddress}</p> : null}</div>
          {order.customer.id ? <Link to={`/laundry/customers/${order.customer.id}`} className="ml-auto rounded-xl border border-[#2563c2]/40 px-4 py-2 text-sm font-bold text-[#2563c2]">Open customer</Link> : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-base">
          <Info icon={<CalendarDays className="h-5 w-5" />} label="Order taken on" value={order.orderDate} />
          <Info icon={<Clock3 className="h-5 w-5" />} label="Give back on" value={order.expectedDeliveryDate || '—'} />
          <Info icon={<Truck className="h-5 w-5" />} label="How" value={order.fulfillmentMode || 'At store'} />
          <Info icon={<CircleDollarSign className="h-5 w-5" />} label="Payment" value={order.paymentStatus || order.paymentMode} />
        </div>
      </section>

      <section className="rounded-3xl border border-[#263f44]/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-xl font-extrabold text-[#17353c]"><Wallet className="h-6 w-6 text-[#2563c2]" />Payment Summary</h2>
          <span className={cn('rounded-full px-4 py-1.5 text-base font-extrabold', order.state === 'Cancelled' ? 'bg-rose-100 text-rose-800' : outstanding <= 0 ? 'bg-emerald-100 text-emerald-800' : paid > 0 ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800')}>{order.state === 'Cancelled' ? 'Cancelled' : outstanding <= 0 ? 'Paid' : paid > 0 ? 'Part Paid' : 'Pending Payment'}</span></div>
        <dl className="mt-3 space-y-1.5 text-lg">
          <div className="flex justify-between"><dt className="text-[#617178]">Item Total</dt><dd className="font-bold">{formatMoney(order.subtotal)}</dd></div>
          {rows.filter((row) => row.kind !== 'subtotal' && row.kind !== 'tax').map((row) => <div key={row.label} className="flex justify-between"><dt className="text-[#617178]">{row.label}</dt><dd className="font-bold">{row.kind === 'discount' ? '−' : ''}{formatMoney(row.amount)}</dd></div>)}
          <div className="flex justify-between"><dt className="text-[#617178]">Tax{order.taxRate ? ` (GST ${order.taxRate}%)` : ''}</dt><dd className="font-bold">{formatMoney(order.taxAmount || 0)}</dd></div>
          <div className="flex justify-between border-t border-[#263f44]/10 pt-2 text-2xl font-extrabold text-[#2563c2]"><dt>Grand Total</dt><dd>{formatMoney(order.grandTotal)}</dd></div>
          <div className="flex justify-between text-emerald-700"><dt>Paid Amount</dt><dd className="font-extrabold">{formatMoney(paid)}</dd></div>
          <div className={cn('flex justify-between', outstanding > 0 ? 'text-rose-600' : 'text-emerald-700')}><dt>Balance Amount</dt><dd className="font-extrabold">{formatMoney(Math.max(0, outstanding))}</dd></div>
        </dl>
        {!paying ? <button type="button" disabled={!canPay || closed || outstanding <= 0} onClick={() => { setPaying(true); setAmount(String(outstanding)) }} className="mt-4 h-14 w-full rounded-2xl bg-[#2563c2] text-lg font-extrabold text-white disabled:bg-[#a9b8cf]">{outstanding <= 0 ? 'Fully paid' : 'Collect Payment'}</button> : null}
        {paying ? <div className="mt-4 space-y-2 rounded-2xl bg-[#f4f8ff] p-3">
          <label className="block text-sm font-bold text-[#344c54]">Amount (₹)<input type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-xl font-extrabold" /></label>
          <div className="grid grid-cols-4 gap-2">{['Cash', 'UPI', 'Card', 'Bank'].map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={cn('h-12 rounded-xl border-2 text-sm font-extrabold', mode === item ? 'border-[#2563c2] bg-white text-[#2563c2]' : 'border-transparent bg-white text-[#617178]')}>{item}</button>)}</div>
          {mode !== 'Cash' ? <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Payment reference (optional)" className="h-11 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm" /> : null}
          {payError ? <p role="alert" className="text-sm font-bold text-rose-700">{payError}</p> : null}
          <div className="flex gap-2"><button type="button" disabled={!(Number(amount) > 0) || collect.isPending} onClick={() => collect.mutate()} className="h-12 flex-1 rounded-xl bg-emerald-600 font-extrabold text-white disabled:opacity-40">{collect.isPending ? 'Saving…' : 'Save payment'}</button><button type="button" onClick={() => setPaying(false)} className="h-12 rounded-xl border border-[#263f44]/15 bg-white px-4 font-bold">Close</button></div>
        </div> : null}
      </section>
    </div>

    <section className="rounded-3xl border border-[#263f44]/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-xl font-extrabold text-[#17353c]"><Shirt className="h-6 w-6 text-[#2563c2]" />Clothes in this order</h2><span className="rounded-full bg-[#eef5ff] px-3 py-1 text-sm font-bold text-[#1e4fa0]">{order.items.length} item{order.items.length === 1 ? '' : 's'}{pieces ? ` · ${pieces} pieces` : ''}</span></div>
      <div className="mt-3 divide-y divide-[#263f44]/10">
        {order.items.map((item, index) => {
          const garment = item.garment ? garmentById.get(item.garment) : undefined
          const image = garment?.photo || garmentVisuals[garment?.visual_key as keyof typeof garmentVisuals] || ''
          const bag = bags.get(item.garmentName.trim().toLowerCase())
          return <article key={`${item.garment}:${item.service}:${index}`} className="grid gap-3 py-4 sm:grid-cols-[88px_1fr_auto]">
            <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-[#f1f4f3]">{image ? <img src={image} alt={item.garmentName} className="h-full w-full object-contain p-1.5" /> : <Shirt className="h-9 w-9 text-[#2563c2]" />}</span>
            <div className="min-w-0">
              <p className="text-lg font-extrabold uppercase text-[#17353c]">{item.garmentName}</p>
              <p className="text-sm text-[#617178]">{garment?.categoryName ? `${garment.categoryName} · ` : ''}{item.serviceName}</p>
              {bag?.alias ? <p className="mt-1 text-sm font-bold text-[#1e4fa0]">Bag: {bag.alias}</p> : null}
              {bag?.inside.length ? <div className="mt-2 flex flex-wrap gap-1.5">{bag.inside.map((piece) => <span key={piece.name} className="rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-extrabold uppercase text-[#1e4fa0]">{piece.name} × {piece.count}</span>)}</div> : null}
              {bag?.stains ? <p className="mt-1 text-xs font-bold text-amber-800">Stains: {bag.stains}</p> : null}
              {bag?.extra.length ? <p className="mt-1 text-xs text-[#617178]">{bag.extra.join('; ')}</p> : null}
            </div>
            <div className="text-right"><p className="text-base font-bold">{qtyWords(item)}</p><p className="text-sm text-[#617178]">{formatMoney(item.rate)} each</p><p className="text-xl font-extrabold text-[#17353c]">{formatMoney(item.amount)}</p></div>
          </article>
        })}
      </div>
    </section>

    <section className="rounded-3xl border border-[#263f44]/10 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#17353c]"><PackageCheck className="h-6 w-6 text-[#2563c2]" />What happened</h2>
      <ol className="mt-3 space-y-2">{(order.timeline || []).slice().reverse().map((event, index) => <li key={event.id} className={cn('flex items-start gap-3 rounded-xl px-3 py-2', index === 0 ? 'bg-emerald-50' : '')}><CheckCircle2 className={cn('mt-0.5 h-5 w-5 shrink-0', index === 0 ? 'text-emerald-600' : 'text-[#9aa7ab]')} /><div><p className="font-bold text-[#17353c]">{event.action}</p><p className="text-xs text-[#718087]">{new Date(event.ts).toLocaleString('en-IN')}</p></div></li>)}</ol>
    </section>

    <OrderStatusDialog move={move} pending={transition.isPending} error={transition.error} onConfirm={(override) => move && transition.mutate({ move, override })} onClose={() => { transition.reset(); setMove(null) }} onReload={() => { transition.reset(); setMove(null); refresh() }} />
  </div>
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-[#f7faf9] p-3"><span className="text-[#2563c2]">{icon}</span><div><p className="text-xs font-bold text-[#718087]">{label}</p><p className="font-extrabold text-[#17353c]">{value}</p></div></div>
}
