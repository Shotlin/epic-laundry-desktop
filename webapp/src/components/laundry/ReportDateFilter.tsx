import { useEffect, useState } from 'react'
import { localDateKey } from '@/lib/utils'

export type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

const periodLabels: Array<[ReportPeriod, string]> = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['quarter', 'Quarter'],
  ['year', 'Year'],
  ['custom', 'Custom'],
]
const defaultPeriodOptions: ReportPeriod[] = ['today', 'yesterday', 'week', 'month', 'year', 'custom']

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function reportPeriodRange(period: Exclude<ReportPeriod, 'custom'>) {
  const today = new Date()
  if (period === 'today') return { from: localDateKey(today), to: localDateKey(today) }
  if (period === 'yesterday') {
    const yesterday = addDays(today, -1)
    return { from: localDateKey(yesterday), to: localDateKey(yesterday) }
  }
  if (period === 'week') {
    return { from: localDateKey(addDays(today, -6)), to: localDateKey(today) }
  }
  if (period === 'month') return { from: localDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDateKey(today) }
  if (period === 'quarter') return { from: localDateKey(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)), to: localDateKey(today) }
  return { from: localDateKey(new Date(today.getFullYear(), 0, 1)), to: localDateKey(today) }
}

export default function ReportDateFilter({ from, to, onApply, onReset, periodOptions = defaultPeriodOptions, initialPeriod = 'custom', selectedPeriod, onSelectedPeriodChange, showReset = true, applyLabel = 'Apply filter' }: { from: string; to: string; onApply: (range: { from: string; to: string }) => void; onReset: () => void; periodOptions?: ReportPeriod[]; initialPeriod?: ReportPeriod; selectedPeriod?: ReportPeriod; onSelectedPeriodChange?: (period: ReportPeriod) => void; showReset?: boolean; applyLabel?: string }) {
  const [localPeriod, setLocalPeriod] = useState<ReportPeriod>(initialPeriod)
  const period = selectedPeriod ?? localPeriod
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)

  useEffect(() => { setDraftFrom(from); setDraftTo(to) }, [from, to])
  useEffect(() => { if (selectedPeriod === undefined) setLocalPeriod(initialPeriod) }, [initialPeriod, selectedPeriod])

  function choosePeriod(next: ReportPeriod) {
    if (selectedPeriod === undefined) setLocalPeriod(next)
    onSelectedPeriodChange?.(next)
    if (next === 'custom') return
    const range = reportPeriodRange(next)
    setDraftFrom(range.from)
    setDraftTo(range.to)
  }

  return <div className="flex flex-wrap items-end gap-2" aria-label="Report date filter">
    <label className="text-xs font-semibold text-[#617178]">Report by
      <select value={period} onChange={(event) => choosePeriod(event.target.value as ReportPeriod)} className="mt-1 block h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 font-normal">
        {periodLabels.filter(([value]) => periodOptions.includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <label className="text-xs font-semibold text-[#617178]">From
      <input type="date" max={draftTo || undefined} disabled={period !== 'custom'} value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 font-normal disabled:cursor-not-allowed disabled:bg-[#f0f3f1]" />
    </label>
    <label className="text-xs font-semibold text-[#617178]">To
      <input type="date" min={draftFrom || undefined} disabled={period !== 'custom'} value={draftTo} onChange={(event) => setDraftTo(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 font-normal disabled:cursor-not-allowed disabled:bg-[#f0f3f1]" />
    </label>
    {draftFrom && draftTo && draftFrom > draftTo ? <p role="status" className="text-xs font-semibold text-rose-700">End date must be on or after the start date.</p> : null}
    <button type="button" disabled={Boolean(draftFrom && draftTo && draftFrom > draftTo)} onClick={() => onApply({ from: draftFrom, to: draftTo })} className="h-9 rounded-lg bg-[#123039] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{applyLabel}</button>
    {showReset ? <button type="button" onClick={() => { if (selectedPeriod === undefined) setLocalPeriod('custom'); onSelectedPeriodChange?.('custom'); setDraftFrom(''); setDraftTo(''); onReset() }} className="h-9 rounded-lg border border-[#263f44]/15 bg-white px-3 text-xs font-bold text-[#315d57]">Reset</button> : null}
  </div>
}
