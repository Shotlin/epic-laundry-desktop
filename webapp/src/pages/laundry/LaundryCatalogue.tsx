import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, CircleDollarSign, ImageOff, Loader2, PackagePlus, Pencil, Plus, RefreshCw, Ruler, Shirt, SlidersHorizontal, Sparkles, Tags, X } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { garmentVisuals, lndryBrand } from '@/assets/generated/manifest'
import { apiGet, apiPatch, apiPost, operatorErrorMessage } from '@/lib/api'
import type { LaundryCatalogue as Catalogue } from '@/lib/laundry'
import { cn, formatINR } from '@/lib/utils'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'
import { StoreChargeFields, type StoreChargeFormValue } from '@/components/laundry/StoreChargeFields'
import { StoreDiscountFields } from '@/components/laundry/StoreDiscountFields'

type Session = { user: { roles: string[] } | null }
type SetupProgress = { catalogue: boolean }
type Customer = { id: string; name: string; phone: string }
type RuleType = 'Flat' | 'Percentage'
type EditTarget = { kind: 'category' | 'service' | 'garment' | 'price' | 'charge' | 'discount' | 'tax'; value?: any }
const emptyEdit: EditTarget = { kind: 'category' }

export default function LaundryCatalogue() {
  const client = useQueryClient()
  const location = useLocation()
  const requestedView = new URLSearchParams(location.search).get('view')
  const catalogueView = requestedView === 'pricing' || requestedView === 'garments' ? requestedView : null
  const [editor, setEditor] = useState<EditTarget | null>(null)
  const [notice, setNotice] = useState('')
  const [priceGarmentSearch, setPriceGarmentSearch] = useState('')
  const [priceServiceFilter, setPriceServiceFilter] = useState('')
  const [priceUnitFilter, setPriceUnitFilter] = useState('')
  const [priceStatusFilter, setPriceStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [pricePageSize, setPricePageSize] = useState(100)
  const [pricePage, setPricePage] = useState(1)
  const catalogue = useQuery({ queryKey: ['laundry-catalogue'], queryFn: () => apiGet<Catalogue>('/laundry/catalogue') })
  const session = useQuery({ queryKey: ['auth-session'], queryFn: () => apiGet<Session>('/auth/session') })
  const customers = useQuery({ queryKey: ['catalogue-customers'], queryFn: () => apiGet<Customer[]>('/laundry/customers?search='), enabled: Boolean(session.data?.user?.roles.includes('owner')) })
  const isOwner = Boolean(session.data?.user?.roles.includes('owner'))
  const setupProgress = useQuery({ queryKey: ['setup-progress'], queryFn: () => apiGet<SetupProgress>('/settings/setup-progress'), enabled: isOwner })
  const confirmCatalogue = useMutation({ mutationFn: () => apiPost<SetupProgress>('/settings/setup-progress', { catalogue: true }), onSuccess: (progress) => { client.setQueryData(['setup-progress'], progress); setNotice('Catalogue review recorded in the owner setup audit.') }, onError: (error: Error) => setNotice(error.message || 'Could not record catalogue review.') })
  // Pulls this vendor's real, admin-approved garment/service catalogue
  // (categories, services, garments, prices, and each garment's own real
  // photo where an admin uploaded one) from the LNDRY marketplace and
  // updates this store's local master data in place — the same sync that
  // ran automatically on first connect, re-runnable any time new items or
  // photos are approved on the vendor side.
  const syncCatalogue = useMutation({
    mutationFn: () => apiPost<{ categoriesSeen: number; servicesSeen: number; garmentsSeen: number; created: number; updated: number; imagesEmbedded: number }>('/marketplace/cloud/catalogue-sync', {}),
    onSuccess: (summary) => { client.invalidateQueries({ queryKey: ['laundry-catalogue'] }); setNotice(`Synced from LNDRY: ${summary.garmentsSeen} garments, ${summary.categoriesSeen} categories, ${summary.imagesEmbedded} real photo(s) — ${summary.created} added, ${summary.updated} updated.`) },
    onError: (error: Error) => setNotice(operatorErrorMessage(error, 'Could not sync the real catalogue from LNDRY — check the marketplace connection.')),
  })
  const save = useMutation({
    mutationFn: async ({ target, data }: { target: EditTarget; data: Record<string, unknown> }) => {
      const { kind, value } = target
      const name = kind === 'category' ? 'categories' : kind === 'service' ? 'services' : kind === 'garment' ? 'garments' : kind === 'price' ? 'prices' : kind === 'charge' ? 'charges' : kind === 'discount' ? 'discounts' : 'taxes'
      return value?.id ? apiPatch(`/laundry/catalogue/${name}/${value.id}`, data) : apiPost(`/laundry/catalogue/${name}`, data)
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ['laundry-catalogue'] }); setEditor(null); setNotice('Master data saved. New counter quotes read the updated active rules; booked orders retain their original rates.') },
    onError: (error: Error) => setNotice(error.message || 'The master-data change could not be saved.'),
  })

  const data = catalogue.data
  const garmentById = useMemo(() => new Map((data?.garments || []).map((item) => [item.id, item])), [data?.garments])
  const priceServiceOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const price of data?.prices || []) {
      const name = price.serviceName.trim()
      if (name && !names.has(name.toLocaleLowerCase())) names.set(name.toLocaleLowerCase(), displayServiceName(name))
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b))
  }, [data?.prices])
  const priceGarmentOptions = useMemo(() => {
    const names = new Map<string, { name: string; rates: number }>()
    for (const price of data?.prices || []) {
      const name = price.garmentName.trim()
      if (!name) continue
      const key = name.toLocaleLowerCase()
      const existing = names.get(key)
      names.set(key, { name: existing?.name || name, rates: (existing?.rates || 0) + 1 })
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [data?.prices])
  const filteredPrices = useMemo(() => {
    const search = priceGarmentSearch.trim().toLocaleLowerCase()
    return (data?.prices || []).filter((price) => {
      if (search && !price.garmentName.toLocaleLowerCase().includes(search)) return false
      if (priceServiceFilter && displayServiceName(price.serviceName) !== displayServiceName(priceServiceFilter)) return false
      const unit = garmentById.get(price.garment)?.unit || ''
      if (priceUnitFilter && unit.toLocaleLowerCase() !== priceUnitFilter.toLocaleLowerCase()) return false
      if (priceStatusFilter === 'enabled' && price.active === false) return false
      if (priceStatusFilter === 'disabled' && price.active !== false) return false
      return true
    })
  }, [data?.prices, garmentById, priceGarmentSearch, priceServiceFilter, priceStatusFilter, priceUnitFilter])
  const pricePageCount = Math.max(1, Math.ceil(filteredPrices.length / pricePageSize))
  const currentPricePage = Math.min(pricePage, pricePageCount)
  const priceStart = filteredPrices.length ? (currentPricePage - 1) * pricePageSize + 1 : 0
  const priceEnd = Math.min(currentPricePage * pricePageSize, filteredPrices.length)
  const visiblePrices = filteredPrices.slice(priceStart ? priceStart - 1 : 0, priceEnd)
  const hasPriceFilters = Boolean(priceGarmentSearch || priceServiceFilter || priceUnitFilter || priceStatusFilter !== 'all')
  useEffect(() => {
    if (!data || !catalogueView) return
    const target = document.getElementById(`catalogue-${catalogueView}`)
    target?.scrollIntoView({ block: 'start' })
    target?.focus({ preventScroll: true })
  }, [catalogueView, data])
  function clearPriceFilters() {
    setPriceGarmentSearch('')
    setPriceServiceFilter('')
    setPriceUnitFilter('')
    setPriceStatusFilter('all')
    setPricePage(1)
  }
  if (catalogue.isLoading || session.isLoading) return <VisualLoadingState title="Loading catalogue" detail="Reading garments, services, prices and visual identities for this store." />
  if (catalogue.isError || !data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">The laundry catalogue could not be loaded.</div>
  return <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
    <header className="relative overflow-hidden rounded-[28px] bg-[#201847] p-6 text-white shadow-[0_20px_50px_rgba(51,31,118,.22)] md:p-8">
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border-[28px] border-white/10" /><div className="absolute bottom-0 right-16 h-28 w-28 rounded-t-full bg-[#9c8cff]/20" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#bfb5ff]">Lndry master data</p><h1 className="mt-2 font-serif text-3xl">Catalogue command centre</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#ddd8ff]">Your counter catalogue starts from your LNDRY services. Add counter-only garments and services, and set counter prices that never change what customers see in the LNDRY app.</p></div>{isOwner ? <div className="flex flex-wrap gap-2"><button type="button" disabled={syncCatalogue.isPending} onClick={() => syncCatalogue.mutate()} title="Pull the latest approved garments, services and photos from your LNDRY marketplace account" className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-default disabled:opacity-70"><RefreshCw className={cn('h-4 w-4', syncCatalogue.isPending && 'animate-spin')} />{syncCatalogue.isPending ? 'Syncing…' : 'Sync from LNDRY'}</button><button type="button" disabled={confirmCatalogue.isPending || setupProgress.data?.catalogue} onClick={() => confirmCatalogue.mutate()} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-default disabled:opacity-70"><Check className="h-4 w-4" />{setupProgress.data?.catalogue ? 'Catalogue reviewed' : 'Mark reviewed'}</button><button type="button" onClick={() => setEditor({ kind: 'garment' })} className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#382a7b] shadow-lg transition hover:bg-[#f1efff]"><PackagePlus className="h-4 w-4" />Add garment</button></div> : <span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-[#ddd8ff]">Read-only catalogue access</span>}</div>
    </header>
    {catalogueView ? <p role="status" className="mt-4 rounded-xl border border-[#664cf0]/15 bg-[#f4f1ff] px-4 py-3 text-sm text-[#443694]">{catalogueView === 'pricing' ? 'Garment pricing' : 'Garments'} selected from Store settings.</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-xl border border-[#664cf0]/15 bg-[#f4f1ff] px-4 py-3 text-sm text-[#443694]">{notice}</p> : null}
    <section className="mt-5 grid gap-3 md:grid-cols-4"><Metric label="Categories" value={data.categories.length} note="Counter organisation" /><Metric label="Services" value={data.services.length} note="Unit-aware processing" /><Metric label="Price rules" value={data.prices.length} note="General + special rates" /><Metric label="Adjustments" value={data.chargeRules.length + data.discountRules.length + data.taxRules.length} note="Server-calculated" /></section>
    <section className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="min-w-0 space-y-5"><Panel id="catalogue-pricing" title="Garment price matrix" subtitle="The actual rules the counter can use" icon={<Tags className="h-5 w-5" />} action={isOwner ? <button type="button" onClick={() => setEditor({ kind: 'price' })} className={actionClass}><Plus className="h-4 w-4" />Price rule</button> : undefined}>
        <PriceMatrixFilters
          garmentSearch={priceGarmentSearch}
          garments={priceGarmentOptions}
          service={priceServiceFilter}
          unit={priceUnitFilter}
          status={priceStatusFilter}
          services={priceServiceOptions}
          units={serviceUnitOptions(data)}
          hasFilters={hasPriceFilters}
          onGarmentSearch={(value) => { setPriceGarmentSearch(value); setPricePage(1) }}
          onServiceChange={(value) => { setPriceServiceFilter(value); setPricePage(1) }}
          onUnitChange={(value) => { setPriceUnitFilter(value); setPricePage(1) }}
          onStatusChange={(value) => { setPriceStatusFilter(value); setPricePage(1) }}
          onClear={clearPriceFilters}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#342a63]/8 px-4 py-3 text-xs text-[#6b667b]" aria-live="polite">
          <span>{filteredPrices.length ? `Showing ${priceStart}–${priceEnd} of ${filteredPrices.length} price rules` : 'Showing 0 price rules'}</span>
          <div className="flex items-center gap-2">
            <label htmlFor="catalogue-price-page-size" className="font-semibold">Items per page</label>
            <select id="catalogue-price-page-size" aria-label="Items per page" value={pricePageSize} onChange={(event) => { setPricePageSize(Number(event.target.value)); setPricePage(1) }} className="rounded-lg border border-[#342a63]/15 bg-white px-2 py-1.5 font-semibold text-[#423b52] focus:outline-none focus:ring-2 focus:ring-[#664cf0]/30">
              {[10, 20, 50, 100, 500].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <button type="button" onClick={() => setPricePage((page) => Math.max(1, page - 1))} disabled={currentPricePage <= 1} className="rounded-lg border border-[#342a63]/15 px-2.5 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <span className="min-w-12 text-center">{currentPricePage} / {pricePageCount}</span>
            <button type="button" onClick={() => setPricePage((page) => Math.min(pricePageCount, page + 1))} disabled={currentPricePage >= pricePageCount} className="rounded-lg border border-[#342a63]/15 px-2.5 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[790px] text-left text-sm"><thead className="bg-[#faf9ff] text-[10px] font-bold uppercase tracking-[.14em] text-[#77738d]"><tr><th className="px-5 py-3">Garment</th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Unit</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Scope</th><th className="px-5 py-3 text-right">Rate</th>{isOwner ? <th className="px-3 py-3" /> : null}</tr></thead><tbody>{visiblePrices.map((price) => { const garment = garmentById.get(price.garment); const visual = garment ? garment.photo || garmentVisuals[garment.visual_key as keyof typeof garmentVisuals] || '' : ''; return <tr key={price.id} className="border-t border-[#342a63]/8"><td className="px-5 py-3.5"><span className="flex items-center gap-3">{visual ? <img src={visual} alt={`${price.garmentName} Lndry garment visual`} loading="lazy" className="h-11 w-11 rounded-xl border border-[#664cf0]/15 bg-[#f7f5ff] object-contain p-1" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f2efff] text-[#664cf0]"><Shirt className="h-4 w-4" /></span>}<span className="font-semibold text-[#332b50]">{price.garmentName}</span></span></td><td className="px-3 py-3.5 text-[#614dc3]">{displayServiceName(price.serviceName)}</td><td className="px-3 py-3.5 text-[#65707a]"><Ruler className="mr-1 inline h-3.5 w-3.5" />{serviceUnitLabel(garment?.unit || '', data)}</td><td className="px-3 py-3.5 text-xs text-[#65707a]">{garment?.categoryName || '—'}</td><td className="px-3 py-3.5 text-xs text-[#65707a]">{price.customer ? 'Customer specific' : 'General'}{price.source ? <span className="mt-0.5 block text-[10px] text-[#8a84a3]">{price.source === 'MARKETPLACE' ? (price.overridden && price.marketplaceRate != null ? `Counter rate · LNDRY app ${formatINR(price.marketplaceRate)}` : 'Follows LNDRY app price') : 'Counter only'}</span> : null}{price.active === false ? <span className="mt-0.5 block text-[10px] font-bold text-rose-600">Switched off</span> : null}</td><td className="px-5 py-3.5 text-right font-bold tabular-nums">{formatINR(price.rate)}</td>{isOwner ? <td className="px-3 py-3.5"><EditButton onClick={() => setEditor({ kind: 'price', value: price })} /></td> : null}</tr> })}</tbody></table>
          {filteredPrices.length === 0 ? <div className="p-8 text-center"><p className="font-semibold text-[#423b52]">{data.prices.length === 0 ? 'No price rules yet' : 'No price rules match these filters'}</p><p className="mt-1 text-xs text-[#77738d]">{data.prices.length === 0 ? 'Add a price rule before counter booking.' : 'Change a filter or clear the filters to see more results.'}</p>{hasPriceFilters ? <button type="button" onClick={clearPriceFilters} className="mt-3 rounded-lg border border-[#664cf0]/20 bg-[#f5f2ff] px-3 py-2 text-xs font-bold text-[#5843bd]">Clear filters</button> : null}</div> : null}
        </div>
      </Panel>
      <Panel id="catalogue-garments" title="Garment library" subtitle="Use approved local Lndry art, never remote images" icon={<Shirt className="h-5 w-5" />} action={isOwner ? <button type="button" onClick={() => setEditor({ kind: 'garment' })} className={actionClass}><Plus className="h-4 w-4" />Garment</button> : undefined}><div className="grid gap-3 sm:grid-cols-2">{data.garments.map((garment) => <button type="button" key={garment.id} disabled={!isOwner} onClick={() => setEditor({ kind: 'garment', value: garment })} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#342a63]/10 bg-[#fcfbff] p-3 text-left transition hover:border-[#664cf0]/35 disabled:cursor-default"><span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f1efff]">{garment.photo ? <img src={garment.photo} alt={`${garment.name} visual`} className="h-full w-full object-contain p-1" /> : <ImageOff className="h-5 w-5 text-[#9a8edb]" />}</span><span className="min-w-0"><span className="block truncate font-semibold text-[#332b50]">{garment.name}</span><span className="mt-1 block text-xs text-[#77808b]">{garment.categoryName} · {garment.unit}{garment.source === 'MARKETPLACE' ? ' · from LNDRY' : garment.source === 'POS' ? ' · counter only' : ''}{garment.active === false ? ' · switched off' : ''}</span></span>{isOwner ? <ChevronRight className="ml-auto h-4 w-4 text-[#8c7ee1]" /> : null}</button>)}</div></Panel></div>
      <div className="min-w-0 space-y-5"><Panel title="Counter configuration" subtitle="Rules are selected and calculated by the server" icon={<SlidersHorizontal className="h-5 w-5" />} action={isOwner ? <span className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setEditor({ kind: 'charge' })} className={actionClass}><Plus className="h-3.5 w-3.5" />Charge</button><button type="button" onClick={() => setEditor({ kind: 'discount' })} className={actionClass}><Plus className="h-3.5 w-3.5" />Discount</button><button type="button" onClick={() => setEditor({ kind: 'tax' })} className={actionClass}><Plus className="h-3.5 w-3.5" />Tax</button></span> : undefined}><RuleList title="Charges" rows={data.chargeRules} tone="violet" isOwner={isOwner} onEdit={(value) => setEditor({ kind: 'charge', value })} /><RuleList title="Discounts" rows={data.discountRules} tone="amber" isOwner={isOwner} onEdit={(value) => setEditor({ kind: 'discount', value })} /><RuleList title="Tax" rows={data.taxRules.map((item) => ({ ...item, type: 'Percentage' as RuleType, amount: item.rate }))} tone="blue" isOwner={isOwner} onEdit={(value) => setEditor({ kind: 'tax', value })} /></Panel>
      <Panel title="Categories & services" subtitle="Maintain how the counter finds a garment" icon={<Sparkles className="h-5 w-5" />} action={isOwner ? <span className="flex gap-2"><button type="button" onClick={() => setEditor({ kind: 'category' })} className={actionClass}><Plus className="h-4 w-4" />Category</button><button type="button" onClick={() => setEditor({ kind: 'service' })} className={actionClass}><Plus className="h-4 w-4" />Service</button></span> : undefined}><div className="space-y-2">{data.categories.map((category) => <RecordLine key={category.id} name={category.parentId ? `${data.categories.find((parent) => parent.id === category.parentId)?.name || ''} › ${category.name}` : category.name} detail={`${category.parentId ? 'Sub-category' : 'Category'}${category.source === 'MARKETPLACE' ? ' · from LNDRY' : ' · counter only'}${category.active === false ? ' · switched off' : ''}`} color={category.color} isOwner={isOwner} onEdit={() => setEditor({ kind: 'category', value: category })} />)}{data.services.map((service) => <RecordLine key={service.id} name={service.name} detail={`${service.units?.map((unit) => serviceUnitLabel(unit, data)).join(', ') || serviceUnitOptions(data).map((unit) => unit.label).join(', ')}${service.source === 'MARKETPLACE' ? ' · from LNDRY' : ' · counter only'}${service.active === false ? ' · switched off' : ''}`} isOwner={isOwner} onEdit={() => setEditor({ kind: 'service', value: service })} />)}</div></Panel>
      <section className="rounded-[22px] border border-[#664cf0]/14 bg-[#f8f6ff] p-5"><img src={lndryBrand.officialMark} alt="Lndry brand mark" className="h-8 w-auto object-contain" /><p className="mt-3 text-sm font-semibold text-[#3d317f]">Approved visual source</p><p className="mt-1 text-xs leading-5 text-[#696180]">The supplied Lndry mark is preserved as a local brand asset. Generated visual selection is restricted to approved local files.</p></section></div></section>
    {editor ? <Editor target={editor || emptyEdit} data={data} customers={customers.data || []} saving={save.isPending} onCancel={() => setEditor(null)} onSave={(payload) => save.mutate({ target: editor, data: payload })} /> : null}
  </div>
}

function PriceMatrixFilters({ garmentSearch, garments, service, unit, status, services, units, hasFilters, onGarmentSearch, onServiceChange, onUnitChange, onStatusChange, onClear }: {
  garmentSearch: string
  garments: Array<{ name: string; rates: number }>
  service: string
  unit: string
  status: 'all' | 'enabled' | 'disabled'
  services: string[]
  units: Array<{ value: string; label: string }>
  hasFilters: boolean
  onGarmentSearch: (value: string) => void
  onServiceChange: (value: string) => void
  onUnitChange: (value: string) => void
  onStatusChange: (value: 'all' | 'enabled' | 'disabled') => void
  onClear: () => void
}) {
  const controlClass = 'mt-1.5 min-h-10 w-full rounded-xl border border-[#342a63]/15 bg-white px-3 py-2 text-sm text-[#423b52] outline-none transition focus:border-[#664cf0]/45 focus:ring-2 focus:ring-[#664cf0]/20'
  const uniqueUnits = [...new Map(units.map((unit) => [unit.value, unit])).values()].sort((a, b) => a.label.localeCompare(b.label))
  const [garmentOptionsOpen, setGarmentOptionsOpen] = useState(false)
  const [activeGarmentOption, setActiveGarmentOption] = useState(0)
  const matchingGarments = garments.filter((garment) => !garmentSearch.trim() || garment.name.toLocaleLowerCase().includes(garmentSearch.trim().toLocaleLowerCase())).slice(0, 8)
  function selectGarment(name: string) {
    onGarmentSearch(name)
    setGarmentOptionsOpen(false)
    setActiveGarmentOption(0)
  }
  return <div className="bg-[#fcfbff] px-4 py-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs font-bold text-[#423b52]">Find a garment price</p><p className="mt-0.5 text-[11px] text-[#77738d]">Results update as you change a filter.</p></div>
      {hasFilters ? <button type="button" onClick={onClear} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-1.5 text-xs font-bold text-[#5843bd] transition hover:bg-[#f5f2ff]"><X className="h-3.5 w-3.5" />Clear filters</button> : null}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="relative">
        <label className="text-[11px] font-bold text-[#625d73]">Garment
          <input
            type="search"
            aria-label="Garment"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={garmentOptionsOpen && matchingGarments.length > 0}
            aria-controls="catalogue-price-garment-options"
            aria-activedescendant={garmentOptionsOpen && matchingGarments[activeGarmentOption] ? `catalogue-price-garment-option-${activeGarmentOption}` : undefined}
            placeholder="Type a garment name"
            value={garmentSearch}
            onFocus={() => setGarmentOptionsOpen(true)}
            onChange={(event) => { onGarmentSearch(event.target.value); setActiveGarmentOption(0); setGarmentOptionsOpen(true) }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && matchingGarments.length) { event.preventDefault(); setGarmentOptionsOpen(true); setActiveGarmentOption((index) => Math.min(index + 1, matchingGarments.length - 1)) }
              else if (event.key === 'ArrowUp' && matchingGarments.length) { event.preventDefault(); setGarmentOptionsOpen(true); setActiveGarmentOption((index) => Math.max(index - 1, 0)) }
              else if (event.key === 'Enter' && garmentOptionsOpen && matchingGarments[activeGarmentOption]) { event.preventDefault(); selectGarment(matchingGarments[activeGarmentOption].name) }
              else if (event.key === 'Escape' && garmentOptionsOpen) { event.preventDefault(); setGarmentOptionsOpen(false) }
            }}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null
              if (!nextTarget || !event.currentTarget.parentElement?.contains(nextTarget)) setGarmentOptionsOpen(false)
            }}
            className={`${controlClass} pr-10`}
          />
        </label>
        {garmentSearch ? <button type="button" aria-label="Clear garment filter" onMouseDown={(event) => event.preventDefault()} onClick={() => { onGarmentSearch(''); setGarmentOptionsOpen(false); setActiveGarmentOption(0) }} className="absolute right-2 top-[2.1rem] grid h-7 w-7 place-items-center rounded-lg text-[#77718a] hover:bg-[#f1efff] hover:text-[#5740cb]"><X className="h-3.5 w-3.5" /></button> : null}
        {garmentOptionsOpen ? <div id="catalogue-price-garment-options" role="listbox" aria-label="Matching garments" className="mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#342a63]/15 bg-white p-1.5 shadow-xl">
          {matchingGarments.length ? matchingGarments.map((garment, index) => <button key={garment.name.toLocaleLowerCase()} type="button" role="option" id={`catalogue-price-garment-option-${index}`} aria-selected={index === activeGarmentOption} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveGarmentOption(index)} onClick={() => selectGarment(garment.name)} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${index === activeGarmentOption ? 'bg-[#f1efff] text-[#4937a0]' : 'text-[#423b52] hover:bg-[#f8f6ff]'}`}><span className="truncate font-semibold">{garment.name}</span><span className="shrink-0 text-[10px] text-[#77718a]">{garment.rates} {garment.rates === 1 ? 'price' : 'prices'}</span></button>) : <p className="px-3 py-2 text-xs text-[#77718a]">No matching garments with price rules.</p>}
        </div> : null}
      </div>
      <label className="text-[11px] font-bold text-[#625d73]">Service<select aria-label="Service" value={service} onChange={(event) => onServiceChange(event.target.value)} className={controlClass}><option value="">All services</option>{services.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="text-[11px] font-bold text-[#625d73]">Service unit<select aria-label="Service unit" value={unit} onChange={(event) => onUnitChange(event.target.value)} className={controlClass}><option value="">All units</option>{uniqueUnits.map((unitOption) => <option key={unitOption.value} value={unitOption.value}>{unitOption.label}</option>)}</select></label>
      <label className="text-[11px] font-bold text-[#625d73]">Status<select aria-label="Status" value={status} onChange={(event) => onStatusChange(event.target.value as 'all' | 'enabled' | 'disabled')} className={controlClass}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
    </div>
  </div>
}

function Editor({ target, data, customers, saving, onCancel, onSave }: { target: EditTarget; data: Catalogue; customers: Customer[]; saving: boolean; onCancel: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const existing = target.value || {}; const [form, setForm] = useState<any>(() => ({ ...existing, units: existing.units || data.serviceUnits, photo: existing.photo || '', active: existing.active !== false })); const [visualError, setVisualError] = useState('')
  const title = `${existing.id ? 'Edit' : 'Add'} ${target.kind === 'price' ? 'price rule' : target.kind === 'tax' ? 'tax rule' : target.kind === 'charge' ? 'charge rule' : target.kind === 'discount' ? 'Store Discount' : target.kind}`
  async function selectVisual(file?: File) { if (!file) return; setVisualError(''); if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setVisualError('Choose a PNG, JPEG, or WebP image.'); return } if (file.size > 1_000_000) { setVisualError('Choose an image smaller than 1 MB.'); return } try { setForm({ ...form, photo: await readDataUrl(file) }) } catch { setVisualError('The garment image could not be read.') } }
  function submit(event: FormEvent) { event.preventDefault(); const base: Record<string, unknown> = { ...form }; if (target.kind === 'garment') { base.gstRate = Number(form.gst_rate ?? form.gstRate ?? 0); base.visualKey = Object.entries(garmentVisuals).find(([, path]) => path === form.photo)?.[0] || form.visual_key || ''; delete base.gst_rate; delete base.visual_key } if (target.kind === 'category') { base.sortOrder = Number(form.sort_order ?? form.sortOrder ?? 0); delete base.sort_order } if (target.kind === 'price' || target.kind === 'charge' || target.kind === 'discount') base.rate = target.kind === 'price' ? Number(form.rate) : undefined; if (target.kind === 'charge' || target.kind === 'discount') { base.amount = Number(form.amount); delete base.rate } if (target.kind === 'tax') { base.rate = Number(form.rate ?? form.amount); delete base.amount; delete base.type } onSave(base) }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#110c2a]/55 p-4 backdrop-blur-sm"><form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[26px] border border-white/20 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#664cf0]">Owner configuration</p><h2 className="mt-1 font-serif text-2xl text-[#2d2545]">{title}</h2></div><button type="button" aria-label="Close editor" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-xl text-[#6e6880] hover:bg-[#f1eff8]"><X className="h-4 w-4" /></button></div><div className="mt-6 grid gap-4">{target.kind === 'category' ? <><Text label="Category name" value={form.name || ''} onChange={(name) => setForm({ ...form, name })} />{!data.categories.some((item) => item.parentId === existing.id) ? <Select label="Parent category" value={form.parentId || ''} onChange={(parentId) => setForm({ ...form, parentId })} options={[{ value: '', label: 'No parent (top-level category)' }, ...data.categories.filter((item) => !item.parentId && item.id !== existing.id).map((item) => ({ value: item.id, label: item.name }))]} /> : <p className="rounded-xl bg-[#f6f5fb] px-3 py-2 text-xs text-[#5b5472]">This category has sub-categories, so it stays a top-level category.</p>}<Text label="Brand colour" value={form.color || ''} placeholder="#664CF0" onChange={(color) => setForm({ ...form, color })} /><ImageField label="Category image" value={form.image || ''} onChange={(image) => setForm({ ...form, image })} onError={setVisualError} />{visualError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{visualError}</p> : null}</> : null}{target.kind === 'service' ? <><Text label="Service name" value={form.name || ''} onChange={(name) => setForm({ ...form, name })} /><Text label="Description" value={form.description || ''} onChange={(description) => setForm({ ...form, description })} /><UnitPicker values={form.units} units={serviceUnitOptions(data)} onChange={(units) => setForm({ ...form, units })} /><ImageField label="Service image" value={form.image || ''} onChange={(image) => setForm({ ...form, image })} onError={setVisualError} />{visualError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{visualError}</p> : null}</> : null}{target.kind === 'garment' ? <><Text label="Garment name" value={form.name || ''} onChange={(name) => setForm({ ...form, name })} /><Text label="Garment code" value={form.code || ''} onChange={(code) => setForm({ ...form, code })} /><Select label="Category" value={form.category || ''} onChange={(category) => setForm({ ...form, category })} options={data.categories.filter((item) => item.active !== false).map((item) => ({ value: item.id, label: item.parentId ? `${data.categories.find((parent) => parent.id === item.parentId)?.name || ''} › ${item.name}` : item.name }))} /><Select label="Unit" value={form.unit || 'Piece'} onChange={(unit) => setForm({ ...form, unit })} options={serviceUnitOptions(data)} /><Text label="HSN" value={form.hsn || ''} onChange={(hsn) => setForm({ ...form, hsn })} /><Text label="GST rate" type="number" value={String(form.gst_rate ?? form.gstRate ?? 0)} onChange={(gst_rate) => setForm({ ...form, gst_rate })} /><VisualPicker value={form.photo || ''} onChange={(photo) => setForm({ ...form, photo })} onUpload={selectVisual} />{visualError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{visualError}</p> : null}</> : null}{target.kind === 'price' ? <><Select label="Garment" value={form.garment || ''} onChange={(garment) => setForm({ ...form, garment })} options={data.garments.map((item) => ({ value: item.id, label: item.name }))} /><Select label="Service" value={form.service || ''} onChange={(service) => setForm({ ...form, service })} options={data.services.map((item) => ({ value: item.id, label: item.name }))} /><Select label="Customer scope" value={form.customer || ''} onChange={(customer) => setForm({ ...form, customer })} options={[{ value: '', label: 'General price rule' }, ...customers.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` }))]} /><Text label="Rate" type="number" value={String(form.rate ?? '')} onChange={(rate) => setForm({ ...form, rate })} />{existing.marketplaceRate != null ? <p className="rounded-xl bg-[#f6f5fb] px-3 py-2 text-xs text-[#5b5472]">Your LNDRY app price is {formatINR(existing.marketplaceRate)}. Changing the counter rate here never changes the app price.{existing.overridden ? <button type="button" onClick={() => onSave({ ...form, rate: existing.marketplaceRate, resetToMarketplace: true })} className="ml-2 font-bold text-[#664cf0] underline">Use the LNDRY price</button> : null}</p> : null}</> : null}{target.kind === 'discount' ? <StoreDiscountFields form={{ name: String(form.name || ''), type: form.type || '', amount: String(form.amount ?? ''), description: String(form.description || ''), active: form.active !== false }} onChange={(next) => setForm({ ...form, ...next })} /> : null}{target.kind === 'charge' ? <StoreChargeFields form={{ name: String(form.name || ''), type: form.type || '', amount: String(form.amount ?? ''), expressCharge: Boolean(form.expressCharge), description: String(form.description || ''), active: form.active !== false }} onChange={(next: StoreChargeFormValue) => setForm({ ...form, ...next })} /> : null}{target.kind === 'tax' ? <><Text label="Tax rule name" value={form.name || ''} onChange={(name) => setForm({ ...form, name })} /><Text label="Rate (%)" type="number" value={String(form.rate ?? form.amount ?? '')} onChange={(rate) => setForm({ ...form, rate })} /></> : null}{target.kind !== 'discount' && target.kind !== 'charge' ? <label className="flex items-center gap-3 rounded-xl bg-[#f6f5fb] p-3 text-sm text-[#443d58]"><input checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })} type="checkbox" className="h-4 w-4 accent-[#664cf0]" />Active at the counter</label> : null}</div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-xl border border-[#372e52]/15 px-4 py-2.5 text-sm font-bold text-[#4f485e]">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Check className="h-4 w-4" />{saving ? 'Saving…' : 'Save change'}</button></div></form></div>
}

const actionClass = 'inline-flex items-center gap-1.5 rounded-lg border border-[#664cf0]/20 bg-[#f5f2ff] px-2.5 py-2 text-xs font-bold text-[#5843bd] transition hover:bg-[#eae5ff]'
function Panel({ id, title, subtitle, icon, action, children }: { id?: string; title: string; subtitle: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) { return <section id={id} tabIndex={id ? -1 : undefined} className="scroll-mt-4 overflow-hidden rounded-[22px] border border-[#342a63]/10 bg-white shadow-[0_9px_28px_rgba(37,25,88,.05)]"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#342a63]/8 p-5"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1efff] text-[#664cf0]">{icon}</span><div><h2 className="font-serif text-xl text-[#30274b]">{title}</h2><p className="mt-0.5 text-xs text-[#77738d]">{subtitle}</p></div></div>{action}</div>{children}</section> }
function Metric({ label, value, note }: { label: string; value: number; note: string }) { return <div className="rounded-[18px] border border-[#342a63]/10 bg-white p-4 shadow-[0_7px_18px_rgba(37,25,88,.04)]"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#77738d]">{label}</p><p className="mt-1 font-serif text-3xl text-[#30274b]">{value}</p><p className="mt-1 text-xs text-[#858095]">{note}</p></div> }
function EditButton({ onClick }: { onClick: () => void }) { return <button type="button" aria-label="Edit record" onClick={onClick} className="grid h-8 w-8 place-items-center rounded-lg text-[#664cf0] hover:bg-[#f0edff]"><Pencil className="h-3.5 w-3.5" /></button> }
function RuleList({ title, rows, tone, isOwner, onEdit }: { title: string; rows: Array<{ id: string; name: string; type: RuleType; amount: number; description?: string; expressCharge?: boolean }>; tone: 'violet' | 'amber' | 'blue'; isOwner: boolean; onEdit: (value: any) => void }) { const toneClass = tone === 'amber' ? 'bg-[#fff7e9] text-[#9b6517]' : tone === 'blue' ? 'bg-[#edf5ff] text-[#316c9c]' : 'bg-[#f2efff] text-[#664cf0]'; return <div className="border-t border-[#342a63]/8 p-4 first:border-t-0"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#77738d]">{title}</p>{rows.length ? <div className="space-y-2">{rows.map((row) => <div key={row.id} className="flex items-center gap-2 rounded-xl bg-[#faf9fd] px-3 py-2.5"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${toneClass}`}>{row.type === 'Percentage' ? `${row.amount}%` : formatINR(row.amount)}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#443b58]">{row.name}</span>{row.expressCharge ? <span className="rounded-full bg-[#fff2ce] px-2 py-1 text-[10px] font-bold text-[#855815]">Express</span> : null}{isOwner ? <EditButton onClick={() => onEdit(row)} /> : null}</div>)}</div> : <p className="text-xs text-[#868197]">No active {title.toLowerCase()} configured.</p>}</div> }
function RecordLine({ name, detail, color, isOwner, onEdit }: { name: string; detail: string; color?: string; isOwner: boolean; onEdit: () => void }) { return <div className="flex items-center gap-3 rounded-xl bg-[#faf9fd] px-3 py-2.5"><span className="h-3 w-3 rounded-full bg-[#9e93e6]" style={color ? { backgroundColor: color } : undefined} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#443b58]">{name}</span><span className="block truncate text-[11px] text-[#817b90]">{detail}</span></span>{isOwner ? <EditButton onClick={onEdit} /> : null}</div> }
function Empty({ text }: { text: string }) { return <VisualEmptyState kind="operations" compact title="No catalogue rules yet" detail={text} /> }
function Text({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <label className="text-sm font-semibold text-[#423b52]">{label}<input required={label !== 'Description' && label !== 'Operator note' && label !== 'HSN' && label !== 'Brand colour' && label !== 'Garment code'} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#342a63]/15 px-3 py-2.5 font-normal outline-none ring-[#664cf0] focus:ring-2" /></label> }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="text-sm font-semibold text-[#423b52]">{label}<select required={label !== 'Customer scope' && label !== 'Parent category'} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#342a63]/15 bg-white px-3 py-2.5 font-normal outline-none ring-[#664cf0] focus:ring-2">{!value && label !== 'Customer scope' && label !== 'Parent category' ? <option value="">Select {label.toLowerCase()}</option> : null}{options.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}</select></label> }
function displayServiceName(name: string) {
  const normalized = name.trim().replace(/[_\s]+/g, ' ').toLocaleLowerCase()
  return normalized.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase())
}
function serviceUnitOptions(data: Catalogue) {
  const records = data.serviceUnitRecords?.filter((unit) => unit.active);
  if (records?.length) return records.map((unit) => ({ value: unit.value, label: unit.fullName }));
  return data.serviceUnits.map((value) => ({ value, label: value === 'Piece' ? 'Quantity' : value === 'Square Foot' ? 'Sq.Ft' : value }));
}
function serviceUnitLabel(value: string, data: Catalogue) {
  return data.serviceUnitRecords?.find((unit) => unit.value === value)?.fullName || serviceUnitOptions(data).find((unit) => unit.value === value)?.label || value;
}
function UnitPicker({ values, units, onChange }: { values: string[]; units: Array<{ value: string; label: string }>; onChange: (values: string[]) => void }) { return <fieldset><legend className="text-sm font-semibold text-[#423b52]">Applicable units</legend><div className="mt-2 flex flex-wrap gap-2">{units.map((unit) => <label key={unit.value} className="flex items-center gap-2 rounded-lg border border-[#342a63]/12 px-3 py-2 text-xs"><input checked={values.includes(unit.value)} onChange={(event) => onChange(event.target.checked ? [...values, unit.value] : values.filter((value) => value !== unit.value))} type="checkbox" className="accent-[#664cf0]" />{unit.label}</label>)}</div></fieldset> }
function VisualPicker({ value, onChange, onUpload }: { value: string; onChange: (value: string) => void; onUpload: (file?: File) => void }) { return <fieldset><legend className="text-sm font-semibold text-[#423b52]">Garment visual</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(garmentVisuals).map(([key, path]) => <label key={path} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${value === path ? 'border-[#664cf0]/35 bg-[#f8f6ff]' : 'border-[#342a63]/10'}`}><input checked={value === path} onChange={() => onChange(path)} type="radio" name="visual" className="accent-[#664cf0]" /><img src={path} alt={`Lndry ${visualLabel(key)} visual`} className="h-12 w-12 object-contain" /><span className="text-xs text-[#5b5472]">{visualLabel(key)}</span></label>)}</div><label className="mt-2 block rounded-xl border border-dashed border-[#664cf0]/30 p-3 text-xs text-[#5b5472]"><span className="font-semibold">Upload a local image</span><span className="mt-1 block">PNG, JPEG or WebP · maximum 1 MB</span><input aria-label="Upload garment image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void onUpload(event.target.files?.[0])} className="mt-2 block w-full text-xs" /></label><label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-[#342a63]/10 p-3"><input checked={!value} onChange={() => onChange('')} type="radio" name="visual" className="accent-[#664cf0]" /><ImageOff className="h-5 w-5 text-[#8d84ab]" /><span className="text-xs text-[#5b5472]">No illustration yet</span></label></fieldset> }
function visualLabel(key: string) { return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()).replace('Folded ', 'Lndry folded ') }
function readDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('The garment image could not be read.')); reader.readAsDataURL(file) }) }
function ImageField({ label, value, onChange, onError }: { label: string; value: string; onChange: (value: string) => void; onError: (message: string) => void }) {
  async function pick(file?: File) {
    if (!file) return; onError('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { onError('Choose a PNG, JPEG, or WebP image.'); return }
    if (file.size > 1_000_000) { onError('Choose an image smaller than 1 MB.'); return }
    try { onChange(await readDataUrl(file)) } catch { onError('The image could not be read.') }
  }
  return <fieldset><legend className="text-sm font-semibold text-[#423b52]">{label}</legend><div className="mt-2 flex items-center gap-3">{value ? <img src={value} alt="" className="h-14 w-14 rounded-xl border border-[#664cf0]/15 bg-[#f7f5ff] object-contain p-1" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-[#f1efff]"><ImageOff className="h-5 w-5 text-[#9a8edb]" /></span>}<label className="flex-1 rounded-xl border border-dashed border-[#664cf0]/30 p-2.5 text-xs text-[#5b5472]"><span className="font-semibold">{value ? 'Replace image' : 'Upload an image'}</span><span className="block text-[11px]">PNG, JPEG or WebP · up to 1 MB</span><input aria-label={label} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pick(event.target.files?.[0])} className="mt-1.5 block w-full text-xs" /></label>{value ? <button type="button" onClick={() => onChange('')} className="text-xs font-bold text-rose-600">Remove</button> : null}</div></fieldset>
}
