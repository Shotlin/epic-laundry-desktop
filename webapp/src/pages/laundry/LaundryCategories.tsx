import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Archive, Check, ChevronLeft, ChevronRight, Eye, Loader2, Plus, RotateCcw, Search, Tags, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'

type Category = {
  id: string
  name: string
  color?: string
  image?: string
  sort_order?: number
  active?: boolean
  parentId?: string
  source?: 'MARKETPLACE' | 'POS'
  usageCount?: number
}

export default function LaundryCategories() {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<Category | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)
  const [switching, setSwitching] = useState<Category | null>(null)
  const [notice, setNotice] = useState('')
  const categories = useQuery({ queryKey: ['laundry-settings-categories'], queryFn: () => apiGet<Category[]>('/laundry/settings/categories') })

  const save = useMutation({
    mutationFn: ({ category, name }: { category?: Category; name: string }) => {
      // Send the existing metadata back with the source-style name edit so the
      // simple settings flow does not clear Epic's colour/image extensions.
      const payload = category ? {
        name,
        color: category.color || '',
        image: category.image || '',
        sortOrder: category.sort_order || 0,
        active: category.active !== false,
        parentId: category.parentId || null,
      } : { name }
      return category
        ? apiPatch<Category>(`/laundry/catalogue/categories/${encodeURIComponent(category.id)}`, payload)
        : apiPost<Category>('/laundry/catalogue/categories', payload)
    },
    onSuccess: (_result, variables) => {
      void client.invalidateQueries({ queryKey: ['laundry-settings-categories'] })
      void client.invalidateQueries({ queryKey: ['laundry-catalogue'] })
      setAdding(false); setEditing(null); setViewing(null)
      setNotice(variables.category ? 'Category updated.' : 'Category added.')
    },
  })

  const setActive = useMutation({
    mutationFn: ({ category, active }: { category: Category; active: boolean }) => apiPatch<Category>(`/laundry/catalogue/categories/${encodeURIComponent(category.id)}`, {
      name: category.name,
      color: category.color || '',
      image: category.image || '',
      sortOrder: category.sort_order || 0,
      active,
      parentId: category.parentId || null,
    }),
    onSuccess: (_result, variables) => {
      void client.invalidateQueries({ queryKey: ['laundry-settings-categories'] })
      void client.invalidateQueries({ queryKey: ['laundry-catalogue'] })
      setSwitching(null)
      setNotice(variables.active ? 'Category restored for new orders.' : 'Category switched off. It remains in Settings and can be restored.')
    },
  })

  const allRows = categories.data || []
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return [...allRows]
      .filter((category) => !query || category.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.name.localeCompare(b.name))
  }, [allRows, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = filtered.length ? (currentPage - 1) * pageSize + 1 : 0
  const end = Math.min(currentPage * pageSize, filtered.length)
  const visible = filtered.slice(start ? start - 1 : 0, end)
  const duplicateKey = (name: string) => name.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()
  const duplicate = (name: string, category?: Category) => allRows.some((item) => item.id !== category?.id && duplicateKey(item.name) === duplicateKey(name))

  if (categories.isLoading) return <VisualLoadingState title="Loading categories" detail="Reading the categories available to this store." />
  if (categories.isError) return <div className="mx-auto max-w-5xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><p role="alert">The category list could not be loaded.</p><button type="button" onClick={() => void categories.refetch()} className="mt-3 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold">Try again</button></div>

  return <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-2 duration-300">
    <Link to="/laundry/settings" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#5740cb] hover:bg-[#f3f0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]"><ArrowLeft className="h-4 w-4" />Back to Settings</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#664cf0]">Catalog</p><h1 className="mt-1 font-serif text-3xl text-[#241a45]">Categories</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6982]">Group garments the way your team finds them at the counter. Switching off a category keeps its history and lets you restore it later.</p></div>
      <button type="button" onClick={() => { save.reset(); setNotice(''); setAdding(true) }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#5740cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0] focus-visible:ring-offset-2"><Plus className="h-4 w-4" />Add Category</button>
    </div>
    {notice ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}

    <section aria-label="Categories" className="mt-6 overflow-hidden rounded-2xl border border-[#272043]/10 bg-white shadow-[0_8px_28px_rgba(32,23,60,.04)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#272043]/8 px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eeeaff] text-[#5740cb]"><Tags className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-[#241a45]">Category list</h2><p className="text-xs text-[#77718a]">{allRows.length} categories, including switched-off categories</p></div>
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm"><span className="sr-only">Search categories</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77718a]" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search categories..." className="h-10 w-full rounded-xl border border-[#342a63]/15 bg-white pl-9 pr-9 text-sm text-[#423b52] outline-none focus:border-[#664cf0]/45 focus:ring-2 focus:ring-[#664cf0]/20" />{search ? <button type="button" aria-label="Clear category search" onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[#77718a] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button> : null}</label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#272043]/8 px-5 py-3 text-xs text-[#6b667b]" aria-live="polite">
        <span>{filtered.length ? `Showing ${start}–${end} of ${filtered.length}` : search ? 'No categories match this search' : 'No categories yet'}</span>
        <div className={filtered.length ? 'flex items-center gap-2' : 'hidden'}><label htmlFor="category-page-size" className="font-semibold">Items per page</label><select id="category-page-size" aria-label="Items per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="rounded-lg border border-[#342a63]/15 bg-white px-2 py-1.5 font-semibold text-[#423b52]">{[10, 20, 50, 100, 500].map((size) => <option key={size} value={size}>{size}</option>)}</select><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-[#342a63]/15 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-12 text-center">{currentPage} / {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-[#342a63]/15 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>
      </div>
      {visible.length ? <div className="divide-y divide-[#272043]/8">{visible.map((category) => <div key={category.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f5f2ff] text-[#664cf0]" style={category.color ? { backgroundColor: `${category.color}18`, color: category.color } : undefined}><Tags className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold text-[#332849]">{category.parentId ? `${allRows.find((parent) => parent.id === category.parentId)?.name || ''} › ${category.name}` : category.name}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${category.active === false ? 'bg-[#f1eff5] text-[#686479]' : 'bg-emerald-50 text-emerald-700'}`}>{category.active === false ? 'Switched off' : 'Active'}</span>{category.source === 'MARKETPLACE' ? <span className="rounded-full bg-[#edf5ff] px-2.5 py-1 text-[10px] font-bold text-[#316c9c]">LNDRY catalogue</span> : null}</div><p className="mt-1 text-xs text-[#77718a]">{category.usageCount ? `Used by ${category.usageCount} active garment${category.usageCount === 1 ? '' : 's'}` : 'No active garments use this category'}{category.source === 'POS' ? ' · Counter category' : ''}</p></div>
        <div className="flex items-center gap-2"><button type="button" aria-label={`View ${category.name}`} onClick={() => setViewing(category)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#ded9f7] px-3 py-1.5 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]"><Eye className="h-3.5 w-3.5" />View</button>{category.active === false ? <button type="button" aria-label={`Restore ${category.name}`} disabled={setActive.isPending} onClick={() => setActive.mutate({ category, active: true })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#ded9f7] px-3 py-1.5 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]"><RotateCcw className="h-3.5 w-3.5" />Restore</button> : <button type="button" aria-label={`Switch off ${category.name}`} disabled={setActive.isPending || (category.usageCount || 0) > 0} title={(category.usageCount || 0) > 0 ? 'Move its garments to another category first' : undefined} onClick={() => setSwitching(category)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e4d6d6] px-3 py-1.5 text-xs font-bold text-[#93504c] hover:bg-[#fff6f5] disabled:cursor-not-allowed disabled:opacity-50"><Archive className="h-3.5 w-3.5" />Switch off</button>}</div>
      </div>)}</div> : <div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f2efff] text-[#664cf0]"><Tags className="h-5 w-5" /></span><h2 className="mt-3 text-base font-extrabold text-[#332849]">{search ? 'No Data Found' : 'No categories yet'}</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-[#77718a]">{search ? 'Change the search or clear it to see the full list.' : 'Add a category so staff can find garments quickly.'}</p>{search ? <button type="button" onClick={() => setSearch('')} className="mt-4 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-2 text-xs font-bold text-[#5740cb]">Clear search</button> : <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-2 text-xs font-bold text-[#5740cb]"><Plus className="h-3.5 w-3.5" />Add Category</button>}</div>}
    </section>

    {adding || editing ? <CategoryForm key={editing?.id || 'new'} category={editing || undefined} saving={save.isPending} error={save.error} isDuplicate={duplicate} onClose={() => { setAdding(false); setEditing(null); save.reset() }} onSave={(name) => save.mutate({ category: editing || undefined, name })} /> : null}
    {viewing ? <CategoryDetails category={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); save.reset() }} /> : null}
    {switching ? <SwitchCategoryDialog category={switching} saving={setActive.isPending} error={setActive.error} onClose={() => setSwitching(null)} onConfirm={() => setActive.mutate({ category: switching, active: false })} /> : null}
  </div>
}

function CategoryDetails({ category, onEdit, onClose }: { category: Category; onEdit: () => void; onClose: () => void }) {
  const dialog = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-labelledby="category-view-title" tabIndex={-1} onKeyDown={dialog.onKeyDown} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Categories</p><h2 id="category-view-title" className="mt-1 font-serif text-2xl text-[#241a45]">View Category</h2></div><button ref={dialog.initialFocusRef} type="button" aria-label="Close category details" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#686479] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button></div><dl className="mt-5 space-y-3"><div className="rounded-xl bg-[#faf9fd] p-3"><dt className="text-xs font-bold text-[#77718a]">Category</dt><dd className="mt-1 text-sm font-semibold text-[#332849]">{category.name}</dd></div><div className="rounded-xl bg-[#faf9fd] p-3"><dt className="text-xs font-bold text-[#77718a]">Status</dt><dd className="mt-1 text-sm font-semibold text-[#332849]">{category.active === false ? 'Switched off' : 'Active'}</dd></div><div className="rounded-xl bg-[#faf9fd] p-3"><dt className="text-xs font-bold text-[#77718a]">Active garments</dt><dd className="mt-1 text-sm font-semibold text-[#332849]">{category.usageCount || 0}</dd></div></dl><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67]">Close</button><button type="button" onClick={onEdit} className="min-h-10 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white">Edit Category</button></div></div></div>
}

function CategoryForm({ category, saving, error, isDuplicate, onClose, onSave }: { category?: Category; saving: boolean; error: unknown; isDuplicate: (name: string, category?: Category) => boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(category?.name || '')
  const dialog = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSave(name.trim().replace(/\s+/g, ' ')) }
  const normalized = name.trim().replace(/\s+/g, ' ')
  const nameError = normalized.length > 0 && normalized.length < 2 ? 'Enter at least 2 characters.' : isDuplicate(normalized, category) ? 'A category with the same name ignoring case and spaces already exists.' : ''
  const valid = Boolean(normalized && normalized.length <= 100 && !nameError)
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-labelledby="category-form-title" tabIndex={-1} onKeyDown={dialog.onKeyDown} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Categories</p><h2 id="category-form-title" className="mt-1 font-serif text-2xl text-[#241a45]">{category ? 'Edit Category' : 'Add Category'}</h2></div><button ref={dialog.initialFocusRef} type="button" aria-label="Close category form" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#686479] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button></div><form className="mt-5 space-y-4" onSubmit={submit}><label className="block text-sm font-semibold text-[#423b52]">Category *<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter category name" aria-invalid={Boolean(nameError)} aria-describedby="category-name-count category-name-error" className="mt-1.5 w-full rounded-xl border border-[#342a63]/15 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-[#664cf0]/30" /><span id="category-name-count" className="mt-1 block text-right text-[11px] font-normal text-[#77718a]">{name.length}/100</span></label>{nameError ? <p id="category-name-error" role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{nameError}</p> : null}<p className="rounded-xl bg-[#f6f5fb] px-3 py-2 text-xs leading-5 text-[#5b5472]">Category colour, image and sub-category options are available in the broader Catalogue editor.</p>{error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error instanceof Error ? error.message : 'Could not save this category.'}</p> : null}<div className="flex justify-end gap-2 border-t border-[#272043]/8 pt-4"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67]">Cancel</button><button type="submit" disabled={saving || !valid} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button></div></form></div></div>
}

function SwitchCategoryDialog({ category, saving, error, onClose, onConfirm }: { category: Category; saving: boolean; error: unknown; onClose: () => void; onConfirm: () => void }) {
  const dialog = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-labelledby="switch-category-title" tabIndex={-1} onKeyDown={dialog.onKeyDown} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Categories</p><h2 id="switch-category-title" className="mt-1 font-serif text-xl text-[#241a45]">Switch off {category.name}?</h2><p className="mt-2 text-sm leading-5 text-[#6f6982]">Staff will not see this category when making new orders. It stays in Settings and you can restore it later. Existing orders keep their saved garment details.</p>{error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error instanceof Error ? error.message : 'Could not switch off this category.'}</p> : null}<div className="mt-5 flex justify-end gap-2"><button ref={dialog.initialFocusRef} type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67]">Cancel</button><button type="button" disabled={saving} onClick={onConfirm} className="min-h-10 rounded-xl bg-[#93504c] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Switching off…</> : 'Switch off category'}</button></div></div></div>
}
