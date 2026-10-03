import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeIndianRupee, Check, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Save, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { StoreChargeFields, type StoreChargeFormValue } from '@/components/laundry/StoreChargeFields'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { formatINR } from '@/lib/utils'

type ChargeRule = { id: string; name: string; type: 'Flat' | 'Percentage'; amount: number; expressCharge?: boolean; description?: string; active?: boolean }
type ChargeInput = { name: string; type: 'Flat' | 'Percentage'; amount: number; expressCharge: boolean; description: string; active: boolean }
const blankDraft: StoreChargeFormValue = { name: '', type: '', amount: '', expressCharge: false, description: '', active: true }

export default function LaundryStoreCharges() {
  const client = useQueryClient()
  const [editing, setEditing] = useState<ChargeRule | null>(null)
  const [adding, setAdding] = useState(false)
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  const charges = useQuery({ queryKey: ['laundry-charge-rules'], queryFn: () => apiGet<ChargeRule[]>('/laundry/catalogue/charges') })
  const save = useMutation({
    mutationFn: ({ id, draft }: { id?: string; draft: ChargeInput }) => id
      ? apiPatch<ChargeRule>(`/laundry/catalogue/charges/${id}`, draft)
      : apiPost<ChargeRule>('/laundry/catalogue/charges', draft),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['laundry-catalogue'] })
      client.invalidateQueries({ queryKey: ['laundry-charge-rules'] })
      setAdding(false)
      setEditing(null)
      setNotice('Store charge saved.')
    },
  })
  const rows = charges.data || []
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = rows.length ? (currentPage - 1) * pageSize + 1 : 0
  const end = Math.min(currentPage * pageSize, rows.length)
  const visibleRows = rows.slice(start ? start - 1 : 0, end)

  function openAdd() {
    save.reset()
    setNotice('')
    setEditing(null)
    setAdding(true)
  }

  function openEdit(rule: ChargeRule) {
    save.reset()
    setNotice('')
    setAdding(false)
    setEditing(rule)
  }

  return <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-2 duration-300">
    <Link to="/laundry/settings" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#5740cb] hover:bg-[#f3f0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]"><ArrowLeft className="h-4 w-4" />Back to Settings</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#664cf0]">Pricing</p><h1 className="mt-1 font-serif text-3xl text-[#241a45]">Store Charges</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6982]">Set the charges staff can use for a laundry order. Express charges are selected when Express Delivery is chosen.</p></div>
      <button type="button" onClick={openAdd} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#5740cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0] focus-visible:ring-offset-2"><Plus className="h-4 w-4" />Add Store Charge</button>
    </div>
    {notice ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}

    <section aria-label="Store charges" className="mt-6 overflow-hidden rounded-2xl border border-[#272043]/10 bg-white shadow-[0_8px_28px_rgba(32,23,60,.04)]">
      <div className="flex items-center gap-3 border-b border-[#272043]/8 px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eeeaff] text-[#5740cb]"><BadgeIndianRupee className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-[#241a45]">Charge rules</h2><p className="text-xs text-[#77718a]">{charges.isLoading ? 'Loading…' : `${rows.length} configured`}</p></div><button type="button" aria-label="Refresh charges" onClick={() => void charges.refetch()} className="grid h-9 w-9 place-items-center rounded-lg text-[#5740cb] hover:bg-[#f5f2ff]"><RefreshCw className="h-4 w-4" /></button></div>
      {charges.isLoading ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-[#77718a]"><Loader2 className="h-4 w-4 animate-spin" />Loading charges…</p>
        : charges.error ? <div className="p-6"><p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{charges.error instanceof Error ? charges.error.message : 'Could not load store charges.'}</p><button type="button" onClick={() => void charges.refetch()} className="mt-3 rounded-lg border border-[#ded9f7] px-3 py-2 text-sm font-bold text-[#5740cb]">Try again</button></div>
          : rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#f8f7fc] text-[11px] font-bold uppercase tracking-wide text-[#77718a]"><tr><th scope="col" className="px-5 py-3">Charge Name</th><th scope="col" className="px-5 py-3">Charge In Type</th><th scope="col" className="px-5 py-3">Charge Amount</th><th scope="col" className="px-5 py-3">Express charge</th><th scope="col" className="px-5 py-3">Description</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#272043]/8">{visibleRows.map((rule) => <tr key={rule.id}><td className="px-5 py-3 font-semibold text-[#332849]">{rule.name}</td><td className="px-5 py-3 text-[#5740cb]">{rule.type === 'Percentage' ? 'Percentage' : 'Amount'}</td><td className="px-5 py-3 font-semibold text-[#332849]">{rule.type === 'Percentage' ? `${rule.amount}%` : formatINR(rule.amount)}</td><td className="px-5 py-3">{rule.expressCharge ? <span className="rounded-full bg-[#fff2ce] px-2.5 py-1 text-[11px] font-bold text-[#855815]">Express</span> : <span className="text-[#77718a]">—</span>}</td><td className="max-w-xs truncate px-5 py-3 text-[#686479]">{rule.description || '—'}</td><td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${rule.active === false ? 'bg-[#f1eff5] text-[#686479]' : 'bg-emerald-50 text-emerald-800'}`}>{rule.active === false ? 'Paused' : 'Active'}</span></td><td className="px-5 py-3 text-right"><button type="button" onClick={() => openEdit(rule)} className="min-h-9 rounded-lg border border-[#ded9f7] px-3 py-1.5 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]">Edit</button></td></tr>)}</tbody></table></div>
            : <div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f2efff] text-[#664cf0]"><BadgeIndianRupee className="h-5 w-5" /></span><h2 className="mt-3 text-base font-extrabold text-[#332849]">No Data Found</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-[#77718a]">Add a charge name, choose its type, then save it for the counter team. Mark a charge for Express Delivery to select it automatically.</p><button type="button" onClick={openAdd} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-2 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]"><Plus className="h-3.5 w-3.5" />Add Store Charge</button></div>}
      {!charges.isLoading && !charges.error && rows.length ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#272043]/8 px-5 py-3 text-xs text-[#6b667b]" aria-live="polite"><span>Showing {start}–{end} of {rows.length}</span><div className="flex items-center gap-2"><label htmlFor="store-charge-page-size" className="font-semibold">Items per page</label><select id="store-charge-page-size" aria-label="Items per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="rounded-lg border border-[#342a63]/15 bg-white px-2 py-1.5 font-semibold text-[#423b52]">{[10, 20, 50, 100, 500].map((size) => <option key={size} value={size}>{size}</option>)}</select><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-[#342a63]/15 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-12 text-center">{currentPage} / {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-[#342a63]/15 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div> : null}
    </section>

    {adding || editing ? <StoreChargeDialog key={editing?.id || 'new'} rule={editing} saving={save.isPending} error={save.error} onClose={() => { setAdding(false); setEditing(null); save.reset() }} onSave={(draft) => save.mutate({ id: editing?.id, draft })} /> : null}
  </div>
}

function StoreChargeDialog({ rule, saving, error, onClose, onSave }: { rule: ChargeRule | null; saving: boolean; error: unknown; onClose: () => void; onSave: (draft: ChargeInput) => void }) {
  const [form, setForm] = useState<StoreChargeFormValue>(() => rule ? { name: rule.name, type: rule.type, amount: String(rule.amount), expressCharge: Boolean(rule.expressCharge), description: rule.description || '', active: rule.active !== false } : blankDraft)
  const dialog = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.type) return
    onSave({ name: form.name.trim(), type: form.type, amount: Number(form.amount), expressCharge: form.expressCharge, description: form.description.trim(), active: form.active })
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-labelledby="store-charge-title" tabIndex={-1} onKeyDown={dialog.onKeyDown} className="max-h-[98vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Store Charges</p><h2 id="store-charge-title" className="mt-1 font-serif text-2xl text-[#241a45]">{rule ? 'Edit Store Charge' : 'Add Store Charge'}</h2></div><button ref={dialog.initialFocusRef} type="button" aria-label="Close charge form" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#686479] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button></div>
      <form className="mt-3 space-y-2" onSubmit={submit}>
        <StoreChargeFields form={form} onChange={setForm} autoFocusName={!rule} />
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error instanceof Error ? error.message : 'Could not save this store charge.'}</p> : null}
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex justify-end gap-2 border-t border-[#272043]/8 bg-white/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67] hover:bg-[#f8f7fc]">Cancel</button><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>
  </div>
}
