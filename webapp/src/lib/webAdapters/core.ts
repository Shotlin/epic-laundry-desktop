// Website-build only. Pages were written against the local desktop server's
// own endpoints (/laundry/..., /marketplace/cloud/..., etc.). Those do not
// exist on the real LNDRY backend. An adapter answers one such path by
// calling the real /api/v1 endpoints and reshaping the result into exactly
// what the page already expects — the page itself is not changed. Electron
// never loads this: api.ts only consults it when isWebOnly is true.

export type Real = {
  get: (path: string) => Promise<any>
  post: (path: string, body?: unknown) => Promise<any>
  put: (path: string, body?: unknown) => Promise<any>
  patch: (path: string, body?: unknown) => Promise<any>
  del: (path: string) => Promise<any>
}

export type AdapterCtx = Real & {
  params: Record<string, string>
  query: URLSearchParams
  body: any
}

export type Adapter = (ctx: AdapterCtx) => Promise<unknown>
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const table: Array<{ method: Method; re: RegExp; keys: string[]; fn: Adapter }> = []

export function route(method: Method, pattern: string, fn: Adapter) {
  const keys: string[] = []
  const source = pattern.replace(/:([A-Za-z]+)/g, (_match, key: string) => { keys.push(key); return '([^/]+)' })
  table.push({ method, re: new RegExp(`^${source}$`), keys, fn })
}

export function matchAdapter(method: Method, fullPath: string): { fn: Adapter; params: Record<string, string>; query: URLSearchParams } | null {
  const [path, search = ''] = fullPath.split('?')
  for (const entry of table) {
    if (entry.method !== method) continue
    const found = entry.re.exec(path)
    if (!found) continue
    const params: Record<string, string> = {}
    entry.keys.forEach((key, index) => { params[key] = decodeURIComponent(found[index + 1]) })
    return { fn: entry.fn, params, query: new URLSearchParams(search) }
  }
  return null
}

export const rupees = (paise: unknown) => (Number(paise) || 0) / 100
export const toPaise = (value: unknown) => Math.round((Number(value) || 0) * 100)

type RawLine = { label?: unknown; percent?: unknown; amountPaise?: unknown }
const line = (raw: RawLine) => ({ label: String(raw.label || ''), percent: raw.percent == null ? null : Number(raw.percent), amount: rupees(raw.amountPaise) })

/**
 * The backend's labelled price breakdown (paise) as rupees. An order booked before the breakdown was
 * stored has only its totals, so plain lines are built from those — never an "Adjustment".
 */
export function breakdownOf(raw: { charges?: RawLine[]; discounts?: RawLine[]; tax?: RawLine | null } | null | undefined, totals: { chargesPaise: number; discountsPaise: number; taxPaise: number; taxRateBps: number }) {
  if (raw) {
    return {
      charges: (raw.charges || []).map(line).filter((entry) => entry.amount > 0),
      discounts: (raw.discounts || []).map(line).filter((entry) => entry.amount > 0),
      tax: raw.tax && Number(raw.tax.amountPaise) > 0 ? line(raw.tax) : null,
    };
  }
  return {
    charges: totals.chargesPaise > 0 ? [{ label: 'Additional Charge', percent: null, amount: rupees(totals.chargesPaise) }] : [],
    discounts: totals.discountsPaise > 0 ? [{ label: 'Discount', percent: null, amount: rupees(totals.discountsPaise) }] : [],
    tax: totals.taxPaise > 0 ? { label: 'GST', percent: totals.taxRateBps ? totals.taxRateBps / 100 : null, amount: rupees(totals.taxPaise) } : null,
  };
}
export const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '')

/** Real backend list endpoints sometimes return the array directly and sometimes wrap it — accept both. */
export function listOf(data: any, ...keys: string[]): any[] {
  if (Array.isArray(data)) return data
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key]
  return []
}

export class AdapterUnavailable extends Error {
  readonly code = 'NOT_AVAILABLE_ON_WEB'
  constructor(what: string) { super(`${what} is not available in the web version yet.`); this.name = 'AdapterUnavailable' }
}
