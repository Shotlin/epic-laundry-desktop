// Spreadsheet imports (customers, price list). The browser reads the file; the LNDRY backend checks every
// row and applies the valid ones with the same rules as typing them in by hand.
import { route, listOf } from './core'

route('GET', '/laundry/import/jobs', async ({ get, query }) => listOf(await get(`/vendor/imports?type=${encodeURIComponent(query.get('type') || 'customers')}`), 'jobs'))
route('POST', '/laundry/import/preview', ({ post, body }) => post('/vendor/imports/preview', { type: body?.type, rows: body?.rows }))
route('POST', '/laundry/import/customers', ({ post, body }) => post('/vendor/imports/customers', { rows: body?.rows }))
route('POST', '/laundry/import/prices', ({ post, body }) => post('/vendor/imports/prices', { rows: body?.rows }))
