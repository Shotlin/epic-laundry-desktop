// Captains, cash drawer, parked carts and print settings.
import { route, rupees, listOf } from './core'

type Staff = { id: string; user_name?: string | null; user_phone?: string | null; is_active?: boolean }

route('GET', '/laundry/riders', async ({ get }) => {
  const data = await get('/vendor/employees?role=VENDOR_RIDER')
  return (listOf(data, 'staff') as Staff[]).filter((staff) => staff.is_active !== false).map((staff) => ({ id: staff.id, name: staff.user_name || 'Captain', phone: staff.user_phone || '' }))
})

// ── Cash drawer ─────────────────────────────────────────────────────────
type RealShift = {
  id: string; register: string; status: 'OPEN' | 'CLOSED'; businessDate: string; openedAt: string; openedBy: string
  closedAt?: string | null; closedBy?: string | null; note?: string | null; closeNote?: string | null
  openingCashPaise: number; countedCashPaise?: number | null; expectedCashPaise?: number | null; variancePaise?: number | null
  varianceApprovedBy?: string | null; collectionsPaise?: number; expensesPaise?: number; collectionCount?: number; expenseCount?: number
}

export const shiftShape = (shift: RealShift) => ({
  id: shift.id,
  status: shift.status === 'OPEN' ? 'Open' : 'Closed',
  register: shift.register,
  businessDate: String(shift.businessDate || '').slice(0, 10),
  openedAt: shift.openedAt, openedBy: shift.openedBy, closedAt: shift.closedAt || null, closedBy: shift.closedBy || null,
  openingCash: rupees(shift.openingCashPaise),
  collections: rupees(shift.collectionsPaise),
  expenses: rupees(shift.expensesPaise),
  refunds: 0,
  expectedCash: rupees(shift.expectedCashPaise ?? shift.openingCashPaise),
  countedCash: shift.countedCashPaise == null ? null : rupees(shift.countedCashPaise),
  variance: shift.variancePaise == null ? null : rupees(shift.variancePaise),
  varianceApprovedBy: shift.varianceApprovedBy || null,
  movementCounts: { collections: shift.collectionCount || 0, expenses: shift.expenseCount || 0, refunds: 0 },
  note: shift.note || '',
  closeNote: shift.closeNote || '',
})

route('GET', '/laundry/cash-shifts', async ({ get }) => {
  const shifts = listOf(await get('/vendor/cash-shifts?limit=50')) as RealShift[]
  const open = shifts.find((shift) => shift.status === 'OPEN')
  const live = open ? await get(`/vendor/cash-shifts/current?register=${encodeURIComponent(open.register)}`).catch(() => null) : null
  return shifts.map((shift) => shiftShape(live && live.id === shift.id ? live : shift))
})

route('GET', '/laundry/cash-shifts/current', async ({ get, query }) => {
  const current = await get(`/vendor/cash-shifts/current?register=${encodeURIComponent(query.get('register') || 'Main counter')}`)
  return current ? shiftShape(current) : null
})

route('POST', '/laundry/cash-shifts/open', async ({ post, body }) => shiftShape(await post('/vendor/cash-shifts/open', {
  register: body.register, openingCashPaise: Math.round((Number(body.openingCash) || 0) * 100), note: body.note,
})))

route('POST', '/laundry/cash-shifts/close', async ({ get, post, body }) => {
  const current = await get(`/vendor/cash-shifts/current?register=${encodeURIComponent(body.register || 'Main counter')}`)
  if (!current?.id) throw new Error('No cash shift is open for this register.')
  return shiftShape(await post(`/vendor/cash-shifts/${current.id}/close`, {
    countedCashPaise: Math.round((Number(body.countedCash) || 0) * 100), note: body.note,
    supervisorApproved: body.supervisorApproved, supervisorActor: body.supervisorActor,
  }))
})

// ── Parked carts (order holds) ──────────────────────────────────────────
const holdStatus = (status: string) => (status === 'RESUMED' ? 'Resumed' : status === 'CANCELLED' ? 'Cancelled' : 'Held')
type RealHold = { id: string; holdCode: string; status: string; payload: any; createdAt: string; ownership: string; leaseExpiresAt?: string }
const holdShape = (hold: RealHold) => ({ id: hold.id, holdCode: hold.holdCode, status: holdStatus(hold.status), payload: hold.payload, createdAt: hold.createdAt, ownership: hold.ownership, leaseExpiresAt: hold.leaseExpiresAt })

route('GET', '/laundry/order-holds', async ({ get }) => (listOf(await get('/vendor/order-holds')) as RealHold[]).map(holdShape))
route('GET', '/laundry/order-holds/presence', ({ get }) => get('/vendor/order-holds/presence'))
route('POST', '/laundry/order-holds', async ({ post, body }) => holdShape(await post('/vendor/order-holds', { payload: { ...body, lines: Object.values(body?.cart || {}) } })))
for (const action of ['claim', 'renew', 'release', 'resume', 'cancel']) {
  route('POST', `/laundry/order-holds/:id/${action}`, async ({ post, params, body }) => holdShape(await post(`/vendor/order-holds/${params.id}/${action}`, { override: Boolean(body?.override) })))
}

// ── Print settings ──────────────────────────────────────────────────────
const PRINT_KEY = 'epic-web-print-settings-v1'
export function storedPrintSettings(): Record<string, unknown> {
  try { return JSON.parse(window.localStorage.getItem(PRINT_KEY) || '{}') } catch { return {} }
}
route('GET', '/laundry/print-settings', async ({ get }) => {
  const profile = await get('/vendor/profile').catch(() => ({}))
  const address = [profile.address_line1, profile.address_line2, profile.city, profile.state, profile.pincode].filter(Boolean).join(', ')
  return {
    businessName: profile.name || 'LNDRY Partner', address, phone: profile.phone || '', email: profile.email || '',
    upiId: '', qrOnPrint: true, logoDataUrl: undefined, taxMode: 'none', gstin: '', currency: 'INR', timezone: 'Asia/Kolkata',
    printerProfile: 'system-default', afterBooking: 'ask', printerProfiles: [],
    ...storedPrintSettings(),
  }
})
