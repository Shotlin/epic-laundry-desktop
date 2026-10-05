import { useMemo, useState } from 'react'
import { Minus, Plus, Search, Weight, X } from 'lucide-react'
import { garmentVisuals } from '@/assets/generated/manifest'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'
import AddGarmentDialog, { type NewGarment } from '@/components/laundry/AddGarmentDialog'

export type WeightDetails = { qty: number; pieceCount?: number; rateOverride?: number; alias?: string; breakdown?: Record<string, number>; stains?: string[]; remarks?: string }
type GarmentLite = { id: string; name: string; unit: string; photo?: string; visual_key?: string; categoryName?: string; active?: boolean }

const STAINS = ['A', 'B', 'C', 'D', 'E']

/** Opens when staff add a kilogram-billed service: set the weight, and optionally list the pieces inside the bag. */
export default function WeightDialog({ title, subtitle, unitLabel, image, rate, initial, garments, categories, defaultCategory, onCreateGarment, onCancel, onSave }: {
  title: string; subtitle: string; unitLabel: string; image?: string; rate?: number; initial?: Partial<WeightDetails>; garments: GarmentLite[]
  categories: Array<{ id: string; name: string; parentId?: string | null; active?: boolean }>; defaultCategory?: string; onCreateGarment: (garment: NewGarment) => Promise<string | void>
  onCancel: () => void; onSave: (details: WeightDetails) => void
}) {
  const [adding, setAdding] = useState(false)
  const [addPending, setAddPending] = useState(false)
  const [addError, setAddError] = useState('')
  const [price, setPrice] = useState(initial?.rateOverride ? String(initial.rateOverride) : rate ? String(rate) : '')
  const [pieceText, setPieceText] = useState(initial?.pieceCount ? String(initial.pieceCount) : '')
  const [weight, setWeight] = useState(initial?.qty ? String(initial.qty) : '')
  const [alias, setAlias] = useState(initial?.alias || '')
  const [remarks, setRemarks] = useState(initial?.remarks || '')
  const [stains, setStains] = useState<string[]>(initial?.stains || [])
  const [breakdown, setBreakdown] = useState<Record<string, number>>(initial?.breakdown || {})
  const [search, setSearch] = useState('')
  const focus = useDialogFocus<HTMLElement, HTMLInputElement>(onCancel)
  const pieces = useMemo(() => garments.filter((item) => item.active !== false && ['Piece', 'Pair'].includes(item.unit) && item.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 60), [garments, search])
  const counted = Object.values(breakdown).reduce((sum, count) => sum + count, 0)
  const total = pieceText !== '' ? Number(pieceText) || 0 : counted
  const parsed = Number(weight)
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 10000
  const change = (id: string, delta: number) => setBreakdown((previous) => {
    const next = { ...previous }; const value = Math.max(0, (next[id] || 0) + delta)
    if (value === 0) delete next[id]; else next[id] = value
    return next
  })
  const visual = (item: GarmentLite) => item.photo || garmentVisuals[item.visual_key as keyof typeof garmentVisuals] || ''
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#102b33]/55 p-4 backdrop-blur-sm">
    <section ref={focus.dialogRef} onKeyDown={focus.onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Weight and garment details" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#263f44]/10 px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#17353c]"><Weight className="h-5 w-5 text-[#2563c2]" />Garment Details</h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1f4f3]"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3 rounded-xl border border-[#263f44]/10 bg-[#f7faf9] p-3">
          <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-white">{image ? <img src={image} alt="" className="h-full w-full object-contain p-1" /> : <Weight className="h-6 w-6 text-[#2563c2]" />}</span>
          <div><p className="text-base font-extrabold text-[#17353c]">{title}</p><p className="text-sm text-[#617178]">{subtitle}</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-[#344c54]">Garment Alias (optional)
            <input value={alias} maxLength={60} onChange={(event) => setAlias(event.target.value)} placeholder="e.g. Blue bag" className="mt-1 h-12 w-full rounded-xl border border-[#263f44]/15 bg-white px-4 text-base font-normal outline-none focus:border-[#2563c2]" /></label>
          <label className="block text-xs font-bold text-[#344c54]">Price per {unitLabel} (₹)
            <input inputMode="decimal" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-[#263f44]/15 bg-white px-4 text-base font-bold outline-none focus:border-[#2563c2]" /></label>
          <label className="block text-xs font-bold text-[#344c54]">Total Garment (pieces)
            <input inputMode="numeric" type="number" min="0" step="1" value={pieceText} onChange={(event) => setPieceText(event.target.value)} placeholder={String(counted || 1)} className="mt-1 h-12 w-full rounded-xl border border-[#263f44]/15 bg-white px-4 text-base font-bold outline-none focus:border-[#2563c2]" /></label>
          <label className="block text-sm font-bold text-[#344c54]">Weight ({unitLabel}) <span className="text-rose-700">*</span>
            <input ref={focus.initialFocusRef} autoFocus inputMode="decimal" type="number" min="0.1" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="e.g. 2.5" className="mt-1 h-12 w-full rounded-xl border-2 border-[#2563c2]/40 bg-white px-4 text-xl font-extrabold tabular-nums outline-none focus:border-[#2563c2]" />
            <span className="mt-1 block text-xs font-medium text-[#718087]">Enter like 1.6 for 1 kg 600 g</span></label>
        </div>
        <div className="rounded-xl border border-[#263f44]/10 p-3">
          <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-extrabold text-[#17353c]">Garment Breakdown <span className="font-medium text-[#718087]">(Optional)</span></p><p className="text-xs text-[#718087]">Tap + for each piece you see inside the bag.</p></div><button type="button" onClick={() => { setAddError(''); setAdding(true) }} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-[#2563c2] px-3 text-sm font-bold text-[#2563c2]"><Plus className="h-4 w-4" />Add Garment</button></div>
          <label className="relative mt-2 block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#819095]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search garments" className="h-10 w-full rounded-xl border border-[#263f44]/15 pl-9 pr-3 text-sm outline-none focus:border-[#2563c2]" /></label>
          <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
            {pieces.map((item) => <div key={item.id} className={`rounded-xl border p-2 text-center ${breakdown[item.id] ? 'border-[#2563c2] bg-[#eef5ff]' : 'border-[#263f44]/10 bg-white'}`}>
              <span className="mx-auto grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-[#f1f4f3]">{visual(item) ? <img src={visual(item)} alt="" loading="lazy" className="h-full w-full object-contain p-1" /> : <span className="font-bold text-[#2563c2]">{item.name.slice(0, 1)}</span>}</span>
              <p className="mt-1 line-clamp-2 min-h-[2rem] text-[11px] font-bold uppercase leading-4 text-[#344c54]">{item.name}</p>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => change(item.id, -1)} className="grid h-8 w-8 place-items-center rounded-full border border-[#263f44]/15 bg-white"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-6 text-center text-sm font-extrabold tabular-nums">{breakdown[item.id] || 0}</span>
                <button type="button" aria-label={`Add one ${item.name}`} onClick={() => change(item.id, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-[#2563c2] text-white"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>)}
            {!pieces.length ? <p className="col-span-full py-6 text-center text-sm text-[#718087]">No piece garments found.</p> : null}
          </div>
        </div>
        <fieldset className="rounded-xl border border-[#263f44]/10 p-3"><legend className="px-1 text-sm font-extrabold text-[#17353c]">Piece Stains</legend>
          <div className="flex flex-wrap gap-2">{STAINS.map((stain) => <label key={stain} className={`flex h-11 min-w-[3rem] cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold ${stains.includes(stain) ? 'border-[#2563c2] bg-[#eef5ff] text-[#1e4fa0]' : 'border-[#263f44]/15'}`}><input type="checkbox" className="sr-only" checked={stains.includes(stain)} onChange={() => setStains((previous) => previous.includes(stain) ? previous.filter((item) => item !== stain) : [...previous, stain])} />{stain}</label>)}</div>
        </fieldset>
        <label className="block text-sm font-bold text-[#344c54]">Garment Remarks (optional)<textarea value={remarks} maxLength={300} onChange={(event) => setRemarks(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-[#263f44]/15 px-3 py-2 text-sm outline-none focus:border-[#2563c2]" /></label>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-[#263f44]/10 px-5 py-4">
        <button type="button" onClick={onCancel} className="h-11 rounded-full border border-[#2563c2] px-6 text-sm font-bold text-[#2563c2]">Cancel</button>
        <button type="button" disabled={!valid} onClick={() => onSave({ qty: Math.round(parsed * 1000) / 1000, pieceCount: pieceText !== '' ? Math.round(Number(pieceText)) : undefined, rateOverride: price !== '' && Number(price) > 0 && Number(price) !== rate ? Number(price) : undefined, alias: alias.trim() || undefined, breakdown: Object.keys(breakdown).length ? breakdown : undefined, stains: stains.length ? stains : undefined, remarks: remarks.trim() || undefined })} className="h-11 rounded-full bg-[#2563c2] px-6 text-sm font-bold text-white disabled:opacity-40">{initial?.qty ? 'Save' : 'Add Garment'}</button>
      </footer>
    </section>
    {adding ? <AddGarmentDialog categories={categories} defaultCategory={defaultCategory} pending={addPending} error={addError} onCancel={() => setAdding(false)} onSave={async (garment) => { setAddPending(true); setAddError(''); try { const id = await onCreateGarment(garment); if (id) setBreakdown((previous) => ({ ...previous, [id]: 1 })); setAdding(false) } catch (reason) { setAddError(reason instanceof Error ? reason.message : 'The garment could not be saved.') } finally { setAddPending(false) } }} /> : null}
  </div>
}
