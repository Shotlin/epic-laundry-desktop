import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { apiGet, apiPost, operatorErrorMessage } from '@/lib/api'
import { canUseUi } from '@/lib/permissions'
import { invalidateProductionViews } from '@/lib/productionQueries'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'

type Claim = {
  id: string
  unitId: string
  tagCode: string
  orderNumber: string
  garment: string
  state: string
  category: string
  severity: string
  status: string
  description: string
  openedAt: string
  openedBy: string
  decision?: string | null
  resolutionNote?: string
  correction?: { id: string; status: string; summary: string; customerMessage: string; issuedAt: string } | null
}
type QualityAnalytics = {
  totalClaims: number
  openClaims: number
  resolvedClaims: number
  rejectedClaims: number
  rewashClaims: number
  correctionDocuments: number
  averageResolutionHours: number | null
  byCategory: Record<string, number>
  byDecision: Record<string, number>
}
type Session = { user: { roles: string[] } | null }

const categories = ['Stain', 'Damage', 'Missing', 'Rewash', 'Other']
const decisions = ['Rewash', 'Damaged', 'Missing', 'Release', 'Reject']

export default function LaundryQualityClaims() {
  const client = useQueryClient()
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('Rewash')
  const [severity, setSeverity] = useState('Medium')
  const [description, setDescription] = useState('')
  const [openNotice, setOpenNotice] = useState('')
  const [resolutionNotice, setResolutionNotice] = useState('')
  const session = useQuery({ queryKey: ['auth-session'], queryFn: () => apiGet<Session>('/auth/session') })
  const claims = useQuery({ queryKey: ['quality-claims'], queryFn: () => apiGet<Claim[]>('/laundry/quality-claims') })
  const analytics = useQuery({ queryKey: ['quality-analytics'], queryFn: () => apiGet<QualityAnalytics>('/laundry/quality-analytics') })

  const open = useMutation({
    mutationFn: () => apiPost<Claim>('/laundry/quality-claims', { garmentUnitId: unit, category, severity, description }),
    onMutate: () => setOpenNotice(''),
    onSuccess: async () => {
      setUnit('')
      setDescription('')
      setOpenNotice('Quality claim opened for supervisor review.')
      await Promise.all([
        client.invalidateQueries({ queryKey: ['quality-claims'] }),
        client.invalidateQueries({ queryKey: ['quality-analytics'] }),
        client.invalidateQueries({ queryKey: ['customer-corrections'] }),
        client.invalidateQueries({ queryKey: ['garment-units'] }),
        invalidateProductionViews(client),
      ])
    },
    onError: () => setOpenNotice(''),
  })
  const resolve = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note: string }) => apiPost<Claim>(`/laundry/quality-claims/${id}/resolve`, { decision, note }),
    onMutate: () => setResolutionNotice(''),
    onSuccess: async () => {
      setResolutionNotice('Claim decision recorded in the garment audit trail.')
      await Promise.all([
        client.invalidateQueries({ queryKey: ['quality-claims'] }),
        client.invalidateQueries({ queryKey: ['quality-analytics'] }),
        client.invalidateQueries({ queryKey: ['customer-corrections'] }),
        client.invalidateQueries({ queryKey: ['garment-units'] }),
        client.invalidateQueries({ queryKey: ['production-queue'] }),
        client.invalidateQueries({ queryKey: ['production-load'] }),
        client.invalidateQueries({ queryKey: ['production-workload'] }),
        client.invalidateQueries({ queryKey: ['production-schedule'] }),
        client.invalidateQueries({ queryKey: ['production-supervisor-metrics'] }),
      ])
    },
    onError: () => setResolutionNotice(''),
  })

  const roles = session.data?.user?.roles
  const canOpen = canUseUi(roles, 'quality.open')
  const canResolve = canUseUi(roles, 'quality.resolve')
  if (claims.isLoading) return <VisualLoadingState title="Loading quality queue" detail="Reading claims, rewash decisions and correction-document evidence." />
  if (claims.isError || !claims.data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">Quality claims could not be loaded.</div>

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Quality control</p>
        <h1 className="mt-1 font-serif text-3xl text-[#17353c]">Claims &amp; exceptions</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#718087]">Record stains, damage, missing items, and rewash decisions against the physical garment. Every decision advances the tag lifecycle and remains auditable.</p>
      </header>

      {analytics.data ? (
        <section aria-label="Quality metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Open claims" value={analytics.data.openClaims} />
          <Metric label="Rewash loops" value={analytics.data.rewashClaims} />
          <Metric label="Resolved" value={analytics.data.resolvedClaims} />
          <Metric label="Corrections" value={analytics.data.correctionDocuments} />
          <Metric label="Avg resolution" value={analytics.data.averageResolutionHours === null ? '—' : `${analytics.data.averageResolutionHours}h`} />
        </section>
      ) : null}

      {canOpen ? <section className="rounded-[24px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#c07832]" />
          <h2 className="font-serif text-xl text-[#17353c]">Open a claim</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-xs font-bold uppercase tracking-[.12em] text-[#617178] md:col-span-2">
            Tag or unit code
            <input value={unit} onChange={(event) => { setUnit(event.target.value); if (open.error) open.reset(); setOpenNotice('') }} placeholder="TAG-20260829-000001" className="mt-1.5 h-11 w-full rounded-xl border border-[#263f44]/15 px-3 text-sm font-semibold normal-case tracking-normal" />
          </label>
          <Select label="Category" value={category} onChange={setCategory} options={categories} />
          <Select label="Severity" value={severity} onChange={setSeverity} options={['Low', 'Medium', 'High', 'Critical']} />
          <label className="text-xs font-bold uppercase tracking-[.12em] text-[#617178] md:col-span-3">
            Description
            <textarea value={description} onChange={(event) => { setDescription(event.target.value); if (open.error) open.reset(); setOpenNotice('') }} placeholder="What did the operator observe?" className="mt-1.5 min-h-20 w-full rounded-xl border border-[#263f44]/15 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
          </label>
          <button type="button" disabled={open.isPending || !unit.trim() || description.trim().length < 3} onClick={() => open.mutate()} className="self-end rounded-xl bg-[#123039] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {open.isPending ? 'Opening…' : 'Open claim'}
          </button>
        </div>
        {open.error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{operatorErrorMessage(open.error, 'The claim could not be opened. Check the tag and try again.')}</p> : null}
        {openNotice ? <p role="status" className="mt-3 text-sm font-semibold text-[#2e6a60]"><CheckCircle2 className="mr-1 inline h-4 w-4" />{openNotice}</p> : null}
      </section> : <p className="rounded-xl border border-[#263f44]/10 bg-white p-4 text-sm text-[#617178]">You have read-only access to quality records. A permitted team member must open or resolve claims.</p>}

      <section aria-label="Claim register" className="overflow-hidden rounded-[24px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">
        <header className="flex items-center gap-2 border-b border-[#263f44]/10 bg-[#fafaf7] p-5">
          <ShieldCheck className="h-5 w-5 text-[#39786f]" />
          <div>
            <h2 className="font-serif text-xl text-[#17353c]">Claim register</h2>
            <p className="text-xs text-[#718087]">{claims.data.filter((claim) => ['Open', 'Under Review'].includes(claim.status)).length} awaiting decision</p>
          </div>
        </header>
        {resolutionNotice ? <p role="status" className="mx-5 mt-4 rounded-xl bg-[#eaf3ef] p-3 text-sm font-semibold text-[#2e6a60]"><CheckCircle2 className="mr-1 inline h-4 w-4" />{resolutionNotice}</p> : null}
        {resolve.error ? <p role="alert" className="mx-5 mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{operatorErrorMessage(resolve.error, 'The claim decision could not be saved. No resolution was recorded.')}</p> : null}
        {claims.data.length ? (
          <div className="divide-y divide-[#263f44]/8">
            {claims.data.map((claim) => <ClaimRow key={claim.id} claim={claim} canResolve={canResolve} pending={resolve.isPending} onClearError={() => { if (resolve.error) resolve.reset(); setResolutionNotice('') }} onResolve={(decision, note) => resolve.mutate({ id: claim.id, decision, note })} />)}
          </div>
        ) : <VisualEmptyState kind="quality" title="Quality is clear" detail="Claims will appear here when a physical garment needs review." />}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-[#263f44]/10 bg-white p-4 shadow-[0_8px_28px_rgba(37,48,43,.03)]"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">{label}</p><p className="mt-1 font-serif text-2xl text-[#17353c]">{value}</p></div>
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="text-xs font-bold uppercase tracking-[.12em] text-[#617178]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-medium normal-case tracking-normal">{options.map((option) => <option key={option}>{option}</option>)}</select></label>
}

function ClaimRow({ claim, canResolve, pending, onClearError, onResolve }: { claim: Claim; canResolve: boolean; pending: boolean; onClearError: () => void; onResolve: (decision: string, note: string) => void }) {
  const [decision, setDecision] = useState('Rewash')
  const [note, setNote] = useState('')
  const active = ['Open', 'Under Review'].includes(claim.status)

  return (
    <article className="p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-[#215861]">{claim.category} · {claim.garment}</p>
            <span className="rounded-full bg-[#fff2ce] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#855815]">{claim.severity}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] ${active ? 'bg-rose-50 text-rose-700' : 'bg-[#eaf3ef] text-[#2e6a60]'}`}>{claim.status}</span>
          </div>
          <p className="mt-1 text-xs text-[#819095]">{claim.orderNumber} · <span className="font-mono">{claim.tagCode}</span> · state {claim.state} · opened by {claim.openedBy}</p>
          <p className="mt-2 max-w-3xl text-sm text-[#52676b]">{claim.description}</p>
          {claim.resolutionNote ? <p className="mt-1 text-xs text-[#718087]">Decision: {claim.decision} · {claim.resolutionNote}</p> : null}
          {claim.correction ? <div className="mt-3 max-w-3xl rounded-xl border border-[#39786f]/20 bg-[#eaf3ef] p-3"><p className="text-xs font-bold text-[#2e6a60]">Customer correction issued · {claim.correction.id}</p><p className="mt-1 text-xs leading-5 text-[#52676b]">{claim.correction.customerMessage}</p></div> : null}
        </div>
        {active && canResolve ? (
          <div className="flex w-full flex-col gap-2 lg:w-80">
            <div className="flex gap-2">
              <select aria-label={`Resolution decision for ${claim.tagCode}`} value={decision} onChange={(event) => { setDecision(event.target.value); onClearError() }} className="h-10 flex-1 rounded-lg border border-[#263f44]/15 px-2 text-xs">{decisions.map((item) => <option key={item}>{item}</option>)}</select>
              <button type="button" disabled={pending || note.trim().length < 3} onClick={() => onResolve(decision, note)} className="rounded-lg bg-[#3a7d78] px-3 text-xs font-bold text-white disabled:opacity-50">{pending ? 'Saving…' : 'Resolve'}</button>
            </div>
            <input aria-label={`Resolution note for ${claim.tagCode}`} value={note} onChange={(event) => { setNote(event.target.value); onClearError() }} placeholder="Required resolution note" className="h-9 rounded-lg border border-[#263f44]/15 px-2 text-xs" />
          </div>
        ) : null}
      </div>
    </article>
  )
}
