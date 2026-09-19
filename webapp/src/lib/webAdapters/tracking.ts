// Garment/bag tracking, production queue, quality claims, corrections, returns,
// print history, wallet redemption. Real /api/v1/vendor/* modules.
import { route, listOf, rupees, toPaise } from './core'

const title = (value: string) => {
  const key = String(value || '')
  if (key === 'QC') return 'QC'
  return key.split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(' ')
}
const wire = (value: unknown) => String(value || '').trim().toUpperCase().replace(/\s+/g, '_')
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

type RealUnit = {
  id: string; orderId: string; orderNumber: string; tagCode: string; sequence: number; garmentName: string; serviceName: string; unit?: string
  state: string; location: string; condition: string; customerName: string; customerPhone: string; expectedDeliveryDate: string | null
  eventCount?: number; reprintCount?: number; events?: any[]; reprints?: any[]
}

const today = () => new Date().toISOString().slice(0, 10)

const unitShape = (unit: RealUnit) => ({
  id: unit.id, code: unit.tagCode, tagCode: unit.tagCode, orderId: unit.orderId, orderNumber: unit.orderNumber,
  customer: { name: unit.customerName, phone: unit.customerPhone }, garment: { name: unit.garmentName }, service: { name: unit.serviceName || '' },
  unit: 'Piece', sequence: unit.sequence, state: title(unit.state), location: unit.location, condition: unit.condition,
  expectedDeliveryDate: unit.expectedDeliveryDate || undefined,
  isOverdue: Boolean(unit.expectedDeliveryDate && unit.expectedDeliveryDate < today() && !['DELIVERED', 'CANCELLED'].includes(unit.state)),
  eventCount: unit.eventCount || 0, reprintCount: unit.reprintCount || 0,
})

const eventShape = (event: any) => ({
  id: event.id, event: title(event.eventType), fromState: event.fromState ? title(event.fromState) : undefined,
  toState: event.toState ? title(event.toState) : undefined, location: event.location || undefined, actor: event.actor, note: event.note || undefined, createdAt: event.createdAt,
})

const unitDetail = (unit: RealUnit, scanResult?: string) => ({
  ...unitShape(unit), scanResult,
  events: (unit.events || []).map(eventShape),
  reprints: (unit.reprints || []).map((entry: any) => ({ id: entry.id, previousTagCode: entry.previousTagCode, newTagCode: entry.newTagCode, station: 'Counter', reason: entry.reason, actor: entry.actor, createdAt: entry.createdAt })),
})

const containerDetail = (container: any, scanResult?: string) => ({
  scanResult, id: container.id, tagCode: container.tagCode, tagPayload: container.tagCode, orderId: container.orderId, orderNumber: container.orderNumber,
  customer: { id: '', name: container.customerName, phone: container.customerPhone }, sequence: container.sequence, total: container.total,
  weightKg: container.weightKg ?? undefined, state: title(container.state), location: container.location, condition: container.condition,
  expectedDeliveryDate: container.expectedDeliveryDate || undefined, events: (container.events || []).map(eventShape),
})

route('GET', '/laundry/garment-units', async ({ get, query }) => {
  const params = new URLSearchParams()
  const search = query.get('search'); if (search) params.set('search', search)
  const state = query.get('state'); if (state) params.set('state', wire(state))
  return (listOf(await get(`/vendor/counter/garment-units?${params}`)) as RealUnit[]).map(unitShape)
})
route('GET', '/laundry/garment-units/:id', async ({ get, params }) => unitDetail(await get(`/vendor/counter/garment-units/${params.id}`)))

route('POST', '/laundry/garment-units/scan', async ({ get, post, body }) => {
  const result = await post('/vendor/garment-units/scan', { tagCode: body.tagCode, nextState: body.nextState ? wire(body.nextState) : undefined, location: body.location, note: body.note })
  const id = result.unit?.id
  return unitDetail(await get(`/vendor/counter/garment-units/${id}`), result.scanResult)
})
route('POST', '/laundry/garment-units/:id/reprint', async ({ get, post, params, body }) => {
  await post(`/vendor/garment-units/${params.id}/reprint-tag`, { station: body.station, reason: body.reason || 'Reprint' })
  return unitDetail(await get(`/vendor/counter/garment-units/${params.id}`))
})
route('POST', '/laundry/garment-units/:id/replace-tag', async ({ get, post, params, body }) => {
  await post(`/vendor/garment-units/${params.id}/replace-tag`, { station: body.station, reason: body.reason || 'Tag replaced' })
  return unitDetail(await get(`/vendor/counter/garment-units/${params.id}`))
})

route('POST', '/laundry/containers/scan', async ({ get, post, body }) => {
  const result = await post('/vendor/laundry-containers/scan', { tagCode: body.tagCode, nextState: body.nextState ? wire(body.nextState) : undefined, location: body.location, note: body.note })
  const id = result.container?.id
  return containerDetail(await get(`/vendor/counter/containers/${id}`), result.scanResult)
})

route('GET', '/laundry/rack-occupancy', async ({ get }) => {
  const [units, racks] = await Promise.all([
    get('/vendor/counter/garment-units?state=RACKED').then((data) => listOf(data) as RealUnit[]).catch(() => [] as RealUnit[]),
    get('/vendor/rack-profiles').then((data) => listOf(data) as any[]).catch(() => [] as any[]),
  ])
  const byLocation = new Map<string, RealUnit[]>()
  for (const unit of units) byLocation.set(unit.location, [...(byLocation.get(unit.location) || []), unit])
  const configured = new Map<string, number | null>(racks.filter((rack) => rack.active !== false).map((rack) => [rack.name as string, (rack.capacity as number) ?? null]))
  const names = new Set([...byLocation.keys(), ...configured.keys()])
  const locations = [...names].map((location) => {
    const here = byLocation.get(location) || []
    const capacity = configured.get(location) ?? null
    return {
      location, occupied: here.length, capacity, available: capacity == null ? null : Math.max(0, capacity - here.length),
      utilizationPercent: capacity ? Math.round((here.length / capacity) * 100) : null, overCapacity: capacity != null && here.length > capacity,
      units: here.map((unit) => ({ id: unit.id, tagCode: unit.tagCode, orderId: unit.orderId, orderNumber: unit.orderNumber, customer: unit.customerName, garment: unit.garmentName, updatedAt: '' })),
    }
  })
  const capacityTotal = [...configured.values()].reduce<number>((sum, cap) => sum + (cap || 0), 0)
  return {
    asOf: new Date().toISOString(),
    totals: {
      rackedUnits: units.length, locations: byLocation.size, unassignedRackedUnits: 0, occupiedSlots: units.length,
      configuredLocations: configured.size, configuredCapacity: capacityTotal, availableSlots: Math.max(0, capacityTotal - units.length), overCapacityLocations: locations.filter((l) => l.overCapacity).length,
    },
    locations,
  }
})

// ── Production queue ──────────────────────────────────────────────────────
type RealTask = { id: string; unitId: string; tagCode: string; orderNumber: string; garment: string; station: string; kind: string; status: string; priority: string; assignedTo: string; assignedToId: string; reason: string; createdAt: string; completedAt: string | null; dueDate: string | null; overdue: boolean }
const taskShape = (task: RealTask) => ({ ...task, station: title(task.station), kind: title(task.kind), status: title(task.status), priority: title(task.priority) })

async function loadTasks(get: (p: string) => Promise<any>, qs = '') { return listOf(await get(`/vendor/counter/production-tasks${qs}`)) as RealTask[] }

route('GET', '/laundry/production-queue', async ({ get, query }) => {
  const params = new URLSearchParams()
  if (query.get('overdue')) params.set('overdue', 'true')
  const status = query.get('status'); if (status) params.set('status', wire(status))
  return (await loadTasks(get, String(params) ? `?${params}` : '')).map(taskShape)
})
route('POST', '/laundry/production-tasks/:id/start', async ({ post, params }) => taskShape({ ...(await post(`/vendor/production-tasks/${params.id}/start`, {})), unitId: '', tagCode: '', orderNumber: '', garment: '', assignedTo: '', assignedToId: '', overdue: false, dueDate: null, completedAt: null, reason: '' } as any))
route('POST', '/laundry/production-tasks/:id/assign', async ({ post, params, body }) => taskShape({ ...(await post(`/vendor/production-tasks/${params.id}/assign`, { employeeId: body.assignedTo }).then((r) => r.task ?? r)), unitId: '', tagCode: '', orderNumber: '', garment: '', assignedTo: '', assignedToId: '', overdue: false, dueDate: null, completedAt: null, reason: '' } as any))

const isOpen = (task: RealTask) => ['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(task.status)

route('GET', '/laundry/production-load', async ({ get }) => {
  const tasks = await loadTasks(get)
  const stations = [...new Set(tasks.map((task) => task.station))].map((station) => {
    const own = tasks.filter((task) => task.station === station)
    const open = own.filter((task) => task.status === 'OPEN').length
    return {
      station: title(station), total: own.length, open, inProgress: own.filter((task) => task.status === 'IN_PROGRESS').length,
      urgent: own.filter((task) => task.priority === 'URGENT' && isOpen(task)).length, overdue: own.filter((task) => task.overdue).length,
      completed: own.filter((task) => task.status === 'COMPLETED').length, capacity: null, utilizationPercent: null, atCapacity: false,
    }
  })
  return { totalTasks: tasks.length, openTasks: tasks.filter(isOpen).length, urgentTasks: tasks.filter((task) => task.priority === 'URGENT' && isOpen(task)).length, overdueTasks: tasks.filter((task) => task.overdue).length, stations }
})

route('GET', '/laundry/production-workload', async ({ get }) => {
  const tasks = (await loadTasks(get)).filter(isOpen)
  const byPerson = new Map<string, { id: string; username: string; name: string; openTasks: number; urgent: number; overdue: number }>()
  for (const task of tasks) {
    if (!task.assignedToId) continue
    const entry = byPerson.get(task.assignedToId) || { id: task.assignedToId, username: task.assignedTo, name: task.assignedTo, openTasks: 0, urgent: 0, overdue: 0 }
    entry.openTasks += 1; if (task.priority === 'URGENT') entry.urgent += 1; if (task.overdue) entry.overdue += 1
    byPerson.set(task.assignedToId, entry)
  }
  return { openTasks: tasks.length, unassignedOpenTasks: tasks.filter((task) => !task.assignedToId).length, unrecognizedAssignments: 0, assignees: [...byPerson.values()], recommendations: [] }
})

route('POST', '/laundry/production-workload/assign', async ({ get, post, body }) => {
  const staff = (listOf(await get('/vendor/employees'), 'staff') as any[]).filter((person) => person.is_active !== false)
  if (!staff.length) return { requested: (body.taskIds || []).length, assigned: [], skipped: (body.taskIds || []).map((taskId: string) => ({ taskId, reason: 'No active team members to assign to' })) }
  const assigned: Array<{ taskId: string; assignedTo: string; operator: string }> = []
  const skipped: Array<{ taskId: string; reason: string }> = []
  let index = 0
  for (const taskId of body.taskIds || []) {
    const person = staff[index % staff.length]; index += 1
    try { await post(`/vendor/production-tasks/${taskId}/assign`, { employeeId: person.id }); assigned.push({ taskId, assignedTo: person.id, operator: person.user_name || 'Team member' }) }
    catch (error) { skipped.push({ taskId, reason: error instanceof Error ? error.message : 'Could not assign' }) }
  }
  return { requested: (body.taskIds || []).length, assigned, skipped }
})

route('GET', '/laundry/production-schedule', async ({ get }) => {
  const tasks = (await loadTasks(get)).filter(isOpen)
  const dates = [...new Set(tasks.map((task) => task.dueDate))].sort((a, b) => String(a ?? '9999').localeCompare(String(b ?? '9999')))
  return {
    totalTasks: tasks.length, scheduledTasks: tasks.filter((task) => task.dueDate).length, unscheduledTasks: tasks.filter((task) => !task.dueDate).length,
    days: dates.map((date) => {
      const day = tasks.filter((task) => task.dueDate === date)
      return {
        date, label: date ? new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No due date', totalTasks: day.length,
        urgentTasks: day.filter((task) => task.priority === 'URGENT').length, overdueTasks: day.filter((task) => task.overdue).length,
        stations: [...new Set(day.map((task) => task.station))].map((station) => {
          const own = day.filter((task) => task.station === station)
          return { station: title(station), totalTasks: own.length, urgentTasks: own.filter((task) => task.priority === 'URGENT').length, overdueTasks: own.filter((task) => task.overdue).length, currentOpen: own.length, capacityTarget: null, atCapacity: false, tasks: own.map(taskShape) }
        }),
      }
    }),
  }
})

route('GET', '/laundry/production-supervisor-metrics', async ({ get }) => {
  const tasks = await loadTasks(get)
  const summarize = (name: string, own: RealTask[]) => ({
    name, total: own.length, completed: own.filter((task) => task.status === 'COMPLETED').length, active: own.filter((task) => task.status === 'IN_PROGRESS').length,
    blocked: own.filter((task) => task.status === 'BLOCKED').length, urgent: own.filter((task) => task.priority === 'URGENT').length, overdue: own.filter((task) => task.overdue).length,
    completionRatePercent: own.length ? Math.round((own.filter((task) => task.status === 'COMPLETED').length / own.length) * 100) : 0, averageCycleMinutes: null, p95CycleMinutes: null,
  })
  const overall = summarize('All', tasks)
  return {
    total: overall.total, completed: overall.completed, active: overall.active, blocked: overall.blocked, urgent: overall.urgent, overdue: overall.overdue,
    completionRatePercent: overall.completionRatePercent, cycleSamples: 0, averageCycleMinutes: null, p50CycleMinutes: null, p95CycleMinutes: null,
    stations: [...new Set(tasks.map((task) => task.station))].map((station) => summarize(title(station), tasks.filter((task) => task.station === station))),
    operators: [...new Set(tasks.map((task) => task.assignedTo).filter(Boolean))].map((name) => summarize(name, tasks.filter((task) => task.assignedTo === name))),
  }
})

// ── Quality, corrections, returns ─────────────────────────────────────────
route('GET', '/laundry/quality-claims', async ({ get }) => (listOf(await get('/vendor/counter/quality-claims')) as any[]).map((claim) => ({
  ...claim, state: title(claim.state), category: title(claim.category), severity: title(claim.severity), status: title(claim.status), decision: claim.decision ? title(claim.decision) : null,
  correction: claim.correction ? { ...claim.correction } : null,
})))
route('GET', '/laundry/quality-analytics', ({ get }) => get('/vendor/counter/quality-analytics'))
route('POST', '/laundry/quality-claims', async ({ post, body }) => {
  const result = await post('/vendor/quality-claims', { garmentUnitId: body.garmentUnitId, category: wire(body.category), severity: wire(body.severity || 'MEDIUM'), description: body.description })
  return result.claim ?? result
})
route('POST', '/laundry/quality-claims/:id/resolve', async ({ post, params, body }) => {
  const result = await post(`/vendor/quality-claims/${params.id}/resolve`, { decision: wire(body.decision), note: body.note })
  return result.claim ?? result
})
route('GET', '/laundry/customer-corrections', ({ get }) => get('/vendor/counter/corrections'))

route('GET', '/laundry/returns', async ({ get }) => (listOf(await get('/vendor/counter/returns')) as any[]).map((item) => ({
  id: item.id, status: title(item.status), orderId: item.orderId, orderNumber: item.orderNumber, customerId: item.customerId, customerName: item.customerName,
  amount: rupees(item.amountPaise), reason: title(item.reason), note: item.note, createdAt: item.createdAt,
})))
route('POST', '/laundry/returns', async ({ get, post, body }) => {
  let orderId = String(body.orderId || '').trim()
  if (!isUuid(orderId)) {
    const found = listOf(await get(`/vendor/counter/orders?search=${encodeURIComponent(orderId)}&limit=5`)) as Array<{ id: string; orderNumber: string }>
    const match = found.find((order) => order.orderNumber.toLowerCase() === orderId.toLowerCase()) || found[0]
    if (!match) throw new Error('No order matches that number.')
    orderId = match.id
  }
  const known = ['QUALITY_ISSUE', 'SERVICE_NOT_PERFORMED', 'DUPLICATE_CHARGE', 'CUSTOMER_CANCELLATION']
  const reason = known.includes(wire(body.reason)) ? wire(body.reason) : 'OTHER'
  const result = await post('/vendor/return-cases', { orderId, amountPaise: toPaise(body.amount), reason, note: body.note })
  return result.returnCase ?? result
})

// ── Print history ─────────────────────────────────────────────────────────
const DOC_OUT: Record<string, string> = { GARMENT_TAG: 'garment-tags', CONTAINER_TAG: 'bag-tags', RECEIPT: 'invoice' }
const STATUS_OUT: Record<string, string> = { PENDING: 'Queued', PRINTED: 'Printed', FAILED: 'Cancelled' }
const printJobShape = (job: any) => ({
  id: job.id, orderId: job.orderId, documentType: DOC_OUT[job.documentType] || job.documentType, requestedCopies: job.requestedCopies, requestedBy: job.requestedBy,
  createdAt: job.createdAt, status: STATUS_OUT[job.status] || job.status, templateId: 'recommended-a4-6', evidence: job.failureReason || undefined, tagIds: job.tagIds || [],
})
route('GET', '/laundry/print-jobs', async ({ get, query }) => {
  const orderId = query.get('orderId')
  return (listOf(await get(`/vendor/counter/print-jobs${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`)) as any[]).map(printJobShape)
})
route('POST', '/laundry/print-jobs', async ({ get, post, body }) => {
  const kind = String(body.documentType || 'invoice')
  const documentType = kind === 'garment-tags' || kind === 'tags' ? 'GARMENT_TAG' : kind === 'bag-tags' ? 'CONTAINER_TAG' : 'RECEIPT'
  let orderId = String(body.orderId || '')
  if (!isUuid(orderId)) {
    const found = listOf(await get(`/vendor/counter/orders?search=${encodeURIComponent(orderId)}&limit=5`)) as Array<{ id: string; orderNumber: string }>
    orderId = found.find((order) => order.orderNumber === orderId)?.id || found[0]?.id || orderId
  }
  const ids = (list: unknown) => (Array.isArray(list) ? list.map(String) : [])
  const garmentUnitIds: string[] = []
  for (const tag of ids(body.tagIds)) {
    if (isUuid(tag)) { garmentUnitIds.push(tag); continue }
    const found = listOf(await get(`/vendor/counter/garment-units?search=${encodeURIComponent(tag)}`)) as RealUnit[]
    const hit = found.find((unit) => unit.tagCode === tag); if (hit) garmentUnitIds.push(hit.id)
  }
  const containerIds: string[] = []
  for (const code of ids(body.containerIds)) {
    if (isUuid(code)) { containerIds.push(code); continue }
    const found = listOf(await get(`/vendor/counter/containers?orderId=${orderId}`)) as any[]
    const hit = found.find((container) => container.tagCode === code); if (hit) containerIds.push(hit.id)
  }
  const failed = String(body.status || '') === 'Cancelled'
  const result = await post('/vendor/print-jobs', {
    orderId, documentType, garmentUnitIds, containerIds, requestedCopies: Math.max(1, Math.min(20, Number(body.requestedCopies) || 1)),
    status: failed ? 'FAILED' : 'PRINTED', failureReason: failed ? String(body.evidence || 'Cancelled by operator').slice(0, 500) : undefined,
  })
  return printJobShape({ ...(result.job ?? result), requestedBy: 'You', tagIds: [...garmentUnitIds, ...containerIds] })
})

// ── LNDRY wallet redemption at the counter ────────────────────────────────
route('POST', '/marketplace/cloud/wallet/lookup', ({ post, body }) => post('/vendor/wallet/lookup', { phone: body.phone }))
route('POST', '/marketplace/cloud/wallet/redemption-requests', ({ post, body }) => post('/vendor/wallet/redemption-requests', body))
route('POST', '/marketplace/cloud/wallet/redemption-requests/:id/confirm', ({ post, params, body }) => post(`/vendor/wallet/redemption-requests/${params.id}/confirm`, body))
route('POST', '/marketplace/cloud/wallet/redemption-requests/:id/cancel', ({ post, params }) => post(`/vendor/wallet/redemption-requests/${params.id}/cancel`, {}))
