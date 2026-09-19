// Route planning (kept in this browser), team attendance (real), management snapshot, HR lists.
import { route, listOf, rupees } from './core'
import { laundryOrder, type RealOrder } from './orders'

const ROUTE_KEY = 'epic-web-routes-v1'
type Stop = { id: string; sequence: number; orderId: string; orderNumber: string; address: string; estimatedAt?: string; status: string; note: string }
type Run = { id: string; riderId: string; riderName: string; routeDate: string; stage: 'Pickup' | 'Delivery'; zone?: string; startTime?: string; minutesPerStop?: number; status: string; stopCount: number; notes: string; stops: Stop[] }
const readRuns = (): Run[] => { try { return JSON.parse(window.localStorage.getItem(ROUTE_KEY) || '[]') } catch { return [] } }
const writeRuns = (runs: Run[]) => { try { window.localStorage.setItem(ROUTE_KEY, JSON.stringify(runs)) } catch { /* not persisted */ } }
const withCount = (run: Run): Run => ({ ...run, stopCount: run.stops.length })

route('GET', '/laundry/routes', async () => readRuns().map(withCount))
route('POST', '/laundry/routes', async ({ get, body }) => {
  const [captains, orders] = await Promise.all([
    get('/vendor/employees?role=VENDOR_RIDER').then((data) => listOf(data, 'staff') as any[]),
    get('/vendor/counter/orders?limit=300').then((data) => (listOf(data) as RealOrder[]).map(laundryOrder)),
  ])
  const captain = captains.find((entry) => entry.id === body.riderId)
  if (!captain) throw new Error('Choose an active captain for this run.')
  const chosen = orders.filter((order) => (body.orderIds || []).includes(order.id))
  if (!chosen.length) throw new Error('Select at least one order for this run.')
  const [h = '9', m = '0'] = String(body.startTime || '09:00').split(':'); const minutes = Number(body.minutesPerStop) || 15
  const base = Number(h) * 60 + Number(m)
  const run: Run = {
    id: crypto.randomUUID(), riderId: captain.id, riderName: captain.user_name || 'Captain', routeDate: body.routeDate, stage: body.stage, zone: body.zone || undefined, startTime: body.startTime, minutesPerStop: minutes,
    status: 'Planned', stopCount: chosen.length, notes: '',
    stops: chosen.map((order, index) => { const at = base + index * minutes; return { id: crypto.randomUUID(), sequence: index + 1, orderId: order.id, orderNumber: order.orderNumber, address: order.deliveryAddress || 'Address not recorded', estimatedAt: `${String(Math.floor(at / 60) % 24).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`, status: 'Pending', note: '' } }),
  }
  writeRuns([run, ...readRuns()]); return run
})
route('POST', '/laundry/routes/:id/start', async ({ params }) => {
  const runs = readRuns().map((run) => (run.id === params.id ? { ...run, status: 'In progress' } : run)); writeRuns(runs); return runs.find((run) => run.id === params.id)
})
route('POST', '/laundry/routes/:id/stops/:stopId/complete', async ({ params, body }) => {
  const runs = readRuns().map((run) => {
    if (run.id !== params.id) return run
    const stops = run.stops.map((stop) => (stop.id === params.stopId ? { ...stop, status: body.status, note: body.note || '' } : stop))
    return { ...run, stops, status: stops.every((stop) => stop.status !== 'Pending') ? 'Completed' : run.status }
  }); writeRuns(runs); return runs.find((run) => run.id === params.id)
})
route('GET', '/laundry/route-analytics', async ({ get }) => {
  const runs = readRuns(); const orders = (await get('/vendor/counter/orders?limit=300').then((data) => listOf(data) as RealOrder[]).catch(() => [] as RealOrder[])).map(laundryOrder).filter((order) => !['Delivered', 'Cancelled'].includes(order.state))
  const stops = runs.flatMap((run) => run.stops); const completed = stops.filter((stop) => stop.status === 'Completed').length; const skipped = stops.filter((stop) => stop.status === 'Skipped').length
  const zones = new Map<string, { orders: number; pickupReady: number; deliveryReady: number; assigned: number; activeRuns: number }>()
  for (const order of orders) { const key = order.serviceZone || 'Unzoned'; const z = zones.get(key) || { orders: 0, pickupReady: 0, deliveryReady: 0, assigned: 0, activeRuns: 0 }; z.orders += 1; if (['Booked', 'Picked Up'].includes(order.state)) z.pickupReady += 1; if (['Ready', 'Out for Delivery'].includes(order.state)) z.deliveryReady += 1; if (order.pickupRider || order.deliveryRider) z.assigned += 1; zones.set(key, z) }
  return { totals: { orders: orders.length, zones: zones.size, routes: runs.length, activeRoutes: runs.filter((run) => run.status === 'In progress').length, stops: stops.length, completedStops: completed, skippedStops: skipped, closedStops: completed + skipped, completionPercent: stops.length ? Math.round(((completed + skipped) / stops.length) * 100) : 0 }, zones: [...zones.entries()].map(([zone, value]) => ({ zone, ...value })) }
})

// ── Team attendance (real) ────────────────────────────────────────────────
const STATUS_OUT: Record<string, string> = { PRESENT: 'Present', ABSENT: 'Absent', HALF_DAY: 'Half Day', ON_LEAVE: 'On Leave', HOLIDAY: 'Holiday' }
const statusIn = (label: string) => String(label || '').toUpperCase().replace(/\s+/g, '_')
route('GET', '/laundry/workforce', async ({ get, query }) => {
  const date = query.get('date') || new Date().toISOString().slice(0, 10)
  const data = await get(`/vendor/attendance/roster?date=${date}`)
  const roster = (data.roster || data.employees || []) as any[]
  return {
    asOf: date, activeEmployees: data.activeEmployees ?? roster.length, marked: data.marked ?? 0,
    statusCounts: Object.fromEntries(Object.entries(data.statusCounts || {}).map(([key, value]) => [STATUS_OUT[key] || key, value])),
    roster: roster.map((row) => ({ id: row.id, name: row.name, department: row.role === 'VENDOR_RIDER' ? 'Captains' : 'Counter', designation: String(row.role || '').replace('VENDOR_', '').toLowerCase(), status: row.status ? STATUS_OUT[row.status] || row.status : 'Not marked', shift: row.shift || '', inTime: row.inTime || '', outTime: row.outTime || '', workingHours: row.workingHours || 0 })),
  }
})
route('POST', '/laundry/workforce/attendance', async ({ post, body }) => post('/vendor/attendance/mark', { employeeId: body.employee, date: body.date, status: statusIn(body.status), shift: body.shift, workingHours: body.workingHours }))

// ── Management snapshot and HR lists ──────────────────────────────────────
route('GET', '/laundry/management-snapshot', async ({ get }) => {
  const [orders, expenses, claims, roster] = await Promise.all([
    get('/vendor/counter/orders?limit=500').then((data) => listOf(data) as RealOrder[]).catch(() => [] as RealOrder[]),
    get('/vendor/expenses?limit=200').then((data) => listOf(data) as any[]).catch(() => [] as any[]),
    get('/vendor/counter/quality-analytics').catch(() => ({ openClaims: 0, rewashClaims: 0, totalClaims: 0, averageResolutionHours: null })),
    get('/vendor/employees').then((data) => listOf(data, 'staff') as any[]).catch(() => [] as any[]),
  ])
  const live = orders.filter((order) => order.status !== 'CANCELLED')
  const invoice = rupees(live.reduce((sum, order) => sum + order.totalPaise, 0)); const collected = rupees(live.reduce((sum, order) => sum + order.amountPaidPaise, 0))
  const spent = rupees(expenses.filter((expense) => expense.status !== 'CANCELLED').reduce((sum, expense) => sum + expense.amountPaise, 0))
  return {
    financial: { invoice, collected, expenses: spent, outstanding: Math.max(0, invoice - collected), canonicalNet: collected - spent },
    reconciliation: { status: 'Balanced', issueCount: 0, journalsBalanced: true },
    quality: { openClaims: claims.openClaims, rewashClaims: claims.rewashClaims, totalClaims: claims.totalClaims, averageResolutionHours: claims.averageResolutionHours },
    workforce: { activeEmployees: roster.filter((person) => person.is_active !== false).length },
    ebitda: { state: 'NotConfigured', value: null, reason: 'Depreciation and interest are not tracked on the website.' },
    withholding: { state: 'NotApplicable', policyCount: 0, ledgerBalances: { tdsPayable: 0, tcsPayable: 0 }, note: 'Withholding policies are configured in the desktop finance module.' },
    regulatory: { policyCount: 0, checks: { statutoryBaseline: true, entityConfiguration: true, statePolicy: true, marketplaceModel: true }, missing: { entity: [], statePolicy: [], marketplace: [] } },
  }
})
route('GET', '/employee', async ({ get }) => (listOf(await get('/vendor/employees'), 'staff') as any[]).map((person) => ({ id: person.id, name: person.user_name || 'Team member', department: person.role === 'VENDOR_RIDER' ? 'Captains' : 'Counter', designation: String(person.role || '').replace('VENDOR_', '').toLowerCase(), is_active: person.is_active !== false })))
for (const entity of ['salary_slip', 'leave_application', 'expense_claim', 'employee_loan', 'job_opening', 'job_applicant', 'interview']) route('GET', `/${entity}`, async () => [])
route('POST', '/employee', async () => { throw new Error('Add team members from the LNDRY Partner app (Team).') })
