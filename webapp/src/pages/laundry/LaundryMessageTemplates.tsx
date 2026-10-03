import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, ChevronLeft, ChevronRight, MessageSquareText, Pencil, RotateCcw, Save, X } from 'lucide-react'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'

type MessageTemplate = { key: string; label: string; body: string; active: boolean; updatedAt?: string }
type Key = 'order-booked' | 'order-processing' | 'order-done' | 'order-delivered'
const DEFAULTS: MessageTemplate[] = [
  { key: 'order-booked', label: 'Order Booked', active: true, body: 'Hello {CustomerName}, your {Brand} order #{OrderNo} has been booked.\n\nItems: {TotalGarments}\nAmount: {TotalAmount}\nExpected delivery: {DeliveryDate}\n\nWe will keep you updated as your order moves through the laundry.' },
  { key: 'order-processing', label: 'Order Processing', active: true, body: 'Hello {CustomerName}, we have started processing your {Brand} order #{OrderNo}. We will message you when it is ready.' },
  { key: 'order-done', label: 'Order Done', active: true, body: 'Hello {CustomerName}, your {Brand} order #{OrderNo} is ready for collection.\n\nItems: {TotalGarments}\nBalance due: {Balance}\n\nThank you for choosing {Brand}.' },
  { key: 'order-delivered', label: 'Order Delivered', active: true, body: 'Hello {CustomerName}, your {Brand} order #{OrderNo} has been delivered. Thank you for choosing {Brand}.' },
]
const PLACEHOLDERS = ['Brand', 'CustomerName', 'CustomerPhone', 'OrderNo', 'InvoiceNo', 'OrderDate', 'DeliveryDate', 'TotalGarments', 'TotalAmount', 'Paid', 'Balance', 'OverallPendingAmount', 'Remarks', 'StainDetails', 'PackageDetails', 'InvoiceUrl', 'ImageDownloadPage', 'TrackOrderUrl', 'ReviewSection', 'TeamName']
const PREVIEW_VALUES: Record<string, string> = {
  Brand: 'Epic Laundry', CustomerName: 'Alex', CustomerPhone: 'Customer phone', OrderNo: 'EL-1042', InvoiceNo: 'INV-1042',
  OrderDate: '29 Sep 2026', DeliveryDate: '2 Oct 2026', TotalGarments: '4', TotalAmount: '₹480', Paid: '₹200', Balance: '₹280',
  OverallPendingAmount: '₹280', Remarks: 'Care instructions', StainDetails: '', PackageDetails: '', InvoiceUrl: 'Invoice link',
  ImageDownloadPage: 'Photo link', TrackOrderUrl: 'Tracking link', ReviewSection: '', TeamName: 'Epic Laundry',
}

export default function LaundryMessageTemplates() {
  const client = useQueryClient()
  const [selectedKey, setSelectedKey] = useState<Key>('order-booked')
  const [editing, setEditing] = useState(false)
  const [archivePrompt, setArchivePrompt] = useState(false)
  const templates = useQuery({ queryKey: ['laundry-message-templates'], queryFn: () => apiGet<MessageTemplate[]>('/laundry/message-templates') })
  const selected = templates.data?.find((template) => template.key === selectedKey)
  const persist = useMutation({
    mutationFn: ({ key, body }: { key: Key; body: string }) => apiPatch<MessageTemplate>(`/laundry/message-templates/${key}`, { body }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['laundry-message-templates'] }); setEditing(false) },
  })
  const archive = useMutation({
    mutationFn: (key: Key) => apiPost<MessageTemplate>(`/laundry/message-templates/${key}/archive`),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['laundry-message-templates'] }); setArchivePrompt(false) },
  })
  const restore = useMutation({
    mutationFn: (key: Key) => apiPost<MessageTemplate>(`/laundry/message-templates/${key}/restore`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['laundry-message-templates'] }),
  })
  const error = templates.error || persist.error || archive.error || restore.error

  function selectOffset(offset: number) {
    const all = templates.data || DEFAULTS
    const current = Math.max(0, all.findIndex((template) => template.key === selectedKey))
    const next = all[(current + offset + all.length) % all.length]
    if (next) setSelectedKey(next.key as Key)
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#664cf0]">Customer updates</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-[#241a45]">WhatsApp message templates</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#686479]">Review the message for each order stage. Changes are saved for this store; a message is never sent from this page.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eeeaff] px-3 py-1.5 text-xs font-bold text-[#5740cb]"><MessageSquareText className="h-4 w-4" /> Settings only</span>
      </header>

      <section className="rounded-[22px] border border-[#ded9f7] bg-white p-4 shadow-[0_8px_28px_rgba(36,26,69,.04)] sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Previous message stage" onClick={() => selectOffset(-1)} className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7e3f7] text-[#5544b5] hover:bg-[#f6f4ff]"><ChevronLeft className="h-4 w-4" /></button>
          <div role="tablist" aria-label="Order message stage" className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
            {(templates.data || DEFAULTS).map((template) => (
              <button
                type="button"
                role="tab"
                id={`message-tab-${template.key}`}
                aria-selected={selectedKey === template.key}
                aria-controls="message-template-panel"
                key={template.key}
                onClick={() => { setSelectedKey(template.key as Key); setArchivePrompt(false) }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') { event.preventDefault(); selectOffset(1) }
                  if (event.key === 'ArrowLeft') { event.preventDefault(); selectOffset(-1) }
                  if (event.key === 'Home') { event.preventDefault(); setSelectedKey((templates.data || DEFAULTS)[0].key as Key) }
                  if (event.key === 'End') { event.preventDefault(); setSelectedKey((templates.data || DEFAULTS).at(-1)!.key as Key) }
                }}
                className={`min-w-max rounded-xl px-3 py-2.5 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0] ${selectedKey === template.key ? 'bg-[#241a45] text-white shadow-sm' : 'bg-[#f6f4ff] text-[#514b67] hover:bg-[#eeeaff]'}`}
              >{template.label}</button>
            ))}
          </div>
          <button type="button" aria-label="Next message stage" onClick={() => selectOffset(1)} className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7e3f7] text-[#5544b5] hover:bg-[#f6f4ff]"><ChevronRight className="h-4 w-4" /></button>
        </div>

        <div id="message-template-panel" role="tabpanel" aria-labelledby={`message-tab-${selectedKey}`} className="mt-4 rounded-2xl border border-[#eeeaf8] bg-[#fbfaff] p-4 sm:p-5">
          {templates.isLoading ? <p className="py-10 text-center text-sm text-[#686479]">Loading message templates…</p> : templates.isError || !selected ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Templates could not be loaded. Please retry.</p> : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#77718a]">Message type</p>
                  <h2 className="mt-1 font-serif text-2xl text-[#241a45]">{selected.label}</h2>
                  <p className="mt-1 text-xs text-[#686479]">This template is used by the matching order stage when messaging is connected.</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${selected.active ? 'bg-[#eaf5ed] text-[#2e6a60]' : 'bg-[#f0eef4] text-[#686479]'}`}>{selected.active ? 'Active' : 'Archived'}</span>
              </div>

              {selected.active ? (
                <>
                  <div className="mt-4 whitespace-pre-wrap rounded-xl border border-[#e8e4f4] bg-white p-4 text-sm leading-6 text-[#454158]">{selected.body}</div>
                  <p className="mt-2 text-xs text-[#77718a]">Preview only. Customer details and actual order values are not loaded here.</p>
                  {archivePrompt ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <span>Archive this stage template? You can restore it later.</span>
                      <span className="flex gap-2"><button type="button" onClick={() => setArchivePrompt(false)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold">Keep template</button><button type="button" disabled={archive.isPending} onClick={() => archive.mutate(selected.key as Key)} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white">{archive.isPending ? 'Archiving…' : 'Archive template'}</button></span>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { persist.reset(); setEditing(true) }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#5540d2]"><Pencil className="h-4 w-4" /> Edit</button>
                    <button type="button" disabled={archive.isPending} onClick={() => setArchivePrompt(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#ded9f7] bg-white px-4 py-2.5 text-sm font-bold text-[#554b72] hover:bg-[#f6f4ff]"><Archive className="h-4 w-4" /> Archive</button>
                    {selected.updatedAt ? <span className="self-center text-xs text-[#77718a]">Updated {new Date(selected.updatedAt).toLocaleString()}</span> : <span className="self-center text-xs text-[#77718a]">Default template</span>}
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-[#d8d2ee] bg-white p-5">
                  <p className="font-bold text-[#39344d]">This message is archived.</p>
                  <p className="mt-1 text-sm text-[#686479]">Restore it to make it available to future messaging flows.</p>
                  <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(selected.key as Key)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" />{restore.isPending ? 'Restoring…' : 'Restore template'}</button>
                </div>
              )}
            </>
          )}
          {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error instanceof Error ? error.message : 'The template could not be updated.'}</p> : null}
        </div>
      </section>
      {editing && selected ? <TemplateEditor key={selected.key} template={selected} saving={persist.isPending} error={persist.error} onClose={() => setEditing(false)} onSave={(body) => persist.mutate({ key: selected.key as Key, body })} /> : null}
    </div>
  )
}

function TemplateEditor({ template, saving, error, onClose, onSave }: { template: MessageTemplate; saving: boolean; error: unknown; onClose: () => void; onSave: (body: string) => void }) {
  const [draft, setDraft] = useState(template.body)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const dialog = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  const rendered = useMemo(() => draft.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, key: string) => PREVIEW_VALUES[key] ?? `{${key}}`), [draft])
  const unknown = useMemo(() => [...new Set(Array.from(draft.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g), (match) => match[1]))].filter((key) => !PLACEHOLDERS.includes(key)), [draft])
  const changed = draft.trim() !== template.body
  const insertPlaceholder = (name: string) => {
    const field = fieldRef.current
    const token = `{${name}}`
    if (!field) { setDraft((value) => value + token); return }
    const start = field.selectionStart ?? draft.length
    const end = field.selectionEnd ?? start
    const next = draft.slice(0, start) + token + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + token.length, start + token.length) })
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-labelledby="template-editor-title" tabIndex={-1} onKeyDown={dialog.onKeyDown} className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Message template</p><h2 id="template-editor-title" className="mt-1 font-serif text-2xl text-[#241a45]">Edit {template.label}</h2></div>
          <button ref={dialog.initialFocusRef} type="button" aria-label="Close template editor" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-[#686479] hover:bg-[#f5f2ff]"><X className="h-5 w-5" /></button>
        </div>
        <label className="mt-5 block text-xs font-bold text-[#514b67]">Message type<input value={template.label} readOnly aria-readonly="true" className="mt-1 h-10 w-full rounded-xl border border-[#e7e3f1] bg-[#f7f6fa] px-3 text-sm" /></label>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="flex items-end justify-between gap-2"><label htmlFor="message-template-body" className="text-xs font-bold text-[#514b67]">Message</label><span className="text-[11px] tabular-nums text-[#77718a]">{draft.length}/4000</span></div>
            <textarea ref={fieldRef} id="message-template-body" aria-label="Message" value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} className="mt-1 min-h-64 w-full rounded-xl border border-[#dcd6ed] p-3 text-sm leading-6 text-[#39344d] outline-none focus:border-[#664cf0] focus:ring-2 focus:ring-[#664cf0]/15" />
            <p className="mt-2 text-xs text-[#77718a]">Use a placeholder below where customer or order details should appear.</p>
          </div>
          <div className="rounded-2xl border border-[#ece8f6] bg-[#fbfaff] p-4">
            <h3 className="font-serif text-lg text-[#241a45]">Placeholders</h3>
            <p className="mt-1 text-xs leading-5 text-[#686479]">Select one to insert it at the cursor.</p>
            <div className="mt-3 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
              {PLACEHOLDERS.map((placeholder) => <button type="button" key={placeholder} onClick={() => insertPlaceholder(placeholder)} className="rounded-full border border-[#ded9f7] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#554b72] hover:border-[#9a8ce8] hover:bg-[#f6f4ff]">{'{' + placeholder + '}'}</button>)}
            </div>
            <h3 className="mt-5 font-serif text-lg text-[#241a45]">Preview</h3>
            <p className="mt-1 text-xs text-[#686479]">Sample values only</p>
            <div aria-label="Message preview" className="mt-3 min-h-28 whitespace-pre-wrap rounded-xl border border-[#ece8f6] bg-white p-3 text-sm leading-6 text-[#454158]">{rendered || 'Your message preview will appear here.'}</div>
          </div>
        </div>
        {unknown.length ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">Unknown placeholder{unknown.length === 1 ? '' : 's'}: {unknown.join(', ')}. Choose from the list before saving.</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error instanceof Error ? error.message : 'The template could not be saved.'}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#ece8f6] pt-4">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded-xl border border-[#ddd7ee] px-4 py-2.5 text-sm font-bold text-[#514b67]">Cancel</button>
          <button type="button" disabled={saving || !changed || !draft.trim() || Boolean(unknown.length)} onClick={() => onSave(draft)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#b8b0dc]"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save template'}</button>
        </div>
      </div>
    </div>
  )
}
