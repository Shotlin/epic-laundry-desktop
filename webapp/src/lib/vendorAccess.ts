import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { isWebOnly } from '@/lib/cloudAuth'

export type VendorType = 'STANDARD' | 'PARTNER' | 'EXCLUSIVE'

export type VendorAccess = {
  vendorType: VendorType | null
  /** POS walk-in sales sync to the customer's LNDRY app; LNDRY accounts can be looked up by phone. (Not about LNDRY app orders — those work for every vendor.) */
  appSync: boolean
  /** The customer's LNDRY wallet at the POS counter: balance lookup, redemption and payment. (App checkout with the wallet is unaffected.) */
  walletAccess: boolean
  /** False until the backend has answered at least once. */
  loaded: boolean
}

const NOT_CONNECTED: VendorAccess = { vendorType: null, appSync: false, walletAccess: false, loaded: false }
// The desktop shell keeps the behaviour it always had; the backend still enforces the vendor's type.
const UNRESTRICTED: VendorAccess = { vendorType: null, appSync: true, walletAccess: true, loaded: true }

/**
 * How connected this vendor's POS walk-in sales are to LNDRY (order sync + wallet at the counter),
 * straight from the backend
 * (GET /vendor/counter/access). Read on sign-in, whenever the window regains focus and every
 * few minutes, so an admin changing the vendor's type shows up here without a redeploy.
 * Until the backend has answered — or if it cannot be reached — the ecosystem features stay
 * hidden. This only decides what the screen offers; the backend refuses the calls regardless.
 */
export function useVendorAccess(): VendorAccess {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['vendor-access'],
    queryFn: () => apiGet<{ vendorType: VendorType; appSync: boolean; walletAccess: boolean }>('/vendor/counter/access'),
    enabled: isWebOnly,
    staleTime: 15_000,
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
    retry: 1,
  })
  // When the vendor's type changes, whatever was looked up under the OLD type (a wallet balance, a "no such
  // LNDRY customer" answer, an error) is stale — drop it so the next search asks the backend again.
  const kind = query.data ? `${query.data.vendorType}:${query.data.appSync}:${query.data.walletAccess}` : ''
  useEffect(() => {
    if (!kind) return
    void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] })
    void queryClient.invalidateQueries({ queryKey: ['laundry-customers-remote'] })
  }, [kind, queryClient])
  if (!isWebOnly) return UNRESTRICTED
  if (!query.data) return NOT_CONNECTED
  return { vendorType: query.data.vendorType, appSync: Boolean(query.data.appSync), walletAccess: Boolean(query.data.walletAccess), loaded: true }
}
