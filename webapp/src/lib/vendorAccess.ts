import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { isWebOnly } from '@/lib/cloudAuth'

export type VendorType = 'STANDARD' | 'PARTNER' | 'EXCLUSIVE'

export type VendorAccess = {
  vendorType: VendorType | null
  /** Counter sales are linked to the customer's LNDRY app; LNDRY accounts can be looked up by phone. */
  appSync: boolean
  /** LNDRY wallet balance lookup, redemption and payment. */
  walletAccess: boolean
  /** False until the backend has answered at least once. */
  loaded: boolean
}

const NOT_CONNECTED: VendorAccess = { vendorType: null, appSync: false, walletAccess: false, loaded: false }
// The desktop shell keeps the behaviour it always had; the backend still enforces the vendor's type.
const UNRESTRICTED: VendorAccess = { vendorType: null, appSync: true, walletAccess: true, loaded: true }

/**
 * What this vendor's counter may do with the LNDRY ecosystem, straight from the backend
 * (GET /vendor/counter/access). Read on sign-in, whenever the window regains focus and every
 * few minutes, so an admin changing the vendor's type shows up here without a redeploy.
 * Until the backend has answered — or if it cannot be reached — the ecosystem features stay
 * hidden. This only decides what the screen offers; the backend refuses the calls regardless.
 */
export function useVendorAccess(): VendorAccess {
  const query = useQuery({
    queryKey: ['vendor-access'],
    queryFn: () => apiGet<{ vendorType: VendorType; appSync: boolean; walletAccess: boolean }>('/vendor/counter/access'),
    enabled: isWebOnly,
    staleTime: 15_000,
    refetchOnWindowFocus: 'always',
    refetchInterval: 5 * 60_000,
    retry: 1,
  })
  if (!isWebOnly) return UNRESTRICTED
  if (!query.data) return NOT_CONNECTED
  return { vendorType: query.data.vendorType, appSync: Boolean(query.data.appSync), walletAccess: Boolean(query.data.walletAccess), loaded: true }
}
