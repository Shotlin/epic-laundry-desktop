import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2, RotateCcw, Search, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError, apiGet, apiPost, operatorErrorMessage } from '@/lib/api'
import { useDialogFocusLifecycle } from '@/components/laundry/useDialogFocus'
import type { LaundryOrder } from '@/lib/laundry'
import { formatMoney } from '@/lib/utils'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'

type ReturnCase = {
  id: string
  status: string
  orderId: string
  orderNumber?: string
  customerId: string
  customerName?: string
  amount: number
  reason: string
  note: string
  createdAt: string
  decisionNote?: string
}
type ReturnRequestResult = { duplicate?: boolean; returnCase?: unknown }
type ReturnReason = 'Quality issue' | 'Service not performed' | 'Duplicate charge' | 'Customer cancellation' | 'Other'
const reasons: ReturnReason[] = ['Quality issue', 'Service not performed', 'Duplicate charge', 'Customer cancellation', 'Other']

function caseShape(item: ReturnCase) {
  return {
    ...item,
    orderNumber: item.orderNumber || item.orderId,
    customerName: item.customerName || item.customerId || 'Customer unavailable',
  }
}

function returnErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const known: Record<string, string> = {
      RETURN_ORDER_NOT_FOUND: 'That order is no longer available in this store. Search again and choose a current order.',
      RETURN_REASON_INVALID: 'Choose one of the listed reasons, then try again.',
      RETURN_AMOUNT_INVALID: 'Enter an amount greater than ₹0.00.',
      RETURN_AMOUNT_PRECISION_INVALID: 'Use no more than two decimal places for a rupee amount.',
      RETURN_EXCEEDS_ORDER_TOTAL: 'The request is above the order total. Lower the amount and try again.',
    }
    return known[error.code || ''] || 'We could not save this return request. Nothing was recorded. Check the connection and try again.'
  }
  return operatorErrorMessage(error, 'We could not save this return request. Nothing was recorded. Check the connection and try again.')
}

export default function LaundryReturns() {
  const client = useQueryClient()
  const [orderSearch, setOrderSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<LaundryOrder | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<ReturnReason>('Quality issue')
  const [note, setNote] = useState('')
  const [showReview, setShowReview] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const closeReview = () => setShowReview(false)
  useDialogFocusLifecycle(closeReview, showReview)

  const cases = useQuery({ queryKey: ['laundry-returns'], queryFn: () => apiGet<ReturnCase[]>('/laundry/returns') })
  const orderResults = useQuery({
    queryKey: ['return-order-search', orderSearch.trim()],
    queryFn: () => apiGet<LaundryOrder[]>(`/laundry/orders?search=${encodeURIComponent(orderSearch.trim())}`),
    enabled: !selectedOrder && orderSearch.trim().length >= 2,
  })
  const request = useMutation({
    mutationFn: () => apiPost<ReturnRequestResult>('/laundry/returns', {
      orderId: selectedOrder?.id,
      amount: Number(amount),
      reason,
      note,
    }),
    onMutate: () => { setFormError(''); setNotice('') },
    onSuccess: async (result) => {
      setNotice(result?.duplicate
        ? 'A matching request already exists. No new case was added, and no refund was issued.'
        : 'Return request recorded. No refund was issued.')
      if (!result?.duplicate) {
        setOrderSearch('')
        setSelectedOrder(null)
        setAmount('')
        setNote('')
      }
      setShowReview(false)
      await client.invalidateQueries({ queryKey: ['laundry-returns'] })
    },
    onError: (error) => {
      setShowReview(false)
      setFormError(returnErrorMessage(error))
    },
  })

  function reviewRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    if (!selectedOrder) { setFormError('Search for and select the order before continuing.'); return }
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) { setFormError('Enter an amount greater than ₹0.00.'); return }
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount.trim())) { setFormError('Use no more than two decimal places for a rupee amount.'); return }
    if (Math.round(parsed * 100) > Math.round(selectedOrder.grandTotal * 100)) {
      setFormError(`The request cannot exceed this order total of ${formatMoney(selectedOrder.grandTotal)}.`)
      return
    }
    if (!reasons.includes(reason)) { setFormError('Choose a reason for this request.'); return }
    setShowReview(true)
  }

  if (cases.isLoading) return <VisualLoadingState title="Loading return requests" detail="Reading customer requests and their order references." icon={RotateCcw} />
  if (cases.isError || !cases.data) return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
    <h1 className="font-display text-xl font-semibold">Return requests could not be loaded</h1>
    <p className="mt-1 text-sm">The saved request register is unavailable. Retry to reload it before recording another case.</p>
    <button type="button" onClick={() => void cases.refetch()} className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-bold">Retry</button>
  </section>

  const selectedOrderTotal = selectedOrder?.grandTotal ?? 0
  const results = (orderResults.data || []).slice(0, 8)

  return <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
    <header>
      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Customer care &amp; finance control</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-[#17353c]">Returns &amp; refund requests</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#718087]">Record the customer's request against the right order. This creates a review case only; an approved case does not send money or create a payment refund.</p>
    </header>

    <section className="flex items-start gap-3 rounded-2xl border border-[#e4c98f] bg-[#fff8e8] p-4 text-[#70501d]">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div><h2 className="text-sm font-extrabold">A request is not a refund</h2><p className="mt-1 text-xs leading-5">The case is tracked here and counted as a requested amount in Finance. Any money returned must be recorded separately through the payment refund workflow.</p></div>
    </section>

    <form noValidate onSubmit={reviewRequest} className="space-y-4 rounded-[22px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]">
      <div className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-[#39786f]" aria-hidden="true" /><div><h2 className="font-display text-xl font-semibold text-[#17353c]">Record a return request</h2><p className="text-xs text-[#718087]">Choose the order first so its customer and total can be checked.</p></div></div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative md:col-span-2 xl:col-span-2">
          <label htmlFor="return-order-search" className="text-xs font-bold text-[#617178]">Search orders by order number or customer</label>
          <div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#819095]" aria-hidden="true" /><input id="return-order-search" type="search" value={orderSearch} onChange={(event) => { setOrderSearch(event.target.value); setSelectedOrder(null); setFormError(''); setNotice('') }} placeholder="Type an order number, customer or phone" autoComplete="off" className="h-11 w-full rounded-xl border border-[#263f44]/15 pl-9 pr-3 text-sm outline-none focus:border-[#39786f]" aria-expanded={!selectedOrder && orderSearch.trim().length >= 2} aria-controls="return-order-results" aria-autocomplete="list" />
            {!selectedOrder && orderSearch.trim().length >= 2 ? <div id="return-order-results" role="listbox" aria-label="Matching orders" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-[#263f44]/15 bg-white p-1 shadow-xl">
              {orderResults.isLoading ? <p className="px-3 py-3 text-sm text-[#718087]">Searching orders…</p> : null}
              {orderResults.isError ? <div className="px-3 py-3 text-sm text-rose-700"><p>Orders could not be searched.</p><button type="button" onClick={() => void orderResults.refetch()} className="mt-1 font-bold underline">Retry search</button></div> : null}
              {orderResults.data && results.length ? results.map((order) => <button key={order.id} type="button" role="option" aria-selected="false" onClick={() => { setSelectedOrder(order); setOrderSearch(order.orderNumber); setAmount(''); setFormError(''); setNotice('') }} className="flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left hover:bg-[#f1f6f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#39786f]"><span className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#17353c]"><span>{order.orderNumber}</span><span>{formatMoney(order.grandTotal)}</span></span><span className="text-xs text-[#657681]">{order.customer.name} · {order.state} · {order.orderDate}</span></button>) : null}
              {orderResults.data && !results.length ? <p className="px-3 py-3 text-sm text-[#718087]">No matching orders. Check the spelling or phone number.</p> : null}
            </div> : null}
          </div>
        </div>

        {selectedOrder ? <section aria-label="Selected order" className="rounded-xl border border-[#39786f]/20 bg-[#f2f8f5] p-3 md:col-span-2 xl:col-span-2">
          <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#39786f]">Selected order</p><p className="mt-1 text-sm font-extrabold text-[#17353c]">{selectedOrder.orderNumber}</p><p className="mt-0.5 text-xs text-[#617178]">{selectedOrder.customer.name} · {selectedOrder.customer.phone}</p></div><button type="button" aria-label="Clear selected order" onClick={() => { setSelectedOrder(null); setOrderSearch(''); setAmount('') }} className="rounded-lg p-1.5 text-[#718087] hover:bg-white"><X className="h-4 w-4" aria-hidden="true" /></button></div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span className="rounded-full bg-white px-2 py-1 font-bold text-[#315d57]">{selectedOrder.state}</span><span className="text-[#617178]">Order total <strong className="text-[#17353c]">{formatMoney(selectedOrderTotal)}</strong></span><a href={`#/laundry/orders/${selectedOrder.id}`} className="inline-flex items-center gap-1 font-bold text-[#39786f] hover:underline">View order <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a></div>
        </section> : null}

        <label className="text-xs font-bold text-[#617178]">Requested amount<input aria-label="Requested amount" required min="0.01" step="0.01" type="number" inputMode="decimal" disabled={!selectedOrder} value={amount} onChange={(event) => { setAmount(event.target.value); setFormError(''); setNotice('') }} placeholder="0.00" className="mt-1 h-11 w-full rounded-xl border border-[#263f44]/15 px-3 text-sm disabled:bg-[#f4f6f3] disabled:text-[#89959a]" /><span className="mt-1 block text-[11px] font-normal text-[#718087]">{selectedOrder ? `Maximum ${formatMoney(selectedOrderTotal)} for this order` : 'Select an order to see its maximum'}</span></label>
        <label className="text-xs font-bold text-[#617178]">Reason<select aria-label="Reason" value={reason} onChange={(event) => { setReason(event.target.value as ReturnReason); setFormError(''); setNotice('') }} className="mt-1 h-11 w-full rounded-xl border border-[#263f44]/15 bg-white px-2 text-sm">{reasons.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-bold text-[#617178] md:col-span-2 xl:col-span-3">Evidence note<textarea aria-label="Evidence note" value={note} onChange={(event) => { setNote(event.target.value); setFormError(''); setNotice('') }} maxLength={1000} placeholder="Describe the customer request and supporting evidence (optional)." className="mt-1 min-h-20 w-full rounded-xl border border-[#263f44]/15 px-3 py-2 text-sm font-normal" /><span className="mt-1 block text-right text-[11px] font-normal text-[#819095]">{note.length}/1000</span></label>
        <div className="flex items-end"><button type="submit" disabled={request.isPending || !selectedOrder} className="w-full rounded-xl bg-[#123039] px-3 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Review request</button></div>
      </div>
      {formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{formError}</p> : null}
      {notice ? <p role="status" className="flex items-start gap-2 rounded-xl border border-[#39786f]/20 bg-[#f2f8f5] p-3 text-sm font-semibold text-[#2e6a60]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}</p> : null}
    </form>

    <section aria-label="Return case register" className="overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">
      <header className="flex items-center gap-3 border-b border-[#263f44]/10 p-5"><RotateCcw className="h-5 w-5 text-[#39786f]" aria-hidden="true" /><div><h2 className="font-display text-xl font-semibold text-[#17353c]">Case register</h2><p className="text-xs text-[#718087]">Requests stay linked to their original order; refunds are tracked separately.</p></div></header>
      {cases.data.length ? <div className="divide-y divide-[#263f44]/8">{cases.data.map((rawCase) => { const item = caseShape(rawCase); return <article key={item.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#17353c]">{item.reason} · {formatMoney(item.amount)}</p><span className="rounded-full bg-[#fff4dc] px-2.5 py-1 text-[10px] font-bold uppercase text-[#855815]">{item.status}</span></div><p className="mt-1 text-xs text-[#718087]">{item.orderNumber} · {item.customerName} · {new Date(item.createdAt).toLocaleString('en-IN')}</p>{item.note ? <p className="mt-2 text-sm text-[#52676b]">{item.note}</p> : null}{item.decisionNote ? <p className="mt-2 text-xs font-semibold text-[#52676b]">Review note: {item.decisionNote}</p> : null}</div>
        <a href={`#/laundry/orders/${item.orderId}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#263f44]/15 px-3 py-2 text-xs font-bold text-[#315d57] hover:bg-[#f3f7f4]">Open order <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
      </article> })}</div> : <VisualEmptyState kind="quality" title="No return requests yet" detail="A request appears here with its order, reason and evidence after you review and submit it." />}
    </section>

    {showReview && selectedOrder ? <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b252a]/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReview() }}>
        <section role="dialog" aria-modal="true" aria-labelledby="return-review-title" aria-describedby="return-review-detail" className="w-full max-w-lg rounded-2xl border border-[#263f44]/10 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#4d8982]">Check before saving</p><h2 id="return-review-title" className="mt-1 font-display text-2xl font-semibold text-[#17353c]">Review return request</h2></div><button type="button" aria-label="Close review" onClick={() => setShowReview(false)} className="rounded-lg p-2 text-[#718087] hover:bg-[#f3f5f1]"><X className="h-4 w-4" aria-hidden="true" /></button></div>
        <p id="return-review-detail" className="mt-2 text-sm leading-6 text-[#617178]">This saves a request for staff review. It does not refund the customer or change the order balance.</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-[#f5f8f5] p-4 text-sm"><dt className="text-[#718087]">Order</dt><dd className="font-bold text-[#17353c]">{selectedOrder.orderNumber} · {selectedOrder.customer.name}</dd><dt className="text-[#718087]">Request amount</dt><dd className="font-bold text-[#17353c]">{formatMoney(Number(amount))}</dd><dt className="text-[#718087]">Reason</dt><dd className="font-bold text-[#17353c]">{reason}</dd>{note ? <><dt className="text-[#718087]">Evidence</dt><dd className="break-words text-[#17353c]">{note}</dd></> : null}</dl>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeReview} className="rounded-xl border border-[#263f44]/15 px-4 py-2.5 text-sm font-bold text-[#52676b]">Cancel</button><button type="button" disabled={request.isPending} onClick={() => request.mutate()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#123039] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{request.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{request.isPending ? 'Recording…' : 'Submit return request'}</button></div>
      </section>
    </div> : null}
  </div>
}
