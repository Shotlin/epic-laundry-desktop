import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeIndianRupee, ChevronDown, ChevronLeft, ChevronRight, Package, Plus, Save, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'
import { apiGet, apiPost } from '@/lib/api'
import { isWebOnly } from '@/lib/cloudAuth'

type Service = { id: string; name: string; active?: boolean }
type ServiceLimit = { serviceId: string; quantityLimit: number; amountLimit: number }
type StorePackage = {
  id: string
  name: string
  amount: number
  services: Array<{ id: string; name: string }>
  limitsEnabled: boolean
  serviceLimits: ServiceLimit[]
  createdAt: string
}
type LimitDraft = { quantityLimit: string; amountLimit: string }

const formatMoney = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)

export default function LaundryStorePackages() {
  const client = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)
  const packages = useQuery({ queryKey: ['laundry-store-packages'], queryFn: () => apiGet<StorePackage[]>('/settings/store-packages') })
  const services = useQuery({ queryKey: ['laundry-settings-services'], queryFn: () => apiGet<Service[]>('/laundry/settings/services') })
  const create = useMutation({
    mutationFn: (draft: { name: string; amount: number; serviceIds: string[]; limitsEnabled: boolean; serviceLimits: ServiceLimit[] }) => apiPost<StorePackage>('/settings/store-packages', draft),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['laundry-store-packages'] })
      setAdding(false)
      setNotice('Store Package added.')
    },
  })
  const activeServices = useMemo(() => (services.data || []).filter((service) => service.active !== false), [services.data])
  const rows = packages.data || []
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = rows.length ? (currentPage - 1) * pageSize + 1 : 0
  const end = Math.min(currentPage * pageSize, rows.length)
  const visiblePackages = rows.slice(start ? start - 1 : 0, end)

  if (packages.isLoading || services.isLoading) return <VisualLoadingState title="Loading Store Packages" detail="Getting this branch’s package setup and service list." />
  if (packages.isError || services.isError) return <div className="mx-auto max-w-5xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><h1 className="text-lg font-extrabold">Store Packages could not be loaded</h1><p role="alert" className="mt-1 text-sm">Check your connection and try again.</p><button type="button" onClick={() => { void packages.refetch(); void services.refetch() }} className="mt-3 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold">Try again</button></div>

  return <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-2 duration-300">
    <Link to="/laundry/settings" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#5740cb] hover:bg-[#f3f0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]"><ArrowLeft className="h-4 w-4" />Back to Settings</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#664cf0]">Store configuration</p><h1 className="mt-1 font-serif text-3xl text-[#241a45]">Store Packages</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6982]">Set up package names, amounts and included services for this branch.</p></div>
      <button type="button" onClick={() => { create.reset(); setAdding(true) }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#5740cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0] focus-visible:ring-offset-2"><Plus className="h-4 w-4" />Add Store Package</button>
    </div>
    {notice ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
    <div className="mt-5 rounded-xl border border-[#d7cffb] bg-[#f8f6ff] px-4 py-3 text-sm leading-5 text-[#514778]">
      <p><strong>Package setup only.</strong> Service-wise quantity and amount limits are saved here as configuration. They are not connected to customer package purchase or redemption while their MyUniClean rules remain unverified.</p>
      {isWebOnly ? <p className="mt-1 text-xs">This connected web version stores these settings in this browser for the current branch. They will not appear in another browser until LNDRY provides a package settings API.</p> : null}
    </div>
    <section aria-label="Store package list" className="mt-5 overflow-hidden rounded-2xl border border-[#272043]/10 bg-white shadow-[0_8px_28px_rgba(32,23,60,.04)]">
      <div className="flex items-center gap-3 border-b border-[#272043]/8 px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eeeaff] text-[#664cf0]"><Package className="h-4 w-4" /></span><div><h2 className="text-sm font-extrabold text-[#241a45]">Package list</h2><p className="text-xs text-[#77718a]">{packages.data?.length ?? 0} configured for this branch</p></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#272043]/8 px-5 py-3 text-xs text-[#6b667b]" aria-live="polite"><span>Showing {start}–{end} of {rows.length}</span><div className="flex items-center gap-2"><label htmlFor="store-package-page-size" className="font-semibold">Items per page</label><select id="store-package-page-size" aria-label="Items per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="rounded-lg border border-[#342a63]/15 bg-white px-2 py-1.5 font-semibold text-[#423b52]">{[10, 20, 50, 100, 500].map((size) => <option key={size} value={size}>{size}</option>)}</select><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-[#342a63]/15 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-12 text-center">{currentPage} / {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-[#342a63]/15 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f8f7fc] text-[11px] font-bold uppercase tracking-wide text-[#77718a]"><tr><th className="px-5 py-3">Package Name</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Services</th><th className="px-5 py-3">Service-wise Limits</th></tr></thead><tbody className="divide-y divide-[#272043]/8">{visiblePackages.map((item) => <tr key={item.id}><td className="px-5 py-3 font-semibold text-[#332849]">{item.name}</td><td className="whitespace-nowrap px-5 py-3 font-semibold text-[#332849]">{formatMoney(item.amount)}</td><td className="px-5 py-3">{item.services.length ? <div className="flex flex-wrap gap-1.5">{item.services.map((service) => <span key={service.id} className="rounded-full bg-[#f2efff] px-2.5 py-1 text-xs font-semibold text-[#5740cb]">{service.name}</span>)}</div> : <span className="text-xs text-[#77718a]">No services selected</span>}</td><td className="px-5 py-3 text-xs font-semibold text-[#625c72]">{item.limitsEnabled ? `${item.serviceLimits.length} service limit group${item.serviceLimits.length === 1 ? '' : 's'}` : 'Not added'}</td></tr>)}</tbody></table></div> : <div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f3f0ff] text-[#664cf0]"><Package className="h-5 w-5" /></span><h2 className="mt-3 text-base font-extrabold text-[#332849]">No Data Found</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-[#77718a]">Add a Store Package to save its name, amount and selected services.</p><button type="button" onClick={() => { create.reset(); setAdding(true) }} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-2 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]"><Plus className="h-3.5 w-3.5" />Add Store Package</button></div>}
    </section>
    {adding ? <StorePackageDialog services={activeServices} saving={create.isPending} error={create.error} onClose={() => setAdding(false)} onSave={(draft) => create.mutate(draft)} /> : null}
  </div>
}

function StorePackageDialog({ services, saving, error, onClose, onSave }: { services: Service[]; saving: boolean; error: unknown; onClose: () => void; onSave: (draft: { name: string; amount: number; serviceIds: string[]; limitsEnabled: boolean; serviceLimits: ServiceLimit[] }) => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false)
  const [limitsEnabled, setLimitsEnabled] = useState(false)
  const [limits, setLimits] = useState<Record<string, LimitDraft>>({})
  const dialog = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  const selectedServices = services.filter((service) => selectedIds.includes(service.id))
  const amountValue = amount === '' ? Number.NaN : Number(amount)
  const canSave = Boolean(name.trim() && name.trim().length <= 100 && Number.isFinite(amountValue) && amountValue >= 0 && amountValue <= Number.MAX_SAFE_INTEGER / 100 && !saving)

  function toggleService(service: Service) {
    setSelectedIds((current) => {
      if (current.includes(service.id)) {
        setLimits((previous) => { const next = { ...previous }; delete next[service.id]; return next })
        return current.filter((id) => id !== service.id)
      }
      setLimits((previous) => ({ ...previous, [service.id]: previous[service.id] || { quantityLimit: '0', amountLimit: '0.00' } }))
      return [...current, service.id]
    })
  }
  function addLimits() {
    setLimits((current) => Object.fromEntries(selectedServices.map((service) => [service.id, current[service.id] || { quantityLimit: '0', amountLimit: '0.00' }])))
    setLimitsEnabled(true)
  }
  function updateLimit(serviceId: string, key: keyof LimitDraft, value: string) {
    setLimits((current) => ({ ...current, [serviceId]: { ...(current[serviceId] || { quantityLimit: '0', amountLimit: '0.00' }), [key]: value } }))
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
    const serviceLimits = limitsEnabled ? selectedServices.map((service) => ({ serviceId: service.id, quantityLimit: Number(limits[service.id]?.quantityLimit), amountLimit: Number(limits[service.id]?.amountLimit) })) : []
    if (serviceLimits.some((limit) => !Number.isFinite(limit.quantityLimit) || limit.quantityLimit < 0 || !Number.isFinite(limit.amountLimit) || limit.amountLimit < 0)) return
    onSave({ name: name.trim().replace(/\s+/g, ' '), amount: amountValue, serviceIds: selectedIds, limitsEnabled, serviceLimits })
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-3 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-labelledby="store-package-title" tabIndex={-1} onKeyDown={dialog.onKeyDown} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Store Packages</p><h2 id="store-package-title" className="mt-1 font-serif text-2xl text-[#241a45]">Add Store Package</h2></div><button ref={dialog.initialFocusRef} type="button" aria-label="Close package form" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#686479] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button></div>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold text-[#332849]">Package Name <span className="text-rose-600">*</span><input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter package name" aria-label="Package Name" className="mt-1.5 h-11 w-full rounded-xl border border-[#272043]/15 px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]" /><span className="mt-1 block text-right text-[11px] font-normal text-[#77718a]">{name.length}/100</span></label>
        <label className="block text-sm font-semibold text-[#332849]">Amount <span className="text-rose-600">*</span><span className="relative mt-1.5 block"><BadgeIndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77718a]" /><input required type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" aria-label="Amount" className="h-11 w-full rounded-xl border border-[#272043]/15 pl-9 pr-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]" /></span></label>
        <fieldset><legend className="text-sm font-semibold text-[#332849]">Services</legend><p className="mt-1 text-xs leading-5 text-[#77718a]">Choose the services included in this Store Package.</p><div className="relative mt-2"><button type="button" aria-haspopup="true" aria-expanded={serviceMenuOpen} aria-controls={serviceMenuOpen ? 'store-package-services' : undefined} onClick={() => setServiceMenuOpen((open) => !open)} disabled={!services.length} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#272043]/15 bg-white px-3 text-left text-sm text-[#332849] outline-none focus:ring-2 focus:ring-[#664cf0] disabled:cursor-not-allowed disabled:opacity-50"><span>{selectedIds.length ? `${selectedIds.length} service${selectedIds.length === 1 ? '' : 's'} selected` : services.length ? 'Select services' : 'No active services available'}</span><ChevronDown className={`h-4 w-4 transition ${serviceMenuOpen ? 'rotate-180' : ''}`} /></button>{serviceMenuOpen ? <div id="store-package-services" role="group" aria-label="Available services" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setServiceMenuOpen(false) } }} className="absolute z-20 mt-1 w-full rounded-xl border border-[#d9d3ec] bg-white p-2 shadow-xl"><div className="max-h-48 overflow-y-auto">{services.map((service) => <label key={service.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm text-[#332849] hover:bg-[#f5f2ff]"><input type="checkbox" checked={selectedIds.includes(service.id)} onChange={() => toggleService(service)} className="h-4 w-4 rounded border-[#8f87a5] text-[#664cf0] focus:ring-[#664cf0]" />{service.name}</label>)}</div><div className="sticky bottom-0 border-t border-[#272043]/8 bg-white pt-2"><button type="button" onClick={() => setServiceMenuOpen(false)} className="min-h-9 w-full rounded-lg bg-[#f2efff] px-3 text-xs font-bold text-[#5740cb] hover:bg-[#e9e4ff]">Done choosing services</button></div></div> : null}</div><div aria-live="polite" className="mt-2 flex flex-wrap gap-1.5">{selectedServices.map((service) => <span key={service.id} className="rounded-full bg-[#f2efff] px-2.5 py-1 text-xs font-semibold text-[#5740cb]">{service.name}</span>)}</div></fieldset>
        {selectedServices.length && !limitsEnabled ? <button type="button" onClick={addLimits} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#664cf0]/25 px-3 py-2 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]"><Plus className="h-3.5 w-3.5" />Add Service-wise Usage Limit</button> : null}
        {limitsEnabled ? <section aria-label="Service-wise usage limits" className="rounded-xl border border-[#ded9f7] bg-[#faf9ff] p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-extrabold text-[#332849]">Service-wise Usage Limits</h3><p className="mt-0.5 text-xs text-[#77718a]">Set the values to save with each selected service.</p></div><button type="button" onClick={() => setLimitsEnabled(false)} className="min-h-8 rounded-lg px-2 text-xs font-bold text-[#5740cb] hover:bg-[#eeeaff]">Remove Limits</button></div><div className="mt-3 space-y-3">{selectedServices.map((service) => <div key={service.id} className="rounded-xl border border-[#272043]/10 bg-white p-3"><h4 className="mb-2 text-sm font-bold text-[#332849]">{service.name}</h4><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#625c72]">Quantity Limit<input type="number" min="0" step="0.001" required value={limits[service.id]?.quantityLimit ?? '0'} onChange={(event) => updateLimit(service.id, 'quantityLimit', event.target.value)} aria-label={`Quantity Limit for ${service.name}`} className="mt-1.5 h-10 w-full rounded-lg border border-[#272043]/15 px-3 text-sm text-[#332849] outline-none focus:ring-2 focus:ring-[#664cf0]" /></label><label className="block text-xs font-semibold text-[#625c72]">Amount Limit<input type="number" min="0" step="0.01" required value={limits[service.id]?.amountLimit ?? '0.00'} onChange={(event) => updateLimit(service.id, 'amountLimit', event.target.value)} aria-label={`Amount Limit for ${service.name}`} className="mt-1.5 h-10 w-full rounded-lg border border-[#272043]/15 px-3 text-sm text-[#332849] outline-none focus:ring-2 focus:ring-[#664cf0]" /></label></div></div>)}</div></section> : null}
        <p className="rounded-xl bg-[#f6f5fb] px-3 py-2 text-xs leading-5 text-[#5b5472]">These saved service limits are setup values only; they do not change the separate Care Package purchase or redemption flow.</p>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error instanceof Error ? error.message : 'Could not save this Store Package.'}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#272043]/8 pt-4"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67] hover:bg-[#f8f7fc]">Cancel</button><button type="submit" disabled={!canSave} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>
  </div>
}
