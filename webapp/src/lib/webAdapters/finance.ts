// Expenses, cash closing (single-register view), captain settlements, dispatch.
import { route, listOf, rupees, toPaise } from './core'
import { shiftShape } from './counterDesk'
import { laundryOrder, type RealOrder } from './orders'

const PAY_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER']
const payWire = (label: unknown) => { const key = String(label || '').trim().toUpperCase().replace(/\s+/g, '_'); return PAY_MODES.includes(key) ? key : key === 'BANK' ? 'BANK_TRANSFER' : 'OTHER' }
const payLabel = (mode: string) => (mode === 'BANK_TRANSFER' ? 'Bank Transfer' : mode.charAt(0) + mode.slice(1).toLowerCase())

const expenseShape = (expense: any) => ({
  id: expense.id, reference: `EXP-${String(expense.id).slice(0, 6).toUpperCase()}`, expenseName: expense.expenseName, expenseDate: String(expense.expenseDate).slice(0, 10),
  amount: rupees(expense.amountPaise), financeCategory: expense.category || 'General', paymentReceiver: expense.paymentReceiver || '', invoiceNumber: expense.invoiceNumber || '',
  isTaxPaid: Boolean(expense.isTaxPaid), paymentMode: payLabel(expense.paymentMode || 'CASH'), notes: expense.notes || '',
  status: expense.status === 'CANCELLED' ? 'Cancelled' : 'Posted', attachment: expense.attachmentUrl || undefined,
})
const expenseBody = (body: any) => ({
  expenseName: body.expenseName, expenseDate: String(body.expenseDate || new Date().toISOString()).slice(0, 10), amountPaise: toPaise(body.amount),
  category: body.financeCategory || undefined, paymentReceiver: body.paymentReceiver || undefined, invoiceNumber: body.invoiceNumber || undefined,
  isTaxPaid: Boolean(body.isTaxPaid), paymentMode: payWire(body.paymentMode), notes: body.notes || undefined, attachmentUrl: body.attachment || undefined,
})

route('GET', '/laundry/expenses', async ({ get, query }) => {
  const search = (query.get('search') || '').toLowerCase()
  const all = (listOf(await get('/vendor/expenses?limit=200')) as any[]).map(expenseShape)
  return search ? all.filter((e) => `${e.expenseName} ${e.paymentReceiver} ${e.financeCategory} ${e.invoiceNumber}`.toLowerCase().includes(search)) : all
})
route('POST', '/laundry/expenses', async ({ post, body }) => expenseShape(await post('/vendor/expenses', expenseBody(body))))
route('PATCH', '/laundry/expenses/:id', async ({ put, params, body }) => expenseShape(await put(`/vendor/expenses/${params.id}`, { ...expenseBody(body), reason: body.reason || 'Edited' })))
route('POST', '/laundry/expenses/:id/cancel', async ({ post, params, body }) => expenseShape(await post(`/vendor/expenses/${params.id}/cancel`, { reason: body.reason || 'Cancelled' })))

// ── Cash closing ──────────────────────────────────────────────────────────
route('GET', '/laundry/cash-shift', async ({ get, query }) => {
  const current = await get(`/vendor/cash-shifts/current?register=${encodeURIComponent(query.get('register') || 'Main counter')}`)
  return current ? shiftShape(current) : null
})
route('POST', '/laundry/cash-shift/open', async ({ post, body }) => shiftShape(await post('/vendor/cash-shifts/open', { register: body.register, openingCashPaise: toPaise(body.openingCash), note: body.note })))
route('POST', '/laundry/cash-shift/close', async ({ get, post, body }) => {
  const current = await get(`/vendor/cash-shifts/current?register=${encodeURIComponent(body.register || 'Main counter')}`)
  if (!current?.id) throw new Error('No cash shift is open for this register.')
  return shiftShape(await post(`/vendor/cash-shifts/${current.id}/close`, { countedCashPaise: toPaise(body.countedCash), note: body.note }))
})
route('GET', '/laundry/cash-close-drill', async ({ get }) => {
  const shifts = (listOf(await get('/vendor/cash-shifts?limit=50')) as any[]).filter((shift) => shift.status === 'CLOSED')
  const rows = shifts.map((shift) => {
    const expected = shift.expectedCashPaise ?? 0; const counted = shift.countedCashPaise ?? 0
    const equation = shift.openingCashPaise + (shift.collectionsPaise || 0) - (shift.expensesPaise || 0) === expected
    const variance = counted - expected
    return { shiftId: shift.id, register: shift.register, businessDate: String(shift.businessDate).slice(0, 10), expectedPaise: expected, countedPaise: counted, variancePaise: variance, passed: equation && variance === (shift.variancePaise ?? variance), checks: { equation, variance: variance === (shift.variancePaise ?? variance), fixedScale: true } }
  })
  return { status: rows.every((row) => row.passed) ? 'Passed' : 'Attention', passed: rows.every((row) => row.passed), totalShifts: rows.length, shifts: rows }
})

// ── Captains, dispatch, settlements ───────────────────────────────────────
type Staff = { id: string; user_name?: string | null; user_phone?: string | null; is_active?: boolean }
const captains = async (get: (p: string) => Promise<any>) => (listOf(await get('/vendor/employees?role=VENDOR_RIDER'), 'staff') as Staff[]).filter((s) => s.is_active !== false).map((s) => ({ id: s.id, name: s.user_name || 'Captain', phone: s.user_phone || '' }))

route('GET', '/laundry/dispatch', async ({ get }) => {
  const [riders, orders] = await Promise.all([captains(get), get('/vendor/counter/orders?limit=200').then((data) => (listOf(data) as RealOrder[]).map(laundryOrder))])
  const open = orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.state))
  return {
    riders,
    pickups: open.filter((order) => ['Booked', 'Picked Up'].includes(order.state) && /pickup/i.test(order.fulfillmentMode)),
    deliveries: open.filter((order) => ['Ready', 'Out for Delivery'].includes(order.state)),
  }
})

const settlementShape = (settlement: any, names: Map<string, string>) => ({
  id: settlement.id, rider: names.get(settlement.riderEmployeeId) || settlement.riderEmployeeId, date: String(settlement.settlementDate).slice(0, 10), amount: rupees(settlement.amountPaise),
  method: settlement.method.charAt(0) + settlement.method.slice(1).toLowerCase(), status: settlement.status.charAt(0) + settlement.status.slice(1).toLowerCase().replace(/_/g, ' '),
  orderIds: settlement.orderIds || [], reference: settlement.reference || '', notes: settlement.notes || '', createdAt: settlement.createdAt,
})
const nameMap = async (get: (p: string) => Promise<any>) => new Map((await captains(get)).map((rider) => [rider.id, rider.name]))
const resolveRider = async (get: (p: string) => Promise<any>, value: string) => {
  const all = await captains(get)
  return all.find((rider) => rider.id === value || rider.name.toLowerCase() === String(value).toLowerCase())?.id || value
}

route('GET', '/laundry/rider-settlements', async ({ get }) => { const names = await nameMap(get); return (listOf(await get('/vendor/rider-settlements')) as any[]).map((s) => settlementShape(s, names)) })
route('POST', '/laundry/rider-settlements', async ({ get, post, body }) => {
  const names = await nameMap(get)
  const created = await post('/vendor/rider-settlements', {
    riderEmployeeId: await resolveRider(get, body.rider), amountPaise: toPaise(body.amount), method: String(body.method || 'Cash').toUpperCase(), orderIds: (body.orderIds || []).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id)),
  })
  return settlementShape(created, names)
})
route('PATCH', '/laundry/rider-settlements/:id', async ({ get, put, params, body }) => {
  const names = await nameMap(get)
  return settlementShape(await put(`/vendor/rider-settlements/${params.id}/status`, { status: String(body.status || '').toUpperCase().replace(/\s+/g, '_') }), names)
})
route('POST', '/marketplace/cloud/captains-sync', async ({ get }) => { const seen = (await captains(get)).length; return { seen, created: 0, alreadyPresent: seen } })
route('POST', '/laundry/riders', async () => { throw new Error('Add captains from the LNDRY Partner app (Team → Captains).') })
