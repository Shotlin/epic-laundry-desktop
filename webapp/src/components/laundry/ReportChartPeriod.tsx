import { useState } from 'react'
import { useDialogFocusLifecycle } from '@/components/laundry/useDialogFocus'
import { localDateKey } from '@/lib/utils'

export type ChartDateRange = { from: string; to: string }
export type ChartPeriod = 'Week' | 'Month' | 'Quarter' | 'Year' | 'Custom'

function rangeFor(period: Exclude<ChartPeriod, 'Custom'>, base = new Date()): ChartDateRange {
  const to = new Date(base)
  const from = new Date(base)
  if (period === 'Week') from.setDate(from.getDate() - 6)
  if (period === 'Month') from.setMonth(from.getMonth() - 1)
  if (period === 'Quarter') from.setMonth(from.getMonth() - 3)
  if (period === 'Year') from.setFullYear(from.getFullYear() - 1)
  return { from: localDateKey(from), to: localDateKey(to) }
}

export default function ReportChartPeriod({ onChange }: { onChange: (range: ChartDateRange) => void }) {
  const [period, setPeriod] = useState<ChartPeriod>('Week')
  const [previousPeriod, setPreviousPeriod] = useState<Exclude<ChartPeriod, 'Custom'>>('Week')
  const [customOpen, setCustomOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const closeCustom = () => {
    setPeriod(previousPeriod)
    setCustomOpen(false)
  }
  useDialogFocusLifecycle(closeCustom, customOpen)

  function selectPeriod(next: ChartPeriod) {
    if (next === 'Custom') {
      setFrom('')
      setTo('')
      setPeriod('Custom')
      setCustomOpen(true)
      return
    }
    setPeriod(next)
    setPreviousPeriod(next)
    onChange(rangeFor(next))
  }

  return <>
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#617178]">
      Chart period
      <select aria-label="Chart period" value={period} onChange={(event) => selectPeriod(event.target.value as ChartPeriod)} className="h-9 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-semibold text-[#315d57]">
        {(['Week', 'Month', 'Quarter', 'Year', 'Custom'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    {customOpen ? <div className="fixed inset-0 z-[80] grid place-items-center bg-[#17272a]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCustom() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="chart-custom-range-title" className="w-full max-w-lg rounded-2xl border border-[#263f44]/10 bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#4d8982]">Chart period</p>
        <h2 id="chart-custom-range-title" className="mt-1 font-serif text-xl text-[#17353c]">Select custom date range</h2>
        <p className="mt-1 text-xs text-[#718087]">Pick the dates to show in the chart.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#617178]">Start date<input aria-label="Chart start date" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 font-normal" /></label>
          <label className="text-xs font-semibold text-[#617178]">End date<input aria-label="Chart end date" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 font-normal" /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={closeCustom} className="h-9 rounded-lg border border-[#263f44]/15 bg-white px-3 text-xs font-bold text-[#315d57]">Cancel</button>
          <button type="button" disabled={!from || !to || from > to} onClick={() => { setPeriod('Custom'); setCustomOpen(false); onChange({ from, to }) }} className="h-9 rounded-lg bg-[#123039] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
        </div>
      </section>
    </div> : null}
  </>
}
