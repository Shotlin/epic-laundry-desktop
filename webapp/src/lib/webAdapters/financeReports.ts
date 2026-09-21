// Finance & compliance + Statutory controls (website build). The pages ask for these two paths; each is
// answered by the real backend report, which is computed there from persisted orders, payments, expenses
// and invoices and is always scoped to the signed-in vendor. Nothing is calculated in the browser.
import { route } from './core'

const params = (query: URLSearchParams) => {
  const out = new URLSearchParams()
  for (const key of ['from', 'to', 'channel']) {
    const value = query.get(key)
    if (value) out.set(key, value)
  }
  return out.toString()
}

route('GET', '/finance/web-overview', async ({ get, query }) => get(`/vendor/finance/overview?${params(query)}`))
route('GET', '/finance/web-statutory', async ({ get, query }) => get(`/vendor/finance/statutory?${params(query)}`))
