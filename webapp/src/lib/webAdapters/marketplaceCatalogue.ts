// Requesting new services (admin approval), and the marketplace price/stock list.
import { route, listOf, toPaise } from './core'
import { forgetCatalogue } from './quote'

const num = (value: unknown) => (value === null || value === undefined ? undefined : Number.isFinite(Number(value)) ? Number(value) : undefined)

const service = (raw: any) => ({
  id: String(raw.id), name: String(raw.name || ''), description: String(raw.description || ''), categoryId: String(raw.category_id || ''), categoryName: typeof raw.category_name === 'string' ? raw.category_name : undefined,
  pricePerPiecePaise: num(raw.price_per_piece) ?? 0, minWeightKg: num(raw.min_weight_kg) ?? 1, isAvailable: Boolean(raw.is_available), approvalStatus: String(raw.approval_status || 'PENDING'),
  rejectionReason: typeof raw.rejection_reason === 'string' && raw.rejection_reason ? raw.rejection_reason : undefined,
})

route('GET', '/marketplace/cloud/service-categories', async ({ get }) => (listOf(await get('/vendor/categories')) as any[]).map((row) => ({ id: row.id, name: row.name || '', description: row.description || '', imageUrl: row.image_url || undefined, sortOrder: row.sort_order ?? 0 })))
route('GET', '/marketplace/cloud/my-services', async ({ get }) => (listOf(await get('/vendor/services')) as any[]).map(service))
route('GET', '/marketplace/cloud/services/:id', async ({ get, params }) => {
  const raw = await get(`/vendor/services/${params.id}`)
  return {
    categoryName: String(raw.category?.name || ''), service: service(raw.service),
    garments: (raw.garments || []).map((row: any) => ({ garmentTypeId: String(row.garment_rate_id || ''), garmentName: String(row.garment_name || ''), unit: String(row.unit || 'Piece'), ratePaise: num(row.rate_paise) ?? 0, isAvailable: Boolean(row.is_available) })),
  }
})
route('POST', '/marketplace/cloud/services', async ({ post, body }) => service(await post('/vendor/services', {
  category_id: body.categoryId, name: body.name, description: body.description || '', price_per_piece: body.pricePerPiecePaise, min_weight_kg: body.minWeightKg ?? 1, is_available: true,
})))
route('POST', '/marketplace/cloud/services/:id/garment-rates/bulk', async ({ post, params, body }) => {
  const result = await post(`/vendor/services/${params.id}/garment-rates/bulk`, { garment_rates: (body.rates || body.garmentRates || []).map((rate: any) => ({ garment_type_id: rate.garmentTypeId, rate_paise: rate.ratePaise })) })
  forgetCatalogue(); return result
})

const item = (raw: any) => {
  const product = raw.product && typeof raw.product === 'object' ? raw.product : {}
  return {
    id: String(raw.id), garmentTypeId: String(raw.garment_rate_id || ''), name: String(product.name || ''), sku: product.sku || undefined, categoryName: product.category_name || undefined,
    price: num(raw.price), salePrice: num(raw.sale_price), costPrice: num(raw.cost_price), stockQuantity: num(raw.stock_quantity) ?? 0, lowStockThreshold: num(raw.low_stock_threshold) ?? 0, maxOrderQty: num(raw.max_order_qty) ?? 0,
    isAvailable: Boolean(raw.is_available), isFeatured: Boolean(raw.is_featured), approvalStatus: String(raw.approval_status || ''), updatedAt: String(raw.updated_at || ''),
  }
}
route('GET', '/marketplace/cloud/catalogue', async ({ get }) => (listOf(await get('/shop-garment_rates?limit=100'), 'items') as any[]).map(item))
route('PATCH', '/marketplace/cloud/catalogue/:id', async ({ patch, params, body }) => {
  const payload: Record<string, unknown> = {}
  if (body.price !== undefined) payload.price = body.price
  if (body.salePrice !== undefined) payload.sale_price = body.salePrice
  if (body.costPrice !== undefined) payload.cost_price = body.costPrice
  if (body.lowStockThreshold !== undefined) payload.low_stock_threshold = body.lowStockThreshold
  if (body.maxOrderQty !== undefined) payload.max_order_qty = body.maxOrderQty
  if (body.isAvailable !== undefined) payload.is_available = body.isAvailable
  const result = await patch(`/shop-garment_rates/${params.id}`, payload); forgetCatalogue(); return item(result)
})
route('PATCH', '/marketplace/cloud/catalogue/:id/stock', async ({ patch, params, body }) => {
  const result = await patch(`/shop-garment_rates/${params.id}/stock`, { stock_quantity: body.stockQuantity })
  return item(result?.shopProduct || result)
})
void toPaise

// Small gaps the catalogue and finance screens ask for on load
route('GET', '/settings/setup-progress', async () => ({ business: true, owner: true, operations: true, catalogue: true, recovery: true, updatedAt: new Date().toISOString(), updatedBy: 'LNDRY vendor account' }))
