// Online (LNDRY app) orders: the real vendor-orders endpoints, presented the
// way the Online Orders and Sync pages expect.
import { route, listOf, AdapterUnavailable } from './core'
import { readStoredSession } from '../cloudAuth'

const REMOTE_STATE: Record<string, string> = {
  WAITING_VENDOR_CONFIRMATION: 'AwaitingAcceptance', VENDOR_ACCEPTED: 'Accepted', PICKUP_ASSIGNED: 'PickupScheduled', GOING_FOR_PICKUP: 'PickupScheduled',
  PICKUP_OTP_VERIFIED: 'PickupScheduled', PICKED_UP: 'IntakeRequired', RECEIVED_AT_VENDOR: 'IntakeRequired', RECONCILIATION_PENDING: 'CustomerApprovalRequired',
  RECONCILIATION_DISPUTED: 'CustomerApprovalRequired', PROCESSING: 'Processing', PACKED: 'Ready', DELIVERY_ASSIGNED: 'DeliveryScheduled',
  OUT_FOR_DELIVERY: 'DeliveryScheduled', DELIVERY_OTP_VERIFIED: 'DeliveryScheduled', DELIVERED: 'Completed', VENDOR_REJECTED: 'Rejected', AUTO_REJECTED: 'Rejected',
  CUSTOMER_CANCELLED: 'Cancelled', ADMIN_CANCELLED: 'Cancelled', CANCELLED: 'Cancelled', REFUNDED: 'Completed', PENDING: 'AwaitingAcceptance', CONFIRMED: 'Accepted',
  PREPARING: 'Processing', WAITING_FOR_VENDOR_CONFIRMATION: 'AwaitingAcceptance', PAYMENT_PENDING: 'AwaitingAcceptance', PAYMENT_FAILED: 'Cancelled',
}
const num = (value: unknown) => (value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? undefined : Number(value))

const onlineOrder = (order: any) => ({
  id: order.id, externalOrderId: order.id, orderNumber: order.order_number, channel: 'LNDRY App', state: REMOTE_STATE[order.status] || 'AwaitingAcceptance',
  sourceVersion: 1,
  customer: { name: order.customer_name || '', phone: order.customer_phone || '' },
  pickup: { date: order.pickup_date ? String(order.pickup_date).slice(0, 10) : undefined, address: order.delivery_address, expressPickup: Boolean(order.is_express_pickup) },
  request: { items: order.items || [], estimate: { amountPaise: num(order.estimated_amount_paise), payablePaise: num(order.payable_amount_paise) }, remoteStatus: order.status },
  paymentState: order.payment_status || '', preferences: '', notes: order.delivery_notes || '', syncState: 'Synced', localOrderId: undefined,
  updatedAt: order.updated_at || order.created_at,
})

async function allOrders(get: (p: string) => Promise<any>) {
  return listOf(await get('/vendor-orders?page=1&limit=100'), 'orders') as any[]
}

route('GET', '/marketplace/cloud/status', async ({ get }) => {
  const session = readStoredSession()
  const profile = await get('/vendor/profile').catch(() => null)
  return {
    configured: true, connected: Boolean(session), remoteVendorName: profile?.name, remoteVendorId: profile?.id,
    remoteUserRole: session?.shopRole || 'VENDOR_OWNER', phone: session?.phone,
    connectedAt: session ? new Date().toISOString() : undefined,
  }
})

route('GET', '/marketplace/sync/status', async ({ get }) => {
  const count = (await allOrders(get).catch(() => [])).length
  return {
    configured: true, version: 1, device: null, checkpoint: { lastPullAt: new Date().toISOString() },
    outbox: { pending: 0, inFlight: 0, retry: 0, deadLetter: 0 }, inbox: { held: 0, failed: 0 }, onlineOrders: count,
  }
})
route('GET', '/marketplace/cloud/sync-health', async () => ({ healthy: true, lastPullAt: new Date().toISOString() }))

route('GET', '/marketplace/orders', async ({ get }) => ({ items: (await allOrders(get)).map(onlineOrder) }))
route('POST', '/marketplace/cloud/sync-orders', async ({ get }) => ({ pulled: (await allOrders(get)).length, created: 0, updated: 0, skipped: [] }))

route('GET', '/marketplace/orders/:id/truth', async ({ get, params }) => {
  const order = await get(`/vendor/orders/${params.id}`)
  return { request: { data: { estimate: { amountPaise: num(order.estimated_amount_paise), payablePaise: num(order.payable_amount_paise) }, customer: { name: order.customer_name, phone: order.customer_phone } } } }
})
route('GET', '/marketplace/orders/:id/customer-status', async ({ get, params }) => {
  const order = await get(`/vendor/orders/${params.id}`)
  return {
    status: REMOTE_STATE[order.status] || order.status, label: String(order.status || '').replace(/_/g, ' ').toLowerCase(),
    timeline: (order.timeline || []).map((entry: any, index: number) => ({ eventId: `${params.id}:${index}`, at: entry.timestamp, status: entry.new_status, label: String(entry.new_status || '').replace(/_/g, ' ').toLowerCase() })),
  }
})
route('GET', '/marketplace/orders/:id/pickup', async () => null)

route('POST', '/marketplace/cloud/orders/:id/detail-sync', async ({ get, params }) => {
  const raw = await get(`/vendor/orders/${params.id}`)
  const rec = raw.latestReconciliation
  return {
    projectionState: REMOTE_STATE[raw.status] || 'AwaitingAcceptance',
    detail: {
      externalOrderId: params.id, remoteStatus: raw.status, orderNumber: raw.order_number, processingStage: raw.processing_stage || undefined,
      estimatedAmountPaise: num(raw.estimated_amount_paise), payableAmountPaise: num(raw.payable_amount_paise),
      lines: (raw.lines || []).map((line: any) => ({
        orderLineId: String(line.id), garmentTypeId: line.garment_type_id, name: String(line.garment_type_name || line.name || ''), unit: String(line.garment_unit || line.unit || ''),
        ratePaise: num(line.rate_paise) ?? Math.round(Number(line.price || 0) * 100), estimatedQuantity: num(line.estimated_quantity) ?? num(line.quantity), confirmedQuantity: num(line.confirmed_quantity),
      })),
      latestReconciliation: rec ? {
        id: String(rec.id), status: String(rec.status || ''), reason: rec.reason || undefined, previousPayableAmountPaise: num(rec.previous_payable_amount_paise),
        proposedPayableAmountPaise: num(rec.proposed_payable_amount_paise), customerDecisionAt: rec.customer_decision_at || undefined, photos: (rec.photos || []).map(String),
      } : undefined,
      timeline: (raw.timeline || []).map((entry: any) => ({ at: String(entry.timestamp || ''), oldStatus: entry.old_status || undefined, newStatus: String(entry.new_status || ''), actorRole: entry.actor_role || undefined, note: entry.note || undefined })),
      evidence: (raw.evidence || []).map((photo: any) => ({ url: String(photo.photo_url || ''), context: String(photo.context || 'RIDER_PICKUP'), orderLineId: photo.order_line_id || undefined, isGrouped: Boolean(photo.is_grouped), uploadedByName: photo.uploaded_by_name || undefined, createdAt: String(photo.created_at || '') })),
    },
  }
})

for (const action of ['accept', 'reject'] as const) {
  route('POST', `/marketplace/cloud/orders/:id/${action}`, async ({ post, params, body }) => {
    const result = await post(`/vendor-orders/${params.id}/${action}`, action === 'reject' ? { reason: body?.reason || 'Rejected by vendor' } : {})
    return { action, remoteStatus: result?.status || (action === 'accept' ? 'VENDOR_ACCEPTED' : 'VENDOR_REJECTED'), transition: 'applied', materialization: 'NotRequired' }
  })
}

route('POST', '/marketplace/cloud/orders/:id/stage', async ({ post, params, body }) => {
  const payload: Record<string, unknown> = { status: body.stage }
  if (body.stage === 'PACKED' && body.deliverySlotLabel) payload.delivery_slot_label = body.deliverySlotLabel
  if (body.stage === 'PACKED' && body.deliverySlotAt) payload.delivery_slot_at = body.deliverySlotAt
  const result = await post(`/vendor-orders/${params.id}/processing-stage`, payload)
  return { externalOrderId: params.id, stage: body.stage, remoteStatus: result?.status || 'PROCESSING', projectionState: REMOTE_STATE[result?.status] || 'Processing' }
})

route('POST', '/marketplace/cloud/orders/:id/reconcile', async ({ post, params, body }) => {
  const payload: Record<string, unknown> = { photo_urls: body.photoUrls || [] }
  if (body.lines?.length) payload.lines = body.lines.map((line: any) => ({ order_line_id: line.orderLineId, confirmed_quantity: line.confirmedQuantity }))
  if (body.reason) payload.adjustment_reason = String(body.reason).slice(0, 500)
  const result = await post(`/vendor-orders/${params.id}/reconcile`, payload)
  const previous = num(result?.previous_payable_amount_paise); const proposed = num(result?.proposed_payable_amount_paise)
  return {
    externalOrderId: params.id, reconciliationId: result?.reconciliation_id, remoteStatus: result?.status || 'RECONCILIATION_PENDING',
    previousPayableAmountPaise: previous, proposedPayableAmountPaise: proposed, deltaPaise: previous !== undefined && proposed !== undefined ? proposed - previous : undefined, projectionState: 'CustomerApprovalRequired',
  }
})

route('POST', '/marketplace/orders/:id/materialize', async () => { throw new AdapterUnavailable('Copying an online order into the counter list') })
route('POST', '/marketplace/orders/:id/intake', async () => { throw new AdapterUnavailable('Recording physical intake here — use the Reconcile action instead') })
route('POST', '/marketplace/orders/:id/pickup/schedule', async () => { throw new AdapterUnavailable('Pickup scheduling here — assign a captain from the LNDRY Partner app') })
route('POST', '/marketplace/orders/:id/pickup/outcome', async () => { throw new AdapterUnavailable('Recording a pickup outcome here') })
