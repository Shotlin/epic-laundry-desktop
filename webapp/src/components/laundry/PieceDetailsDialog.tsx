import { useState } from 'react'
import { Shirt, X } from 'lucide-react'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'

export type PieceDetails = { qty: number; rateOverride?: number; alias?: string; color?: string; brand?: string; packaging?: string; defects?: string; stains?: string[]; remarks?: string }
const STAINS = ['A', 'B', 'C', 'D', 'E']

/** Edit one normal (piece) garment line: how many, price, colour, brand, packaging, defects, stains and remarks. */
export default function PieceDetailsDialog({ title, subtitle, unitLabel, image, rate, initial, onCancel, onSave }: {
  title: string; subtitle: string; unitLabel: string; image?: string; rate?: number; initial: Partial<PieceDetails>
  onCancel: () => void; onSave: (details: PieceDetails) => void
}) {
  const [qty, setQty] = useState(String(initial.qty ?? 1))
  const [price, setPrice] = useState(String(initial.rateOverride ?? rate ?? ''))
  const [alias, setAlias] = useState(initial.alias || '')
  const [color, setColor] = useState(initial.color || '')
  const [brand, setBrand] = useState(initial.brand || '')
  const [packaging, setPackaging] = useState(initial.packaging || '')
  const [defects, setDefects] = useState(initial.defects || '')
  const [stains, setStains] = useState<string[]>(initial.stains || [])
  const [remarks, setRemarks] = useState(initial.remarks || '')
  const focus = useDialogFocus<HTMLElement, HTMLInputElement>(onCancel)
  const count = Math.round(Number(qty))
  const valid = Number.isFinite(count) && count >= 1 && count <= 10000
  const field = 'mt-1 h-12 w-full rounded-xl border border-[#263f44]/15 bg-white px-4 text-base outline-none focus:border-[#2563c2]'
  const text = (label: string, value: string, set: (value: string) => void, max = 60) => <label className="block text-xs font-bold text-[#344c54]">{label}<input value={value} maxLength={max} onChange={(event) => set(event.target.value)} className={field} /></label>
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#102b33]/55 p-4 backdrop-blur-sm">
    <section ref={focus.dialogRef} onKeyDown={focus.onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Garment details" className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#263f44]/10 px-5 py-4"><h2 className="flex items-center gap-2 text-lg font-extrabold text-[#17353c]"><Shirt className="h-5 w-5 text-[#2563c2]" />Garment Details</h2><button type="button" onClick={onCancel} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1f4f3]"><X className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3 rounded-xl border border-[#263f44]/10 bg-[#f7faf9] p-3"><span className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-white">{image ? <img src={image} alt="" className="h-full w-full object-contain p-1" /> : <Shirt className="h-6 w-6 text-[#2563c2]" />}</span><div><p className="text-base font-extrabold uppercase text-[#17353c]">{title}</p><p className="text-sm text-[#617178]">{subtitle}</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('Garment Alias (optional)', alias, setAlias)}
          <label className="block text-xs font-bold text-[#344c54]">Price (₹ per {unitLabel})<input ref={focus.initialFocusRef} inputMode="decimal" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={field + ' font-bold'} /></label>
          <label className="block text-xs font-bold text-[#344c54]">Quantity<input inputMode="numeric" type="number" min="1" step="1" value={qty} onChange={(event) => setQty(event.target.value)} className={field + ' font-bold'} /></label>
        </div>
        <fieldset className="rounded-xl border border-[#263f44]/10 p-3"><legend className="px-1 text-sm font-extrabold text-[#17353c]">Item Details</legend>
          <div className="grid gap-3 sm:grid-cols-2">{text('Color', color, setColor, 40)}{text('Brand', brand, setBrand, 40)}{text('Packaging', packaging, setPackaging, 40)}</div>
          <label className="mt-3 block text-xs font-bold text-[#344c54]">Defects<textarea value={defects} maxLength={200} rows={2} onChange={(event) => setDefects(event.target.value)} placeholder="e.g. torn sleeve, missing button" className="mt-1 w-full rounded-xl border border-[#263f44]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#2563c2]" /></label>
        </fieldset>
        <fieldset className="rounded-xl border border-[#263f44]/10 p-3"><legend className="px-1 text-sm font-extrabold text-[#17353c]">Piece Stains</legend>
          <div className="flex flex-wrap gap-2">{STAINS.map((stain) => <label key={stain} className={`flex h-11 min-w-[3rem] cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-bold ${stains.includes(stain) ? 'border-[#2563c2] bg-[#eef5ff] text-[#1e4fa0]' : 'border-[#263f44]/15'}`}><input type="checkbox" className="sr-only" checked={stains.includes(stain)} onChange={() => setStains((previous) => previous.includes(stain) ? previous.filter((item) => item !== stain) : [...previous, stain])} />{stain}</label>)}</div></fieldset>
        <label className="block text-sm font-bold text-[#344c54]">Garment Remarks<textarea value={remarks} maxLength={300} rows={2} onChange={(event) => setRemarks(event.target.value)} className="mt-1 w-full rounded-xl border border-[#263f44]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#2563c2]" /></label>
      </div>
      <footer className="flex justify-end gap-2 border-t border-[#263f44]/10 px-5 py-4"><button type="button" onClick={onCancel} className="h-11 rounded-full border border-[#2563c2] px-6 text-sm font-bold text-[#2563c2]">Cancel</button><button type="button" disabled={!valid} onClick={() => onSave({ qty: count, rateOverride: price !== '' && Number(price) > 0 && Number(price) !== rate ? Number(price) : undefined, alias: alias.trim() || undefined, color: color.trim() || undefined, brand: brand.trim() || undefined, packaging: packaging.trim() || undefined, defects: defects.trim() || undefined, stains: stains.length ? stains : undefined, remarks: remarks.trim() || undefined })} className="h-11 rounded-full bg-[#2563c2] px-6 text-sm font-bold text-white disabled:opacity-40">Add Garment</button></footer>
    </section>
  </div>
}
