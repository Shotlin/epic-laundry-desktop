import { useState } from 'react'
import { useDialogFocusLifecycle } from '@/components/laundry/useDialogFocus'
import { localDateKey } from '@/lib/utils'
import type { ReportPeriod } from '@/components/laundry/ReportDateFilter'
import { reportPeriodRange } from '@/components/laundry/ReportDateFilter'

type StatisticsPeriod = Exclude<ReportPeriod, 'custom'> | 'custom'
type Range = { from: string; to: string }

const labels: Record<StatisticsPeriod, string> = {
  today: 'Today', yesterday: 'Yesterday', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year', custom: 'Custom',
}

export default function StatisticsRangeFilter({ label, period, options, range, onChange }: {
  label: string
  period: StatisticsPeriod
  options: StatisticsPeriod[]
  range: Range
  onChange: (period: StatisticsPeriod, range: Range) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const closeCustom = () => setCustomOpen(false)
  useDialogFocusLifecycle(closeCustom, customOpen)

  function choose(next: StatisticsPeriod) {
    if (next === 'custom') {
      setFrom('')
      setTo('')
      setCustomOpen(true)
      return
    }
    onChange(next, reportPeriodRange(next))
  }

  return <>
    <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <label className="text-[10px] font-bold text-[#526078]">
        {label}
        <select aria-label={`${label} date range`} value={period} onChange={(event) => choose(event.target.value as StatisticsPeriod)} className="mt-1 block h-9 min-w-32 rounded-lg border border-[#664cf0]/20 bg-white px-2 text-xs font-semibold text-[#4535a4] outline-none transition focus:border-[#664cf0] focus:ring-2 focus:ring-[#664cf0]/15 sm:mt-0 sm:inline-block sm:ml-2">
          {options.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
        </select>
      </label>
      <span className="text-[10px] font-medium text-[#81869a]">{range.from} – {range.to}</span>
    </div>
    {customOpen ? <div className="fixed inset-0 z-[80] grid place-items-center bg-[#20174c]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCustom() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="statistics-custom-range-title" className="w-full max-w-lg rounded-2xl border border-[#664cf0]/15 bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">{label}</p>
        <h2 id="statistics-custom-range-title" className="mt-1 font-serif text-xl text-[#302564]">Select custom date range</h2>
        <p className="mt-1 text-xs text-[#718087]">Choose a start and end date for this section.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#526078]">Start date<input aria-label={`${label} start date`} type="date" max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[#664cf0]/20 bg-white px-2 font-normal focus:border-[#664cf0] focus:outline-none focus:ring-2 focus:ring-[#664cf0]/15" /></label>
          <label className="text-xs font-semibold text-[#526078]">End date<input aria-label={`${label} end date`} type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[#664cf0]/20 bg-white px-2 font-normal focus:border-[#664cf0] focus:outline-none focus:ring-2 focus:ring-[#664cf0]/15" /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={closeCustom} className="h-9 rounded-lg border border-[#664cf0]/20 bg-white px-3 text-xs font-bold text-[#4535a4]">Cancel</button>
          <button type="button" disabled={!from || !to || from > to} onClick={() => { onChange('custom', { from, to }); closeCustom() }} className="h-9 rounded-lg bg-[#664cf0] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
        </div>
      </section>
    </div> : null}
  </>
}

export function currentStatisticsRange(period: Exclude<StatisticsPeriod, 'custom'>): Range {
  if (period !== 'quarter') return reportPeriodRange(period)
  const today = new Date()
  const start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
  return { from: localDateKey(start), to: localDateKey(today) }
}
