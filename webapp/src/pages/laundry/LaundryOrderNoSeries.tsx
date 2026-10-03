import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, ReceiptText, Save, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiGet, apiPost } from '@/lib/api'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'

type OrderNoSeries = { id: string; name: string; prefix: string; createdAt: string }

export default function LaundryOrderNoSeries() {
  const client = useQueryClient()
  const [adding, setAdding] = useState(false)
  const series = useQuery({ queryKey: ['laundry-order-no-series'], queryFn: () => apiGet<OrderNoSeries[]>('/settings/order-no-series') })
  const create = useMutation({
    mutationFn: (draft: { name: string; prefix: string }) => apiPost<OrderNoSeries>('/settings/order-no-series', draft),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['laundry-order-no-series'] }); setAdding(false) },
  })

  return <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-2 duration-300">
    <Link to="/laundry/settings" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#5740cb] hover:bg-[#f3f0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]"><ArrowLeft className="h-4 w-4" />Back to Settings</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#664cf0]">Store configuration</p><h1 className="mt-1 font-serif text-3xl text-[#241a45]">Order No Series</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6982]">Manage the named prefixes available for this branch’s order numbers.</p></div>
      <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#5740cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0] focus-visible:ring-offset-2"><Plus className="h-4 w-4" />Add Order No Series</button>
    </div>

    <section aria-label="Order number series list" className="mt-6 overflow-hidden rounded-2xl border border-[#272043]/10 bg-white shadow-[0_8px_28px_rgba(32,23,60,.04)]">
      <div className="flex items-center gap-3 border-b border-[#272043]/8 px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eeeaff] text-[#664cf0]"><ReceiptText className="h-4 w-4" /></span><div><h2 className="text-sm font-extrabold text-[#241a45]">Order number series</h2><p className="text-xs text-[#77718a]">{series.data?.length ?? 0} configured</p></div></div>
      {series.isLoading ? <p className="p-8 text-center text-sm text-[#77718a]">Loading order number series…</p> : series.error ? <div className="p-6"><p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{series.error instanceof Error ? series.error.message : 'Could not load order number series.'}</p><button type="button" onClick={() => series.refetch()} className="mt-3 rounded-lg border border-[#ded9f7] px-3 py-2 text-sm font-bold text-[#5740cb]">Try again</button></div> : series.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-[#f8f7fc] text-[11px] font-bold uppercase tracking-wide text-[#77718a]"><tr><th className="px-5 py-3">Series Name</th><th className="px-5 py-3">Prefix</th></tr></thead><tbody className="divide-y divide-[#272043]/8">{series.data.map((row) => <tr key={row.id}><td className="px-5 py-3 font-semibold text-[#332849]">{row.name}</td><td className="px-5 py-3 font-mono text-[#5740cb]">{row.prefix}</td></tr>)}</tbody></table></div> : <div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f3f0ff] text-[#664cf0]"><ReceiptText className="h-5 w-5" /></span><h2 className="mt-3 text-base font-extrabold text-[#332849]">No Data Found</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-[#77718a]">Add a series name and prefix when your branch is ready to use custom order numbers.</p><button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-2 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]"><Plus className="h-3.5 w-3.5" />Add Order No Series</button></div>}
    </section>
    {adding ? <OrderNoSeriesDialog saving={create.isPending} error={create.error} onClose={() => setAdding(false)} onSave={(draft) => create.mutate(draft)} /> : null}
  </div>
}

function OrderNoSeriesDialog({ saving, error, onClose, onSave }: { saving: boolean; error: unknown; onClose: () => void; onSave: (draft: { name: string; prefix: string }) => void }) {
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const dialog = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  const canSave = Boolean(name.trim() && prefix.trim()) && !saving
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-labelledby="order-series-title" tabIndex={-1} onKeyDown={dialog.onKeyDown} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Order number series</p><h2 id="order-series-title" className="mt-1 font-serif text-2xl text-[#241a45]">Add Order No Series</h2></div><button ref={dialog.initialFocusRef} type="button" aria-label="Close series form" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#686479] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button></div>
      <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); if (canSave) onSave({ name: name.trim(), prefix: prefix.trim() }) }}>
        <label className="block text-sm font-semibold text-[#332849]">Series Name <span className="text-rose-600">*</span><input autoFocus required maxLength={100} aria-label="Series Name" placeholder="Enter series name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#272043]/15 px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]" /><span className="mt-1 block text-right text-[11px] font-normal text-[#77718a]">{name.length}/100</span></label>
        <label className="block text-sm font-semibold text-[#332849]">Prefix <span className="text-rose-600">*</span><input required maxLength={20} aria-label="Prefix" placeholder="Enter prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#272043]/15 px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]" /><span className="mt-1 block text-right text-[11px] font-normal text-[#77718a]">{prefix.length}/20</span></label>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error instanceof Error ? error.message : 'Could not save this series.'}</p> : null}
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67] hover:bg-[#f8f7fc]">Cancel</button><button type="submit" disabled={!canSave} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>
  </div>
}
