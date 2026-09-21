import { useEffect, useState } from 'react'
import { Globe2, Layers, Store } from 'lucide-react'
import { localDateKey } from '@/lib/utils'

export type FinanceChannel = 'ALL' | 'POS' | 'ONLINE'
export type FinancePreset = 'today' | '7d' | '30d' | 'month' | 'fy' | 'custom'
export type FinanceMarketplace = { connected: boolean; reason?: string | null } | null | undefined

const STORE_KEY = 'epic-finance-filters-v1'
const addDays = (date: string, days: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
const financialYearStart = (date: string) => { const value = new Date(`${date}T00:00:00Z`); return `${value.getUTCMonth() >= 3 ? value.getUTCFullYear() : value.getUTCFullYear() - 1}-04-01` }

export function rangeFor(preset: FinancePreset, now = localDateKey()) {
  if (preset === 'today') return { from: now, to: now }
  if (preset === '7d') return { from: addDays(now, -6), to: now }
  if (preset === '30d') return { from: addDays(now, -29), to: now }
  if (preset === 'fy') return { from: financialYearStart(now), to: now }
  return { from: `${now.slice(0, 7)}-01`, to: now }
}

type Stored = { channel: FinanceChannel; preset: FinancePreset; from: string; to: string }

function read(): Stored {
  const fallback: Stored = { channel: 'ALL', preset: 'month', ...rangeFor('month') }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null')
    if (!parsed) return fallback
    const channel: FinanceChannel = ['ALL', 'POS', 'ONLINE'].includes(parsed.channel) ? parsed.channel : 'ALL'
    const preset: FinancePreset = ['today', '7d', '30d', 'month', 'fy', 'custom'].includes(parsed.preset) ? parsed.preset : 'month'
    // A preset is re-evaluated against today; only a custom range keeps its saved dates.
    const range = preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.from) && /^\d{4}-\d{2}-\d{2}$/.test(parsed.to) ? { from: parsed.from, to: parsed.to } : rangeFor(preset)
    return { channel, preset, ...range }
  } catch {
    return fallback
  }
}

/** Channel + date range, shared by Finance & compliance and Statutory controls so the choice follows the operator between them. */
export function useFinanceFilters() {
  const [state, setState] = useState<Stored>(read)
  useEffect(() => { try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* not remembered */ } }, [state])
  return {
    ...state,
    setChannel: (channel: FinanceChannel) => setState((current) => ({ ...current, channel })),
    setPreset: (preset: FinancePreset) => setState((current) => (preset === 'custom' ? { ...current, preset } : { ...current, preset, ...rangeFor(preset) })),
    setRange: (range: { from?: string; to?: string }) => setState((current) => ({ ...current, preset: 'custom', from: range.from || current.from, to: range.to || current.to })),
  }
}

export const channelName = (channel: string) => (channel === 'POS' ? 'Offline / POS' : channel === 'ONLINE' || channel === 'LNDRY_ONLINE' ? 'Online / LNDRY' : 'All channels')

const CHANNELS: Array<{ value: FinanceChannel; label: string; hint: string; icon: typeof Layers }> = [
  { value: 'ALL', label: 'All', hint: 'Counter + LNDRY online, counted once', icon: Layers },
  { value: 'POS', label: 'Offline / POS', hint: 'Sales rung up at this counter', icon: Store },
  { value: 'ONLINE', label: 'Online / LNDRY', hint: 'Orders from the LNDRY customer app', icon: Globe2 },
]
const PRESETS: Array<[FinancePreset, string]> = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month'], ['fy', 'Financial year'], ['custom', 'Custom']]

export function FinanceFilterBar({ filters, marketplace, tone = 'dark' }: { filters: ReturnType<typeof useFinanceFilters>; marketplace: FinanceMarketplace; tone?: 'dark' | 'light' }) {
  const connected = marketplace ? marketplace.connected : true
  const dark = tone === 'dark'
  return <div className="relative mt-6 space-y-3 border-t border-white/10 pt-4">
    <div role="radiogroup" aria-label="Sales channel" className="flex flex-wrap gap-2">
      {CHANNELS.map((item) => {
        const disabled = item.value !== 'POS' && !connected
        const active = filters.channel === item.value
        return <button key={item.value} type="button" role="radio" aria-checked={active} disabled={disabled} title={disabled ? 'LNDRY Online is not connected for this business.' : item.hint}
          onClick={() => filters.setChannel(item.value)}
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${active ? (dark ? 'bg-white text-[#2d1e65] shadow-sm' : 'bg-[#664cf0] text-white') : (dark ? 'bg-white/10 text-[#e5e0ff] hover:bg-white/20' : 'bg-[#f0edff] text-[#4b3aa8]')} ${disabled ? 'cursor-not-allowed opacity-40 hover:bg-white/10' : ''}`}>
          <item.icon className="h-3.5 w-3.5" aria-hidden="true" />{item.label}
        </button>
      })}
    </div>
    <div className="flex flex-wrap items-center gap-2" aria-label="Period">
      {PRESETS.map(([value, label]) => <button key={value} type="button" onClick={() => filters.setPreset(value)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${filters.preset === value ? 'bg-white text-[#17353c]' : 'bg-white/10 text-[#d6e6e2] hover:bg-white/20'}`}>{label}</button>)}
      {filters.preset === 'custom' ? <span className="flex items-center gap-2">
        <input aria-label="Period start" type="date" value={filters.from} max={filters.to} onChange={(event) => event.target.value && filters.setRange({ from: event.target.value })} className="h-8 rounded-lg border border-white/20 bg-white/10 px-2 text-xs text-white [color-scheme:dark]" />
        <span className="text-xs text-[#e5e0ff]">to</span>
        <input aria-label="Period end" type="date" value={filters.to} min={filters.from} onChange={(event) => event.target.value && filters.setRange({ to: event.target.value })} className="h-8 rounded-lg border border-white/20 bg-white/10 px-2 text-xs text-white [color-scheme:dark]" />
      </span> : null}
    </div>
  </div>
}
