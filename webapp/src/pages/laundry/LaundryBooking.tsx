import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, CircleDollarSign, Download, Droplets, ImagePlus, Loader2, Minus, PackagePlus, Pause, Pencil, PlayCircle, Plus, Printer, RotateCcw, Scissors, Search, Shirt, Sparkles, Tag, Trash2, Truck, UserPlus, Wind, X, Zap } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, apiGet, apiPatch, apiPost, apiPostOffline, operatorErrorMessage } from '@/lib/api'
import { useVendorAccess } from '@/lib/vendorAccess'
import { garmentVisuals, generatedVisualManifest } from '@/assets/generated/manifest'
import type { LaundryCatalogue, LaundryOrder, LaundryQuote } from '@/lib/laundry'
import { cn, formatMoney, localDateKey } from '@/lib/utils'
import { summaryRows } from '@/lib/priceBreakdown'
import { deliverPrintDocument, type PrintOrder, type PrintSettings } from '@/lib/laundryPrint'
import { withTagFormatOverride } from '@/lib/tagFormats'
import { canUseUi } from '@/lib/permissions'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'
import { isWebOnly } from '@/lib/cloudAuth'

type CartLine = { garment: string; service: string; qty: number; color?: string; garmentType?: string; rateOverride?: number }
type Customer = { id: string; name: string; phone: string; email?: string; address?: string }
type NewCustomerDraft = { name: string; phone: string; email: string; address: string }
const blankNewCustomer: NewCustomerDraft = { name: '', phone: '', email: '', address: '' }
type Receipt = { orderNumber: string; invoiceNumber?: string; customer: { name: string; phone: string }; orderDate: string; expectedDeliveryDate: string; fulfillmentMode: string; items: LaundryQuote['items']; subtotal: number; charges: number; discounts: number; taxAmount: number; grandTotal: number; paymentMode: string; paymentStatus: string }
type TagData = { tagNumber: string; containerId?: string; tagKind?: 'garment' | 'container'; orderNumber: string; customer: string; garment: string; service: string; sequence: number; total: number; orderDate: string; expectedDeliveryDate: string; weightKg?: number }
type BookingResult = { order?: { id: string; orderNumber: string }; receipt: Receipt; tags: TagData[]; containerTags?: TagData[] }
type PreparedPaymentLink = { method: 'upi' | 'razorpay'; intent?: string }
type BookingDraft = { cart: Record<string, CartLine>; customer: Customer | null; newCustomerName: string; newCustomerPhone: string; deliveryAddress: string; serviceZone: string; containerCount?: number; deliveryMode: 'Pickup Order' | 'Home Delivery' | 'Express Delivery'; expectedDeliveryDate: string; charges: number; discounts: number; taxRate: number; chargeRuleIds: string[]; chargeRuleSelectionTouched?: boolean; discountRuleIds: string[]; taxRuleId: string; customChargeEnabled?: boolean; customChargeValue?: string; customDiscountType?: 'amount' | 'percentage'; customDiscountValue?: string; notes: string; walletAuth?: { requestId: string; amountPaise: number; holdExpiresAt: string } }
type HeldDraft = BookingDraft & { id: string; savedAt: string; paymentMode: 'Pay Later' | 'Cash' | 'UPI' | 'Card' | 'Bank'; paymentReference: string; serverHoldId?: string; holdCode?: string; ownership?: 'mine' | 'other' | 'expired' | 'unassigned' }
type ServerHold = { id: string; holdCode: string; status: 'Held' | 'Resumed' | 'Cancelled'; payload: HeldDraft; createdAt: string; ownership: 'mine' | 'other' | 'expired' | 'unassigned'; leaseExpiresAt?: string }
type HoldPresence = { leaseMinutes: number; totalHeld: number; mineActive: number; otherActive: number; expired: number; unassigned: number }
type RepeatOrder = { items: CartLine[]; fulfillmentMode?: 'Pickup Order' | 'Home Delivery' | 'Express Delivery'; serviceZone?: string; deliveryAddress?: string; notes?: string }
const DRAFT_KEY = 'epic-laundry-booking-draft-v1'
const HELD_DRAFTS_KEY = 'epic-laundry-held-drafts-v1'

function ServiceIcon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const normalized = name.toLowerCase()
  const Icon = normalized.includes('iron') || normalized.includes('press') ? Wind
    : normalized.includes('wash') || normalized.includes('fold') ? Droplets
      : normalized.includes('dry') || normalized.includes('clean') ? Sparkles
        : normalized.includes('shoe') || normalized.includes('repair') ? Zap
          : normalized.includes('stain') || normalized.includes('special') ? Shirt
            : Scissors
  return <Icon className={className} aria-hidden="true" />
}

function ServiceVisual({ name, compact = false }: { name: string; compact?: boolean }) {
  const normalized = name.toLowerCase()
  const src = normalized.includes('iron') || normalized.includes('press')
    ? generatedVisualManifest.services.steamPress
    : normalized.includes('shoe') || normalized.includes('repair')
      ? generatedVisualManifest.services.shoeCare
      : normalized.includes('dry') || normalized.includes('clean')
        ? generatedVisualManifest.services.dryClean
        : generatedVisualManifest.services.washFold
  return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center overflow-hidden bg-[#eeeaff] shadow-[inset_0_0_0_1px_rgba(102,76,240,.12)]', compact ? 'h-9 w-9 rounded-xl' : 'h-14 w-14 rounded-2xl')}><img src={src} alt="" className="h-full w-full object-contain p-0.5" /></span>
}

function CategoryVisual({ name }: { name: string }) {
  const normalized = name.toLowerCase()
  const src = normalized.includes('men') ? garmentVisuals.foldedShirt
    : normalized.includes('women') ? garmentVisuals.foldedKurti
      : normalized.includes('house') || normalized.includes('linen') ? garmentVisuals.foldedBedsheet
        : normalized.includes('access') || normalized.includes('shoe') ? garmentVisuals.handbag
          : normalized.includes('winter') ? garmentVisuals.foldedBlanket
            : garmentVisuals.mixedClothes
  return <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/80"><img src={src} alt="" className="h-full w-full object-contain p-0.5" /></span>
}

export default function LaundryBooking() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editOrderId = searchParams.get('edit')?.trim() || ''
  const isEditing = Boolean(editOrderId)
  const requestedReturnPath = searchParams.get('returnTo')
  const amendmentReturnPath = isEditing && requestedReturnPath === `/laundry/orders/${editOrderId}`
    ? requestedReturnPath
    : `/laundry/orders?order=${encodeURIComponent(editOrderId)}`
  const [cart, setCart] = useState<Record<string, CartLine>>({})
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [showQuickAddGarment, setShowQuickAddGarment] = useState(false)
  const [newCustomerDraft, setNewCustomerDraft] = useState<NewCustomerDraft>(blankNewCustomer)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [serviceZone, setServiceZone] = useState('')
  const [containerCount, setContainerCount] = useState('')
  const [photoPath, setPhotoPath] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [category, setCategory] = useState('all')
  const [service, setService] = useState('all')
  const [garmentSearch, setGarmentSearch] = useState('')
  const [deliveryMode, setDeliveryMode] = useState<'Pickup Order' | 'Home Delivery' | 'Express Delivery'>('Home Delivery')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(defaultDeliveryDate())
  const [paymentMode, setPaymentMode] = useState<'Pay Later' | 'Cash' | 'UPI' | 'Card' | 'Bank'>('Pay Later')
  const [cashRegister, setCashRegister] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [charges, setCharges] = useState(0)
  const [discounts, setDiscounts] = useState(0)
  const [customChargeEnabled, setCustomChargeEnabled] = useState(false)
  const [customChargeValue, setCustomChargeValue] = useState('')
  const [customDiscountType, setCustomDiscountType] = useState<'' | 'amount' | 'percentage'>('')
  const [customDiscountValue, setCustomDiscountValue] = useState('')
  const [taxRate, setTaxRate] = useState(0)
  const [chargeRuleIds, setChargeRuleIds] = useState<string[]>([])
  const [chargeRuleSelectionTouched, setChargeRuleSelectionTouched] = useState(false)
  const [discountRuleIds, setDiscountRuleIds] = useState<string[]>([])
  const [taxRuleId, setTaxRuleId] = useState('')
  const [taxDefaultInitialized, setTaxDefaultInitialized] = useState(false)
  const [notes, setNotes] = useState('')
  const [orderTrayTab, setOrderTrayTab] = useState<'payment' | 'photos'>('payment')
  const [receipt, setReceipt] = useState<BookingResult | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [editHydrated, setEditHydrated] = useState(false)
  const [heldDrafts, setHeldDrafts] = useState<HeldDraft[]>([])
  const [repeatPending, setRepeatPending] = useState(false)
  const [repeatNotice, setRepeatNotice] = useState('')
  const [quickAddNotice, setQuickAddNotice] = useState('')
  // ── LNDRY wallet redemption at the counter ──────────────────────────────
  const access = useVendorAccess()
  const sessionQuery = useQuery({ queryKey: ['auth-session'], queryFn: () => apiGet<{ user: { roles: string[] } | null }>('/auth/session') })
  const canCreateCustomer = canUseUi(sessionQuery.data?.user?.roles, 'customers.create')
  const canManageCatalogue = canUseUi(sessionQuery.data?.user?.roles, 'catalogue.manage')
  const [walletEnabled, setWalletEnabled] = useState(false)
  const [walletRequest, setWalletRequest] = useState<{ requestId: string; expiresAt: string } | null>(null)
  const [walletConfirmed, setWalletConfirmed] = useState<{ requestId: string; amountPaise: number; holdExpiresAt?: string } | null>(null)
  const [walletOtp, setWalletOtp] = useState('')
  const [walletError, setWalletError] = useState('')
  const cashShifts = useQuery({ queryKey: ['laundry-cash-shifts'], queryFn: () => apiGet<Array<{ id: string; status: string; register: string }>>('/laundry/cash-shifts'), enabled: paymentMode === 'Cash', retry: false })
  const printSettings = useQuery({ queryKey: ['laundry-booking-print-settings'], queryFn: () => apiGet<PrintSettings>('/laundry/print-settings'), retry: false })
  const serverHolds = useQuery({ queryKey: ['laundry-order-holds'], queryFn: () => apiGet<ServerHold[]>('/laundry/order-holds'), retry: false })
  const holdPresence = useQuery({ queryKey: ['laundry-order-hold-presence'], queryFn: () => apiGet<HoldPresence>('/laundry/order-holds/presence'), retry: false, refetchInterval: 30_000 })
  const resumeServerHold = useMutation({ mutationFn: (id: string) => apiPost<ServerHold>(`/laundry/order-holds/${id}/resume`, {}), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['laundry-order-holds'] }) })
  const claimServerHold = useMutation({ mutationFn: (id: string) => apiPost<ServerHold>(`/laundry/order-holds/${id}/claim`, {}), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['laundry-order-holds'] }) })

  useEffect(() => {
    if (isEditing) { setDraftRestored(true); return }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null') as Partial<BookingDraft> | null
      if (parsed) {
        if (parsed.cart && typeof parsed.cart === 'object') setCart(parsed.cart as Record<string, CartLine>)
        if (parsed.customer) setCustomer(parsed.customer)
        if (typeof parsed.newCustomerName === 'string') setNewCustomerName(parsed.newCustomerName)
        if (typeof parsed.newCustomerPhone === 'string') setNewCustomerPhone(parsed.newCustomerPhone)
        if (typeof parsed.deliveryAddress === 'string') setDeliveryAddress(parsed.deliveryAddress)
        if (typeof parsed.serviceZone === 'string') setServiceZone(parsed.serviceZone)
        if (typeof parsed.containerCount === 'number') setContainerCount(String(parsed.containerCount))
        if (parsed.deliveryMode) setDeliveryMode(parsed.deliveryMode)
        if (typeof parsed.expectedDeliveryDate === 'string') setExpectedDeliveryDate(parsed.expectedDeliveryDate)
        if (typeof parsed.charges === 'number') setCharges(parsed.charges)
        if (typeof parsed.discounts === 'number') setDiscounts(parsed.discounts)
        if (typeof parsed.customChargeEnabled === 'boolean') setCustomChargeEnabled(parsed.customChargeEnabled)
        if (typeof parsed.customChargeValue === 'string') setCustomChargeValue(parsed.customChargeValue)
        if (parsed.customDiscountType === 'amount' || parsed.customDiscountType === 'percentage') setCustomDiscountType(parsed.customDiscountType)
        if (typeof parsed.customDiscountValue === 'string') setCustomDiscountValue(parsed.customDiscountValue)
        if (typeof parsed.taxRate === 'number') setTaxRate(parsed.taxRate)
        if (Array.isArray(parsed.chargeRuleIds)) setChargeRuleIds(parsed.chargeRuleIds)
        if (typeof parsed.chargeRuleSelectionTouched === 'boolean') setChargeRuleSelectionTouched(parsed.chargeRuleSelectionTouched)
        else if (Array.isArray(parsed.chargeRuleIds) && parsed.chargeRuleIds.length > 0) setChargeRuleSelectionTouched(true)
        if (Array.isArray(parsed.discountRuleIds)) setDiscountRuleIds(parsed.discountRuleIds)
        if (typeof parsed.taxRuleId === 'string') setTaxRuleId(parsed.taxRuleId)
        if (typeof parsed.notes === 'string') setNotes(parsed.notes)
        // A customer's wallet approval survives a reload / refresh while it is still valid (it lasts 15 minutes and
        // nothing has been debited), so the operator is not sent back to ask for a new code.
        const auth = parsed.walletAuth
        if (auth && typeof auth.requestId === 'string' && auth.holdExpiresAt && new Date(auth.holdExpiresAt).getTime() > Date.now()) setWalletConfirmed(auth)
      }
    } catch { /* a corrupt draft is ignored and replaced by the next save */ }
    try {
      const held = JSON.parse(window.localStorage.getItem(HELD_DRAFTS_KEY) || '[]')
      if (Array.isArray(held)) setHeldDrafts(held.slice(0, 10) as HeldDraft[])
    } catch { /* corrupt held drafts are ignored */ }
    setDraftRestored(true)
  }, [isEditing])
  useEffect(() => {
    if (!draftRestored || isEditing) return
    const draft: BookingDraft = { cart, customer, newCustomerName, newCustomerPhone, deliveryAddress, serviceZone, containerCount: containerCount === '' ? undefined : Number(containerCount), deliveryMode, expectedDeliveryDate, charges, discounts, taxRate, chargeRuleIds, chargeRuleSelectionTouched, discountRuleIds, taxRuleId, customChargeEnabled, customChargeValue, customDiscountType: customDiscountType || undefined, customDiscountValue, notes, walletAuth: walletConfirmed?.holdExpiresAt ? { requestId: walletConfirmed.requestId, amountPaise: walletConfirmed.amountPaise, holdExpiresAt: walletConfirmed.holdExpiresAt } : undefined }
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* local storage is best effort */ }
  }, [draftRestored, isEditing, cart, customer, newCustomerName, newCustomerPhone, deliveryAddress, serviceZone, containerCount, deliveryMode, expectedDeliveryDate, charges, discounts, taxRate, chargeRuleIds, chargeRuleSelectionTouched, discountRuleIds, taxRuleId, customChargeEnabled, customChargeValue, customDiscountType, customDiscountValue, notes, walletConfirmed])
  useEffect(() => {
    if (!serverHolds.data) return
    const remote = serverHolds.data.filter((hold) => hold.status === 'Held').map((hold) => ({ ...hold.payload, id: `server-${hold.id}`, serverHoldId: hold.id, holdCode: hold.holdCode, savedAt: hold.createdAt, ownership: hold.ownership }))
    setHeldDrafts((previous) => {
      const local = previous.filter((item) => !item.serverHoldId)
      const next = [...remote, ...local].slice(0, 10)
      try { window.localStorage.setItem(HELD_DRAFTS_KEY, JSON.stringify(local.slice(0, 10))) } catch { /* best effort */ }
      return next
    })
  }, [serverHolds.data])

  const catalogueQuery = useQuery({ queryKey: ['laundry-catalogue'], queryFn: () => apiGet<LaundryCatalogue>('/laundry/catalogue') })
  const orderForEdit = useQuery({
    queryKey: ['laundry-order-for-builder-edit', editOrderId],
    queryFn: () => apiGet<LaundryOrder>(`/laundry/orders/${editOrderId}`),
    enabled: isEditing,
    retry: false,
  })
  const customerQuery = useQuery({ queryKey: ['laundry-customers', customerSearch], queryFn: () => apiGet<Customer[]>(`/laundry/customers?search=${encodeURIComponent(customerSearch)}`), enabled: customerSearch.trim().length >= 2 })
  const createCustomer = useMutation({
    mutationFn: (draft: NewCustomerDraft) => apiPost<Customer>('/laundry/customers', { ...draft, openingBalance: 0, preferredContact: 'Phone', marketingConsent: false }),
    onSuccess: (created) => {
      setCustomer(created)
      setDeliveryAddress((current) => current.trim() ? current : created.address || '')
      setCustomerSearch('')
      setNewCustomerName('')
      setNewCustomerPhone('')
      setShowNewCustomer(false)
      setNewCustomerDraft(blankNewCustomer)
      void queryClient.invalidateQueries({ queryKey: ['laundry-customers'] })
    },
  })
  const quickAddGarment = useMutation({
    mutationFn: (input: { garment: { name: string; code?: string; category: string; unit: string; hsn?: string; visualKey: string; photo: string }; service: string; rate: number }) => apiPost<{ garment: { id: string }; price: { id?: string } }>('/laundry/catalogue/quick-add', input),
    onSuccess: async (saved, input) => {
      await queryClient.invalidateQueries({ queryKey: ['laundry-catalogue'] })
      const key = `${saved.garment.id}:${input.service}`
      setCart((previous) => previous[key] ? previous : { ...previous, [key]: { garment: saved.garment.id, service: input.service, qty: 1 } })
      setCategory('all')
      setService('all')
      setGarmentSearch('')
      setShowQuickAddGarment(false)
      setQuickAddNotice('Garment and service price saved. Added to this order draft; no order has been booked.')
    },
  })
  const newCustomerPhoneDigits = newCustomerDraft.phone.replace(/\D/g, '')
  const canSaveNewCustomer = Boolean(newCustomerDraft.name.trim()) && newCustomerPhoneDigits.length >= 6 && newCustomerPhoneDigits.length <= 15 && !createCustomer.isPending
  function closeNewCustomerDialog() {
    if (createCustomer.isPending) return
    setShowNewCustomer(false)
    createCustomer.reset()
  }
  function openNewCustomerDialog() {
    const search = customerSearch.trim()
    const digits = search.replace(/\D/g, '')
    const searchIsPhone = digits.length >= 6 && digits.length >= search.replace(/\s/g, '').length * 0.6
    createCustomer.reset()
    setNewCustomerDraft({
      ...blankNewCustomer,
      name: newCustomerName.trim() || (!searchIsPhone ? search : ''),
      phone: newCustomerPhone.trim() || (searchIsPhone ? search : ''),
    })
    setShowNewCustomer(true)
  }
  function submitNewCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSaveNewCustomer) createCustomer.mutate(newCustomerDraft)
  }
  // A local search only ever finds customers this desktop has already
  // saved — it can never find a real LNDRY App customer who's never
  // bought here before. This asks the real backend directly, so a phone
  // that's already a real account still resolves to a real person instead
  // of forcing a "new customer" walk-in re-entry every time.
  const searchDigits = customerSearch.replace(/\D/g, '')
  const remoteMatchQuery = useQuery({
    queryKey: ['laundry-customers-remote', searchDigits],
    queryFn: () => apiGet<{ match: { userId: string; name?: string; phone: string } | null }>(`/laundry/customers/remote-lookup?phone=${encodeURIComponent(searchDigits)}`),
    enabled: searchDigits.length >= 8 && access.appSync,
  })
  const remoteMatch = access.appSync && remoteMatchQuery.data?.match && !(customerQuery.data || []).some((result) => result.phone.replace(/\D/g, '') === remoteMatchQuery.data!.match!.phone)
    ? remoteMatchQuery.data.match
    : null
  const adoptRemoteCustomer = useMutation({
    mutationFn: (match: { userId: string; name?: string; phone: string }) => apiPost<Customer>('/laundry/customers/adopt-remote', match),
    onSuccess: (created) => { setCustomer(created); setNewCustomerName(''); setNewCustomerPhone(''); setCustomerSearch(''); void queryClient.invalidateQueries({ queryKey: ['laundry-customers'] }) },
  })
  useEffect(() => {
    const order = orderForEdit.data
    if (!isEditing || !order || editHydrated) return
    const nextCart = Object.fromEntries(order.items.filter((item) => item.garment && item.service && Number(item.qty) > 0).map((item) => [`${item.garment}:${item.service}`, { garment: item.garment!, service: item.service!, qty: item.qty, color: item.color, garmentType: item.garmentType, rateOverride: item.rateOverride }]))
    setCart(nextCart)
    setCustomer({ id: order.customer.id || '', name: order.customer.name, phone: order.customer.phone, address: order.deliveryAddress })
    setCustomerSearch('')
    setNewCustomerName('')
    setNewCustomerPhone('')
    setDeliveryAddress(order.deliveryAddress || '')
    setServiceZone(order.serviceZone || '')
    setDeliveryMode(order.fulfillmentMode as 'Pickup Order' | 'Home Delivery' | 'Express Delivery')
    setExpectedDeliveryDate(order.expectedDeliveryDate)
    setCharges(order.charges)
    setDiscounts(order.discounts)
    setTaxRate(order.taxRate)
    setNotes(order.notes || '')
    setPaymentMode('Pay Later')
    setPaymentReference('')
    setEditHydrated(true)
  }, [editHydrated, isEditing, orderForEdit.data])
  const items = useMemo(() => Object.values(cart), [cart])
  const expressChargeRule = catalogueQuery.data?.chargeRules.find((rule) => rule.expressCharge && rule.active !== false)
  useEffect(() => {
    if (!draftRestored || isEditing || !catalogueQuery.data || chargeRuleSelectionTouched || deliveryMode !== 'Express Delivery' || chargeRuleIds.length > 0 || !expressChargeRule) return
    setChargeRuleIds([expressChargeRule.id])
  }, [chargeRuleIds.length, chargeRuleSelectionTouched, catalogueQuery.data, deliveryMode, draftRestored, expressChargeRule, isEditing])
  function changeDeliveryMode(mode: 'Pickup Order' | 'Home Delivery' | 'Express Delivery') {
    if (mode === 'Express Delivery') {
      if (expressChargeRule) setChargeRuleIds([expressChargeRule.id])
    } else {
      const expressRuleIds = new Set((catalogueQuery.data?.chargeRules || []).filter((rule) => rule.expressCharge).map((rule) => rule.id))
      setChargeRuleIds((current) => current.filter((id) => !expressRuleIds.has(id)))
    }
    setChargeRuleSelectionTouched(false)
    setDeliveryMode(mode)
  }
  const quoteQuery = useQuery({
    queryKey: ['laundry-quote', JSON.stringify(items), customer?.id, charges, discounts, taxRate, deliveryMode, chargeRuleIds, discountRuleIds, taxRuleId],
    queryFn: () => apiPost<LaundryQuote>('/laundry/quote', { items, customerId: customer?.id, charges, discounts, taxRate, chargeRuleIds, discountRuleIds, taxRuleId }),
    enabled: items.length > 0,
  })
  useEffect(() => {
    if (!customChargeEnabled) return
    setCharges(Math.max(0, Number(customChargeValue) || 0))
  }, [customChargeEnabled, customChargeValue])
  useEffect(() => {
    if (!customDiscountType) return
    const value = Math.max(0, Number(customDiscountValue) || 0)
    const next = customDiscountType === 'percentage'
      ? (value > 100 ? 0 : Math.round(((quoteQuery.data?.subtotal || 0) * value) * 100) / 10_000)
      : value
    setDiscounts(next)
  }, [customDiscountType, customDiscountValue, quoteQuery.data?.subtotal])
  const runningTotalPaise = Math.round((quoteQuery.data?.grandTotal || 0) * 100)
  // Only a customer that resolved to (or was adopted as) a real LNDRY App
  // account has a real wallet to redeem from — a plain local walk-in never
  // does, and this lookup would just 404 for them, so it isn't attempted.
  const walletBalanceQuery = useQuery({
    queryKey: ['wallet-balance', customer?.phone],
    queryFn: async () => {
      try {
        return await apiPost<{ userId: string; name: string; balancePaise: number }>('/marketplace/cloud/wallet/lookup', { phone: customer!.phone })
      } catch (error) {
        // Refused because the vendor's type changed under us: pick up the current type right now, not at the next refresh.
        if (error instanceof ApiError && error.code === 'VENDOR_TIER_RESTRICTED') void queryClient.invalidateQueries({ queryKey: ['vendor-access'] })
        throw error
      }
    },
    enabled: Boolean(customer?.phone) && !walletConfirmed && access.walletAccess,
    retry: false,
  })
  // A Standard vendor has no LNDRY-wallet access — nothing from the wallet is ever shown or offered.
  const walletBalance = access.walletAccess ? walletBalanceQuery.data : undefined
  const walletProposedPaise = Math.max(0, Math.min(walletBalance?.balancePaise || 0, runningTotalPaise))
  // Say WHY there is nothing to offer, instead of the wallet option silently not appearing.
  const walletLookupFailed = access.walletAccess && walletBalanceQuery.isError && (walletBalanceQuery.error as { code?: string })?.code !== 'NOT_FOUND'
  const walletNote = walletBalance && walletBalance.balancePaise <= 0
    ? <p className="mt-3 text-[10px] text-[#8a959a]">This customer's LNDRY wallet balance is ₹0 — there is nothing to redeem.</p>
    : walletLookupFailed
      ? <p role="alert" className="mt-3 text-[11px] text-rose-700">{operatorErrorMessage(walletBalanceQuery.error, 'The LNDRY wallet could not be checked.')}</p>
      : null
  const createWalletRequest = useMutation({
    mutationFn: () => apiPost<{ requestId: string; expiresAt: string }>('/marketplace/cloud/wallet/redemption-requests', { customerUserId: walletBalanceQuery.data!.userId, amountPaise: walletProposedPaise }),
    onSuccess: (created) => { setWalletRequest(created); setWalletError('') },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === 'VENDOR_TIER_RESTRICTED') void queryClient.invalidateQueries({ queryKey: ['vendor-access'] })
      setWalletError(operatorErrorMessage(error, 'Could not start a wallet redemption for this customer.')); setWalletEnabled(false)
    },
  })
  const confirmWalletRequest = useMutation({
    mutationFn: () => apiPost<{ requestId: string; amountPaise: number; holdExpiresAt?: string }>(`/marketplace/cloud/wallet/redemption-requests/${walletRequest!.requestId}/confirm`, { otp: walletOtp }),
    onSuccess: (confirmed) => { setWalletConfirmed(confirmed); setWalletRequest(null); setWalletOtp(''); setWalletError('') },
    onError: (error: Error) => setWalletError(operatorErrorMessage(error, 'That code did not match — ask the customer to check their app and try again.')),
  })
  const cancelWalletRequest = useMutation({
    mutationFn: () => apiPost(`/marketplace/cloud/wallet/redemption-requests/${walletRequest!.requestId}/cancel`, {}),
    onSuccess: () => { setWalletRequest(null); setWalletOtp(''); setWalletEnabled(false); setWalletError('') },
  })
  function toggleWallet(next: boolean) {
    setWalletEnabled(next)
    setWalletError('')
    if (next && walletBalance && walletProposedPaise > 0 && !walletRequest && !walletConfirmed) createWalletRequest.mutate()
    else if (!next && walletRequest) cancelWalletRequest.mutate()
  }
  function clearWalletRedemption() {
    if (walletRequest) cancelWalletRequest.mutate()
    // The customer's approval only RESERVED the amount (nothing was debited): removing it releases the reservation
    // right away instead of leaving it to lapse on its own.
    if (walletConfirmed) void apiPost(`/marketplace/cloud/wallet/redemption-requests/${walletConfirmed.requestId}/cancel`, {}).catch(() => undefined)
    setWalletEnabled(false); setWalletConfirmed(null); setWalletOtp(''); setWalletError('')
  }
  // If the vendor's type takes the wallet away while a code is out, withdraw that request so the customer's app
  // is not left showing it (a redemption the customer ALREADY confirmed stays applied — it was debited legitimately).
  useEffect(() => {
    if (!access.loaded || access.walletAccess) return
    setWalletEnabled(false)
    if (walletRequest) cancelWalletRequest.mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loaded, access.walletAccess])
  const booking = useMutation({
    mutationFn: () => apiPostOffline<BookingResult>('/laundry/orders', {
      customer: customer ? { id: customer.id, address: deliveryAddress || customer.address } : { name: newCustomerName, phone: newCustomerPhone, address: deliveryAddress },
      items, containerCount: containerCount === '' ? undefined : Number(containerCount), expectedDeliveryDate, fulfillmentMode: deliveryMode, serviceZone, cashRegister: paymentMode === 'Cash' ? cashRegister || undefined : undefined, paymentMode, paymentReference, charges, discounts, taxRate, chargeRuleIds, discountRuleIds, taxRuleId, notes, photoPaths: photoPath,
      walletRedemption: walletConfirmed ? { requestId: walletConfirmed.requestId, amountPaise: walletConfirmed.amountPaise } : undefined,
    }, 'laundry_order'),
    onError: (error: Error) => {
      // The wallet approval lapsed / the wallet changed: nothing was taken, the approval is unusable — clear it so the
      // operator can ask the customer to approve again (the message says exactly that).
      if (error instanceof ApiError && /^(WALLET_|INSUFFICIENT_BALANCE)/.test(error.code || '')) { setWalletConfirmed(null); setWalletEnabled(false) }
    },
    onSuccess: (result) => {
      setReceipt(result); setCart({}); setCustomer(null); setCustomerSearch(''); setNewCustomerName(''); setNewCustomerPhone(''); setDeliveryAddress(''); setServiceZone(''); setContainerCount(''); setPhotoPath(''); setPhotoError(''); setPaymentReference(''); setCashRegister(''); setPaymentMode('Pay Later'); setNotes(''); setCharges(0); setDiscounts(0); setChargeRuleIds([]); setChargeRuleSelectionTouched(false); setDiscountRuleIds([]); setTaxRuleId(''); setCustomChargeEnabled(false); setCustomChargeValue(''); setCustomDiscountType(''); setCustomDiscountValue('')
      setWalletEnabled(false); setWalletRequest(null); setWalletConfirmed(null); setWalletOtp(''); setWalletError('')
      try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      queryClient.invalidateQueries({ queryKey: ['laundry-dashboard'] }); queryClient.invalidateQueries({ queryKey: ['laundry-orders'] }); queryClient.invalidateQueries({ queryKey: ['laundry-customers'] })
      if (paymentMode === 'Cash') {
        queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] })
        queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
        queryClient.invalidateQueries({ queryKey: ['cash-close-drill'] })
      }
      const action = printSettings.data?.afterBooking || 'ask'
      if (action === 'open-print-centre' && result.order?.id) navigate(`/laundry/print-centre?order=${encodeURIComponent(result.order.id)}`)
      if (action === 'auto-print' && (result.tags?.length || result.containerTags?.length)) void printBookingDocuments(result, result.tags?.length ? 'tags' : 'bag-tags')
    },
  })
  const saveControlledEdit = useMutation({
    mutationFn: () => apiPatch<LaundryOrder>(`/laundry/orders/${editOrderId}`, {
      items,
      expectedDeliveryDate,
      fulfillmentMode: deliveryMode,
      charges,
      discounts,
      taxRate,
      chargeRuleIds,
      discountRuleIds,
      taxRuleId,
      notes,
      deliveryAddress,
      serviceZone,
      expectedVersion: orderForEdit.data?.version,
    }),
    onSuccess: (order) => {
      try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* best effort */ }
      queryClient.invalidateQueries({ queryKey: ['laundry-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-orders'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-order', editOrderId] })
      queryClient.invalidateQueries({ queryKey: ['laundry-reports'] })
      navigate(amendmentReturnPath)
    },
  })
  const preparePaymentLink = useMutation({
    mutationFn: () => apiPost<PreparedPaymentLink>('/payments/link', {
      amount: Math.max(0, (quoteQuery.data?.grandTotal || 0) - (walletConfirmed?.amountPaise || 0) / 100),
      description: `Epic Laundry order${customer?.name ? ` · ${customer.name}` : ''}`,
    }),
  })

  const catalogue = catalogueQuery.data
  useEffect(() => {
    if (taxDefaultInitialized || !draftRestored || !catalogue || printSettings.isLoading) return
    // GST is only defaulted after the store has positively opted into GST mode.
    // This keeps an unregistered store from accidentally charging tax.
    if (printSettings.data?.taxMode === 'gst' && !taxRuleId && taxRate === 0) {
      const standardLaundryGst = catalogue.taxRules.find((rule) => rule.rate === 18 && /laundry|9997/i.test(rule.name))
      if (standardLaundryGst) setTaxRuleId(standardLaundryGst.id)
      else setTaxRate(18)
    }
    setTaxDefaultInitialized(true)
  }, [catalogue, draftRestored, printSettings.data?.taxMode, printSettings.isLoading, taxDefaultInitialized, taxRate, taxRuleId])
  const garmentById = useMemo(() => new Map((catalogue?.garments || []).map((item) => [item.id, item])), [catalogue])
  const hasBulkItems = useMemo(() => items.some((item) => !['Piece', 'Pair'].includes(garmentById.get(item.garment)?.unit || 'Piece')), [items, garmentById])
  useEffect(() => { if (!hasBulkItems && containerCount !== '') setContainerCount('') }, [hasBulkItems, containerCount])
  const visiblePrices = useMemo(() => (catalogue?.prices || []).filter((price) => {
    const garment = garmentById.get(price.garment)
    // A counter catalogue can have sub-categories (picking a category also shows its sub-categories), switched-off items and customer-only prices (applied at pricing time, not listed).
    const categoryIds = new Set([category, ...(catalogue?.categories || []).filter((item) => item.parentId === category).map((item) => item.id)])
    const serviceActive = (catalogue?.services || []).find((item) => item.id === price.service)?.active !== false
    return garment && garment.active !== false && price.active !== false && Number(price.rate) > 0 && serviceActive && !price.customer && (category === 'all' || categoryIds.has(garment.category)) && (service === 'all' || price.service === service) && `${price.garmentName} ${price.serviceName}`.toLowerCase().includes(garmentSearch.trim().toLowerCase())
  }), [catalogue, garmentById, category, service, garmentSearch])

  function adjustLine(garment: string, serviceId: string, change: number) {
    const key = `${garment}:${serviceId}`
    setCart((previous) => {
      const next = { ...previous }; const line = next[key]
      const unit = garmentById.get(garment)?.unit || 'Piece'; const step = unit === 'Kilogram' ? 0.1 : unit === 'Square Foot' ? 0.25 : 1
      const qty = line ? Math.round((line.qty + change * step) * 1000) / 1000 : change > 0 ? 1 : 0
      if (qty <= 0) delete next[key]; else next[key] = { ...line, garment, service: serviceId, qty }
      return next
    })
  }
  function setLineQuantity(garment: string, serviceId: string, value: string) {
    const key = `${garment}:${serviceId}`; const unit = garmentById.get(garment)?.unit || 'Piece'; const parsed = Number(value); if (!Number.isFinite(parsed) || parsed <= 0) return
    const qty = ['Piece', 'Pair'].includes(unit) ? Math.round(parsed) : Math.round(parsed * 1000) / 1000
    setCart((previous) => ({ ...previous, [key]: { ...previous[key], garment, service: serviceId, qty } }))
  }
  function setLineAttributes(garment: string, serviceId: string, patch: Pick<CartLine, 'color' | 'garmentType' | 'rateOverride'>) {
    const key = `${garment}:${serviceId}`
    const normalizedPatch = patch.rateOverride !== undefined && Number(patch.rateOverride) <= 0 ? { ...patch, rateOverride: undefined } : patch
    setCart((previous) => previous[key] ? { ...previous, [key]: { ...previous[key], ...normalizedPatch } } : previous)
  }

  function currentDraft(): BookingDraft {
    return { cart, customer, newCustomerName, newCustomerPhone, deliveryAddress, serviceZone, containerCount: containerCount === '' ? undefined : Number(containerCount), deliveryMode, expectedDeliveryDate, charges, discounts, taxRate, chargeRuleIds, chargeRuleSelectionTouched, discountRuleIds, taxRuleId, customChargeEnabled, customChargeValue, customDiscountType: customDiscountType || undefined, customDiscountValue, notes }
  }
  function clearCurrentDraft() {
    setCart({}); setCustomer(null); setCustomerSearch(''); setNewCustomerName(''); setNewCustomerPhone(''); setDeliveryAddress(''); setServiceZone(''); setContainerCount(''); setPhotoPath(''); setPhotoError(''); setPaymentReference(''); setPaymentMode('Pay Later'); setNotes(''); setChargeRuleIds([]); setChargeRuleSelectionTouched(false); setDiscountRuleIds([]); setTaxRuleId(''); setCustomChargeEnabled(false); setCustomChargeValue(''); setCustomDiscountType(''); setCustomDiscountValue('')
    try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* best effort */ }
  }
  function clearDraftToDefaults() {
    clearCurrentDraft()
    clearWalletRedemption()
    setShowNewCustomer(false); setNewCustomerDraft(blankNewCustomer)
    setCategory('all'); setService('all'); setGarmentSearch('')
    setDeliveryMode('Home Delivery'); setExpectedDeliveryDate(defaultDeliveryDate())
    setCharges(0); setDiscounts(0); setTaxRate(0); setTaxDefaultInitialized(false)
    setCashRegister(''); setRepeatNotice('')
  }
  async function holdCurrentDraft() {
    if (!items.length && !customer && !newCustomerName.trim()) return
    const held: HeldDraft = { ...currentDraft(), id: `hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, savedAt: new Date().toISOString(), paymentMode, paymentReference }
    try {
      await apiPost<ServerHold>('/laundry/order-holds', held)
      await queryClient.invalidateQueries({ queryKey: ['laundry-order-holds'] })
    } catch {
      setHeldDrafts((previous) => { const next = [held, ...previous.filter((item) => !item.serverHoldId)].slice(0, 10); try { window.localStorage.setItem(HELD_DRAFTS_KEY, JSON.stringify(next)) } catch { /* best effort */ }; return next })
    }
    clearCurrentDraft()
  }
  async function resumeHeldDraft(held: HeldDraft) {
    let source = held
    if (held.serverHoldId) {
      try {
        if (held.ownership !== 'mine') await claimServerHold.mutateAsync(held.serverHoldId)
        const resumed = await resumeServerHold.mutateAsync(held.serverHoldId); source = { ...resumed.payload, ...held }
      } catch { return }
    }
    setCart(source.cart || {}); setCustomer(source.customer || null); setNewCustomerName(source.newCustomerName || ''); setNewCustomerPhone(source.newCustomerPhone || ''); setDeliveryAddress(source.deliveryAddress || ''); setServiceZone(source.serviceZone || ''); setContainerCount(source.containerCount === undefined ? '' : String(source.containerCount)); setDeliveryMode(source.deliveryMode || 'Home Delivery'); setExpectedDeliveryDate(source.expectedDeliveryDate || defaultDeliveryDate()); setCharges(source.charges || 0); setDiscounts(source.discounts || 0); setTaxRate(source.taxRate || 0); setChargeRuleIds(source.chargeRuleIds || []); setChargeRuleSelectionTouched(Boolean(source.chargeRuleSelectionTouched)); setDiscountRuleIds(source.discountRuleIds || []); setTaxRuleId(source.taxRuleId || ''); setCustomChargeEnabled(Boolean(source.customChargeEnabled)); setCustomChargeValue(source.customChargeValue || ''); setCustomDiscountType(source.customDiscountType || ''); setCustomDiscountValue(source.customDiscountValue || ''); setNotes(source.notes || ''); setPaymentMode(source.paymentMode || 'Pay Later'); setPaymentReference(source.paymentReference || '')
    setHeldDrafts((previous) => { const next = previous.filter((item) => item.id !== held.id); try { window.localStorage.setItem(HELD_DRAFTS_KEY, JSON.stringify(next.filter((item) => !item.serverHoldId))) } catch { /* best effort */ }; return next })
  }

  async function repeatLastOrder() {
    if (!customer) return
    setRepeatPending(true); setRepeatNotice('')
    try {
      const profile = await apiGet<{ orders: RepeatOrder[] }>(`/laundry/customers/${customer.id}`)
      const latest = profile.orders.find((order) => Array.isArray(order.items) && order.items.length > 0)
      if (!latest) { setRepeatNotice('No previous order is available for this customer.'); return }
      const available = new Set((catalogueQuery.data?.prices || []).map((price) => `${price.garment}:${price.service}`))
      const nextCart = Object.fromEntries(latest.items.filter((item) => available.has(`${item.garment}:${item.service}`) && Number(item.qty) > 0).map((item) => [`${item.garment}:${item.service}`, { garment: item.garment, service: item.service, qty: item.qty, color: item.color, garmentType: item.garmentType, rateOverride: item.rateOverride }]))
      if (!Object.keys(nextCart).length) { setRepeatNotice('The previous garments are no longer active in this branch catalogue.'); return }
      setCart(nextCart); if (latest.fulfillmentMode) changeDeliveryMode(latest.fulfillmentMode); setServiceZone(latest.serviceZone || ''); setDeliveryAddress(latest.deliveryAddress || customer.address || ''); setNotes('')
      setRepeatNotice(`${Object.keys(nextCart).length} previous line${Object.keys(nextCart).length === 1 ? '' : 's'} restored. Review quantities and today’s delivery date before booking.`)
    } catch (error) { setRepeatNotice(error instanceof Error ? error.message : 'The previous order could not be loaded.') } finally { setRepeatPending(false) }
  }

  const validOrderDraft = items.length > 0 && expectedDeliveryDate && Boolean(customer) && !booking.isPending
  const selectedTaxRule = catalogue?.taxRules.find((rule) => rule.id === taxRuleId)
  const taxChoiceRequiresReview = printSettings.data?.taxMode !== 'gst'
    ? Boolean(taxRuleId) || taxRate > 0
    : Boolean(taxRuleId && (!selectedTaxRule || selectedTaxRule.rate !== 18)) || Boolean(!taxRuleId && taxRate > 0 && taxRate !== 18)
  const hasCommitPermission = canUseUi(sessionQuery.data?.user?.roles, isEditing ? 'orders.edit' : 'orders.create')
  const canCommit = hasCommitPermission && validOrderDraft && !taxChoiceRequiresReview && (!isEditing || Boolean(orderForEdit.data)) && !saveControlledEdit.isPending
  const commitError = isEditing ? saveControlledEdit.error : booking.error
  function commitOrder() {
    if (isEditing) saveControlledEdit.mutate()
    else booking.mutate()
  }
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        if (canCommit) commitOrder()
      } else if (event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        void holdCurrentDraft()
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [canCommit, commitOrder, holdCurrentDraft])

  return <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Counter desk · order & billing</p><h1 className="mt-0.5 font-display text-2xl font-semibold tracking-[-.035em] text-[#17353c]">{isEditing ? 'Amend the order in the familiar builder.' : 'Build the order visually.'}</h1></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => isEditing ? navigate(amendmentReturnPath) : clearDraftToDefaults()} className="rounded-full border border-[#263f44]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#617178]">{isEditing ? 'Cancel amendment' : 'Clear draft'}</button><span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#3c796d]/20 bg-[#eaf3ef] px-3 py-1.5 text-xs font-semibold text-[#29635b]"><Check className="h-3.5 w-3.5" /> Server-calculated totals</span></div></div>
    {isEditing ? <section className="mb-3 rounded-2xl border border-[#c7befa] bg-[#f6f3ff] px-4 py-3 text-sm text-[#463b75]">{orderForEdit.isLoading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading this order into the builder…</span> : orderForEdit.isError ? <span role="alert">This order could not be loaded for amendment.</span> : <><strong>Controlled amendment</strong><span className="ml-1">The customer and paid collections stay fixed. Saving creates a replacement invoice and keeps the original history.</span></>}</section> : null}

    {!isEditing && (items.length > 0 || heldDrafts.length > 0) && <section className="mb-3 rounded-2xl border border-[#d7c38e]/50 bg-[#fff8e8] px-4 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Pause className="h-4 w-4 text-[#9b6d1d]" /><div><p className="text-sm font-bold text-[#704f19]">Counter hold queue</p><p className="hidden text-xs text-[#8b7448] 2xl:block">Park an unfinished order for another customer without losing the work.</p></div></div><button type="button" title="Shortcut: Ctrl/Cmd+Shift+H" disabled={!items.length && !customer && !newCustomerName.trim()} onClick={holdCurrentDraft} className="inline-flex items-center gap-1.5 rounded-lg bg-[#e6bc65] px-3 py-2 text-xs font-bold text-[#17363e] disabled:cursor-not-allowed disabled:opacity-45"><Pause className="h-3.5 w-3.5" />Hold current order</button></div>{holdPresence.data && <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-[#6d5a2d]"><span className="rounded-full bg-white/70 px-2.5 py-1">{holdPresence.data.totalHeld} active hold{holdPresence.data.totalHeld === 1 ? '' : 's'}</span><span className="rounded-full bg-white/70 px-2.5 py-1">{holdPresence.data.mineActive} on this counter</span>{holdPresence.data.otherActive > 0 && <span className="rounded-full bg-white/70 px-2.5 py-1">{holdPresence.data.otherActive} on another counter</span>}{holdPresence.data.expired > 0 && <span className="rounded-full bg-[#fce8d8] px-2.5 py-1 text-[#9a4f27]">{holdPresence.data.expired} lease{holdPresence.data.expired === 1 ? '' : 's'} expired · reclaim safely</span>}</div>}{heldDrafts.length ? <div className="mt-2 flex flex-wrap gap-2">{heldDrafts.map((held) => <button type="button" key={held.id} onClick={() => resumeHeldDraft(held)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-xs font-semibold text-[#315d57] ring-1 ring-inset ring-[#c69e4c]/30 hover:bg-[#fffdf5]"><PlayCircle className="h-4 w-4 text-[#39786f]" /><span>{held.customer?.name || held.newCustomerName || 'Walk-in draft'} · {Object.values(held.cart || {}).reduce((sum, line) => sum + line.qty, 0)} item(s)<small className="ml-1 block text-[10px] font-normal text-[#8b7448]">{held.ownership === 'other' || held.ownership === 'expired' ? `${held.ownership === 'expired' ? 'Lease expired · ' : ''}Claim & resume · ` : held.ownership === 'mine' ? 'Owned by this counter · ' : ''}{new Date(held.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small></span></button>)}</div> : null}</section>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_560px]">
      <section className="xl:col-span-2 rounded-[22px] border border-[#263f44]/10 bg-white p-4 shadow-[0_8px_28px_rgba(37,48,43,.04)]">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf3ef] text-[#39786f]"><UserPlus className="h-4 w-4" /></span><div><p className="font-semibold">Customer</p><p className="text-xs text-[#74848a]">{isEditing ? 'Customer details are retained on a controlled amendment' : 'Find a match or save a customer before booking'}</p></div></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1.2fr_1fr]"><div>{customer ? <div className="rounded-xl bg-[#edf5f1] p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-[#1d4e49]">{customer.name}</p><p className="mt-0.5 text-xs text-[#52716c]">{customer.phone}</p></div><button type="button" onClick={() => { setCustomer(null); setNewCustomerName(''); setNewCustomerPhone(''); clearWalletRedemption() }} className="rounded-lg p-1 text-[#52716c] hover:bg-white" aria-label="Clear customer"><X className="h-4 w-4" /></button></div><button type="button" disabled={repeatPending} onClick={() => void repeatLastOrder()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#39786f]/25 bg-white px-3 py-2 text-xs font-bold text-[#2d6b63] disabled:opacity-60"><RotateCcw className={`h-3.5 w-3.5 ${repeatPending ? 'animate-spin' : ''}`} />{repeatPending ? 'Loading previous order…' : 'Repeat last order'}</button>{repeatNotice ? <p role="status" className="mt-2 text-[11px] leading-4 text-[#52716c]">{repeatNotice}</p> : null}
          {!access.walletAccess ? (access.loaded ? <p className="mt-3 text-[10px] leading-4 text-[#8a959a]">Walk-in POS sales stay independent on your {access.vendorType ? access.vendorType.charAt(0) + access.vendorType.slice(1).toLowerCase() : ''} plan: the customer's LNDRY wallet and LNDRY-app order sync are not available at the counter. LNDRY app orders are unaffected.</p> : null)
          : walletConfirmed ? <div className="mt-3 rounded-lg border border-[#438b82]/40 bg-white p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-[#1d4e49]">₹{(walletConfirmed.amountPaise / 100).toFixed(2)} reserved from LNDRY Wallet</span><button type="button" onClick={clearWalletRedemption} className="text-[10px] font-semibold text-[#8a5a2a] hover:underline">Remove</button></div><p className="mt-1 text-[10px] leading-4 text-[#52716c]">Nothing is deducted yet — the wallet is charged only when you book this order.</p>{walletConfirmed.holdExpiresAt ? <WalletCountdown expiresAt={walletConfirmed.holdExpiresAt} /> : null}</div>
          : walletBalance && walletBalance.balancePaise > 0 ? <div className="mt-3 rounded-lg border border-[#263f44]/10 bg-white p-2.5">
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-[#52716c]">Wallet balance: <strong className="text-[#1d4e49]">₹{(walletBalance.balancePaise / 100).toFixed(2)}</strong></span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-bold text-[#39786f]"><input type="checkbox" checked={walletEnabled} disabled={items.length === 0 || createWalletRequest.isPending} onChange={(event) => toggleWallet(event.target.checked)} className="h-3.5 w-3.5 accent-[#39786f]" />Use wallet</label>
            </div>
            {items.length === 0 && walletEnabled === false ? <p className="mt-1 text-[10px] text-[#8a959a]">Add an item first — the amount is capped by the order total.</p> : null}
            {createWalletRequest.isPending ? <p className="mt-2 text-[11px] text-[#52716c]">Sending a request to {customer.name}'s app…</p> : null}
            {walletRequest ? <div className="mt-2 space-y-1.5">
              <p className="text-[11px] leading-4 text-[#52716c]">₹{(walletProposedPaise / 100).toFixed(2)} requested — ask {customer.name} to open their LNDRY App Wallet and read out the code shown there.</p>
              <div className="flex items-center gap-1.5"><input value={walletOtp} onChange={(event) => setWalletOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" maxLength={6} className="h-9 w-28 rounded-lg border border-[#263f44]/15 px-2.5 text-sm outline-none focus:border-[#438b82]" /><button type="button" disabled={walletOtp.length < 4 || confirmWalletRequest.isPending} onClick={() => confirmWalletRequest.mutate()} className="rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{confirmWalletRequest.isPending ? 'Checking…' : 'Confirm'}</button><button type="button" onClick={() => cancelWalletRequest.mutate()} disabled={cancelWalletRequest.isPending} className="rounded-lg border border-[#263f44]/15 px-2.5 py-2 text-xs font-semibold text-[#617178]">Cancel</button></div>
              <WalletCountdown expiresAt={walletRequest.expiresAt} />
            </div> : null}
            {walletError ? <p role="alert" className="mt-2 text-[11px] text-rose-700">{walletError}</p> : null}
          </div> : walletNote}
          </div> : <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8d90]" /><input aria-label="Search customers by name or phone" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search name or phone" className="h-10 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] pl-9 pr-3 text-sm outline-none transition focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /></div>{canCreateCustomer ? <button type="button" onClick={openNewCustomerDialog} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#39786f]/25 bg-[#f2f9f7] px-3 text-xs font-bold text-[#2d6b63] hover:bg-[#eaf3ef]"><UserPlus className="h-4 w-4" />Add new customer</button> : null}</div>
          {customerSearch.trim().length < 2 ? <p className="mt-2 text-[11px] text-[#74848a]">Type at least 2 letters or digits to search this store.</p> : customerQuery.isLoading ? <p role="status" className="mt-2 rounded-lg bg-[#f4f6f2] px-3 py-2 text-xs text-[#617178]">Searching this store’s customers…</p> : customerQuery.isError ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Customer search failed. Check the connection and try again.</p> : customerQuery.data?.length ? <div aria-label="Customer matches" className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[#263f44]/10 p-1">{customerQuery.data.map((result) => <button type="button" key={result.id} onClick={() => { setCustomer(result); setNewCustomerName(''); setNewCustomerPhone(''); setDeliveryAddress((current) => current.trim() ? current : result.address || ''); setCustomerSearch('') }} className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-[#edf5f1]"><span className="block text-sm font-medium">{result.name}</span><span className="text-xs text-[#718087]">{result.phone}</span></button>)}</div> : <p className="mt-2 rounded-lg border border-dashed border-[#263f44]/15 px-3 py-2 text-xs text-[#617178]">No saved customer matches “{customerSearch.trim()}”. You can add a new customer profile.</p>}
          {remoteMatch && <button type="button" disabled={adoptRemoteCustomer.isPending} onClick={() => adoptRemoteCustomer.mutate(remoteMatch)} className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-[#438b82]/40 bg-[#f2f9f7] px-3 py-2.5 text-left disabled:opacity-60"><span><span className="block text-sm font-medium text-[#1d4e49]">{remoteMatch.name || 'LNDRY App customer'}</span><span className="text-xs text-[#52716c]">{remoteMatch.phone} · has a real LNDRY App account, not yet saved here</span></span><span className="shrink-0 rounded-full bg-[#438b82] px-2.5 py-1 text-[10px] font-bold text-white">{adoptRemoteCustomer.isPending ? 'Linking…' : 'Use this customer'}</span></button>}
          {!customer && (newCustomerName.trim() || newCustomerPhone.trim()) ? <div role="status" className="mt-3 rounded-lg border border-[#d7c38e]/60 bg-[#fff8e8] p-2.5 text-[11px] leading-4 text-[#704f19]">This older draft has unsaved customer details. Review and save them as a customer profile before booking.<button type="button" onClick={openNewCustomerDialog} className="ml-1 font-bold underline">Review details</button></div> : null}
        </>}</div>
        <div className="rounded-xl border border-dashed border-[#263f44]/15 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#648077]">Fulfilment</p><div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Fulfilment type">{(['Pickup Order', 'Home Delivery', 'Express Delivery'] as const).map((mode) => <button type="button" key={mode} aria-pressed={deliveryMode === mode} onClick={() => changeDeliveryMode(mode)} className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-center text-[11px] font-bold transition', deliveryMode === mode ? 'bg-[#664cf0] text-white shadow-[0_8px_18px_rgba(102,76,240,.2)]' : 'bg-[#f5f5f8] text-[#526368] hover:bg-[#eeeaff]')}><Truck className="h-4 w-4" /><span>{mode.replace(' Order', '').replace(' Delivery', '')}</span></button>)}</div>
          <label className="mt-3 block text-xs font-semibold text-[#617178]">Expected delivery<input type="date" value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-2 text-sm outline-none focus:border-[#664cf0]" /></label></div>
        <div className="rounded-xl border border-dashed border-[#263f44]/15 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#648077]">Route details</p><div className="space-y-2"><label className="block text-xs font-semibold text-[#617178]">Service zone<input value={serviceZone} onChange={(event) => setServiceZone(event.target.value.slice(0, 120))} placeholder="e.g. North • Downtown" className="mt-1.5 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm outline-none focus:border-[#664cf0]" /></label><label className="block text-xs font-semibold text-[#617178]">Pickup / delivery address<input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Address for pickup / delivery" className="mt-1.5 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#664cf0]" /></label></div></div></div>
      </section>

      <section className="xl:col-span-2 rounded-[22px] border border-[#263f44]/10 bg-white px-4 py-3 shadow-[0_8px_28px_rgba(37,48,43,.04)]">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Care service"><span className="mr-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#4d8982]">Care service</span><button type="button" aria-pressed={service === 'all'} onClick={() => setService('all')} className={cn('inline-flex h-12 items-center gap-2 rounded-2xl border px-3 text-left transition', service === 'all' ? 'border-[#664cf0] bg-[#f0edff] text-[#241a45] shadow-[0_8px_18px_rgba(102,76,240,.12)]' : 'border-[#263f44]/10 bg-[#fbfbf9] text-[#526368] hover:border-[#b6a8ff]')}><span className={cn('grid h-8 w-8 place-items-center rounded-xl', service === 'all' ? 'bg-[#241a45] text-white' : 'bg-[#e3ddff] text-[#664cf0]')}><PackagePlus className="h-4 w-4" /></span><span className="text-xs font-bold">All services</span></button>{(catalogue?.services || []).filter((item) => item.active !== false).map((item) => <button type="button" key={item.id} aria-pressed={service === item.id} onClick={() => setService(item.id)} className={cn('inline-flex h-12 items-center gap-2 rounded-2xl border px-2.5 text-left transition', service === item.id ? 'border-[#664cf0] bg-[#f0edff] text-[#241a45] shadow-[0_8px_18px_rgba(102,76,240,.12)]' : 'border-[#263f44]/10 bg-[#fbfbf9] text-[#526368] hover:border-[#b6a8ff]')}><ServiceVisual name={item.name} compact /><span className="max-w-28 truncate text-xs font-bold">{item.name}</span></button>)}</div>
      </section>

      <section className="min-w-0 rounded-[22px] border border-[#263f44]/10 bg-white p-4 shadow-[0_8px_28px_rgba(37,48,43,.04)] md:p-5">
        <div className="border-b border-[#263f44]/10 pb-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#4d8982]">2 · Garments</p><p className="mt-1 font-display text-xl font-semibold text-[#17353c]">Add what arrived.</p><p className="mt-1 text-xs text-[#74848a]">Visual cards make each article recognisable at a glance.</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f0edff] text-[#664cf0]"><Shirt className="h-5 w-5" /></span></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')} className={cn('inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition', category === 'all' ? 'border-[#664cf0] bg-[#664cf0] text-white shadow-[0_8px_18px_rgba(102,76,240,.18)]' : 'border-[#263f44]/10 bg-[#fbfbf9] text-[#526368] hover:border-[#b6a8ff]')}><CategoryVisual name="All" />All categories</button>{(catalogue?.categories || []).filter((item) => item.active !== false).map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={cn('inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition', category === item.id ? 'border-[#664cf0] bg-[#664cf0] text-white shadow-[0_8px_18px_rgba(102,76,240,.18)]' : 'border-[#263f44]/10 bg-[#fbfbf9] text-[#526368] hover:border-[#b6a8ff]')}><CategoryVisual name={item.name} />{item.parentId ? `${catalogue?.categories.find((parent) => parent.id === item.parentId)?.name || ''} › ${item.name}` : item.name}</button>)}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8d90]" /><input value={garmentSearch} onChange={(event) => setGarmentSearch(event.target.value)} placeholder="Search garment, category or service" aria-label="Search garments, categories or services" className="h-11 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] pl-9 pr-3 text-sm outline-none focus:border-[#664cf0]" /></div><div className="flex shrink-0 gap-2">{canManageCatalogue ? <button type="button" onClick={() => { quickAddGarment.reset(); setQuickAddNotice(''); setShowQuickAddGarment(true) }} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#39786f] px-3 text-xs font-bold text-white hover:bg-[#2d6b63]"><Plus className="h-4 w-4" />Quick add garment</button> : null}<button type="button" onClick={() => navigate('/laundry/catalogue')} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#664cf0]/25 bg-[#f5f2ff] px-3 text-xs font-bold text-[#5843bd]">Manage garments & prices</button></div></div></div>
        {quickAddNotice ? <p role="status" className="mt-3 rounded-xl border border-[#39786f]/15 bg-[#f2f9f7] px-3 py-2 text-xs font-semibold text-[#2d6b63]">{quickAddNotice}</p> : null}
        {catalogueQuery.isLoading ? <div className="grid h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#664cf0]" /></div> : catalogueQuery.isError ? <p className="p-8 text-center text-rose-700">The laundry catalogue could not be loaded.</p> : <div className="mt-4 grid max-h-[650px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{visiblePrices.map((price) => { const garment = garmentById.get(price.garment)!; const line = cart[`${price.garment}:${price.service}`]; const visual = garment.photo || garmentVisuals[garment.visual_key as keyof typeof garmentVisuals] || ''; const bulk = !['Piece', 'Pair'].includes(garment.unit); const quantityStep = garment.unit === 'Kilogram' ? 0.1 : garment.unit === 'Square Foot' ? 0.25 : 1; return <article key={price.id} className={cn('group rounded-2xl border p-3 transition', line ? 'border-[#664cf0] bg-[#f4f1ff] shadow-[0_8px_20px_rgba(102,76,240,.1)]' : 'border-[#263f44]/10 bg-[#fcfcfa] hover:border-[#b6a8ff] hover:shadow-[0_8px_20px_rgba(102,76,240,.08)]')}><div className="flex items-start gap-2.5"><span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#f1effb]">{visual ? <img src={visual} alt={`${price.garmentName} visual`} loading="lazy" className="h-full w-full object-contain p-1" /> : <span className="font-display text-base font-bold text-[#664cf0]">{price.garmentName.slice(0, 1)}</span>}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#223b40]">{price.garmentName}</p><p className="mt-1 flex items-center gap-1 truncate text-[11px] text-[#718087]"><ServiceIcon name={price.serviceName} className="h-3.5 w-3.5 shrink-0 text-[#664cf0]" />{garment.categoryName}</p><p className="mt-1.5 text-xs font-semibold text-[#4c756e]">{formatMoney(price.rate)} / {garment.unit.toLowerCase()}</p></div></div><div className="mt-3 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.13em] text-[#829092]">{garment.unit}</span>{line ? bulk ? <label className="flex items-center gap-1 text-[11px] font-semibold text-[#315d57]"><span className="sr-only">Quantity for {price.garmentName}</span><input type="number" min={quantityStep} step={quantityStep} value={line.qty} onChange={(event) => setLineQuantity(price.garment, price.service, event.target.value)} className="h-8 w-20 rounded-lg border border-[#664cf0]/25 bg-white px-2 text-right text-sm font-bold tabular-nums outline-none focus:border-[#664cf0]" aria-label={`Quantity of ${price.garmentName}`} /><span>{garment.unit}</span></label> : <div className="flex items-center gap-1 rounded-lg bg-white p-0.5 shadow-sm"><button onClick={() => adjustLine(price.garment, price.service, -1)} className="grid h-7 w-7 place-items-center rounded-md text-[#5d7274] hover:bg-[#eeeaff]" aria-label={`Decrease ${price.garmentName}`}><Minus className="h-3.5 w-3.5" /></button><span className="w-6 text-center text-sm font-bold tabular-nums">{line.qty}</span><button onClick={() => adjustLine(price.garment, price.service, 1)} className="grid h-7 w-7 place-items-center rounded-md bg-[#664cf0] text-white" aria-label={`Increase ${price.garmentName}`}><Plus className="h-3.5 w-3.5" /></button></div> : <button onClick={() => adjustLine(price.garment, price.service, 1)} className="rounded-lg bg-[#2d1f59] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#664cf0]">Add</button>}</div></article> })}{visiblePrices.length === 0 && <p className="col-span-full py-14 text-center text-sm text-[#718087]">No active price rules match these filters.</p>}</div>}
      </section>

      <OrderReviewPanel
        quote={quoteQuery.data}
        cart={cart}
        onClearSelection={() => { setCart({}); clearWalletRedemption() }}
        onRemoveLine={(garment, serviceId) => adjustLine(garment, serviceId, -100000)}
        onUpdateLine={setLineAttributes}
        hasBulkItems={hasBulkItems}
        containerCount={containerCount}
        setContainerCount={setContainerCount}
        catalogue={catalogue}
        chargeRuleIds={chargeRuleIds}
        discountRuleIds={discountRuleIds}
        taxRuleId={taxRuleId}
        taxRate={taxRate}
        gstEnabled={printSettings.data?.taxMode === 'gst'}
        onChargeChange={(value) => { setChargeRuleIds(value); setChargeRuleSelectionTouched(true) }}
        onDiscountChange={setDiscountRuleIds}
        onTaxChange={(value) => { if (value === '__gst18__') { setTaxRuleId(''); setTaxRate(18) } else { setTaxRuleId(value); setTaxRate(0) } }}
        charges={charges}
        discounts={discounts}
        setCharges={setCharges}
        setDiscounts={setDiscounts}
        customChargeEnabled={customChargeEnabled}
        customChargeValue={customChargeValue}
        setCustomChargeEnabled={setCustomChargeEnabled}
        setCustomChargeValue={setCustomChargeValue}
        customDiscountType={customDiscountType}
        customDiscountValue={customDiscountValue}
        setCustomDiscountType={setCustomDiscountType}
        setCustomDiscountValue={setCustomDiscountValue}
        paymentMode={paymentMode}
        setPaymentMode={setPaymentMode}
        cashShifts={cashShifts.data || []}
        cashRegister={cashRegister}
        setCashRegister={setCashRegister}
        paymentReference={paymentReference}
        setPaymentReference={setPaymentReference}
        isEditing={isEditing}
        walletConfirmed={walletConfirmed}
        orderTrayTab={orderTrayTab}
        setOrderTrayTab={setOrderTrayTab}
        notes={notes}
        setNotes={setNotes}
        photoPath={photoPath}
        setPhotoPath={setPhotoPath}
        photoError={photoError}
        setPhotoError={setPhotoError}
        paymentLinkPending={preparePaymentLink.isPending}
        paymentLinkIntent={preparePaymentLink.data?.intent || ''}
        paymentLinkError={preparePaymentLink.isError}
        onPreparePaymentLink={() => preparePaymentLink.mutate()}
        bookingError={booking.isError || saveControlledEdit.isError ? (commitError instanceof Error ? commitError.message : isEditing ? 'The order could not be amended.' : 'The order could not be booked.') : ''}
        canCommit={Boolean(canCommit)}
        bookingPending={booking.isPending || saveControlledEdit.isPending}
        onBook={commitOrder}
      />
    </div>
    {showNewCustomer && <NewCustomerDialog draft={newCustomerDraft} setDraft={setNewCustomerDraft} pending={createCustomer.isPending} canSave={canSaveNewCustomer} supportsExtendedFields={!isWebOnly} error={createCustomer.error ? operatorErrorMessage(createCustomer.error, 'Could not save this customer. Check the details and try again.') : ''} onCancel={closeNewCustomerDialog} onSubmit={submitNewCustomer} />}
    {showQuickAddGarment && canManageCatalogue && catalogue ? <QuickAddGarmentDialog catalogue={catalogue} pending={quickAddGarment.isPending} error={quickAddGarment.error instanceof Error ? quickAddGarment.error.message : ''} onCancel={() => { if (!quickAddGarment.isPending) { setShowQuickAddGarment(false); quickAddGarment.reset() } }} onSubmit={(input) => quickAddGarment.mutate(input)} /> : null}
    {receipt && <ReceiptDialog result={receipt} onClose={() => setReceipt(null)} />}
  </div>
}

type OrderReviewPanelProps = {
  quote?: LaundryQuote
  cart: Record<string, CartLine>
  onClearSelection: () => void
  onRemoveLine: (garment: string, serviceId: string) => void
  onUpdateLine: (garment: string, serviceId: string, patch: Pick<CartLine, 'color' | 'garmentType' | 'rateOverride'>) => void
  hasBulkItems: boolean
  containerCount: string
  setContainerCount: (value: string) => void
  catalogue?: LaundryCatalogue
  chargeRuleIds: string[]
  discountRuleIds: string[]
  taxRuleId: string
  taxRate: number
  gstEnabled: boolean
  onChargeChange: (value: string[]) => void
  onDiscountChange: (value: string[]) => void
  onTaxChange: (value: string) => void
  charges: number
  discounts: number
  setCharges: (value: number) => void
  setDiscounts: (value: number) => void
  customChargeEnabled: boolean
  customChargeValue: string
  setCustomChargeEnabled: (value: boolean) => void
  setCustomChargeValue: (value: string) => void
  customDiscountType: '' | 'amount' | 'percentage'
  customDiscountValue: string
  setCustomDiscountType: (value: '' | 'amount' | 'percentage') => void
  setCustomDiscountValue: (value: string) => void
  paymentMode: 'Pay Later' | 'Cash' | 'UPI' | 'Card' | 'Bank'
  setPaymentMode: (value: 'Pay Later' | 'Cash' | 'UPI' | 'Card' | 'Bank') => void
  cashShifts: Array<{ id: string; status: string; register: string }>
  cashRegister: string
  setCashRegister: (value: string) => void
  paymentReference: string
  setPaymentReference: (value: string) => void
  isEditing: boolean
  walletConfirmed: { amountPaise: number } | null
  orderTrayTab: 'payment' | 'photos'
  setOrderTrayTab: (value: 'payment' | 'photos') => void
  notes: string
  setNotes: (value: string) => void
  photoPath: string
  setPhotoPath: (value: string) => void
  photoError: string
  setPhotoError: (value: string) => void
  paymentLinkPending: boolean
  paymentLinkIntent: string
  paymentLinkError: boolean
  onPreparePaymentLink: () => void
  bookingError: string
  canCommit: boolean
  bookingPending: boolean
  onBook: () => void
}

function OrderReviewPanel({ quote, cart, onClearSelection, onRemoveLine, onUpdateLine, hasBulkItems, containerCount, setContainerCount, catalogue, chargeRuleIds, discountRuleIds, taxRuleId, taxRate, gstEnabled, onChargeChange, onDiscountChange, onTaxChange, charges, discounts, setCharges, setDiscounts, customChargeEnabled, customChargeValue, setCustomChargeEnabled, setCustomChargeValue, customDiscountType, customDiscountValue, setCustomDiscountType, setCustomDiscountValue, paymentMode, setPaymentMode, cashShifts, cashRegister, setCashRegister, paymentReference, setPaymentReference, isEditing, walletConfirmed, orderTrayTab, setOrderTrayTab, notes, setNotes, photoPath, setPhotoPath, photoError, setPhotoError, paymentLinkPending, paymentLinkIntent, paymentLinkError, onPreparePaymentLink, bookingError, canCommit, bookingPending, onBook }: OrderReviewPanelProps) {
  const [editingLine, setEditingLine] = useState('')
  const isOnlinePayment = paymentMode === 'Card' || paymentMode === 'Bank' || paymentMode === 'UPI'
  const onlineMode = isOnlinePayment ? paymentMode : 'UPI'
  const itemRows = quote?.items || []
  const quantityByUnit = itemRows.reduce<Record<string, number>>((totals, item) => { const unit = item.unit || 'Piece'; totals[unit] = Math.round(((totals[unit] || 0) + item.qty) * 1000) / 1000; return totals }, {})
  const unitLabel = (unit: string) => unit === 'Kilogram' ? 'kg' : unit === 'Square Foot' ? 'sq ft' : unit.toLowerCase()
  const quantitySummary = Object.entries(quantityByUnit).map(([unit, qty]) => `${qty} ${unitLabel(unit)}${['Piece', 'Pair'].includes(unit) && qty !== 1 ? 's' : ''}`).join(' · ')
  const paymentTabs: Array<{ label: string; mode: 'Pay Later' | 'Cash' | 'UPI'; title: string }> = [
    { label: 'Pay Later', mode: 'Pay Later', title: 'Pay Later' },
    { label: 'Cash', mode: 'Cash', title: 'Cash' },
    { label: 'Online', mode: 'UPI', title: 'UPI' },
  ]
  return <section aria-label="Selected order and payment" className="h-fit rounded-[20px] border border-[#263f44]/10 bg-[#fffdf8] p-4 shadow-[0_10px_28px_rgba(37,48,43,.06)] xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
    <header className="flex items-center justify-between gap-3 border-b border-[#263f44]/10 px-1 pb-3">
      <div><p className="font-display text-xl font-semibold tracking-[-.025em] text-[#17353c]">Selected ({itemRows.length})</p><p className="mt-0.5 text-xs text-[#74848a]">{itemRows.length} line{itemRows.length === 1 ? '' : 's'} selected · review quantities and prices.</p></div>
      <button type="button" disabled={!itemRows.length} onClick={onClearSelection} className="rounded-lg px-2 py-1 text-xs font-bold text-[#2563c2] hover:bg-[#edf4ff] disabled:opacity-40">Clear all</button>
    </header>

    <div className="mt-2 overflow-hidden rounded-xl border border-[#263f44]/10 bg-white">
      <div className="grid grid-cols-[minmax(0,1fr)_52px_65px_65px_52px] gap-1 border-b border-[#263f44]/10 bg-[#f7faf9] px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#648077]"><span>Garment</span><span className="text-center">Qty</span><span className="text-right">Price / unit</span><span className="text-right">Total</span><span className="sr-only">Actions</span></div>
      <div className="max-h-72 divide-y divide-[#263f44]/8 overflow-y-auto">
        {itemRows.map((item) => {
          const lineKey = `${item.garment || ''}:${item.service || ''}`
          const line = cart[lineKey]
          const editing = editingLine === lineKey
          return <div key={lineKey || `${item.garmentName}:${item.serviceName}`} className="px-3 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_52px_65px_65px_52px] items-center gap-1"><div className="min-w-0"><p className="truncate text-sm font-extrabold text-[#253d42]">{item.garmentName}</p><p className="truncate text-xs text-[#74848a]">{item.serviceName}</p></div><span className="text-center text-sm font-bold tabular-nums text-[#30484e]">{item.qty}<span className="block text-[10px] font-medium text-[#74848a]">{unitLabel(item.unit || 'Piece')}</span></span><span className="text-right text-sm font-semibold tabular-nums text-[#51666a]">{formatMoney(item.rate)}<span className="block text-[10px] font-medium text-[#74848a]">/ {unitLabel(item.unit || 'Piece')}</span></span><span className="text-right text-sm font-extrabold tabular-nums text-[#17353c]">{formatMoney(item.amount)}</span><span className="flex justify-end gap-0.5"><button type="button" aria-label={`Edit ${item.garmentName}`} title="Edit item details" onClick={() => setEditingLine(editing ? '' : lineKey)} className="grid h-7 w-7 place-items-center rounded-md text-[#39786f] hover:bg-[#eaf3ef]"><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Remove ${item.garmentName}`} title="Remove item" onClick={() => onRemoveLine(item.garment || '', item.service || '')} className="grid h-7 w-7 place-items-center rounded-md text-[#c75a58] hover:bg-[#fff0ef]"><Trash2 className="h-3.5 w-3.5" /></button></span></div>
            {!['Piece', 'Pair'].includes(item.unit || 'Piece') ? <p className="mt-1 text-xs text-[#617178]">{item.qty} {unitLabel(item.unit)} × {formatMoney(item.rate)}/{unitLabel(item.unit)} = {formatMoney(item.amount)}</p> : null}
            {editing ? <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-lg bg-[#f7faf9] p-2"><input value={line?.color || ''} onChange={(event) => onUpdateLine(item.garment || '', item.service || '', { color: event.target.value.slice(0, 40) })} placeholder="Colour" aria-label={`Colour for ${item.garmentName}`} className="h-7 min-w-0 rounded-md border border-[#263f44]/12 bg-white px-1.5 text-[10px] outline-none focus:border-[#2563c2]" /><select value={line?.garmentType || ''} onChange={(event) => onUpdateLine(item.garment || '', item.service || '', { garmentType: event.target.value })} aria-label={`Care type for ${item.garmentName}`} className="h-7 min-w-0 rounded-md border border-[#263f44]/12 bg-white px-1 text-[10px] outline-none focus:border-[#2563c2]"><option value="">Care type</option><option value="Standard">Standard</option><option value="Delicate">Delicate</option><option value="Stain treatment">Stain</option><option value="Other">Other</option></select><label className="relative"><span className="pointer-events-none absolute left-1.5 top-1.5 text-[10px] text-[#718087]">₹</span><input value={line?.rateOverride ?? ''} onChange={(event) => onUpdateLine(item.garment || '', item.service || '', { rateOverride: event.target.value === '' ? undefined : Number(event.target.value) })} type="number" min="0.01" max="1000000" step="0.01" placeholder="Price" aria-label={`Price override for ${item.garmentName}`} className="h-7 w-full rounded-md border border-[#263f44]/12 bg-white pl-4 pr-1 text-[10px] outline-none focus:border-[#2563c2]" /></label></div> : null}
          </div>
        })}
        {!itemRows.length ? <div className="px-4 py-10 text-center"><PackagePlus className="mx-auto h-6 w-6 text-[#7f9dbd]" /><p className="mt-2 text-xs font-bold text-[#3d5870]">Select garments from the catalogue</p><p className="mt-1 text-[10px] leading-4 text-[#74848a]">Your items and totals will appear here.</p></div> : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#263f44]/10 bg-[#fbfcfa] px-3 py-2.5"><span className="text-sm font-bold text-[#526368]">{quantitySummary || 'No items selected'}</span><span className="text-lg font-extrabold tabular-nums text-[#2563c2]">{formatMoney(quote?.subtotal || 0)}</span></div>
    </div>

    {hasBulkItems ? <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#d7c38e]/60 bg-[#fff8e8] px-2.5 py-2"><PackagePlus className="h-4 w-4 shrink-0 text-[#9b6d1d]" /><label className="min-w-0 flex-1 text-[10px] font-bold text-[#704f19]">Bag or container tags<input aria-label="Bag or container count" type="number" min="0" max="500" step="1" inputMode="numeric" value={containerCount} onChange={(event) => setContainerCount(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="0" className="mt-1 h-8 w-full rounded-lg border border-[#c69e4c]/35 bg-white px-2 text-sm font-semibold text-[#17353c] outline-none focus:border-[#9b6d1d]" /></label></div> : null}

    <section aria-label="Charge, discount & GST" className="mt-3 rounded-xl border border-[#263f44]/10 bg-[#f8fafc] p-3">
      <p className="px-1 pb-2 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#526b75]">Charge, discount & GST</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg border border-[#263f44]/10 bg-white p-2.5"><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718087]">Sub total</p><p className="mt-1 text-xl font-extrabold tabular-nums text-[#17353c]">{formatMoney(quote?.subtotal || 0)}</p></div>
        <ChargeSelect rows={catalogue?.chargeRules || []} selected={chargeRuleIds} onRuleChange={onChargeChange} charges={charges} customEnabled={customChargeEnabled} customValue={customChargeValue} setCustomEnabled={setCustomChargeEnabled} setCustomValue={setCustomChargeValue} setCharges={setCharges} />
        <DiscountSelect rows={catalogue?.discountRules || []} selected={discountRuleIds} onRuleChange={onDiscountChange} discounts={discounts} customType={customDiscountType} customValue={customDiscountValue} setCustomType={setCustomDiscountType} setCustomValue={setCustomDiscountValue} setDiscounts={setDiscounts} />
        <TaxSelect taxRuleId={taxRuleId} taxRate={taxRate} gstEnabled={gstEnabled} rows={catalogue?.taxRules || []} onChange={onTaxChange} />
        <div className="rounded-lg border border-[#78b4ec]/55 bg-[#eaf5ff] p-2.5"><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#3973a8]">Grand total</p><p className="mt-1 text-xl font-extrabold tabular-nums text-[#2563c2]">{formatMoney(quote?.grandTotal || 0)}</p></div>
      </div>
      {customChargeEnabled || customDiscountType ? <div className="mt-2 grid gap-2 rounded-lg border border-[#78b4ec]/35 bg-white p-2.5 sm:grid-cols-2">
        {customChargeEnabled ? <div className="rounded-lg bg-[#f7fafc] p-2"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold text-[#344c54]">Custom charge</p><button type="button" aria-label="Remove custom charge" onClick={() => { setCustomChargeEnabled(false); setCustomChargeValue(''); setCharges(0) }} className="grid h-7 w-7 place-items-center rounded-md text-[#60757b] hover:bg-white"><X className="h-3.5 w-3.5" /></button></div><label className="mt-1 block text-[9px] font-bold uppercase tracking-[.1em] text-[#718087]">Charge amount<input aria-label="Custom charge amount" type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={customChargeValue} onChange={(event) => setCustomChargeValue(event.target.value)} placeholder="0" className="mt-1 h-9 w-full rounded-md border border-[#263f44]/12 bg-white px-2 text-sm font-bold text-[#253d42] outline-none focus:border-[#2563c2]" /></label><p className="mt-1 text-[10px] font-bold text-[#2563c2]">Applied {formatMoney(charges)}</p></div> : null}
        {customDiscountType ? <div className="rounded-lg bg-[#f7fafc] p-2"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold text-[#344c54]">Custom discount</p><button type="button" aria-label="Remove custom discount" onClick={() => { setCustomDiscountType(''); setCustomDiscountValue(''); setDiscounts(0) }} className="grid h-7 w-7 place-items-center rounded-md text-[#60757b] hover:bg-white"><X className="h-3.5 w-3.5" /></button></div><div className="mt-1 grid grid-cols-2 gap-1.5"><label className="block text-[9px] font-bold uppercase tracking-[.1em] text-[#718087]">Discount type<select aria-label="Custom discount type" value={customDiscountType} onChange={(event) => setCustomDiscountType(event.target.value as 'amount' | 'percentage')} className="mt-1 h-9 w-full rounded-md border border-[#263f44]/12 bg-white px-1.5 text-xs font-semibold normal-case tracking-normal text-[#253d42] outline-none focus:border-[#2563c2]"><option value="amount">Amount (₹)</option><option value="percentage">Percentage (%)</option></select></label><label className="block text-[9px] font-bold uppercase tracking-[.1em] text-[#718087]">Discount amount<input aria-label="Custom discount amount" type="number" min="0" max={customDiscountType === 'percentage' ? 100 : 1000000} step="0.01" inputMode="decimal" value={customDiscountValue} onChange={(event) => setCustomDiscountValue(event.target.value)} placeholder="0" className="mt-1 h-9 w-full rounded-md border border-[#263f44]/12 bg-white px-2 text-sm font-bold text-[#253d42] outline-none focus:border-[#2563c2]" /></label></div>{customDiscountType === 'percentage' && Number(customDiscountValue) > 100 ? <p role="alert" className="mt-1 text-[10px] font-bold text-rose-700">Enter a percentage between 0 and 100. No discount is applied until it is valid.</p> : null}<p className="mt-1 text-[10px] font-bold text-[#2563c2]">Applied {formatMoney(discounts)}</p></div> : null}
      </div> : null}
      <details className="mt-2 rounded-lg border border-[#263f44]/10 bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[#526368]"><span>Manual adjustments (optional)</span><ChevronDown className="h-4 w-4" /></summary><div className="space-y-1.5 border-t border-[#263f44]/8 px-3 pb-3 pt-2"><MoneyInput label="Additional charge" value={charges} onChange={(value) => { setCharges(value); setCustomChargeEnabled(true); setCustomChargeValue(value ? String(value) : '') }} /><MoneyInput label="Manual discount amount" value={discounts} onChange={(value) => { setDiscounts(value); setCustomDiscountType('amount'); setCustomDiscountValue(value ? String(value) : '') }} /><p className={cn('mt-2 rounded-lg border px-2 py-1.5 text-[10px] leading-4', gstEnabled ? 'border-[#d9cffc] bg-[#f6f3ff] text-[#51437f]' : 'border-[#e6d5a8] bg-[#fff9ed] text-[#765b25]')}>{gstEnabled ? 'Choose GST (18%) or None above.' : 'GST is not enabled for this store.'}</p></div></details>
    </section>

    <div className="mt-3 grid grid-cols-2 rounded-lg bg-[#e7ebf0] p-1"><button type="button" aria-pressed={orderTrayTab === 'payment'} onClick={() => setOrderTrayTab('payment')} className={cn('rounded-lg px-2 py-2 text-sm font-extrabold transition', orderTrayTab === 'payment' ? 'bg-white text-[#2563c2] shadow-sm' : 'text-[#65747d]')}>Payment</button><button type="button" aria-pressed={orderTrayTab === 'photos'} onClick={() => setOrderTrayTab('photos')} className={cn('rounded-lg px-2 py-2 text-sm font-extrabold transition', orderTrayTab === 'photos' ? 'bg-white text-[#2563c2] shadow-sm' : 'text-[#65747d]')}>Order photos & notes</button></div>
    {orderTrayTab === 'photos' ? <div className="mt-2 rounded-xl border border-[#263f44]/10 bg-white p-2.5"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Remarks for this order" aria-label="Order remarks" className="min-h-20 w-full rounded-lg border border-[#263f44]/15 bg-[#fbfbf9] p-2 text-xs outline-none focus:border-[#2563c2]" /><label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#79a59b] bg-[#f5faf6] px-2 py-2 text-[10px] font-semibold text-[#39786f] hover:bg-[#edf6f0]"><ImagePlus className="h-3.5 w-3.5" />{photoPath ? 'Garment photo attached' : 'Attach garment photo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setPhotoError('Choose an image under 1 MB.'); setPhotoPath(''); return } const reader = new FileReader(); reader.onload = () => { setPhotoPath(String(reader.result || '')); setPhotoError('') }; reader.readAsDataURL(file) }} /></label>{photoError ? <p className="mt-1 text-[10px] text-rose-700">{photoError}</p> : null}</div> : <div className="mt-2"><div className="grid grid-cols-3 gap-1.5">{paymentTabs.map((tab) => <button key={tab.label} type="button" title={tab.title} aria-pressed={tab.mode === 'UPI' ? isOnlinePayment : paymentMode === tab.mode} onClick={() => setPaymentMode(tab.mode)} className={cn('rounded-xl border px-2 py-2.5 text-sm font-extrabold transition', (tab.mode === 'UPI' ? isOnlinePayment : paymentMode === tab.mode) ? tab.mode === 'UPI' ? 'border-[#e2a61b] bg-[#fff2bf] text-[#865300] shadow-[0_0_0_1px_rgba(226,166,27,.18)]' : 'border-[#87baf2] bg-[#eaf5ff] text-[#1f5fb7] shadow-[0_0_0_1px_rgba(37,99,194,.10)]' : tab.mode === 'Cash' ? 'border-[#9ddfbb] bg-[#effcf3] text-[#26814e]' : tab.mode === 'UPI' ? 'border-[#efd37c] bg-[#fffaf0] text-[#956a0c] hover:bg-[#fff4cf]' : 'border-[#d9dfe4] bg-white text-[#526368] hover:bg-[#f7fafc]')}>{tab.label}</button>)}</div>{!isEditing && paymentMode !== 'Pay Later' ? <><label className="mt-2 block text-[10px] font-semibold text-[#617178]">{paymentMode === 'Cash' ? 'Cash register' : 'Online payment method'}<select aria-label={paymentMode === 'Cash' ? 'Cash register' : 'Online payment method'} value={paymentMode === 'Cash' ? cashRegister : onlineMode} onChange={(event) => paymentMode === 'Cash' ? setCashRegister(event.target.value) : setPaymentMode(event.target.value as 'UPI' | 'Card' | 'Bank')} className="mt-1 h-8 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 text-[10px] outline-none focus:border-[#2563c2]">{paymentMode === 'Cash' ? <><option value="">{cashShifts.filter((shift) => shift.status === 'Open').length === 1 ? 'Main / only open register' : 'No register open — ask the manager to open one in Cash closing'}</option>{cashShifts.filter((shift) => shift.status === 'Open').map((shift) => <option key={shift.id} value={shift.register}>{shift.register}</option>)}</> : <><option value="UPI">UPI</option><option value="Card">Card</option><option value="Bank">Bank transfer</option></>}</select></label><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Payment reference (optional)" className="mt-2 h-8 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 text-[10px] outline-none focus:border-[#2563c2]" /></> : null}{!isEditing && isOnlinePayment && onlineMode === 'UPI' && (quote?.grandTotal || 0) > 0 ? <div className="mt-2 rounded-lg border border-[#6e9c93]/30 bg-[#f2f9f7] p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-[#315d57]">Payment link</span><button type="button" disabled={paymentLinkPending} onClick={onPreparePaymentLink} className="rounded-md border border-[#39786f]/25 bg-white px-2 py-1 text-[10px] font-bold text-[#39786f] disabled:opacity-60">{paymentLinkPending ? 'Preparing…' : 'Prepare UPI link'}</button></div>{paymentLinkIntent ? <div className="mt-2"><p className="break-all text-[10px] leading-4 text-[#526e69]">{paymentLinkIntent}</p><button type="button" onClick={() => void navigator.clipboard?.writeText(paymentLinkIntent)} className="mt-1 text-[10px] font-bold text-[#39786f] underline">Copy link</button><p className="mt-1 text-[10px] leading-4 text-[#718087]">Preparing or copying does not mark the order paid. Confirm the payment before booking.</p></div> : null}{paymentLinkError ? <p role="alert" className="mt-2 text-[10px] text-rose-700">The payment link could not be prepared.</p> : null}</div> : null}</div>}
    {walletConfirmed ? <div className="mt-2 flex justify-between rounded-lg border border-[#438b82]/25 bg-[#f2f9f7] px-2.5 py-2 text-[10px] font-semibold text-[#315d57]"><span>LNDRY Wallet reserved</span><span>−{formatMoney(walletConfirmed.amountPaise / 100)}</span></div> : null}
    {walletConfirmed && paymentMode === 'Pay Later' ? <div className="mt-2 flex justify-between rounded-lg border border-[#d9dfe4] bg-white px-3 py-2 text-sm font-bold text-[#315d57]"><span>Due via Pay Later</span><span>{formatMoney(Math.max(0, (quote?.grandTotal || 0) - walletConfirmed.amountPaise / 100))}</span></div> : null}
    {bookingError ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{bookingError}</p> : null}
    <button title="Shortcut: Ctrl/Cmd+Enter" disabled={!canCommit} onClick={onBook} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563c2] text-base font-extrabold text-white shadow-[0_8px_16px_rgba(37,99,194,.22)] transition hover:bg-[#1e539f] disabled:cursor-not-allowed disabled:bg-[#a8b7b2]">{bookingPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}{bookingPending ? (isEditing ? 'Saving amendment…' : 'Booking order…') : (isEditing ? 'Save replacement invoice' : 'Book order')}</button>
  </section>
}

function ChargeSelect({ rows, selected, onRuleChange, charges, customEnabled, customValue, setCustomEnabled, setCustomValue, setCharges }: { rows: Array<{ id: string; name: string; type: 'Flat' | 'Percentage'; amount: number; expressCharge?: boolean }>; selected: string[]; onRuleChange: (value: string[]) => void; charges: number; customEnabled: boolean; customValue: string; setCustomEnabled: (value: boolean) => void; setCustomValue: (value: string) => void; setCharges: (value: number) => void }) {
  const selectedValue = customEnabled ? '__custom__' : selected.length === 1 ? selected[0] : selected.length > 1 ? '__multiple__' : ''
  const selectedRuleIsUnavailable = selected.length === 1 && !rows.some((rule) => rule.id === selected[0])
  return <label className="block min-w-0 rounded-lg border border-[#263f44]/10 bg-white p-2.5 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718087]">Charge<select aria-label="Charge" value={selectedValue} onChange={(event) => { const value = event.target.value; if (value === '__custom__') { onRuleChange([]); setCustomEnabled(true); setCustomValue(charges ? String(charges) : ''); return } if (!value) { onRuleChange([]); setCustomEnabled(false); setCustomValue(''); setCharges(0); return } onRuleChange([value]); setCustomEnabled(false); setCustomValue(''); setCharges(0) }} className="mt-1 h-9 w-full min-w-0 rounded-md border border-[#263f44]/12 bg-[#fbfcfe] px-1.5 text-xs font-semibold normal-case tracking-normal text-[#253d42] outline-none focus:border-[#2563c2]"><option value="">None</option><option value="__custom__">Other charges · custom amount</option>{selected.length > 1 ? <option value="__multiple__" disabled>{selected.length} saved rules · choose one to replace</option> : null}{selectedRuleIsUnavailable ? <option value={selected[0]} disabled>Saved rule is unavailable · choose another</option> : null}{rows.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} · {rule.expressCharge ? 'Express charge · ' : ''}{rule.type === 'Percentage' ? `Percentage · ${rule.amount}%` : `Amount · ${formatMoney(rule.amount)}`}</option>)}</select>{rows.length === 0 ? <span className="mt-1 block text-[9px] font-normal normal-case leading-3 tracking-normal text-[#718087]">Use a custom amount or add a saved option.</span> : null}</label>
}

function DiscountSelect({ rows, selected, onRuleChange, discounts, customType, customValue, setCustomType, setCustomValue, setDiscounts }: { rows: Array<{ id: string; name: string; type: 'Flat' | 'Percentage'; amount: number }>; selected: string[]; onRuleChange: (value: string[]) => void; discounts: number; customType: '' | 'amount' | 'percentage'; customValue: string; setCustomType: (value: '' | 'amount' | 'percentage') => void; setCustomValue: (value: string) => void; setDiscounts: (value: number) => void }) {
  const selectedValue = customType ? '__custom__' : selected.length === 1 ? selected[0] : selected.length > 1 ? '__multiple__' : ''
  const selectedRuleIsUnavailable = selected.length === 1 && !rows.some((rule) => rule.id === selected[0])
  return <label className="block min-w-0 rounded-lg border border-[#263f44]/10 bg-white p-2.5 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718087]">Discount<select aria-label="Discount" value={selectedValue} onChange={(event) => { const value = event.target.value; if (value === '__custom__') { onRuleChange([]); setCustomType('amount'); setCustomValue(discounts ? String(discounts) : ''); return } if (!value) { onRuleChange([]); setCustomType(''); setCustomValue(''); setDiscounts(0); return } onRuleChange([value]); setCustomType(''); setCustomValue(''); setDiscounts(0) }} className="mt-1 h-9 w-full min-w-0 rounded-md border border-[#263f44]/12 bg-[#fbfcfe] px-1.5 text-xs font-semibold normal-case tracking-normal text-[#253d42] outline-none focus:border-[#2563c2]"><option value="">None</option><option value="__custom__">Other discount · custom amount or %</option>{selected.length > 1 ? <option value="__multiple__" disabled>{selected.length} saved rules · choose one to replace</option> : null}{selectedRuleIsUnavailable ? <option value={selected[0]} disabled>Saved rule is unavailable · choose another</option> : null}{rows.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} · {rule.type === 'Percentage' ? `Percentage · ${rule.amount}%` : `Amount · ${formatMoney(rule.amount)}`}</option>)}</select>{rows.length === 0 ? <span className="mt-1 block text-[9px] font-normal normal-case leading-3 tracking-normal text-[#718087]">Use a custom amount or add a saved option.</span> : null}</label>
}

function TaxSelect({ taxRuleId, taxRate, gstEnabled, rows, onChange }: { taxRuleId: string; taxRate: number; gstEnabled: boolean; rows: LaundryCatalogue['taxRules']; onChange: (value: string) => void }) {
  const standard = rows.find((rule) => rule.rate === 18 && /laundry|9997/i.test(rule.name))
  const selectedSaved = rows.find((rule) => rule.id === taxRuleId)
  const savedRate = !taxRuleId && taxRate > 0 && !(gstEnabled && taxRate === 18)
  const value = taxRuleId || (taxRate === 18 && gstEnabled ? standard?.id || '__gst18__' : savedRate ? '__saved_legacy_rate__' : '')
  const unavailable = Boolean(taxRuleId) && (!selectedSaved || selectedSaved.rate !== 18 || !gstEnabled)
  return <label className="col-span-2 block min-w-0 rounded-lg border border-[#263f44]/10 bg-white p-2.5 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718087] sm:col-span-1">GST<select aria-label="GST" value={value} onChange={(event) => { if (event.target.value !== '__saved_legacy_rate__') onChange(event.target.value) }} className="mt-1 h-9 w-full min-w-0 rounded-md border border-[#263f44]/12 bg-[#fbfcfe] px-1.5 text-xs font-semibold normal-case tracking-normal text-[#253d42] outline-none focus:border-[#2563c2]"><option value="">None</option>{gstEnabled ? <option value={standard?.id || '__gst18__'}>GST (18%)</option> : null}{unavailable ? <option value={taxRuleId} disabled>{selectedSaved ? `Saved GST rate · ${selectedSaved.rate}%` : 'Saved GST option unavailable'}</option> : null}{savedRate ? <option value="__saved_legacy_rate__" disabled>Saved GST rate · {taxRate}% · choose a supported option</option> : null}</select>{!gstEnabled ? <span className="mt-1 block text-[9px] normal-case tracking-normal text-[#8b7448]">GST is not enabled for this store. The owner turns it on in Settings → Store profile → “Allow tax” (then GST 18% is applied automatically to new orders). Staff cannot change it here.</span> : null}</label>
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }> }) { return <label className="relative block"><select aria-label="Filter catalogue" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] px-3 pr-8 text-sm outline-none focus:border-[#438b82]"><>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</></select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-[#718087]" /></label> }
type QuickAddInput = { garment: { name: string; code?: string; category: string; unit: string; hsn?: string; visualKey: string; photo: string }; service: string; rate: number }
function QuickAddGarmentDialog({ catalogue, pending, error, onCancel, onSubmit }: { catalogue: LaundryCatalogue; pending: boolean; error: string; onCancel: () => void; onSubmit: (input: QuickAddInput) => void }) {
  const categories = catalogue.categories.filter((item) => item.active !== false)
  const units = catalogue.serviceUnits.length ? catalogue.serviceUnits : ['Piece']
  const services = catalogue.services.filter((item) => item.active !== false)
  const [form, setForm] = useState(() => {
    const unit = units.includes('Piece') ? 'Piece' : units[0]
    const service = services.find((item) => !item.units?.length || item.units.includes(unit))?.id || ''
    return { name: '', code: '', category: categories[0]?.id || '', unit, hsn: '', service, rate: '', visualKey: 'foldedShirt' }
  })
  const focus = useDialogFocus<HTMLElement, HTMLInputElement>(onCancel)
  const existing = catalogue.garments.find((item) => item.name.trim().toLocaleLowerCase() === form.name.trim().toLocaleLowerCase())
  const existingPrice = existing && catalogue.prices.find((price) => price.garment === existing.id && price.service === form.service && !price.customer)
  const matchingDetails = !existing || (existing.category === form.category && existing.unit === form.unit && (!form.code.trim() || !existing.code || existing.code.toLocaleLowerCase() === form.code.trim().toLocaleLowerCase()))
  const serviceOptions = services.filter((item) => !item.units?.length || item.units.includes(form.unit))
  const rate = Number(form.rate)
  const canSave = form.name.trim().length >= 2 && Boolean(form.category && serviceOptions.some((item) => item.id === form.service)) && Number.isFinite(rate) && rate > 0 && rate <= 1_000_000 && !pending && matchingDetails && (!existingPrice || (existingPrice.active !== false && Number(existingPrice.rate) === rate))
  const duplicateMessage = existing
    ? !matchingDetails ? `A garment named “${existing.name}” already uses ${existing.categoryName} · ${existing.unit}. Match those details to add a new service price.`
      : existingPrice?.active === false ? 'This garment already has a disabled price for this service. Review it in Catalogue before adding another.'
        : existingPrice ? Number(existingPrice.rate) === rate ? 'This garment and service price already exist. Choose a different item or review it in Catalogue.' : 'This garment already has a different price for this service. Review it in Catalogue.'
          : 'This garment already exists. Saving will add the selected service price to that garment.'
    : ''
  function changeUnit(unit: string) {
    const matchingService = services.find((item) => !item.units?.length || item.units.includes(unit))?.id || ''
    setForm((previous) => ({ ...previous, unit, service: matchingService }))
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
    const photo = garmentVisuals[form.visualKey as keyof typeof garmentVisuals]
    onSubmit({ garment: { name: form.name.trim(), code: form.code.trim() || undefined, category: form.category, unit: form.unit, hsn: form.hsn.trim() || undefined, visualKey: form.visualKey, photo }, service: form.service, rate })
  }
  const visualOptions = Object.entries(garmentVisuals)
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#102b33]/55 p-4 backdrop-blur-sm"><section ref={focus.dialogRef} onKeyDown={focus.onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="quick-add-garment-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[24px] bg-[#fffdf8] p-5 shadow-2xl outline-none sm:p-6"><header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Catalogue quick add</p><h2 id="quick-add-garment-title" className="mt-1 font-serif text-2xl text-[#17353c]">Add garment and price</h2><p className="mt-1 text-xs leading-5 text-[#718087]">Choose the item type, service and price so it is ready to select.</p></div><button type="button" aria-label="Close quick add garment" disabled={pending} onClick={onCancel} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#617178] hover:bg-[#f0eee9] disabled:opacity-50"><X className="h-4 w-4" /></button></header><div className="mt-4 rounded-xl border border-[#d7c38e]/60 bg-[#fff8e8] px-3 py-2.5 text-[11px] leading-4 text-[#704f19]">Save adds this item to the store catalogue and this order draft. It does not book an order or take payment. Only users with Catalogue management access can add items.</div>
    {!categories.length || !serviceOptions.length ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">Add an active category and a service that supports this unit in Catalogue before using Quick Add.</p> : null}
    <form onSubmit={submit} className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#526368]">Garment name / type <span className="text-rose-700">*</span><input ref={focus.initialFocusRef} required minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Cotton shirt" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /></label><label className="block text-xs font-semibold text-[#526368]">Garment code <span className="font-normal text-[#889498]">(optional)</span><input maxLength={48} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48) })} placeholder="Auto-generated if blank" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#526368]">Category / classification <span className="text-rose-700">*</span><select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82]">{categories.map((item) => <option key={item.id} value={item.id}>{item.parentId ? `${catalogue.categories.find((parent) => parent.id === item.parentId)?.name || ''} › ${item.name}` : item.name}</option>)}</select></label><label className="block text-xs font-semibold text-[#526368]">Unit <span className="text-rose-700">*</span><select required value={form.unit} onChange={(event) => changeUnit(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82]">{units.map((unit) => <option key={unit} value={unit}>{unit === 'Piece' ? 'Quantity (Piece)' : unit === 'Square Foot' ? 'Sq.Ft' : unit}</option>)}</select></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#526368]">Service <span className="text-rose-700">*</span><select required value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82]">{serviceOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-xs font-semibold text-[#526368]">Price <span className="text-rose-700">*</span><span className="relative mt-1 block"><span className="absolute left-3 top-2.5 text-sm text-[#718087]">₹</span><input required type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} placeholder="0.00" className="h-10 w-full rounded-xl border border-[#263f44]/15 bg-white pl-8 pr-3 text-sm font-normal outline-none focus:border-[#438b82]" /></span></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#526368]">HSN / classification code <span className="font-normal text-[#889498]">(optional)</span><input maxLength={32} value={form.hsn} onChange={(event) => setForm({ ...form, hsn: event.target.value.slice(0, 32) })} placeholder="e.g. 9997" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82]" /></label><label className="block text-xs font-semibold text-[#526368]">Garment icon<select aria-label="Garment icon" value={form.visualKey} onChange={(event) => setForm({ ...form, visualKey: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82]">{visualOptions.map(([key]) => <option key={key} value={key}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())}</option>)}</select></label></div>
      {existing ? <p role="status" className="rounded-xl border border-[#d7c38e]/60 bg-[#fff8e8] px-3 py-2 text-[11px] leading-4 text-[#704f19]">{duplicateMessage}</p> : null}{error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p> : null}
      <footer className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 mt-1 flex flex-col-reverse gap-2 border-t border-[#263f44]/10 bg-[#fffdf8]/95 px-5 py-3 backdrop-blur sm:bottom-[-1.5rem] sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6"><button type="button" disabled={pending} onClick={onCancel} className="rounded-xl border border-[#263f44]/15 bg-white px-4 py-2.5 text-sm font-semibold text-[#526368] disabled:opacity-50">Cancel</button><button type="submit" disabled={!canSave || !categories.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3a7d78] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#a8b7b2]">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}{pending ? 'Saving garment & price…' : 'Save garment & price'}</button></footer></form></section></div>
}
function NewCustomerDialog({ draft, setDraft, pending, canSave, supportsExtendedFields, error, onCancel, onSubmit }: { draft: NewCustomerDraft; setDraft: (draft: NewCustomerDraft) => void; pending: boolean; canSave: boolean; supportsExtendedFields: boolean; error: string; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const digits = draft.phone.replace(/\D/g, '')
  const phoneReady = digits.length >= 6 && digits.length <= 15
  const focus = useDialogFocus<HTMLElement, HTMLInputElement>(onCancel)
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#102b33]/55 p-4 backdrop-blur-sm"><section ref={focus.dialogRef} onKeyDown={focus.onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="new-customer-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[24px] bg-[#fffdf8] p-5 shadow-2xl outline-none sm:p-6"><header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Customer profile</p><h2 id="new-customer-title" className="mt-1 font-serif text-2xl text-[#17353c]">Add new customer</h2><p className="mt-1 text-xs leading-5 text-[#718087]">Save the customer first, then continue with this order.</p></div><button type="button" aria-label="Close add customer" disabled={pending} onClick={onCancel} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#617178] hover:bg-[#f0eee9] disabled:opacity-50"><X className="h-4 w-4" /></button></header><div className="mt-4 rounded-xl border border-[#d7c38e]/60 bg-[#fff8e8] px-3 py-2.5 text-[11px] leading-4 text-[#704f19]">Saving makes a customer profile only. It does not book this order or take payment.</div>{!supportsExtendedFields ? <p className="mt-3 rounded-xl border border-[#263f44]/10 bg-[#f4f6f2] px-3 py-2 text-[11px] leading-4 text-[#617178]">This connected workspace currently saves customer name and phone only. Add any delivery address in the order details below.</p> : null}<form onSubmit={onSubmit} className="mt-4 space-y-3"><label className="block text-xs font-semibold text-[#526368]">Customer name <span className="text-rose-700">*</span><input ref={focus.initialFocusRef} required maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Enter customer name" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm outline-none focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /></label><label className="block text-xs font-semibold text-[#526368]">Phone number <span className="text-rose-700">*</span><input required maxLength={24} type="tel" inputMode="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} aria-describedby="new-customer-phone-help" placeholder="Enter phone number" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm outline-none focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /><span id="new-customer-phone-help" className="mt-1 block text-[10px] font-normal text-[#718087]">Use 6 to 15 digits. Spaces and + signs are okay.</span></label>{supportsExtendedFields ? <><label className="block text-xs font-semibold text-[#526368]">Email <span className="font-normal text-[#889498]">(optional)</span><input type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="name@example.com" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /></label><label className="block text-xs font-semibold text-[#526368]">Address <span className="font-normal text-[#889498]">(optional)</span><textarea maxLength={500} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Add a pickup or delivery address" className="mt-1 min-h-20 w-full rounded-xl border border-[#263f44]/15 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#438b82] focus:ring-2 focus:ring-[#b9ded6]" /></label></> : null}{digits.length > 0 && !phoneReady ? <p role="status" className="text-[11px] text-[#8b5c19]">Enter a phone number with 6 to 15 digits to save.</p> : null}{error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}<footer className="flex flex-col-reverse gap-2 border-t border-[#263f44]/10 pt-3 sm:flex-row sm:justify-end"><button type="button" disabled={pending} onClick={onCancel} className="rounded-xl border border-[#263f44]/15 bg-white px-4 py-2.5 text-sm font-semibold text-[#526368] disabled:opacity-50">Cancel</button><button type="submit" disabled={!canSave} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3a7d78] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#a8b7b2]">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}{pending ? 'Saving customer…' : 'Save customer'}</button></footer></form></section></div>
}
function MoneyInput({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) { return <label className="flex items-center justify-between gap-3 text-sm"><span className="text-[#617178]">{label}</span><input aria-label={label} disabled={disabled} type="number" min="0" step="0.01" value={value || ''} onChange={(event) => onChange(Number(event.target.value) || 0)} className="h-8 w-24 rounded-lg border border-[#263f44]/15 bg-white px-2 text-right text-sm font-semibold outline-none focus:border-[#664cf0] disabled:cursor-not-allowed disabled:bg-[#f1eff8] disabled:text-[#7d7598]" /></label> }
/** Live "mm:ss remaining" for a pending wallet redemption request — purely
 * a display timer, the real expiry is enforced server-side on confirm. */
function WalletCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - now)
  const label = remainingMs <= 0 ? 'Expired — cancel and start again' : `Expires in ${String(Math.floor(remainingMs / 60000)).padStart(1, '0')}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0')}`
  return <p className={cn('text-[10px] font-semibold', remainingMs <= 0 ? 'text-rose-700' : 'text-[#8a959a]')}>{label}</p>
}
function ConfiguredRules({ catalogue, chargeRuleIds, discountRuleIds, taxRuleId, taxRate, gstEnabled, onChargeChange, onDiscountChange, onTaxChange }: { catalogue?: LaundryCatalogue; chargeRuleIds: string[]; discountRuleIds: string[]; taxRuleId: string; taxRate: number; gstEnabled: boolean; onChargeChange: (value: string[]) => void; onDiscountChange: (value: string[]) => void; onTaxChange: (value: string) => void }) {
  if (!catalogue) return null
  const standardGstRule = catalogue.taxRules.find((rule) => rule.rate === 18 && /laundry|9997/i.test(rule.name))
  const selectedSavedTax = catalogue.taxRules.find((rule) => rule.id === taxRuleId)
  const selectedLegacyRate = !taxRuleId && taxRate > 0 && !(gstEnabled && taxRate === 18)
  const selectedTaxValue = taxRuleId || (taxRate === 18 && gstEnabled ? standardGstRule?.id || '__gst18__' : selectedLegacyRate ? '__saved_legacy_rate__' : '')
  const selectedTaxUnavailable = Boolean(taxRuleId) && (!selectedSavedTax || selectedSavedTax.rate !== 18 || !gstEnabled)
  const selectedTaxIsOtherSavedRule = Boolean(taxRuleId) && taxRuleId !== standardGstRule?.id
  const unavailableTaxLabel = selectedSavedTax ? 'Saved GST rate · ' + selectedSavedTax.rate + '%' : 'Saved GST option unavailable · choose another'
  return <section className="rounded-xl border border-[#4d8982]/15 bg-[#f4f8f5] p-3">
    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#527a71]">Charge, discount & GST</p>
    <p className="mt-1 text-[11px] leading-4 text-[#718087]">Choose a saved option. The server refreshes the quote before booking.</p>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <RuleSelect label="Charge" rows={catalogue.chargeRules} selected={chargeRuleIds} onChange={onChargeChange} />
      <RuleSelect label="Discount" rows={catalogue.discountRules} selected={discountRuleIds} onChange={onDiscountChange} />
      <label className="block text-xs font-semibold text-[#526368] sm:col-span-2">GST
        <select aria-label="GST" value={selectedTaxValue} onChange={(event) => { if (event.target.value !== '__saved_legacy_rate__') onTaxChange(event.target.value) }} className="mt-1 h-10 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs outline-none focus:border-[#438b82]">
          <option value="">None</option>
          {gstEnabled ? <option value={standardGstRule?.id || '__gst18__'}>GST (18%)</option> : null}
          {selectedTaxUnavailable || selectedTaxIsOtherSavedRule ? <option value={taxRuleId} disabled>{unavailableTaxLabel}</option> : null}
          {selectedLegacyRate ? <option value="__saved_legacy_rate__" disabled>Saved GST rate · {taxRate}% · choose a supported option</option> : null}
        </select>
        {selectedTaxUnavailable || selectedLegacyRate ? <span role="alert" className="mt-1 block text-[10px] font-normal leading-4 text-[#8b5d1d]">Choose GST (18%) or None to review this saved tax choice before booking.</span> : null}
        {!gstEnabled ? <span className="mt-1 block text-[10px] font-normal leading-4 text-[#718087]">GST is not enabled for this store.</span> : null}
      </label>
    </div>
  </section>
}
function RuleSelect({ label, rows, selected, onChange }: { label: string; rows: Array<{ id: string; name: string; type: 'Flat' | 'Percentage'; amount: number; expressCharge?: boolean }>; selected: string[]; onChange: (value: string[]) => void }) {
  const selectedValue = selected.length === 1 ? selected[0] : selected.length > 1 ? '__multiple__' : ''
  const selectedRuleIsUnavailable = selected.length === 1 && !rows.some((rule) => rule.id === selected[0])
  return <label className="block min-w-0 rounded-lg border border-[#263f44]/10 bg-white p-2.5 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#718087]">{label}<select aria-label={label} value={selectedValue} onChange={(event) => onChange(event.target.value ? [event.target.value] : [])} className="mt-1 h-9 w-full min-w-0 rounded-md border border-[#263f44]/12 bg-[#fbfcfe] px-1.5 text-xs font-semibold normal-case tracking-normal text-[#253d42] outline-none focus:border-[#2563c2]"><option value="">None</option>{selected.length > 1 ? <option value="__multiple__" disabled>{selected.length} saved rules · choose one to replace</option> : null}{selectedRuleIsUnavailable ? <option value={selected[0]} disabled>Saved rule is unavailable · choose another</option> : null}{rows.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} · {rule.expressCharge ? 'Express charge · ' : ''}{rule.type === 'Percentage' ? `Percentage · ${rule.amount}%` : `Amount · ${formatMoney(rule.amount)}`}</option>)}</select>{rows.length === 0 ? <span className="mt-1 block text-[9px] font-normal normal-case leading-3 tracking-normal text-[#718087]">No configured options.</span> : null}{selected.length > 1 ? <span className="mt-1 block text-[9px] font-normal normal-case leading-3 tracking-normal text-[#8b7448]">Choose one rule or None.</span> : null}</label>
}
function ReceiptDialog({ result, onClose }: { result: BookingResult; onClose: () => void }) { const receipt = result.receipt; const tags = result.tags || []; const containerTags = result.containerTags || []; const [printNotice, setPrintNotice] = useState(''); async function handlePrint(kind: 'tags' | 'bag-tags' | 'receipt', pdf = false) { setPrintNotice(''); try { const outcome = await printBookingDocuments(result, kind, pdf); setPrintNotice(!outcome.ok ? 'Printing was cancelled or could not be started. No output was recorded as printed.' : !outcome.auditRecorded ? 'The document action completed, but print history could not be saved. Retry from Print Centre if needed.' : pdf ? 'PDF export completed and was recorded in print history.' : 'Print command accepted and recorded in print history. Confirm the physical output at the station.') } catch (error) { setPrintNotice(error instanceof Error ? error.message : 'The document could not be prepared. The order remains saved.') } } return <div className="fixed inset-0 z-50 grid place-items-center bg-[#102b33]/55 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] bg-[#fffdf8] p-5 shadow-2xl"><div className="flex justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Order booked</p><h2 className="mt-1 font-serif text-2xl text-[#17353c]">{receipt.orderNumber}</h2></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#f0eee9]" aria-label="Close receipt"><X className="h-4 w-4" /></button></div><div className="mt-5 rounded-2xl border border-dashed border-[#8daaa0] bg-white p-4"><div className="flex justify-between text-sm"><span>{receipt.customer.name}</span><span>{receipt.customer.phone}</span></div><p className="mt-1 text-xs text-[#718087]">Invoice {receipt.invoiceNumber} · Delivery {receipt.expectedDeliveryDate}</p><div className="mt-4 space-y-2 border-y border-[#263f44]/10 py-3">{receipt.items.map((item) => <div key={`${item.garmentName}:${item.serviceName}`} className="flex justify-between text-sm"><span>{item.garmentName} × {item.qty}</span><span>{formatMoney(item.amount)}</span></div>)}</div><div className="mt-3 flex justify-between font-serif text-xl"><span>Total</span><span>{formatMoney(receipt.grandTotal)}</span></div><p className="mt-2 text-xs text-[#718087]">{receipt.paymentStatus} · {receipt.paymentMode}</p></div><div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#648077]">Garment tags ({tags.length})</p><div className="mt-2 grid grid-cols-2 gap-2">{tags.map((tag) => <div key={tag.tagNumber} className="rounded-xl border border-[#263f44]/10 bg-white p-2.5 text-xs"><p className="font-bold text-[#225861]">{tag.tagNumber} <span className="font-normal text-[#718087]">({tag.sequence} / {tag.total})</span></p><p className="mt-1 font-medium">{tag.garment}</p><p className="text-[#718087]">{tag.service} · Due {tag.expectedDeliveryDate}</p><p className="text-[10px] text-[#91a09f]">Order date {tag.orderDate}</p></div>)}</div>{containerTags.length ? <><p className="mt-5 text-xs font-bold uppercase tracking-[.15em] text-[#648077]">Bag / container tags ({containerTags.length})</p><div className="mt-2 grid grid-cols-2 gap-2">{containerTags.map((tag) => <div key={tag.tagNumber} className="rounded-xl border border-[#d7c38e]/60 bg-[#fff8e8] p-2.5 text-xs"><p className="font-bold text-[#704f19]">{tag.tagNumber} <span className="font-normal text-[#8b7448]">({tag.sequence} / {tag.total})</span></p><p className="mt-1 font-medium">{tag.garment}</p><p className="text-[#8b7448]">{tag.service}</p></div>)}</div></> : null}</div>{printNotice ? <p role="status" className="mt-4 rounded-xl bg-[#eaf3ef] p-3 text-xs font-semibold text-[#2e6a60]">{printNotice}</p> : null}<div className="mt-5 grid gap-2 sm:grid-cols-2"><button disabled={!tags.length} onClick={() => void handlePrint('tags')} className="flex items-center justify-center gap-2 rounded-xl bg-[#123039] py-3 text-xs font-bold text-white disabled:opacity-40"><Printer className="h-4 w-4" />{tags.length ? `Print ${tags.length} garment tags` : 'No garment tags'}</button><button onClick={() => void handlePrint('receipt')} className="flex items-center justify-center gap-2 rounded-xl border border-[#123039]/15 bg-white py-3 text-xs font-bold text-[#17353c]"><Printer className="h-4 w-4" />Print invoice</button><button disabled={!containerTags.length} onClick={() => void handlePrint('bag-tags')} className="flex items-center justify-center gap-2 rounded-xl border border-[#d7c38e] bg-[#fff8e8] py-3 text-xs font-bold text-[#704f19] disabled:opacity-40"><Tag className="h-4 w-4" />{containerTags.length ? `Print ${containerTags.length} bag tags` : 'No bag tags'}</button><button disabled={!tags.length} onClick={() => void handlePrint('tags', true)} className="flex items-center justify-center gap-2 rounded-xl border border-[#123039]/15 bg-white py-3 text-xs font-bold text-[#17353c] disabled:opacity-40"><Download className="h-4 w-4" />Tags PDF</button></div></div></div> }

type PrintActionResult = { ok: boolean; auditRecorded: boolean }

async function printBookingDocuments(result: BookingResult, kind: 'tags' | 'bag-tags' | 'receipt' = 'tags', pdf = false): Promise<PrintActionResult> {
  const settings = await apiGet<PrintSettings>('/laundry/print-settings').catch(() => ({} as PrintSettings))
  const order: PrintOrder = { id: result.order?.id || result.receipt.orderNumber, orderNumber: result.receipt.orderNumber, invoiceNumber: result.receipt.invoiceNumber, customer: result.receipt.customer, expectedDeliveryDate: result.receipt.expectedDeliveryDate, fulfillmentMode: result.receipt.fulfillmentMode, receipt: result.receipt }
  const physicalTags = kind === 'bag-tags' ? result.containerTags || [] : result.tags
  // Label size / printer resolution for this computer's printer (set in the Print Centre) apply here too;
  // a whole batch goes out as one job, label after label in order.
  const outcome = await deliverPrintDocument(kind === 'receipt' ? 'receipt' : 'tags', order, withTagFormatOverride(settings), physicalTags, { pdf, filename: `${result.receipt.orderNumber}-${kind}` }).catch(() => ({ ok: false, evidence: 'The document could not be prepared' }))
  const ok = outcome.ok
  let auditRecorded = false
  try { await apiPost('/laundry/print-jobs', { orderId: result.order?.id || result.receipt.orderNumber, templateId: 'recommended-a4-6', templateVersion: '1', ...(kind === 'bag-tags' ? { containerIds: physicalTags.map((tag) => tag.containerId || tag.tagNumber) } : kind === 'tags' ? { tagIds: physicalTags.map((tag) => tag.tagNumber) } : {}), documentType: kind, requestedCopies: 1, status: ok ? (pdf ? 'Downloaded' : 'Printed') : 'Cancelled', evidence: ok ? (pdf ? 'Electron printToPDF completed' : 'Native print command accepted; physical output not independently verified') : 'Operator cancelled or print command failed' }); auditRecorded = true } catch { /* the booking itself is already committed; the caller reports the missing audit record */ }
  return { ok, auditRecorded }
}
function defaultDeliveryDate() { const date = new Date(); date.setDate(date.getDate() + 2); return localDateKey(date) }
