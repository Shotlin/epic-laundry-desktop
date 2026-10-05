import { useState } from 'react'
import { ImagePlus, Loader2, Upload } from 'lucide-react'
import { garmentVisuals } from '@/assets/generated/manifest'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'

export type NewGarment = { name: string; code?: string; category: string; photo?: string; visualKey?: string }
type CategoryLite = { id: string; name: string; parentId?: string | null; active?: boolean }

/** Small "Add Garment" form: name, code, category and a picture (pick an existing one or upload a new one). */
export default function AddGarmentDialog({ categories, defaultCategory, pending, error, onCancel, onSave }: {
  categories: CategoryLite[]; defaultCategory?: string; pending: boolean; error: string; onCancel: () => void; onSave: (garment: NewGarment) => void
}) {
  const active = categories.filter((item) => item.active !== false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [category, setCategory] = useState(defaultCategory && active.some((item) => item.id === defaultCategory) ? defaultCategory : '')
  const [mode, setMode] = useState<'existing' | 'upload'>('upload')
  const [visualKey, setVisualKey] = useState('')
  const [photo, setPhoto] = useState('')
  const [photoError, setPhotoError] = useState('')
  const focus = useDialogFocus<HTMLElement, HTMLInputElement>(onCancel)
  const label = (item: CategoryLite) => item.parentId ? `${active.find((parent) => parent.id === item.parentId)?.name || ''} › ${item.name}` : item.name
  const ready = name.trim().length >= 2 && Boolean(category) && !pending

  async function choose(file?: File) {
    if (!file) return
    setPhotoError('')
    try { setPhoto(await shrink(file)) } catch { setPhotoError('That picture could not be used. Try a .jpg or .png file.') }
  }
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4">
    <section ref={focus.dialogRef} onKeyDown={focus.onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add Garment" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <h2 className="text-xl font-extrabold text-[#17353c]">Add Garment</h2>
      <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); if (ready) onSave({ name: name.trim(), code: code.trim() || undefined, category, photo: mode === 'upload' ? photo || undefined : undefined, visualKey: mode === 'existing' ? visualKey || undefined : undefined }) }}>
        <label className="block"><span className="text-xs font-bold text-[#2563c2]">Name *</span>
          <input ref={focus.initialFocusRef} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter Garment name" className="mt-0.5 h-12 w-full rounded-xl border-2 border-[#2563c2] px-4 text-base outline-none" />
          <span className="block text-right text-xs text-[#718087]">{name.length}/100</span></label>
        <label className="block"><input maxLength={50} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="Code" className="h-12 w-full rounded-xl border border-[#263f44]/15 px-4 text-base outline-none focus:border-[#2563c2]" />
          <span className="block text-right text-xs text-[#718087]">{code.length}/50</span></label>
        <label className="block"><span className="sr-only">Category</span>
          <select required value={category} onChange={(event) => setCategory(event.target.value)} className="h-12 w-full rounded-xl border border-[#263f44]/15 bg-white px-4 text-base outline-none focus:border-[#2563c2]"><option value="">Category *</option>{active.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="text-base font-bold text-[#344c54]">Upload Images</span>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="garment-image-mode" checked={mode === 'existing'} onChange={() => setMode('existing')} />Select From Existing</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="garment-image-mode" checked={mode === 'upload'} onChange={() => setMode('upload')} />Upload New</label>
        </div>
        {mode === 'upload'
          ? <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void choose(event.dataTransfer.files?.[0]) }} className="flex h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#2563c2] text-center">
            {photo ? <img src={photo} alt="Chosen" className="h-28 object-contain" /> : <><Upload className="h-7 w-7 text-[#2563c2]" /><span className="mt-2 font-bold text-[#17353c]">Drop or select file</span><span className="text-sm text-[#718087]">Supports .jpg and .png files</span></>}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} /></label>
          : <div className="grid max-h-44 grid-cols-5 gap-2 overflow-y-auto rounded-xl border border-[#263f44]/10 p-2 sm:grid-cols-6">{Object.entries(garmentVisuals).map(([key, src]) => <button key={key} type="button" title={key.replace(/([A-Z])/g, ' $1')} onClick={() => setVisualKey(key)} className={`grid h-14 place-items-center overflow-hidden rounded-lg border ${visualKey === key ? 'border-[#2563c2] bg-[#eef5ff]' : 'border-transparent hover:bg-[#f1f4f3]'}`}><img src={src as string} alt={key} loading="lazy" className="h-full w-full object-contain p-1" /></button>)}</div>}
        {photoError ? <p role="alert" className="text-xs text-rose-700">{photoError}</p> : null}
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="submit" disabled={!ready} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#2563c2] px-7 text-sm font-bold text-white disabled:opacity-40">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}Save</button>
          <button type="button" disabled={pending} onClick={onCancel} className="h-11 rounded-full bg-rose-600 px-7 text-sm font-bold text-white">Cancel</button>
        </div>
      </form>
    </section>
  </div>
}

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/webp', 0.82)
}
