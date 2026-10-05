import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  CalendarDays,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cloud,
  CircleDollarSign,
  Download,
  ExternalLink,
  Eye,
  Layers3,
  LayoutGrid,
  Loader2,
  List,
  MapPin,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Tag,
  Truck,
  UserCheck,
  UserRound,
  UserX,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost, operatorErrorMessage } from "@/lib/api";
import {
  nextLaundryState,
  stateTone,
  type LaundryCatalogue,
  type LaundryFulfillmentEvent,
  type LaundryOrder,
  type LaundryPaymentSummary,
  type LaundryState,
} from "@/lib/laundry";
import { cn, formatDate, formatINR, formatMoney } from "@/lib/utils";
import { summaryRows } from "@/lib/priceBreakdown";
import OrderItemEditor from "@/components/laundry/OrderItemEditor";
import VisualEmptyState from "@/components/laundry/VisualEmptyState";
import OrderSummaryPage from "@/components/laundry/OrderSummaryPage";
import { OrderStatusDialog, type StatusMove, type StatusOverride } from "@/components/laundry/OrderStatusDialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { canUseUi } from "@/lib/permissions";
import { isWebOnly, sessionFromStoredCloud } from "@/lib/cloudAuth";

const orderStatusFilters = [
  { value: "booked", label: "Booked" },
  { value: "in-process", label: "In Process" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "done", label: "Done" },
  { value: "partially-delivered", label: "Partially Delivered" },
  { value: "pickup-assigned", label: "Pickup Assigned" },
  { value: "pickup-received", label: "Pickup Received" },
  { value: "out-for-delivery", label: "Out for Delivery" },
] as const;
type OrderStatusFilter = (typeof orderStatusFilters)[number]["value"];
type BulkOrderStatusMove = { orders: LaundryOrder[]; next: "Ready" | "Delivered" };

type OrderPage = { items: LaundryOrder[]; total: number; page: number; pageSize: number; totalPages: number };
type OrderFilterOptions = { sources: string[]; reporters: string[] };
type OrderFilters = { phone: string; orderNo: string; customer: string; statuses: OrderStatusFilter[]; source: string; reportedBy: string; from: string; to: string };
function sameStatusSelection(left: OrderStatusFilter[], right: OrderStatusFilter[]) {
  return left.length === right.length && left.every((status) => right.includes(status));
}
function isBulkDeliveryEligible(order: LaundryOrder) {
  return order.state === "Out for Delivery" || (order.state === "Ready" && order.fulfillmentMode === "Pickup Order");
}
function isBulkDoneEligible(order: LaundryOrder) {
  if (order.state !== "In Process") return false;
  const readyUnitStates = new Set(["Racked", "Dispatched", "Delivered"]);
  const readyContainerStates = new Set(["Ready", "Dispatched", "Delivered"]);
  const units = (order.physicalUnits || []).filter((unit) => unit.state !== "Cancelled");
  const containers = (order.containers || []).filter((container) => container.state !== "Cancelled");
  return units.every((unit) => readyUnitStates.has(unit.state)) && containers.every((container) => readyContainerStates.has(container.state));
}
function isBulkSelectable(order: LaundryOrder) {
  return isBulkDoneEligible(order) || isBulkDeliveryEligible(order);
}
type CustomerRecord = { id: string; name: string; phone: string; email: string; address: string; preferredContact?: string; marketingConsent?: boolean };
type OnlineOnlyCustomer = { name: string; phone: string; orderCount: number; lastOrderAt: string };
type CustomerInsight = {
  asOf: string;
  summary: { totalCustomers: number; revenue: number };
  customers: Array<{ customerId: string; orderCount: number; revenue: number; lastOrderDate: string | null; contactEligible: boolean; segment: string }>;
};
type CustomerViewStatus = "all" | "contactable" | "restricted";
type CustomerViewSegment = "all" | "new" | "repeat" | "at_risk" | "lapsed" | "no_orders" | "unknown";
type DashboardQueue = "pending" | "booking" | "delivery" | "delivered" | "pickup-unassigned" | "delivery-due" | "delivery-unassigned" | "express";
const dashboardQueueLabels: Record<DashboardQueue, string> = {
  pending: "Pending orders", booking: "Booking", delivery: "Delivery", delivered: "Delivered",
  "pickup-unassigned": "Pending / unassigned pickup", "delivery-due": "Upcoming delivery",
  "delivery-unassigned": "Unassigned delivery", express: "Express delivery",
};
type CustomerDrawerProfile = {
  customer: CustomerRecord & { notes?: string; servicePreferences?: string };
  metrics: {
    revenue: number;
    orderBalance: number;
    walletBalance: number;
    rewardPoints: number;
    lastVisit: string | null;
    currentPackage: string | null;
  };
  addresses: Array<{ id: string; label: string; line1: string; line2: string; city: string; state: string; postalCode: string; isDefault: boolean; active: boolean }>;
  orders: Array<{ id: string; orderNumber: string; orderDate: string; state: string; grandTotal: number; invoice: string | null; paymentStatus: string; fulfillmentMode?: string; expectedDeliveryDate?: string }>;
  ledger: Array<{ id: string; entryDate: string; entryType: string; debit: number; credit: number; referenceId: string; reason: string }>;
  timeline: Array<{ at: string; type: string; label: string; amount: number; reason: string }>;
};

export default function LaundryOrders() {
  const { id: orderId } = useParams();
  return orderId ? <OrderSummaryPage id={orderId} /> : <StoreOrdersCustomersWorkspace />;
}

function StoreOrdersCustomersWorkspace() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [phoneSuggestionsOpen, setPhoneSuggestionsOpen] = useState(false);
  const [orderNo, setOrderNo] = useState("");
  const [orderCustomer, setOrderCustomer] = useState("");
  const [exportingOrders, setExportingOrders] = useState(false);
  const [orderExportError, setOrderExportError] = useState("");
  const [orderExportNotice, setOrderExportNotice] = useState("");
  const [orderView, setOrderView] = useState<"list" | "grid">("list");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkStatusMove, setBulkStatusMove] = useState<BulkOrderStatusMove | null>(null);
  const [bulkStatusPending, setBulkStatusPending] = useState(false);
  const [bulkStatusError, setBulkStatusError] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter[]>([]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const [source, setSource] = useState("all");
  const [reportedBy, setReportedBy] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedOrderFilters, setAppliedOrderFilters] = useState<OrderFilters>({ phone: "", orderNo: "", customer: "", statuses: [], source: "all", reportedBy: "all", from: "", to: "" });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchParams] = useSearchParams();
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => isWebOnly ? Promise.resolve(sessionFromStoredCloud()) : apiGet<{ user: { roles: string[] } | null }>("/auth/session"),
  });
  const canTransitionOrders = canUseUi(sessionQuery.data?.user?.roles, "orders.transition");
  const [customerStatus, setCustomerStatus] = useState<CustomerViewStatus>("all");
  const [customerSegment, setCustomerSegment] = useState<CustomerViewSegment>("all");
  const [customerSort, setCustomerSort] = useState<"newest" | "spend">("newest");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedHistoryOrderId, setSelectedHistoryOrderId] = useState<string | null>(null);
  const linkedCustomerId = searchParams.get("customer");
  const linkedOrderId = searchParams.get("order");
  const queueParam = searchParams.get("queue");
  const dashboardQueue = queueParam && queueParam in dashboardQueueLabels ? queueParam as DashboardQueue : undefined;
  const view = searchParams.get("view") === "customers" ? "customers" : "orders";
  useEffect(() => setPage(1), [appliedOrderFilters, dashboardQueue]);
  useEffect(() => {
    if (linkedCustomerId) setSelectedCustomerId(linkedCustomerId);
  }, [linkedCustomerId]);
  useEffect(() => {
    if (linkedOrderId) setSelectedOrderId(linkedOrderId);
  }, [linkedOrderId]);
  const filters = new URLSearchParams({
    ...(appliedOrderFilters.phone ? { phone: appliedOrderFilters.phone } : {}),
    ...(appliedOrderFilters.orderNo ? { orderNo: appliedOrderFilters.orderNo } : {}),
    ...(appliedOrderFilters.customer ? { customer: appliedOrderFilters.customer } : {}),
    ...(appliedOrderFilters.statuses.length ? { status: appliedOrderFilters.statuses.join(",") } : {}),
    ...(appliedOrderFilters.source === "all" ? {} : { source: appliedOrderFilters.source }),
    ...(appliedOrderFilters.reportedBy === "all" ? {} : { reportedBy: appliedOrderFilters.reportedBy }),
    ...(dashboardQueue ? { queue: dashboardQueue } : {}),
    ...(appliedOrderFilters.from ? { from: appliedOrderFilters.from } : {}),
    ...(appliedOrderFilters.to ? { to: appliedOrderFilters.to } : {}),
  });
  const orders = useQuery({
    queryKey: ["laundry-orders", appliedOrderFilters, dashboardQueue, page, pageSize],
    queryFn: () =>
      apiGet<OrderPage>(`/laundry/orders?${filters.toString()}&page=${page}&pageSize=${pageSize}`),
    enabled: view === "orders",
  });
  const orderFilterOptions = useQuery({
    queryKey: ["laundry-order-filter-options"],
    queryFn: () => apiGet<OrderFilterOptions>("/laundry/orders/filter-options"),
    enabled: view === "orders",
    staleTime: 60_000,
  });
  useEffect(() => setSelectedOrderIds([]), [appliedOrderFilters, dashboardQueue, page, pageSize]);
  const customers = useQuery({
    queryKey: ["laundry-customers", search],
    queryFn: () => apiGet<CustomerRecord[]>(`/laundry/customers?search=${encodeURIComponent(search)}`),
    enabled: view === "customers",
  });
  const phoneSuggestionTerm = orderPhone.replace(/\D/g, "");
  const phoneSuggestions = useQuery({
    queryKey: ["laundry-order-phone-suggestions", phoneSuggestionTerm],
    queryFn: () => apiGet<CustomerRecord[]>(`/laundry/customers?search=${encodeURIComponent(phoneSuggestionTerm)}`),
    enabled: view === "orders" && phoneSuggestionTerm.length >= 3,
    staleTime: 30_000,
  });
  const customerInsights = useQuery({
    queryKey: ["customer-insights"],
    queryFn: () => apiGet<CustomerInsight>("/laundry/customer-insights"),
    enabled: view === "customers",
    staleTime: 30_000,
  });
  const onlineOnlyCustomers = useQuery({
    queryKey: ["laundry-customers-online-only"],
    queryFn: () => apiGet<OnlineOnlyCustomer[]>("/laundry/customers/online-only"),
    enabled: view === "customers",
    staleTime: 30_000,
  });
  // Every status change: confirm first, then the backend; success is announced only after the backend says so,
  // the row is patched from the backend's own answer, and a refusal stays in the dialog.
  const [statusMove, setStatusMove] = useState<StatusMove | null>(null);
  const [statusNotice, setStatusNotice] = useState("");
  const transition = useMutation({
    mutationFn: ({ move, override }: { move: StatusMove; override?: StatusOverride }) =>
      apiPost<LaundryOrder>(`/laundry/orders/${move.order.id}/transition`, {
        state: move.next,
        expectedVersion: move.order.version,
        ...override,
      }),
    onSuccess: (updated, { move }) => {
      client.setQueriesData<OrderPage>({ queryKey: ["laundry-orders"] }, (page) =>
        page ? { ...page, items: page.items.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) } : page,
      );
      client.invalidateQueries({ queryKey: ["laundry-orders"] });
      client.invalidateQueries({ queryKey: ["laundry-order"] });
      client.invalidateQueries({ queryKey: ["laundry-dashboard"] });
      client.invalidateQueries({ queryKey: ["laundry-dispatch"] });
      setStatusMove(null);
      setStatusNotice(`Order ${updated.orderNumber || move.order.orderNumber} is now ${updated.state}.`);
    },
  });
  function askStatusChange(order: LaundryOrder, next: LaundryState) {
    transition.reset();
    setStatusNotice("");
    setStatusMove({ order, next });
  }
  const rows = orders.data?.items || [];
  const eligibleForDone = rows.filter(isBulkDoneEligible);
  const eligibleForDelivery = rows.filter(isBulkDeliveryEligible);
  const selectedOrders = rows.filter((order) => selectedOrderIds.includes(order.id));
  const selectedForDone = selectedOrders.length > 0 && selectedOrders.every(isBulkDoneEligible);
  const selectedForDelivery = selectedOrders.length > 0 && selectedOrders.every(isBulkDeliveryEligible);
  const activeOrderFilterCount = [appliedOrderFilters.phone, appliedOrderFilters.orderNo, appliedOrderFilters.customer, appliedOrderFilters.statuses.length ? "status" : "", appliedOrderFilters.source === "all" ? "" : appliedOrderFilters.source, appliedOrderFilters.reportedBy === "all" ? "" : appliedOrderFilters.reportedBy, appliedOrderFilters.from, appliedOrderFilters.to, dashboardQueue].filter(Boolean).length;
  const statusFilterSummary = statusFilter.length ? statusFilter.map((value) => orderStatusFilters.find((option) => option.value === value)?.label || value).join(", ") : "All Status";
  const invalidDateRange = Boolean(from && to && from > to);
  const hasUnappliedOrderFilters = orderPhone.trim() !== appliedOrderFilters.phone || orderNo.trim() !== appliedOrderFilters.orderNo || orderCustomer.trim() !== appliedOrderFilters.customer || !sameStatusSelection(statusFilter, appliedOrderFilters.statuses) || source !== appliedOrderFilters.source || reportedBy !== appliedOrderFilters.reportedBy || from !== appliedOrderFilters.from || to !== appliedOrderFilters.to;
  function selectEligibleForDone() {
    setBulkStatusError("");
    setStatusNotice("");
    setSelectedOrderIds(eligibleForDone.map((order) => order.id));
  }
  function selectEligibleForDelivery() {
    setBulkStatusError("");
    setStatusNotice("");
    setSelectedOrderIds(eligibleForDelivery.map((order) => order.id));
  }
  function toggleOrderSelection(id: string) {
    setSelectedOrderIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]);
  }
  function openBulkStatusMove(next: "Ready" | "Delivered") {
    setBulkStatusError("");
    setStatusNotice("");
    setBulkStatusMove({ orders: selectedOrders, next });
  }
  async function confirmBulkStatusMove() {
    if (!bulkStatusMove || bulkStatusPending) return;
    const move = bulkStatusMove;
    setBulkStatusPending(true);
    setBulkStatusError("");
    const outcomes = await Promise.all(move.orders.map(async (order) => {
      try {
        const updated = await apiPost<LaundryOrder>(`/laundry/orders/${order.id}/transition`, { state: move.next, expectedVersion: order.version });
        return { order, updated, ok: true as const };
      } catch (error) {
        return { order, error: error instanceof Error ? error.message : "The status could not be updated.", ok: false as const };
      }
    }));
    const succeeded = outcomes.filter((outcome) => outcome.ok);
    const failed = outcomes.filter((outcome) => !outcome.ok);
    setSelectedOrderIds(failed.map((outcome) => outcome.order.id));
    if (succeeded.length) setStatusNotice(`Moved ${succeeded.length} of ${move.orders.length} selected orders to ${move.next === "Ready" ? "Done (Ready)" : "Delivered"}.`);
    if (failed.length) setBulkStatusError(`${failed.length} order${failed.length === 1 ? "" : "s"} could not be moved. ${failed.slice(0, 4).map((outcome) => `${outcome.order.orderNumber}: ${outcome.error}`).join(" · ")}${failed.length > 4 ? " · Review the remaining selected orders after refresh." : ""}`);
    setBulkStatusMove(null);
    setBulkStatusPending(false);
    client.invalidateQueries({ queryKey: ["laundry-orders"] });
    client.invalidateQueries({ queryKey: ["laundry-dashboard"] });
    client.invalidateQueries({ queryKey: ["laundry-dispatch"] });
  }
  const customerRows = useMemo(() => {
    const metrics = new Map((customerInsights.data?.customers || []).map((entry) => [entry.customerId, entry]));
    const filtered = (customers.data || []).map((customer) => ({ customer, metric: metrics.get(customer.id) })).filter(({ metric }) => {
      if (customerStatus === "contactable") return Boolean(metric?.contactEligible);
      if (customerStatus === "restricted") return !metric?.contactEligible;
      return true;
    }).filter(({ metric }) => customerSegment === "all" || metric?.segment === customerSegment);
    return filtered.sort((a, b) => customerSort === "spend" ? (b.metric?.revenue || 0) - (a.metric?.revenue || 0) : String(b.metric?.lastOrderDate || "").localeCompare(String(a.metric?.lastOrderDate || "")));
  }, [customers.data, customerInsights.data, customerSegment, customerSort, customerStatus]);
  const visiblePhoneSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return (phoneSuggestions.data || []).filter((customer) => {
      const identity = `${customer.id}:${customer.phone}`;
      if (!customer.phone || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).slice(0, 8);
  }, [phoneSuggestions.data]);
  const activeToday = (customerInsights.data?.customers || []).filter((customer) => customer.lastOrderDate === customerInsights.data?.asOf).length;
  const restrictedCustomers = (customerInsights.data?.customers || []).filter((customer) => !customer.contactEligible).length;
  function setView(nextView: "orders" | "customers") {
    const params = new URLSearchParams(searchParams);
    if (nextView === "customers") params.set("view", "customers"); else params.delete("view");
    params.delete("order");
    setSearch("");
    setOrderPhone("");
    setOrderNo("");
    setOrderCustomer("");
    setAppliedOrderFilters((current) => ({ ...current, phone: "", orderNo: "", customer: "" }));
    navigate(`/laundry/orders${params.size ? `?${params.toString()}` : ""}`);
  }
  function closeCustomerDrawer() {
    setSelectedCustomerId(null);
    if (!linkedCustomerId) return;
    const params = new URLSearchParams(searchParams);
    params.delete("customer");
    navigate(`/laundry/orders${params.size ? `?${params.toString()}` : ""}`, { replace: true });
  }
  function openOrderDrawer(id: string) {
    navigate(`/laundry/orders/${encodeURIComponent(id)}`);
  }
  function openOrderHistory(id: string) {
    setSelectedOrderId(null);
    setSelectedCustomerId(null);
    setSelectedHistoryOrderId(id);
  }
  function closeOrderDrawer() {
    setSelectedOrderId(null);
    if (!linkedOrderId) return;
    const params = new URLSearchParams(searchParams);
    params.delete("order");
    navigate(`/laundry/orders${params.size ? `?${params.toString()}` : ""}`, { replace: true });
  }
  function clearDashboardQueue() {
    const params = new URLSearchParams(searchParams);
    params.delete("queue");
    navigate(`/laundry/orders${params.size ? `?${params.toString()}` : ""}`, { replace: true });
  }
  function clearOrderFilters() {
    setOrderPhone("");
    setPhoneSuggestionsOpen(false);
    setOrderNo("");
    setOrderCustomer("");
    setStatusFilter([]);
    setStatusMenuOpen(false);
    setSource("all");
    setReportedBy("all");
    setFrom("");
    setTo("");
    setAppliedOrderFilters({ phone: "", orderNo: "", customer: "", statuses: [], source: "all", reportedBy: "all", from: "", to: "" });
    if (dashboardQueue) clearDashboardQueue();
  }
  function applyOrderFilters() {
    if (invalidDateRange) return;
    const next: OrderFilters = { phone: orderPhone.trim(), orderNo: orderNo.trim(), customer: orderCustomer.trim(), statuses: [...statusFilter], source, reportedBy, from, to };
    setStatusMenuOpen(false);
    setPhoneSuggestionsOpen(false);
    setPage(1);
    setAppliedOrderFilters(next);
    if (!hasUnappliedOrderFilters) void orders.refetch();
  }
  async function exportMatchingOrders() {
    setExportingOrders(true);
    setOrderExportError("");
    setOrderExportNotice("");
    try {
      const matching: LaundryOrder[] = [];
      let requestedPage = 1;
      let totalPages = 1;
      let expectedTotal: number | undefined;
      do {
        const result = await apiGet<OrderPage>(`/laundry/orders?${filters.toString()}&page=${requestedPage}&pageSize=100`);
        if (expectedTotal !== undefined && result.total !== expectedTotal) {
          throw new Error("The matching order list changed during export.");
        }
        expectedTotal = result.total;
        if (result.page !== requestedPage || (result.items.length === 0 && matching.length < expectedTotal)) {
          throw new Error("The order export returned an incomplete page.");
        }
        matching.push(...result.items);
        totalPages = result.totalPages;
        requestedPage += 1;
      } while (requestedPage <= totalPages);

      if (matching.length !== (expectedTotal || 0)) {
        throw new Error("The matching order list changed during export.");
      }
      await exportOrders(matching);
      setOrderExportNotice(`Excel file prepared for ${matching.length} matching orders.`);
    } catch {
      setOrderExportError("Could not export all matching orders. Check the connection and try again.");
    } finally {
      setExportingOrders(false);
    }
  }
  function toggleStatusFilter(status: OrderStatusFilter) {
    setStatusFilter((current) => current.includes(status) ? current.filter((value) => value !== status) : [...current, status]);
  }
  function closeStatusMenu() {
    setStatusMenuOpen(false);
    statusFilterTriggerRef.current?.focus();
  }
  function handleStatusMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeStatusMenu();
  }
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">
            Counter operations
          </p>
          <h1 className="mt-1 font-serif text-3xl text-[#17353c]">
            Store orders & customers
          </h1>
          <p className="mt-1 text-sm text-[#718087]">
            One workspace for bookings and customer records—without splitting the
            operational truth across two menus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => orders.refetch()}
            className="inline-flex items-center gap-2 rounded-xl border border-[#263f44]/15 bg-white px-3 py-2 text-sm font-semibold text-[#315d57]"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-[#263f44]/15 bg-white px-3 py-2 text-sm font-semibold text-[#315d57]"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
          <button
            type="button"
            disabled={view !== "orders" || rows.length === 0 || exportingOrders}
            onClick={() => void exportMatchingOrders()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#123039] px-3 py-2 text-sm font-bold text-white disabled:bg-[#a8b7b2]"
          >
            {exportingOrders ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportingOrders ? "Exporting…" : "Excel"}
          </button>
        </div>
      </div>
      {orderExportError ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{orderExportError}</p> : null}
      {orderExportNotice ? <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{orderExportNotice}</p> : null}
      <div className="mt-5 inline-flex rounded-xl bg-[#ece9f8] p-1" role="tablist" aria-label="Store workspace view">
        <button type="button" role="tab" aria-selected={view === "orders"} onClick={() => setView("orders")} className={cn("rounded-lg px-4 py-2 text-sm font-bold transition", view === "orders" ? "bg-[#241a45] text-white shadow-sm" : "text-[#5f5a72] hover:text-[#241a45]")}>Store orders</button>
        <button type="button" role="tab" aria-selected={view === "customers"} onClick={() => setView("customers")} className={cn("rounded-lg px-4 py-2 text-sm font-bold transition", view === "customers" ? "bg-[#241a45] text-white shadow-sm" : "text-[#5f5a72] hover:text-[#241a45]")}>Customers</button>
      </div>
      {view === "orders" ? <>
        <OrderPulse rows={rows} loading={orders.isLoading} />
        <section className="mt-6 overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">
          <div className="grid gap-3 border-b border-[#263f44]/10 p-4 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto]">
            <label className="relative min-w-0 text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">Phone No
              <input aria-label="Phone No" aria-autocomplete="list" aria-controls="phone-customer-suggestions" aria-expanded={phoneSuggestionsOpen && phoneSuggestionTerm.length >= 3 && visiblePhoneSuggestions.length > 0} type="tel" inputMode="tel" autoComplete="off" value={orderPhone} onFocus={() => setPhoneSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setPhoneSuggestionsOpen(false), 120)} onChange={(event) => { setOrderPhone(event.target.value); setPhoneSuggestionsOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") { setPhoneSuggestionsOpen(false); return; } if (event.key === "Enter") { event.preventDefault(); applyOrderFilters(); } }} placeholder="Enter at least 3 digits" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] px-3 text-sm font-normal normal-case tracking-normal text-[#40565a] outline-none focus:border-[#438b82]" />
              {phoneSuggestionsOpen && phoneSuggestionTerm.length >= 3 ? <div id="phone-customer-suggestions" role="listbox" aria-label="Saved customer suggestions" className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-[#b9dfd8] bg-white p-1 normal-case tracking-normal shadow-[0_14px_32px_rgba(23,53,60,.16)]">
                {phoneSuggestions.isFetching ? <p className="flex items-center gap-2 px-3 py-2 text-xs text-[#617178]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Looking up saved customers…</p> : visiblePhoneSuggestions.length ? <><p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#648077]">Saved customers</p>{visiblePhoneSuggestions.map((customer) => <button key={customer.id} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => { setOrderPhone(customer.phone); setOrderCustomer(customer.name); setPhoneSuggestionsOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#edf7f4] focus:bg-[#edf7f4] focus:outline-none"><span className="min-w-0"><span className="block truncate text-sm font-bold text-[#24444a]">{customer.name || "Unnamed customer"}</span><span className="block text-xs text-[#617178]">{customer.phone}</span></span><UserRound className="h-4 w-4 shrink-0 text-[#4d8982]" /></button>)}</> : <p className="px-3 py-2 text-xs text-[#617178]">No saved customer matches these digits.</p>}
              </div> : null}
            </label>
            <label className="min-w-0 text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">Order No
              <input aria-label="Order No" autoComplete="off" value={orderNo} onChange={(event) => setOrderNo(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyOrderFilters(); } }} placeholder="Enter order number" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] px-3 text-sm font-normal normal-case tracking-normal text-[#40565a] outline-none focus:border-[#438b82]" />
            </label>
            <label className="min-w-0 text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">Customer
              <input aria-label="Customer" autoComplete="off" value={orderCustomer} onChange={(event) => setOrderCustomer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyOrderFilters(); } }} placeholder="Enter customer name" className="mt-1 h-10 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] px-3 text-sm font-normal normal-case tracking-normal text-[#40565a] outline-none focus:border-[#438b82]" />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-expanded={moreFiltersOpen}
                aria-controls="store-order-more-filters"
                onClick={() => { setStatusMenuOpen(false); setMoreFiltersOpen((value) => !value); }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#263f44]/15 bg-white px-3 text-sm font-bold text-[#315d57] hover:bg-[#f1f4f1]"
              >
                <SlidersHorizontal className="h-4 w-4" /> More filters
                {activeOrderFilterCount > 0 ? <span className="rounded-full bg-[#e8bf68] px-1.5 py-0.5 text-[10px] leading-none text-white">{activeOrderFilterCount}</span> : null}
              </button>
              {activeOrderFilterCount > 0 || hasUnappliedOrderFilters ? <button type="button" onClick={clearOrderFilters} className="h-10 rounded-xl px-2.5 text-xs font-bold text-[#4d8982] hover:bg-[#eef5f1]">Clear</button> : null}
            </div>
            <button type="button" onClick={applyOrderFilters} disabled={invalidDateRange} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#241a45] px-4 text-sm font-bold text-white hover:bg-[#352766] disabled:cursor-not-allowed disabled:bg-[#9d98b1]">
              <Search className="h-4 w-4" /> Search
            </button>
          </div>
          {moreFiltersOpen ? <div id="store-order-more-filters" className="grid gap-3 border-b border-[#263f44]/10 bg-[#faf9f5] p-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative min-w-0 text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">
              <span className="block">Status</span>
              <button
                ref={statusFilterTriggerRef}
                type="button"
                aria-label="Select order statuses"
                aria-haspopup="true"
                aria-expanded={statusMenuOpen}
                aria-controls="store-order-status-options"
                title={statusFilterSummary}
                onClick={() => setStatusMenuOpen((open) => !open)}
                onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeStatusMenu(); } }}
                className="mt-1 flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[#263f44]/15 bg-white px-2 text-left text-sm font-normal normal-case tracking-normal text-[#40565a] hover:border-[#438b82] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <span className="min-w-0 truncate">{statusFilterSummary}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#718087]" aria-hidden="true" />
              </button>
              {statusMenuOpen ? <div id="store-order-status-options" role="group" aria-label="Order statuses" onKeyDown={handleStatusMenuKeyDown} className="absolute left-0 top-full z-30 mt-1 w-full min-w-[250px] overflow-hidden rounded-xl border border-[#272043]/12 bg-white text-[#332849] shadow-[0_12px_32px_rgba(32,23,60,.16)]">
                <div className="flex items-center justify-between border-b border-[#272043]/8 px-3 py-2">
                  <span className="text-[11px] font-semibold normal-case tracking-normal text-[#777086]">Choose one or more</span>
                  <button type="button" onClick={() => setStatusFilter([])} className="rounded px-1.5 py-1 text-[11px] font-bold normal-case tracking-normal text-brand-700 hover:bg-brand-50">All Status</button>
                </div>
                <div className="max-h-56 overflow-y-auto p-1.5">
                  {orderStatusFilters.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-xs font-semibold normal-case tracking-normal text-[#3b3253] hover:bg-[#f7f5ff]">
                    <input type="checkbox" aria-label={option.label} checked={statusFilter.includes(option.value)} onChange={() => toggleStatusFilter(option.value)} className="h-4 w-4 rounded border-[#c9c4d8] accent-[#664cf0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]" />
                    <span>{option.label}</span>
                  </label>)}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[#272043]/8 px-3 py-2">
                  <p className="max-w-[190px] text-[10px] font-medium normal-case leading-4 tracking-normal text-[#777086]">Done appears as Ready; Pickup Received appears as Picked Up.</p>
                  <button type="button" onClick={closeStatusMenu} aria-label="Close status list" className="shrink-0 rounded-lg bg-[#241a45] px-2.5 py-1.5 text-[11px] font-bold normal-case tracking-normal text-white hover:bg-[#352766]">Close list</button>
                </div>
              </div> : null}
            </div>
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">Order source
              <select aria-label="Filter order source" value={source} onChange={(event) => setSource(event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 text-sm font-normal normal-case tracking-normal text-[#40565a] focus:border-[#438b82]">
                <option value="all">All sources</option>
                {(orderFilterOptions.data?.sources || []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">Reported by
              <select aria-label="Filter reporter" value={reportedBy} onChange={(event) => setReportedBy(event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-[#263f44]/15 bg-white px-2 text-sm font-normal normal-case tracking-normal text-[#40565a] focus:border-[#438b82]">
                <option value="all">All users</option>
                {(orderFilterOptions.data?.reporters || []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <DateFilter label="From" value={from} onChange={setFrom} invalid={invalidDateRange} />
            <DateFilter label="To" value={to} onChange={setTo} invalid={invalidDateRange} />
            <p className="text-[11px] text-[#718087] md:col-span-2 xl:col-span-4">Dates filter the order date. Choose both dates or use either date on its own.</p>
            {invalidDateRange ? <p role="alert" className="text-xs font-semibold text-[#ae453d] md:col-span-2 xl:col-span-4">End date must be the same as or later than the start date.</p> : null}
          </div> : null}
          {hasUnappliedOrderFilters ? <p className="border-b border-[#263f44]/8 bg-[#f7f4ff] px-5 py-2 text-xs font-medium text-[#554a78]">Filters changed. Select Search to update the order list.</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263f44]/8 px-5 py-2.5 text-xs text-[#617178]">
            <span>
              <strong className="text-[#315d57]">{orders.data?.total ?? rows.length}</strong> matching
              order{rows.length === 1 ? "" : "s"}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span>Print opens the system dialog; choose “Save as PDF” when needed.</span>
              <div role="group" aria-label="Order display" className="inline-flex rounded-lg border border-[#263f44]/15 bg-white p-0.5">
                <button type="button" aria-label="List view" aria-pressed={orderView === "list"} onClick={() => setOrderView("list")} className={cn("inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-bold", orderView === "list" ? "bg-[#eaf3ef] text-[#315d57]" : "text-[#718087] hover:bg-[#f7f8f4]")}><List className="h-4 w-4" />List</button>
                <button type="button" aria-label="Grid view" aria-pressed={orderView === "grid"} onClick={() => setOrderView("grid")} className={cn("inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-bold", orderView === "grid" ? "bg-[#eaf3ef] text-[#315d57]" : "text-[#718087] hover:bg-[#f7f8f4]")}><LayoutGrid className="h-4 w-4" />Grid</button>
              </div>
            </div>
          </div>
          {dashboardQueue ? <div className="flex items-center justify-between gap-3 border-b border-[#c9ddd7] bg-[#eef8f3] px-5 py-2.5 text-xs font-semibold text-[#2e6a60]"><span>Dashboard filter: {dashboardQueueLabels[dashboardQueue]}</span><button type="button" onClick={clearDashboardQueue} className="rounded-lg border border-[#2e6a60]/25 bg-white px-2.5 py-1 text-[11px] font-bold text-[#2e6a60]">Clear filter</button></div> : null}
          {statusNotice ? (
            <div role="status" className="flex items-center justify-between gap-3 border-b border-[#9ccabf] bg-[#eef8f3] px-5 py-2.5 text-xs font-semibold text-[#2e6a60]">
              <span>
                <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                {statusNotice}
              </span>
              <button type="button" onClick={() => setStatusNotice("")} aria-label="Dismiss" className="text-[#2e6a60]">
                ×
              </button>
            </div>
          ) : null}
          {canTransitionOrders ? (
            <section aria-label="Bulk order status actions" className="border-b border-[#263f44]/8 bg-[#fbfcf8] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold text-[#315d57]">Bulk status actions</h2>
                  <p className="mt-1 text-[11px] text-[#718087]">Choose eligible orders on this page, review the count, then confirm the update.</p>
                </div>
                <p className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#315d57]" aria-live="polite">{selectedOrderIds.length} selected</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled={eligibleForDone.length === 0 || bulkStatusPending} onClick={selectEligibleForDone} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-50">Select eligible for Done ({eligibleForDone.length})</button>
                <button type="button" disabled={eligibleForDelivery.length === 0 || bulkStatusPending} onClick={selectEligibleForDelivery} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-50">Select eligible for delivery ({eligibleForDelivery.length})</button>
                <button type="button" disabled={!selectedForDone || bulkStatusPending} onClick={() => openBulkStatusMove("Ready")} className="rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-[#a8b7b2]">Move selected to Done</button>
                <button type="button" disabled={!selectedForDelivery || bulkStatusPending} onClick={() => openBulkStatusMove("Delivered")} className="rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-[#a8b7b2]">Mark selected delivered</button>
                <button type="button" disabled={selectedOrderIds.length === 0 || bulkStatusPending} onClick={() => { setSelectedOrderIds([]); setBulkStatusError(""); }} className="rounded-lg px-3 py-2 text-xs font-bold text-[#4d8982] hover:bg-[#eef5f1] disabled:cursor-not-allowed disabled:opacity-50">Clear selection</button>
              </div>
              {bulkStatusError ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{bulkStatusError}</p> : null}
            </section>
          ) : null}
          <OrderTable
            rows={rows}
            layout={orderView}
            loading={orders.isLoading}
            pending={transition.isPending}
            selectionEnabled={canTransitionOrders}
            selectedIds={selectedOrderIds}
            onToggleSelected={toggleOrderSelection}
            onSelect={openOrderDrawer}
            onOpenHistory={openOrderHistory}
            onOpenCustomer={setSelectedCustomerId}
            onTransition={askStatusChange}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#263f44]/8 px-5 py-3 text-xs text-[#617178]">
            <label className="flex items-center gap-2 font-semibold">Items per page
              <select aria-label="Items per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="h-8 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs font-bold text-[#315d57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#438b82]">
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <button type="button" disabled={page <= 1 || orders.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-1.5 font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
              <span>Page {orders.data?.page || page} of {orders.data?.totalPages || 1}</span>
              <button type="button" disabled={page >= (orders.data?.totalPages || 1) || orders.isFetching} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-1.5 font-bold text-[#315d57] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </div>
          </div>
        </section>
      </> : <>
        <CustomerPulse data={customerInsights.data} loading={customerInsights.isLoading} activeToday={activeToday} restricted={restrictedCustomers} />
        {onlineOnlyCustomers.data?.length ? (
          <section className="mt-5 rounded-[20px] border border-[#664cf0]/15 bg-[#f6f4ff] p-5">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-[#5138cf]" />
              <p className="text-sm font-bold text-[#3a2b8f]">Online-only customers ({onlineOnlyCustomers.data.length})</p>
            </div>
            <p className="mt-1 text-xs text-[#6b5fb0]">Ordered through the app, not yet in your local customer list — they'll appear above automatically once their first order is finalised.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {onlineOnlyCustomers.data.slice(0, 12).map((customer) => (
                <div key={customer.phone} className="rounded-xl border border-[#664cf0]/10 bg-white px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-[#332b50]">{customer.name}</p>
                  <p className="text-xs text-[#718087]">{customer.phone} · {customer.orderCount} order{customer.orderCount === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="mt-6 overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">
          <div className="grid gap-3 border-b border-[#263f44]/10 p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_150px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8d90]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or email" className="h-10 w-full rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] pl-9 pr-3 text-sm outline-none focus:border-brand-500" /></div>
            <select aria-label="Filter customer contact status" value={customerStatus} onChange={(event) => setCustomerStatus(event.target.value as CustomerViewStatus)} className="h-10 rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] px-3 text-sm outline-none focus:border-brand-500"><option value="all">All contact states</option><option value="contactable">Contactable</option><option value="restricted">Contact restricted</option></select>
            <select aria-label="Filter customer segment" value={customerSegment} onChange={(event) => setCustomerSegment(event.target.value as CustomerViewSegment)} className="h-10 rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] px-3 text-sm outline-none focus:border-brand-500"><option value="all">All activity</option><option value="new">New</option><option value="repeat">Repeat</option><option value="at_risk">At risk</option><option value="lapsed">Lapsed</option><option value="no_orders">No orders</option><option value="unknown">Date unknown</option></select>
            <select aria-label="Sort customers" value={customerSort} onChange={(event) => setCustomerSort(event.target.value as "newest" | "spend")} className="h-10 rounded-xl border border-[#263f44]/15 bg-[#fbfbf9] px-3 text-sm outline-none focus:border-brand-500"><option value="newest">Latest activity</option><option value="spend">Highest spend</option></select>
          </div>
          <CustomerTable rows={customerRows} loading={customers.isLoading || customerInsights.isLoading} onOpen={setSelectedCustomerId} />
        </section>
      </>}
      <OrderStatusDialog
        move={statusMove}
        pending={transition.isPending}
        error={transition.error}
        onConfirm={(override) => statusMove && transition.mutate({ move: statusMove, override })}
        onClose={() => {
          transition.reset();
          setStatusMove(null);
        }}
        onReload={() => {
          transition.reset();
          setStatusMove(null);
          client.invalidateQueries({ queryKey: ["laundry-orders"] });
        }}
      />
      <BulkOrderStatusDialog
        move={bulkStatusMove}
        pending={bulkStatusPending}
        onConfirm={() => void confirmBulkStatusMove()}
        onClose={() => !bulkStatusPending && setBulkStatusMove(null)}
      />
      {selectedCustomerId ? (
        <CustomerWorkCardDrawer
          id={selectedCustomerId}
          onClose={closeCustomerDrawer}
          onOpenOrder={openOrderDrawer}
        />
      ) : null}
      {selectedOrderId ? (
        <OrderWorkCardDrawer id={selectedOrderId} onClose={closeOrderDrawer} />
      ) : null}
      {selectedHistoryOrderId ? (
        <OrderHistoryDialog id={selectedHistoryOrderId} onClose={() => setSelectedHistoryOrderId(null)} />
      ) : null}
    </div>
  );
}

function OrderPulse({ rows, loading }: { rows: LaundryOrder[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-5 h-[132px] animate-pulse rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]" aria-label="Loading order summary" />
    );
  }

  const counts = new Map<LaundryState, number>();
  for (const order of rows) counts.set(order.state, (counts.get(order.state) || 0) + 1);
  const workInProgress = rows.filter((order) => ["Booked", "Picked Up", "In Process"].includes(order.state)).length;
  const readyToMove = rows.filter((order) => ["Ready", "Out for Delivery"].includes(order.state)).length;
  const paymentAttention = rows.filter((order) => !["paid", "settled"].includes(order.paymentStatus.toLowerCase())).length;
  const stages: Array<{ label: string; state: LaundryState; tone: string }> = [
    { label: "Booked", state: "Booked", tone: "bg-[#eeeaff] text-[#5743d7]" },
    { label: "In process", state: "In Process", tone: "bg-[#e8f3f1] text-[#24776f]" },
    { label: "Ready", state: "Ready", tone: "bg-[#fff1d8] text-[#9a6519]" },
    { label: "Delivered", state: "Delivered", tone: "bg-[#edf5ef] text-[#2d7561]" },
  ];

  return (
    <section className="mt-5 overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]" aria-label="Order pulse for the current view">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263f44]/8 px-5 py-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#4d8982]">Order pulse</p>
          <p className="mt-0.5 text-xs text-[#718087]">A quick read of the currently loaded order view.</p>
        </div>
        <span className="rounded-full bg-[#f5f2ff] px-3 py-1 text-[11px] font-bold text-[#5743d7]">{rows.length} visible</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <PulseMetric icon={<Layers3 className="h-4 w-4" />} label="Active work" value={workInProgress} detail="Booked, picked up or processing" tone="text-[#5743d7] bg-[#eeeaff]" />
        <PulseMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Ready to move" value={readyToMove} detail="Ready or out for delivery" tone="text-[#24776f] bg-[#e8f3f1]" />
        <PulseMetric icon={<CircleDollarSign className="h-4 w-4" />} label="Payment attention" value={paymentAttention} detail="Not marked paid or settled" tone="text-[#9a6519] bg-[#fff1d8]" />
        <PulseMetric icon={<AlertTriangle className="h-4 w-4" />} label="Needs review" value={rows.filter((order) => order.state === "Cancelled").length} detail="Cancelled records in view" tone="text-[#c4554d] bg-[#fff0ee]" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[#263f44]/8 px-5 py-3">
        <Clock3 className="h-4 w-4 text-[#718087]" aria-hidden="true" />
        <span className="mr-1 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#718087]">Pipeline</span>
        {stages.map((stage, index) => (
          <div key={stage.state} className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", stage.tone)}>
              {stage.label}<span className="tabular-nums">{counts.get(stage.state) || 0}</span>
            </span>
            {index < stages.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-[#b3bfbb]" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function PulseMetric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: number; detail: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#263f44]/8 bg-[#fbfcfa] px-3 py-2.5">
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", tone)} aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#718087]">{label}</p>
        <p className="mt-0.5 text-xl font-semibold leading-none tabular-nums text-[#17353c]">{value}</p>
        <p className="mt-1 truncate text-[10px] text-[#718087]">{detail}</p>
      </div>
    </div>
  );
}

function CustomerPulse({ data, loading, activeToday, restricted }: { data?: CustomerInsight; loading: boolean; activeToday: number; restricted: number }) {
  if (loading) return <div className="mt-5 h-[132px] animate-pulse rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]" aria-label="Loading customer summary" />;
  return <section className="mt-5 overflow-hidden rounded-[22px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]" aria-label="Customer summary">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263f44]/8 px-5 py-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#4d8982]">Customer summary</p><p className="mt-0.5 text-xs text-[#718087]">Live values from this store’s customer and order records.</p></div><span className="rounded-full bg-[#f5f2ff] px-3 py-1 text-[11px] font-bold text-[#5743d7]">Current branch</span></div>
    <div className="grid gap-px bg-[#ebe7f6] sm:grid-cols-2 xl:grid-cols-4">
      <CustomerMetric icon={<UserRound className="h-4 w-4" />} label="Total customers" value={String(data?.summary.totalCustomers || 0)} detail="Profiles in this branch" tone="text-[#5743d7]" />
      <CustomerMetric icon={<UserCheck className="h-4 w-4" />} label="Active today" value={String(activeToday)} detail="Customers with an order today" tone="text-emerald-700" />
      <CustomerMetric icon={<UserX className="h-4 w-4" />} label="Contact restricted" value={String(restricted)} detail="No consent or usable contact route" tone="text-rose-700" />
      <CustomerMetric icon={<CircleDollarSign className="h-4 w-4" />} label="Total revenue" value={formatINR(data?.summary.revenue || 0)} detail="Customer revenue, before tax" tone="text-amber-700" />
    </div>
  </section>;
}

function CustomerMetric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <div className="flex items-center gap-3 bg-white px-4 py-4"><span className={cn("grid h-9 w-9 place-items-center rounded-xl bg-[#f7f5ff]", tone)} aria-hidden="true">{icon}</span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#718087]">{label}</p><p className="mt-1 text-xl font-semibold leading-none tabular-nums text-[#17353c]">{value}</p><p className="mt-1 truncate text-[10px] text-[#718087]">{detail}</p></div></div>;
}

function CustomerTable({ rows, loading, onOpen }: { rows: Array<{ customer: CustomerRecord; metric: CustomerInsight["customers"][number] | undefined }>; loading: boolean; onOpen: (id: string) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-[#fafaf7] text-[10px] font-bold uppercase tracking-[.14em] text-[#718087]"><tr><th className="px-5 py-3">Customer</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Orders</th><th className="px-3 py-3">Total spent</th><th className="px-3 py-3">Last activity</th><th className="px-3 py-3">Contact</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-600" /></td></tr> : rows.length ? rows.map(({ customer, metric }) => <tr key={customer.id} className="border-t border-[#263f44]/8 transition hover:bg-[#faf9ff]"><td className="px-5 py-4"><button type="button" onClick={() => onOpen(customer.id)} className="font-semibold text-brand-700 hover:underline">{customer.name || "Unnamed customer"}</button><span className="mt-1 block max-w-[260px] truncate text-xs text-[#718087]">{customer.email || customer.address || "No additional contact recorded"}</span></td><td className="px-3 py-4 text-[#40565a]">{customer.phone || "—"}</td><td className="px-3 py-4 font-semibold tabular-nums">{metric?.orderCount || 0}</td><td className="px-3 py-4 font-semibold tabular-nums">{formatINR(metric?.revenue || 0)}</td><td className="px-3 py-4 text-xs text-[#617178]">{metric?.lastOrderDate || "No order date"}</td><td className="px-3 py-4"><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", metric?.contactEligible ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{metric?.contactEligible ? "Contactable" : "Restricted"}</span></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => onOpen(customer.id)} className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50">Open profile</button></td></tr>) : <tr><td colSpan={7}><VisualEmptyState kind="customers" compact title="No customers match these filters" detail="Clear a filter or create a new customer account from the customer directory." /></td></tr>}</tbody></table></div>;
}

function useDrawerFocus() {
  const drawerRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => (initialFocusRef.current || drawerRef.current)?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (priorFocusRef.current?.isConnected) priorFocusRef.current.focus();
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []).filter((element) => !element.hasAttribute("hidden"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!focusable.includes(document.activeElement as HTMLElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { drawerRef, initialFocusRef, onKeyDown };
}

function CustomerWorkCardDrawer({ id, onClose, onOpenOrder }: { id: string; onClose: () => void; onOpenOrder: (id: string) => void }) {
  const [section, setSection] = useState<"activity" | "orders" | "ledger">("activity");
  const { drawerRef, initialFocusRef, onKeyDown } = useDrawerFocus();
  const profile = useQuery({
    queryKey: ["laundry-customer-work-card", id],
    queryFn: () => apiGet<CustomerDrawerProfile>(`/laundry/customers/${id}`),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const customer = profile.data?.customer;
  const metrics = profile.data?.metrics;
  const address = profile.data?.addresses.find((entry) => entry.isDefault && entry.active) || profile.data?.addresses.find((entry) => entry.active);
  const tabs: Array<{ value: "activity" | "orders" | "ledger"; label: string }> = [
    { value: "activity", label: "Activity" },
    { value: "orders", label: "Orders" },
    { value: "ledger", label: "Ledger" },
  ];

  return <>
    <button type="button" aria-label="Close customer work card" onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-[#171024]/65 backdrop-blur-[2px]" />
    <aside ref={drawerRef} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-labelledby="customer-work-card-title" className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[#272043]/10 bg-[#fffdfb] shadow-[-22px_0_60px_rgba(32,23,60,.22)] animate-in slide-in-from-right duration-300 sm:w-[min(34vw,560px)] sm:min-w-[440px]">
      <header className="relative overflow-hidden border-b border-[#272043]/10 bg-[#fcfbff] px-5 py-5">
        <div className="pointer-events-none absolute -left-14 -top-16 h-36 w-36 rounded-full bg-brand-100/75 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[.17em] text-brand-700">Customer work card</p>
            {profile.isLoading ? <div className="mt-2 h-7 w-48 animate-pulse rounded bg-brand-100" /> : <><h2 id="customer-work-card-title" className="mt-1 truncate font-serif text-2xl text-[#21183d]">{customer?.name || "Customer profile"}</h2><p className="mt-1 text-sm text-[#6d6682]">{customer?.phone || "No phone recorded"}{customer?.email ? ` · ${customer.email}` : ""}</p>{customer ? <Link to={`/laundry/customers/${encodeURIComponent(id)}`} onClick={onClose} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900">Open full customer profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link> : null}</>}
          </div>
          <button ref={initialFocusRef} type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#272043]/10 bg-white text-[#554d6d] transition hover:bg-brand-50 hover:text-brand-800" aria-label="Close customer work card"><X className="h-4 w-4" /></button>
        </div>
      </header>
      {profile.isLoading ? <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div> : profile.isError || !profile.data ? <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-bold">Customer details could not be loaded.</p><p className="mt-1 text-xs">Close this card, then try again from the customer list.</p></div> : <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-px border-b border-[#272043]/10 bg-[#eae7f4] sm:grid-cols-4">
          <DrawerMetric label="Total spend" value={formatMoney(metrics?.revenue || 0)} tone="text-brand-700" />
          <DrawerMetric label="Due balance" value={formatMoney(metrics?.orderBalance || 0)} tone="text-amber-700" />
          <DrawerMetric label="Wallet" value={formatMoney(metrics?.walletBalance || 0)} tone="text-emerald-700" />
          <DrawerMetric label="Rewards" value={String(metrics?.rewardPoints || 0)} tone="text-[#7a4cbb]" />
        </div>
        <div className="px-5 pt-4">
          <div className="flex rounded-xl bg-[#f1eff8] p-1" role="tablist" aria-label="Customer work card sections">
            {tabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={section === tab.value} onClick={() => setSection(tab.value)} className={cn("flex-1 rounded-lg px-2 py-2 text-xs font-bold transition", section === tab.value ? "bg-white text-brand-800 shadow-sm" : "text-[#756e89] hover:text-brand-800")}>{tab.label}</button>)}
          </div>
        </div>
        {section === "activity" ? <div className="space-y-4 px-5 py-4">
          <section className="rounded-2xl border border-[#272043]/10 bg-white p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#777086]">Customer details</p>
            <div className="mt-3 grid gap-3 text-sm">
              <div className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="font-semibold text-[#2b2344]">{address ? `${address.label} address` : "No default address"}</p><p className="mt-0.5 text-xs leading-5 text-[#746d82]">{address ? [address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(", ") : customer?.address || "Add an address when needed for pickup or delivery."}</p></div></div>
              <div className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="font-semibold text-[#2b2344]">Latest visit</p><p className="mt-0.5 text-xs text-[#746d82]">{metrics?.lastVisit ? new Date(`${metrics.lastVisit}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "No completed visit recorded"}</p></div></div>
              <div className="flex items-start gap-2.5"><WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="font-semibold text-[#2b2344]">Current package</p><p className="mt-0.5 text-xs text-[#746d82]">{metrics?.currentPackage || "No active package"}</p></div></div>
            </div>
          </section>
          <section className="rounded-2xl border border-[#272043]/10 bg-white p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#777086]">Recent activity</p><div className="mt-3 space-y-3">{profile.data.timeline.length ? profile.data.timeline.slice(0, 6).map((entry) => <div key={`${entry.at}:${entry.label}`} className="flex gap-2.5"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" /><div className="min-w-0"><p className="text-xs font-semibold text-[#3b3253]">{entry.label}</p><p className="mt-0.5 text-[11px] text-[#7b7488]">{new Date(entry.at).toLocaleString("en-IN")} {entry.amount ? ` · ${formatMoney(entry.amount)}` : ""}</p></div></div>) : <p className="text-xs text-[#7b7488]">No customer activity recorded yet.</p>}</div></section>
        </div> : null}
        {section === "orders" ? <div className="space-y-2 px-5 py-4">{profile.data.orders.length ? <>
          <p className="px-1 text-[11px] leading-4 text-[#746d82]">Invoice and order details stay in this customer profile. Select the eye only when you want the separate full order work card.</p>
          {profile.data.orders.map((order) => <article key={order.id} className="rounded-2xl border border-[#272043]/10 bg-white p-3 transition hover:border-brand-200 hover:bg-brand-50/20"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-[#332849]">{order.invoice || order.orderNumber}</p><p className="mt-1 text-xs text-[#746d82]">{order.invoice ? order.orderNumber : "No invoice yet"} · {date(order.orderDate)} · {order.paymentStatus}</p></div><div className="flex shrink-0 items-center gap-2"><StatePill state={order.state as LaundryState} /><button type="button" onClick={() => onOpenOrder(order.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-brand-200 bg-white text-brand-700 transition hover:bg-brand-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2" aria-label={`View order ${order.invoice || order.orderNumber}`} title="Open full order work card"><Eye className="h-4 w-4" /></button></div></div><div className="mt-3 flex items-center justify-between border-t border-[#272043]/8 pt-2 text-xs"><span className="text-[#746d82]">{order.expectedDeliveryDate ? `Due ${date(order.expectedDeliveryDate)}` : "No due date"}</span><span className="font-bold tabular-nums text-[#332849]">{formatMoney(order.grandTotal)}</span></div></article>)}
        </> : <VisualEmptyState kind="orders" compact title="No orders for this customer" detail="The booking history will appear here after the first order." />}</div> : null}
        {section === "ledger" ? <div className="space-y-2 px-5 py-4">{profile.data.ledger.length ? profile.data.ledger.slice(0, 12).map((entry) => <div key={entry.id} className="rounded-xl border border-[#272043]/10 bg-white px-3 py-3"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold text-[#352b4b]">{entry.entryType}</p><p className="mt-1 text-[11px] text-[#7a7388]">{entry.reason || entry.referenceId || "Customer ledger entry"}</p></div><div className="text-right text-xs tabular-nums"><p className={entry.debit ? "font-bold text-rose-700" : "font-bold text-emerald-700"}>{entry.debit ? `−${formatMoney(entry.debit)}` : `+${formatMoney(entry.credit)}`}</p><p className="mt-1 text-[10px] text-[#8a8397]">{date(entry.entryDate)}</p></div></div></div>) : <VisualEmptyState kind="finance" compact title="No ledger entries" detail="Payments, invoices, credits and wallet activity will be listed here." />}</div> : null}
      </div>}
    </aside>
  </>;
}

function DrawerMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="bg-[#fffdfb] px-3 py-3"><p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[#817a8e]">{label}</p><p className={cn("mt-1 text-base font-semibold tabular-nums", tone)}>{value}</p></div>;
}

function DateFilter({
  label,
  value,
  onChange,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#718087]">
      {label}
      <input
        aria-label={`${label} date`}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className={cn("mt-1 block h-8 w-full rounded-lg border bg-[#fbfbf9] px-2 text-sm font-normal normal-case tracking-normal text-[#40565a]", invalid ? "border-[#ae453d]" : "border-[#263f44]/15")}
      />
    </label>
  );
}
function OrderTable({
  rows,
  layout,
  loading,
  pending,
  selectionEnabled,
  selectedIds,
  onToggleSelected,
  onSelect,
  onOpenHistory,
  onOpenCustomer,
  onTransition,
}: {
  rows: LaundryOrder[];
  layout: "list" | "grid";
  loading: boolean;
  pending: boolean;
  selectionEnabled: boolean;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onSelect: (id: string) => void;
  onOpenHistory: (id: string) => void;
  onOpenCustomer: (id: string) => void;
  onTransition: (order: LaundryOrder, next: LaundryState) => void;
}) {
  if (layout === "grid") {
    return (
      <div role="list" aria-label="Store orders" className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
        {loading ? <div role="status" className="col-span-full grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[#3a7d78]" /></div> : rows.length ? rows.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            pending={pending}
            selectionEnabled={selectionEnabled}
            selected={selectedIds.includes(order.id)}
            onToggleSelected={onToggleSelected}
            onSelect={onSelect}
            onOpenHistory={onOpenHistory}
            onOpenCustomer={onOpenCustomer}
            onTransition={onTransition}
          />
        )) : <div className="col-span-full"><VisualEmptyState kind="orders" compact title="No orders match this view" detail="Clear a filter or book the first order for this branch." /></div>}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[940px] text-left text-sm">
        <thead className="bg-[#fafaf7] text-[10px] font-bold uppercase tracking-[.14em] text-[#718087]">
          <tr>
            <th className="px-5 py-3">Invoice / order</th>
            <th className="px-3 py-3">Customer</th>
            <th className="px-3 py-3">Dates</th>
            <th className="px-3 py-3">Amount</th>
            <th className="px-3 py-3">Source</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-5 py-3 text-right">Order actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="py-16 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#3a7d78]" />
              </td>
            </tr>
          ) : rows.length ? (
            rows.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                pending={pending}
                selectionEnabled={selectionEnabled}
                selected={selectedIds.includes(order.id)}
                onToggleSelected={onToggleSelected}
                onSelect={onSelect}
                onOpenHistory={onOpenHistory}
                onOpenCustomer={onOpenCustomer}
                onTransition={onTransition}
              />
            ))
          ) : (
            <tr>
              <td colSpan={7} className="text-center">
                <VisualEmptyState kind="orders" compact title="No orders match this view" detail="Clear a filter or book the first order for this branch." />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function OrderRow({
  order,
  pending,
  selectionEnabled,
  selected,
  onToggleSelected,
  onSelect,
  onOpenHistory,
  onOpenCustomer,
  onTransition,
}: {
  order: LaundryOrder;
  pending: boolean;
  selectionEnabled: boolean;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onSelect: (id: string) => void;
  onOpenHistory: (id: string) => void;
  onOpenCustomer: (id: string) => void;
  onTransition: (order: LaundryOrder, next: LaundryState) => void;
}) {
  return (
    <tr
      className={cn(
        "border-t border-[#263f44]/8 transition hover:bg-[#f7f8f4]",
      )}
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          {selectionEnabled && isBulkSelectable(order) ? <input type="checkbox" aria-label={`Select order ${order.orderNumber} for bulk status update`} checked={selected} disabled={pending} onChange={() => onToggleSelected(order.id)} className="h-4 w-4 shrink-0 rounded border-[#b7c9c3] accent-[#39786f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#438b82]" /> : null}
          <div className="min-w-0"><span className="block font-bold text-[#205660]">{order.invoiceNumber || "—"}</span><span className="text-xs text-[#718087]">{order.orderNumber} · {order.itemCount} items</span></div>
        </div>
      </td>
      <td className="px-3 py-4">
        {order.customer.id ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenCustomer(order.customer.id!);
            }}
            className="block w-fit font-semibold text-brand-700 underline-offset-4 hover:text-brand-900 hover:underline"
            title={`Open ${order.customer.name}'s customer record`}
          >
            {order.customer.name}
          </button>
        ) : (
          <span className="block font-medium">{order.customer.name}</span>
        )}
        <span className="text-xs text-[#718087]">{order.customer.phone}</span>
      </td>
      <td className="px-3 py-4 text-xs text-[#617178]">
        <span className="block">Booked {date(order.orderDate)}</span>
        <span className="mt-1 block">
          Due {date(order.expectedDeliveryDate)}
        </span>
      </td>
      <td className="px-3 py-4 font-bold tabular-nums">
        {formatMoney(order.grandTotal)}
      </td>
      <td className="px-3 py-4 text-xs text-[#617178]">
        <span className="inline-flex rounded-full bg-[#f2f0fa] px-2 py-1 font-semibold text-[#554b73]">
          {order.source === "By Store" ? "By-Store" : order.source || "Unknown source"}
        </span>
      </td>
      <td className="px-3 py-4">
        <StatePill state={order.state} />
      </td>
      <td className="px-5 py-4 text-right">
        <OrderActions order={order} pending={pending} onSelect={onSelect} onOpenHistory={onOpenHistory} onTransition={onTransition} align="right" />
      </td>
    </tr>
  );
}

function OrderCard({
  order,
  pending,
  selectionEnabled,
  selected,
  onToggleSelected,
  onSelect,
  onOpenHistory,
  onOpenCustomer,
  onTransition,
}: {
  order: LaundryOrder;
  pending: boolean;
  selectionEnabled: boolean;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onSelect: (id: string) => void;
  onOpenHistory: (id: string) => void;
  onOpenCustomer: (id: string) => void;
  onTransition: (order: LaundryOrder, next: LaundryState) => void;
}) {
  return (
    <article role="listitem" aria-label={`Order ${order.orderNumber}`} className="min-w-0 rounded-2xl border border-[#263f44]/10 bg-white p-4 shadow-[0_4px_16px_rgba(37,48,43,.04)]">
      <header className="flex items-start justify-between gap-3 border-b border-[#263f44]/8 pb-3">
        <div className="flex min-w-0 items-start gap-2">
          {selectionEnabled && isBulkSelectable(order) ? <input type="checkbox" aria-label={`Select order ${order.orderNumber} for bulk status update`} checked={selected} disabled={pending} onChange={() => onToggleSelected(order.id)} className="mt-1 h-4 w-4 shrink-0 rounded border-[#b7c9c3] accent-[#39786f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#438b82]" /> : null}
          <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#205660]">{order.invoiceNumber || "No invoice"}</p>
          <p className="mt-1 truncate text-xs text-[#718087]">{order.orderNumber} · {order.itemCount} items</p>
          </div>
        </div>
        <StatePill state={order.state} />
      </header>
      <div className="mt-3">
        {order.customer.id ? <button type="button" onClick={() => onOpenCustomer(order.customer.id!)} className="block max-w-full truncate text-left text-sm font-semibold text-brand-700 hover:underline">{order.customer.name}</button> : <p className="truncate text-sm font-semibold">{order.customer.name}</p>}
        <p className="mt-0.5 text-xs text-[#718087]">{order.customer.phone}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#fafaf7] p-3 text-xs">
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-[#718087]">Booked</dt><dd className="mt-1 font-medium text-[#40565a]">{date(order.orderDate)}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-[#718087]">Due</dt><dd className="mt-1 font-medium text-[#40565a]">{date(order.expectedDeliveryDate)}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-[#718087]">Source</dt><dd className="mt-1 truncate font-medium text-[#40565a]">{order.source === "By Store" ? "By-Store" : order.source || "Unknown source"}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-[#718087]">Amount</dt><dd className="mt-1 font-bold tabular-nums text-[#17353c]">{formatMoney(order.grandTotal)}</dd></div>
      </dl>
      <OrderActions order={order} pending={pending} onSelect={onSelect} onOpenHistory={onOpenHistory} onTransition={onTransition} />
    </article>
  );
}

function OrderActions({
  order,
  pending,
  onSelect,
  onOpenHistory,
  onTransition,
  align = "left",
}: {
  order: LaundryOrder;
  pending: boolean;
  onSelect: (id: string) => void;
  onOpenHistory: (id: string) => void;
  onTransition: (order: LaundryOrder, next: LaundryState) => void;
  align?: "left" | "right";
}) {
  const next = nextLaundryState[order.state];
  const needsRider = next === "Out for Delivery" && !order.deliveryRider;
  return (
    <div className={cn("mt-3 flex flex-wrap items-center gap-2", align === "right" && "justify-end")}>
      <button
        type="button"
        onClick={() => onOpenHistory(order.id)}
        aria-label={`Open order history for ${order.invoiceNumber || order.orderNumber}`}
        title="Open the read-only order status history"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-2.5 py-1.5 text-xs font-bold text-[#514390] hover:bg-[#f0edff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />Order History
      </button>
      <button
        type="button"
        onClick={() => onSelect(order.id)}
        aria-label={`Open order summary for ${order.invoiceNumber || order.orderNumber}`}
        title="Open the order summary and available actions"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#263f44]/15 bg-white px-2.5 py-1.5 text-xs font-bold text-[#315d57] hover:bg-[#f1f4f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Order Summary
      </button>
      {order.state === "Ready" ? <button type="button" disabled={pending} onClick={() => onTransition(order, "Delivered")} aria-label={`Mark order ${order.orderNumber} handed over`} title="The customer collected it at the counter" className="rounded-lg border border-[#123039]/20 bg-white px-2.5 py-1.5 text-xs font-bold text-[#17353c] hover:bg-[#f1f4f1]">Handed over</button> : null}
      {next ? needsRider ? <Link to="/laundry/dispatch" aria-label={`Assign a delivery rider for order ${order.orderNumber}`} className="inline-flex items-center gap-1 rounded-lg bg-[#e7f3ed] px-2.5 py-1.5 text-xs font-bold text-[#2b6c62]">Assign captain<Truck className="h-3.5 w-3.5" /></Link> : <button type="button" disabled={pending} onClick={() => onTransition(order, next)} aria-label={`Move order ${order.orderNumber} to ${next}`} className="inline-flex items-center gap-1 rounded-lg bg-[#123039] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#1d4a53]">{next}<ChevronRight className="h-3.5 w-3.5" /></button> : null}
    </div>
  );
}

function BulkOrderStatusDialog({
  move,
  pending,
  onConfirm,
  onClose,
}: {
  move: BulkOrderStatusMove | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const label = move?.next === "Ready" ? "Done (Ready)" : "Delivered";
  const count = move?.orders.length || 0;
  return (
    <AlertDialog open={Boolean(move)} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Move {count} {count === 1 ? "order" : "orders"} to {label}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-[#526368]">
              <p>Each order will use the normal status checks and save its own history entry. If an order changed since it was loaded or is no longer eligible, it will stay unchanged and appear in the result message.</p>
              {move?.next === "Delivered" ? <p className="rounded-lg bg-[#fff6e1] px-3 py-2 text-xs font-semibold text-[#855815]">This updates delivery status only. Any unpaid balance remains due.</p> : null}
              {move?.orders.length ? <ul aria-label="Selected orders" className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-[#f7f8f4] p-3 text-xs font-semibold text-[#315d57]">{move.orders.slice(0, 6).map((order) => <li key={order.id}>{order.orderNumber} · {order.customer.name} · {formatMoney(order.grandTotal)}</li>)}{move.orders.length > 6 ? <li>and {move.orders.length - 6} more…</li> : null}</ul> : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#40565a] disabled:opacity-50">Cancel</button>
          <button type="button" disabled={pending || !move?.orders.length} onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{pending ? "Updating orders…" : `Confirm ${label}`}</button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OrderHistoryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { drawerRef, initialFocusRef, onKeyDown } = useDrawerFocus();
  const detail = useQuery({
    queryKey: ["laundry-order", id],
    queryFn: () => apiGet<LaundryOrder & { timeline: Array<{ id: string; ts: string; action: string }> }>(`/laundry/orders/${id}`),
  });

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const order = detail.data;
  return <>
    <button type="button" aria-label="Close order history" onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-[#171024]/65 backdrop-blur-[2px]" />
    <section ref={drawerRef} onKeyDown={onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="order-history-title" className="fixed inset-x-3 top-1/2 z-50 max-h-[min(82vh,720px)] -translate-y-1/2 overflow-y-auto rounded-[24px] border border-[#272043]/10 bg-[#fffdfb] p-5 shadow-[0_26px_80px_rgba(32,23,60,.3)] animate-in fade-in zoom-in-95 duration-200 sm:inset-x-auto sm:left-1/2 sm:w-[min(92vw,620px)] sm:-translate-x-1/2 sm:p-7">
      <header className="flex items-start justify-between gap-4 border-b border-[#272043]/10 pb-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.17em] text-brand-700">Read-only record</p>
          <h2 id="order-history-title" className="mt-1 font-serif text-2xl text-[#241a45]">Order history</h2>
          <p className="mt-1 text-sm text-[#746d82]">{order ? `${order.invoiceNumber || order.orderNumber} · ${order.customer.name}` : "Order status timeline"}</p>
        </div>
        <button ref={initialFocusRef} type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#272043]/15 bg-white px-3 text-xs font-bold text-[#554d6d] hover:bg-[#f6f4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X className="h-3.5 w-3.5" />Close</button>
      </header>
      {order ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e0f2] bg-[#f8f7fc] px-4 py-3"><span className="text-xs font-semibold text-[#625c75]">Current order status</span><StatePill state={order.state} /></div> : null}
      <section className="mt-5" aria-label="Order activity timeline">
        <h3 className="text-sm font-bold text-[#332849]">Order timeline</h3>
        {detail.isLoading ? <p role="status" className="mt-4 rounded-xl bg-[#f8f7fc] p-4 text-sm text-[#625c75]">Loading order history…</p> : detail.isError ? <p role="status" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Order history could not be loaded. Close this window and try again.</p> : order?.timeline.length ? <ol className="mt-4 space-y-3">{order.timeline.map((entry) => <li key={entry.id} className="flex gap-3 rounded-xl border border-[#272043]/8 bg-white px-3 py-3"><span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" /><div><p className="text-sm font-semibold capitalize text-[#3b3253]">{entry.action.replace(/^laundry:/, "").replace(/[:_]/g, " ")}</p><time className="mt-1 block text-xs text-[#7b7488]" dateTime={entry.ts}>{new Date(entry.ts).toLocaleString("en-IN")}</time></div></li>)}</ol> : <p className="mt-4 rounded-xl bg-[#f8f7fc] p-4 text-sm text-[#625c75]">No order history has been recorded yet.</p>}
      </section>
      <p className="mt-5 rounded-xl border border-[#e5e0f2] bg-[#f8f7fc] px-3 py-2.5 text-xs text-[#625c75]">This view does not change the order. Use the separate order details view for operational actions.</p>
    </section>
  </>;
}
type OrderTag = {
  tagNumber: string;
  garment: string;
  service: string;
  sequence: number;
  total: number;
  orderDate: string;
  expectedDeliveryDate: string;
};
function TraceabilitySummary({ order }: { order: LaundryOrder & { tags?: Array<OrderTag> } }) {
  const expectedPieces = order.items.reduce((sum, item) => /^(piece|pair)$/i.test(item.unit) ? sum + item.qty : sum, 0);
  const units = order.physicalUnits || [];
  const activeUnits = units.filter((unit) => unit.state !== 'Cancelled');
  const cancelledUnitCount = units.length - activeUnits.length;
  const containers = order.containers || [];
  const accounted = expectedPieces === activeUnits.length;
  return <section className="mt-4 rounded-xl border border-[#39786f]/20 bg-[#f3faf6] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#39786f]">Assembly safety · garment traceability</p><p className="mt-1 text-xs text-[#52676b]">{expectedPieces ? `${activeUnits.length} of ${expectedPieces} active piece tags accounted for.${cancelledUnitCount ? ` ${cancelledUnitCount} cancelled historical tag${cancelledUnitCount === 1 ? '' : 's'} remains in history.` : ''}` : containers.length ? `${containers.length} explicit container tag${containers.length === 1 ? '' : 's'} accounted for; no piece tags fabricated for bulk lines.` : 'No physical identity has been recorded yet.'}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${accounted ? 'bg-[#dcefe5] text-[#2e6a60]' : 'bg-amber-100 text-amber-800'}`}>{expectedPieces ? accounted ? 'Ready to assemble' : 'Hold · investigate mismatch' : containers.length ? 'Container-controlled' : 'Identity pending'}</span></div>
    {units.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{units.map((unit) => <div key={unit.id} className="rounded-lg border border-[#39786f]/10 bg-white px-2.5 py-2 text-[10px]"><div className="flex items-center justify-between gap-2"><span className="font-mono font-bold text-[#315d57]">{unit.tagCode}</span><span className="rounded-full bg-[#eaf3ef] px-1.5 py-0.5 font-bold text-[#2e6a60]">{unit.state}</span></div><p className="mt-1 truncate text-[#617178]">{unit.garment.name} · {unit.service.name} · {unit.location || 'No location'} · {unit.condition}</p><Link to={`/laundry/garment-tracking?tag=${encodeURIComponent(unit.tagCode)}`} className="mt-1 inline-block font-bold text-[#39786f]">Scan · history · reprint · replace</Link></div>)}</div> : null}
    <div className="mt-3 flex flex-wrap gap-2"><Link to={`/laundry/garment-tracking?tag=${encodeURIComponent(activeUnits[0]?.tagCode || units[0]?.tagCode || containers[0]?.tagCode || '')}`} className="rounded-lg border border-[#39786f]/20 bg-white px-3 py-1.5 text-[10px] font-bold text-[#39786f]">Open tracking</Link><Link to={`/laundry/print-centre?order=${encodeURIComponent(order.id)}`} className="rounded-lg border border-[#39786f]/20 bg-white px-3 py-1.5 text-[10px] font-bold text-[#39786f]">Open Print Centre</Link></div>
  </section>;
}
function OrderWorkCardPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["laundry-order", id],
    queryFn: () => apiGet<LaundryOrder & { timeline: Array<{ id: string; ts: string; action: string }>; tags?: Array<OrderTag> }>("/laundry/orders/" + id),
    retry: false,
  });
  const backToOrders = () => navigate("/laundry/orders");
  if (detail.isError) {
    const failureKind = orderDetailFailureKind(detail.error);
    const failureCopy = failureKind === "denied"
      ? { title: "You don’t have access to this order.", detail: "Your role cannot open this order record. Return to Store Orders or ask an administrator to review your access." }
      : failureKind === "not-found"
        ? { title: "This order can’t be found.", detail: "It may have been removed or may belong to another store. Return to Store Orders and search for the order number again." }
        : { title: "We couldn’t open this order.", detail: "The order may be unavailable, or the service may be temporarily interrupted. Retry once; if it continues, return to Store Orders and search by order number." };
    return (
      <section className="mx-auto mt-8 max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm" role="alert">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-rose-700">Order detail unavailable</p>
        <h1 className="mt-2 font-serif text-2xl text-[#30265f]">{failureCopy.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#625c72]">{failureCopy.detail}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {failureKind === "retry" ? <button type="button" onClick={() => void detail.refetch()} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white">Try again</button> : null}
          <button type="button" onClick={backToOrders} className="rounded-lg border border-[#272043]/15 px-4 py-2 text-sm font-bold text-[#554d6d]">Back to Store Orders</button>
        </div>
      </section>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[1240px] px-3 py-5 sm:px-5 lg:px-8">
      <OrderDetail order={detail.data} loading={detail.isLoading} onClose={backToOrders} presentation="page" />
    </div>
  );
}

function orderDetailFailureKind(error: unknown): "denied" | "not-found" | "retry" {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/\b403\b|FORBIDDEN|PERMISSION_DENIED/i.test(message)) return "denied";
  if (/\b404\b|ORDER_NOT_FOUND/i.test(message)) return "not-found";
  return "retry";
}

function OrderWorkCardDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { drawerRef, initialFocusRef, onKeyDown } = useDrawerFocus();
  const detail = useQuery({
    queryKey: ["laundry-order", id],
    queryFn: () => apiGet<LaundryOrder & { timeline: Array<{ id: string; ts: string; action: string }>; tags?: Array<OrderTag> }>(`/laundry/orders/${id}`),
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <>
    <button type="button" aria-label="Close order work card" onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-[#171024]/65 backdrop-blur-[2px]" />
    <aside ref={drawerRef} onKeyDown={onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Order work card" className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto border-l border-[#272043]/10 bg-[#fffdfb] px-4 py-5 shadow-[-22px_0_60px_rgba(32,23,60,.22)] animate-in slide-in-from-right duration-300 sm:w-[min(52vw,820px)] sm:min-w-[520px] sm:px-5">
      <div className="flex shrink-0 justify-end">
        <button ref={initialFocusRef} type="button" onClick={onClose} aria-label="Close order work card" className="grid h-9 w-9 place-items-center rounded-lg border border-[#272043]/10 bg-white text-[#554d6d] transition hover:bg-brand-50 hover:text-brand-800"><X className="h-4 w-4" /></button>
      </div>
      <OrderDetail order={detail.data} loading={detail.isLoading} onClose={onClose} presentation="drawer" />
    </aside>
  </>;
}

function OrderDetail({
  order,
  loading,
  onClose,
  presentation = "panel",
}: {
  order?: LaundryOrder & {
    timeline: Array<{ id: string; ts: string; action: string }>;
    tags?: Array<OrderTag>;
  };
  loading: boolean;
  onClose: () => void;
  presentation?: "panel" | "page" | "drawer";
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const savedPriceDetails = order ? summaryRows({
    subtotal: order.subtotal,
    charges: order.charges,
    discounts: order.discounts,
    taxAmount: order.taxAmount,
    taxRate: order.taxRate,
    breakdown: order.breakdown,
  }).filter((row) => row.kind !== "subtotal") : [];
  const session = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => isWebOnly ? Promise.resolve(sessionFromStoredCloud()) : apiGet<{ user: { roles: string[] } | null }>("/auth/session"),
  });
  const roles = session.data?.user?.roles;
  const canEditOrder = canUseUi(roles, "orders.edit");
  const canCollectPayment = canUseUi(roles, "payments.collect");
  const canReversePayment = canUseUi(roles, "payments.refund");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"Cash" | "UPI" | "Card" | "Bank">("Cash");
  const [cashRegister, setCashRegister] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [fulfilmentItem, setFulfilmentItem] = useState("0");
  const [fulfilmentStage, setFulfilmentStage] =
    useState<LaundryFulfillmentEvent["stage"]>("Picked Up");
  const [fulfilmentQty, setFulfilmentQty] = useState("");
  const [fulfilmentNote, setFulfilmentNote] = useState("");
  const [editingOrder, setEditingOrder] = useState(false);
  const [editLines, setEditLines] = useState<
    Array<{ garment: string; service: string; qty: string }>
  >([]);
  const [error, setError] = useState("");
  const paymentQuery = useQuery({
    queryKey: ["laundry-order-payments", order?.id],
    queryFn: () =>
      apiGet<LaundryPaymentSummary>(`/laundry/orders/${order!.id}/payments`),
    enabled: Boolean(order?.id),
  });
  const cashShifts = useQuery({
    queryKey: ["laundry-order-cash-shifts"],
    queryFn: () =>
      apiGet<Array<{ id: string; status: string; register: string }>>(
        "/laundry/cash-shifts",
      ),
    enabled: mode === "Cash" && Boolean(order?.id),
    retry: false,
  });
  const fulfilmentQuery = useQuery({
    queryKey: ["laundry-order-fulfilment", order?.id],
    queryFn: () =>
      apiGet<LaundryFulfillmentEvent[]>(
        `/laundry/orders/${order!.id}/fulfillment`,
      ),
    enabled: Boolean(order?.id),
  });
  const catalogueQuery = useQuery({
    queryKey: ["laundry-order-edit-catalogue"],
    queryFn: () => apiGet<LaundryCatalogue>("/laundry/catalogue"),
    enabled: editingOrder,
  });
  const collect = useMutation({
    mutationFn: () =>
      apiPost<{ summary: LaundryPaymentSummary }>(
        `/laundry/orders/${order!.id}/payments`,
        {
          amount: Number(amount),
          mode,
          reference,
          note,
          register: mode === "Cash" ? cashRegister || undefined : undefined,
        },
      ),
    onSuccess: () => {
      setAmount("");
      setReference("");
      setNote("");
      setCashRegister("");
      setError("");
      void paymentQuery.refetch();
      client.invalidateQueries({ queryKey: ["laundry-orders"] });
      client.invalidateQueries({ queryKey: ["laundry-order", order?.id] });
      client.invalidateQueries({ queryKey: ["cash-shift-current"] });
      client.invalidateQueries({ queryKey: ["cash-shifts"] });
      client.invalidateQueries({ queryKey: ["cash-close-drill"] });
    },
    onError: (cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment could not be recorded.",
      ),
  });
  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost<LaundryPaymentSummary>(`/laundry/payments/${id}/reverse`, {
        reason,
      }),
    onSuccess: () => {
      setReverseTarget(null);
      setReverseReason("");
      setError("");
      void paymentQuery.refetch();
      client.invalidateQueries({ queryKey: ["laundry-orders"] });
      client.invalidateQueries({ queryKey: ["laundry-order", order?.id] });
      client.invalidateQueries({ queryKey: ["cash-shift-current"] });
      client.invalidateQueries({ queryKey: ["cash-shifts"] });
      client.invalidateQueries({ queryKey: ["cash-close-drill"] });
    },
    onError: (cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment could not be reversed.",
      ),
  });
  const fulfilment = useMutation({
    mutationFn: () =>
      apiPost<LaundryFulfillmentEvent>(
        `/laundry/orders/${order!.id}/fulfillment`,
        {
          itemIndex: Number(fulfilmentItem),
          stage: fulfilmentStage,
          quantity: Number(fulfilmentQty),
          note: fulfilmentNote,
        },
      ),
    onSuccess: () => {
      setFulfilmentQty("");
      setFulfilmentNote("");
      setError("");
      void fulfilmentQuery.refetch();
    },
    onError: (cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Fulfilment event could not be recorded.",
      ),
  });
  const cancelOrder = useMutation({
    mutationFn: (reason: string) =>
      apiPost<LaundryOrder>(`/laundry/orders/${order!.id}/cancel`, {
        reason,
        expectedVersion: order!.version,
      }),
    onSuccess: () => {
      setCancelReason("");
      setShowCancel(false);
      setError("");
      void paymentQuery.refetch();
      client.invalidateQueries({ queryKey: ["laundry-orders"] });
      client.invalidateQueries({ queryKey: ["laundry-order", order?.id] });
      client.invalidateQueries({ queryKey: ["laundry-dashboard"] });
      client.invalidateQueries({ queryKey: ["laundry-reports"] });
    },
    onError: (cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Order could not be cancelled.",
      ),
  });
  const editOrder = useMutation({
    mutationFn: () =>
      apiPatch<LaundryOrder>(`/laundry/orders/${order!.id}`, {
        items: editLines.map((line) => ({
          garment: line.garment,
          service: line.service,
          qty: Number(line.qty),
        })),
        expectedDeliveryDate: order!.expectedDeliveryDate,
        fulfillmentMode: order!.fulfillmentMode,
        charges: order!.charges,
        discounts: order!.discounts,
        taxRate: order!.taxRate,
        notes: order!.notes,
        deliveryAddress: order!.deliveryAddress,
        serviceZone: order!.serviceZone,
        expectedVersion: order!.version,
      }),
    onSuccess: () => {
      setEditingOrder(false);
      setEditLines([]);
      setError("");
      client.invalidateQueries({ queryKey: ["laundry-orders"] });
      client.invalidateQueries({ queryKey: ["laundry-order", order?.id] });
      client.invalidateQueries({ queryKey: ["laundry-dashboard"] });
      client.invalidateQueries({ queryKey: ["laundry-reports"] });
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "Order could not be edited.",
      ),
  });
  if (!order && !loading)
    return (
      <aside className="rounded-[22px] border border-dashed border-[#99afa8] bg-[#fbfcf8] p-6 text-center text-sm text-[#718087]">
        <Tag className="mx-auto mb-3 h-5 w-5 text-[#55938a]" />
        Select an order to review its garments, payment, captain, and audit trail.
      </aside>
    );
  if (loading || !order)
    return (
      <aside className="grid h-80 place-items-center rounded-[22px] border border-[#263f44]/10 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-[#3a7d78]" />
      </aside>
    );
  const rider = order.deliveryRider || order.pickupRider;
  const summary = paymentQuery.data;
  return (
    <aside className={cn("h-fit rounded-[22px] border border-[#263f44]/10 bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(37,48,43,.05)]", presentation === "page" ? "mx-auto max-w-[1180px]" : presentation === "drawer" ? "border-0 bg-transparent p-0 shadow-none" : "xl:sticky xl:top-24")}>
      <div className={cn("gap-3", presentation === "page" ? "flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between" : "flex justify-between")}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#4d8982]">{presentation === "page" ? "Order detail" : "Order work card"}</p>
          <h2 className="mt-1 font-serif text-xl text-[#17353c]">
            {order.orderNumber}
          </h2>
        </div>
        <div className={cn("flex items-center gap-1", presentation === "page" && "justify-end")}>
          <button
            onClick={onClose}
            className={cn("inline-flex h-8 items-center justify-center rounded-lg hover:bg-[#f0eee9]", presentation === "page" ? "gap-1 px-2 text-[#554d6d]" : "w-8")}
            aria-label="Back to Store Orders and Customers"
          >
            {presentation === "page" ? <ArrowLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {presentation === "page" ? <span className="text-xs font-semibold">Back to Store Orders</span> : null}
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-white p-3">
        <div>
          <p className="font-semibold">{order.customer.name}</p>
          <p className="text-xs text-[#718087]">{order.customer.phone}</p>
        </div>
        <StatePill state={order.state} />
      </div>
      {presentation === "page" ? (
        <>
          <section aria-label="Order summary" className="mt-4 rounded-xl border border-[#263f44]/10 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#17353c]">Order summary</h3>
                <p className="mt-1 text-xs text-[#718087]">Customer, booking, and fulfilment details saved with this order.</p>
              </div>
              <span className="rounded-full bg-[#eaf3ef] px-2.5 py-1 text-[10px] font-bold text-[#39786f]">{order.fulfillmentMode}</span>
            </div>
            <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              <OrderDetailField label="Invoice number" value={order.invoiceNumber || "Not issued"} />
              <OrderDetailField label="Order date" value={formatDate(order.orderDate)} />
              <OrderDetailField label="Expected delivery" value={formatDate(order.expectedDeliveryDate)} />
              <OrderDetailField label="Source" value={order.source || "Not recorded"} />
              <OrderDetailField label="Reported by" value={order.reportedBy || "Not recorded"} />
              <OrderDetailField label="Payment method" value={order.paymentMode || "Not recorded"} />
              <OrderDetailField label="Payment status" value={summary?.status || order.paymentStatus || "Not recorded"} />
              <OrderDetailField label="Pickup slot" value={order.pickupSlot || "Not scheduled"} />
              <OrderDetailField label="Delivery slot" value={order.deliverySlot || "Not scheduled"} />
              <OrderDetailField label="Service zone" value={order.serviceZone || "Not assigned"} />
              <div className="sm:col-span-2 xl:col-span-3">
                <OrderDetailField label="Delivery address" value={order.deliveryAddress || "No delivery address recorded"} />
              </div>
            </dl>
          </section>

          <section aria-label="Order financial summary" className="mt-3 rounded-xl border border-[#263f44]/10 bg-white p-4">
            <h3 className="text-sm font-bold text-[#17353c]">Price summary</h3>
            <p className="mt-1 text-xs text-[#718087]">Saved order amounts from the order record.</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
              <OrderDetailField label="Subtotal" value={formatMoney(order.subtotal)} />
              <OrderDetailField label="Charges" value={formatMoney(order.charges)} />
              <OrderDetailField label="Discounts" value={formatMoney(order.discounts)} />
              <OrderDetailField label="GST rate" value={`${Number(order.taxRate).toLocaleString("en-IN")}%`} />
              <OrderDetailField label="GST amount" value={formatMoney(order.taxAmount)} />
              <div className="rounded-lg bg-[#eaf3ef] px-2.5 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#39786f]">Grand total</dt>
                <dd className="mt-1 font-bold tabular-nums text-[#17353c]">{formatMoney(order.grandTotal)}</dd>
              </div>
            </dl>
            {savedPriceDetails.length ? (
              <ul aria-label="Applied price details" className="mt-3 space-y-1.5 border-t border-[#263f44]/8 pt-3 text-xs">
                {savedPriceDetails.map((row) => (
                  <li key={row.key} className="flex items-start justify-between gap-3 text-[#52676b]">
                    <span>{row.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-[#17353c]">{row.kind === "discount" ? "−" : ""}{formatMoney(row.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-label="Order notes and photo" className="mt-3 rounded-xl border border-[#263f44]/10 bg-white p-4">
            <h3 className="text-sm font-bold text-[#17353c]">Notes and photo</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#52676b]">{order.notes?.trim() || "No order notes recorded."}</p>
            {order.photoPaths ? <img src={order.photoPaths} alt={`Attached photo for order ${order.orderNumber}`} className="mt-3 h-28 w-28 rounded-lg object-cover ring-1 ring-[#263f44]/10" /> : <p className="mt-2 text-xs text-[#718087]">No order photo attached.</p>}
          </section>
        </>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {canEditOrder && !["Delivered", "Cancelled"].includes(order.state) ? (
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams({ edit: order.id });
              if (presentation === "page") params.set("returnTo", `/laundry/orders/${order.id}`);
              navigate(`/laundry/new-order?${params.toString()}`);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#39786f]/25 bg-[#eaf3ef] px-3 py-2 text-xs font-bold text-[#39786f]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit in order builder
          </button>
        ) : (
          <span />
        )}
        {canEditOrder && !["Delivered", "Cancelled"].includes(order.state) ? (
          <button
            type="button"
            disabled={cancelOrder.isPending}
            onClick={() => {
              setShowCancel((visible) => !visible);
              setError("");
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-60"
          >
            <Ban className="h-3.5 w-3.5" />
            {showCancel ? "Close cancellation" : cancelOrder.isPending ? "Cancelling…" : "Cancel order"}
          </button>
        ) : null}
      </div>
      {canEditOrder && showCancel ? (
        <section className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-bold text-rose-800">Cancellation reason required</p>
          <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Explain why this order is being cancelled" className="mt-2 min-h-16 w-full rounded-lg border border-rose-200 bg-white p-2 text-xs outline-none focus:border-rose-400" />
          <div className="mt-2 flex gap-2"><button type="button" onClick={() => setShowCancel(false)} className="flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700">Keep order</button><button type="button" disabled={cancelOrder.isPending || !cancelReason.trim()} onClick={() => cancelOrder.mutate(cancelReason.trim())} className="flex-1 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{cancelOrder.isPending ? "Cancelling…" : "Confirm cancellation"}</button></div>
        </section>
      ) : null}
      <div className="mt-4 space-y-2">
        {order.items.map((item, index) => (
          <div
            key={`${item.garmentName}:${index}`}
            className="rounded-xl border border-[#263f44]/8 bg-white p-3 text-sm"
          >
            <div className="flex justify-between">
              <span>
                <span className="block font-medium">{item.garmentName}</span>
                <span className="text-xs text-[#718087]">
                  {item.serviceName} · {item.qty} {item.unit.toLowerCase()}{presentation === "page" ? ` × ${formatMoney(item.rate)} each` : ""}
                </span>
                {(item.color || item.garmentType) ? <span className="mt-1 block text-[11px] font-semibold text-[#4d706d]">{[item.color, item.garmentType].filter(Boolean).join(' · ')}</span> : null}
              </span>
              <span className="font-bold tabular-nums">
                {formatINR(item.amount)}
              </span>
            </div>
            {item.fulfilment ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#718087]">
                <span>
                  Received {item.fulfilment.received}/{item.fulfilment.ordered}
                </span>
                <span className="font-semibold text-[#39786f]">
                  Delivered {item.fulfilment.delivered}
                </span>
                <span
                  className={
                    item.fulfilment.pending
                      ? "font-semibold text-[#a97420]"
                      : ""
                  }
                >
                  Pending {item.fulfilment.pending}
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <TraceabilitySummary order={order} />
      {canEditOrder && editingOrder ? (
        <section className="mt-3 rounded-xl border border-[#39786f]/20 bg-[#f3faf6] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#39786f]">
            Controlled edit
          </p>
          <p className="mt-1 text-[10px] leading-4 text-[#617178]">
            Only unpaid orders can be amended. A replacement invoice and
            explicit ledger adjustment preserve the original history.
          </p>
          <OrderItemEditor
            order={order}
            lines={editLines}
            setLines={setEditLines}
            catalogue={catalogueQuery.data}
            loading={catalogueQuery.isLoading}
            failed={catalogueQuery.isError}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={editOrder.isPending}
              onClick={() => editOrder.mutate()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#39786f] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {editOrder.isPending ? "Saving…" : "Save replacement"}
            </button>
            <button
              type="button"
              onClick={() => setEditingOrder(false)}
              className="rounded-lg border border-[#39786f]/20 px-3 py-2 text-xs font-bold text-[#39786f]"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      <div className="mt-4 flex justify-between border-t border-[#263f44]/10 pt-4">
        <span className="text-sm text-[#617178]">
          {summary?.status || order.paymentStatus} · {order.paymentMode}
        </span>
        <span className="font-serif text-xl">
          {formatMoney(summary?.total ?? order.grandTotal)}
        </span>
      </div>
      <div className="mt-4 rounded-xl bg-[#eaf3ef] p-3 text-xs text-[#32695f]">
        <Truck className="mr-1.5 inline h-4 w-4" />
        {rider
          ? `${rider.name}${rider.phone ? ` · ${rider.phone}` : ""}`
          : "No captain assigned"}{" "}
        · {order.fulfillmentMode}
      </div>
      <section className="mt-4 rounded-xl border border-[#263f44]/10 bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#648077]">
          Fulfilment details
        </p>
        <p className="mt-1 text-xs leading-5 text-[#617178]">
          {order.deliveryAddress || "No delivery address recorded."}
        </p>
        {order.photoPaths && (
          <img
            src={order.photoPaths}
            alt="Attached garment"
            className="mt-2 h-20 w-20 rounded-lg object-cover ring-1 ring-[#263f44]/10"
          />
        )}
        <div className="mt-3 border-t border-dashed border-[#263f44]/10 pt-3">
          {canEditOrder ? <>
          <p className="text-xs font-semibold text-[#40565a]">
            Record item progress
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              aria-label="Fulfilment item"
              value={fulfilmentItem}
              onChange={(event) => setFulfilmentItem(event.target.value)}
              className="h-8 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs"
            >
              {order.items.map((item, index) => (
                <option key={index} value={index}>
                  {index + 1}. {item.garmentName}
                </option>
              ))}
            </select>
            <select
              aria-label="Fulfilment stage"
              value={fulfilmentStage}
              onChange={(event) =>
                setFulfilmentStage(
                  event.target.value as LaundryFulfillmentEvent["stage"],
                )
              }
              className="h-8 rounded-lg border border-[#263f44]/15 bg-white px-2 text-xs"
            >
              <option>Picked Up</option>
              <option>In Process</option>
              <option>Ready</option>
              <option>Delivered</option>
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={fulfilmentQty}
              onChange={(event) => setFulfilmentQty(event.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              placeholder={`Qty (${order.items[Number(fulfilmentItem)]?.unit || "Piece"})`}
              className="h-8 w-24 rounded-lg border border-[#263f44]/15 px-2 text-xs"
            />
            <input
              value={fulfilmentNote}
              onChange={(event) => setFulfilmentNote(event.target.value)}
              placeholder="Progress note (optional)"
              className="h-8 min-w-0 flex-1 rounded-lg border border-[#263f44]/15 px-2 text-xs"
            />
          </div>
          <button
            type="button"
            disabled={fulfilment.isPending || !Number(fulfilmentQty)}
            onClick={() => fulfilment.mutate()}
            className="mt-2 h-8 w-full rounded-lg bg-[#3a7d78] text-xs font-bold text-white disabled:bg-[#a8b7b2]"
          >
            {fulfilment.isPending ? "Saving…" : "Save progress event"}
          </button>
          </> : <p className="text-[10px] text-[#819094]">Progress entry is available to staff with order edit access.</p>}
          {fulfilmentQuery.data?.length ? (
            <div className="mt-2 space-y-1">
              {fulfilmentQuery.data
                .slice()
                .reverse()
                .map((event) => (
                  <div
                    key={event.id}
                    className="flex justify-between rounded-lg bg-[#f7faf7] px-2 py-1.5 text-[10px] text-[#617178]"
                  >
                    <span>
                      <strong>{event.stage}</strong> · item{" "}
                      {event.itemIndex + 1}
                    </span>
                    <span>
                      {event.quantity} {event.unit}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-[#819094]">
              No item-level events recorded yet.
            </p>
          )}
        </div>
      </section>
      {order.tags?.length ? (
        <section className="mt-4 rounded-xl border border-[#664cf0]/15 bg-[#f7f5ff] p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.15em] text-[#5b45c8]">
              <Tag className="h-3.5 w-3.5" />
              Garment tags
            </p>
            <span className="text-[10px] font-semibold text-[#756e9a]">
              {order.tags.length} physical unit
              {order.tags.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {order.tags.map((tag) => (
              <div
                key={tag.tagNumber}
                className="rounded-lg border border-[#664cf0]/10 bg-white p-2.5"
              >
                <p className="text-xs font-bold text-[#4b3bb0]">
                  {tag.tagNumber}{" "}
                  <span className="font-normal text-[#8178a8]">
                    · {tag.sequence}/{tag.total}
                  </span>
                </p>
                <p className="mt-1 text-xs font-semibold text-[#443b58]">
                  {tag.garment}
                </p>
                <p className="text-[10px] text-[#8178a8]">
                  {tag.service} · Due {tag.expectedDeliveryDate} · {order.physicalUnits?.find((unit) => unit.tagCode === tag.tagNumber)?.state || "Active"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="mt-5 rounded-2xl border border-[#664cf0]/15 bg-[#f7f5ff] p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.15em] text-[#5b45c8]">
            <CircleDollarSign className="h-3.5 w-3.5" />
            Collection ledger
          </p>
          {summary && (
            <span className="text-xs font-bold text-[#4b3bb0]">
              {formatMoney(summary.outstanding)} due
            </span>
          )}
        </div>
        {summary && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-xs">
            <div className="rounded-lg bg-white p-2">
              <span className="block text-[#7b739d]">Total</span>
              <strong>{formatMoney(summary.total)}</strong>
            </div>
            <div className="rounded-lg bg-white p-2">
              <span className="block text-[#7b739d]">Paid</span>
              <strong>{formatMoney(summary.paid)}</strong>
            </div>
            <div className="rounded-lg bg-white p-2">
              <span className="block text-[#7b739d]">Status</span>
              <strong>{summary.status}</strong>
            </div>
          </div>
        )}
        {summary?.outstanding && canCollectPayment ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#6d6594]">
                Amount
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  type="number"
                  min="0.01"
                  max={summary.outstanding}
                  step="0.01"
                  placeholder={String(summary.outstanding)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#664cf0]/20 bg-white px-2 text-sm font-semibold normal-case tracking-normal text-[#30265f]"
                />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#6d6594]">
                Method
                <select
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as typeof mode)
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-[#664cf0]/20 bg-white px-2 text-sm font-semibold normal-case tracking-normal text-[#30265f]"
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Bank</option>
                </select>
              </label>
            </div>
            {mode === "Cash" && cashShifts.data?.filter((shift) => shift.status === "Open").length ? (
              <label className="mt-2 block text-[10px] font-bold uppercase tracking-[.12em] text-[#6d6594]">
                Cash register
                <select value={cashRegister} onChange={(event) => setCashRegister(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#664cf0]/20 bg-white px-2 text-xs font-semibold normal-case tracking-normal text-[#30265f]"><option value="">{cashShifts.data.filter((shift) => shift.status === "Open").length === 1 ? "Main / only open register" : "Choose an open register"}</option>{cashShifts.data.filter((shift) => shift.status === "Open").map((shift) => <option key={shift.id} value={shift.register}>{shift.register}</option>)}</select>
              </label>
            ) : mode === "Cash" ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] font-semibold text-amber-800">Open a cash register before recording cash.</p> : null}
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Reference / receipt no. (optional)"
              className="mt-2 h-9 w-full rounded-lg border border-[#664cf0]/20 bg-white px-2 text-xs outline-none"
            />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Collection note (optional)"
              className="mt-2 h-9 w-full rounded-lg border border-[#664cf0]/20 bg-white px-2 text-xs outline-none"
            />
            <button
              type="button"
              disabled={collect.isPending || !Number(amount)}
              onClick={() => collect.mutate()}
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#664cf0] text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-[#b8afe8]"
            >
              {collect.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleDollarSign className="h-3.5 w-3.5" />
              )}
              Record collection
            </button>
          </>
        ) : summary?.outstanding ? (
          <p className="mt-3 rounded-lg bg-white p-2 text-xs text-[#756e9a]">{formatMoney(summary.outstanding)} remains due. Ask counter staff to record a collection.</p>
        ) : (
          <p className="mt-3 rounded-lg bg-white p-2 text-xs font-semibold text-[#4b3bb0]">
            This invoice is fully settled.
          </p>
        )}
        {summary?.payments.length ? (
          <div className="mt-3 space-y-1.5">
            {summary.payments.map((payment) => (
              <div key={payment.id}>
              <div
                key={payment.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"
              >
                <span>
                  <strong>{formatINR(payment.amount)}</strong> · {payment.mode}
                  <span className="block text-[10px] text-[#8178a8]">
                    {payment.reference || payment.postingDate} ·{" "}
                    {payment.providerStatus}
                  </span>
                </span>
                {canReversePayment ? <button
                  type="button"
                  disabled={reverse.isPending}
                  onClick={() => {
                    setReverseTarget(payment.id);
                    setReverseReason("");
                    setError("");
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-bold text-rose-700 hover:bg-rose-50"
                  title="Reverse collection"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reverse
                </button> : null}
              </div>
              {canReversePayment && reverseTarget === payment.id ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                  <input value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder="Reason for reversal" className="h-8 w-full rounded-md border border-rose-200 bg-white px-2 text-xs outline-none focus:border-rose-400" />
                  <div className="mt-2 flex gap-2"><button type="button" onClick={() => setReverseTarget(null)} className="flex-1 rounded-md border border-rose-200 bg-white px-2 py-1.5 text-[10px] font-bold text-rose-700">Keep payment</button><button type="button" disabled={reverse.isPending || !reverseReason.trim()} onClick={() => reverse.mutate({ id: payment.id, reason: reverseReason.trim() })} className="flex-1 rounded-md bg-rose-700 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">{reverse.isPending ? "Reversing…" : "Confirm reversal"}</button></div>
                </div>
              ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[10px] leading-4 text-[#756e9a]">
          Manual-safe recording only. UPI/Card entries remain operator-confirmed
          until a provider is configured.
        </p>
      </section>
      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-5 border-t border-[#263f44]/10 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#648077]">
          Timeline
        </p>
        <div className="mt-3 space-y-3">
          {order.timeline.map((entry) => (
            <div key={entry.id} className="flex gap-2 text-xs">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#65a298]" />
              <span>
                <span className="font-semibold text-[#40565a]">
                  {entry.action.replace("laundry:", "").replace(":", " ")}
                </span>
                <span className="block text-[#819094]">
                  {new Date(entry.ts).toLocaleString("en-IN")}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
function OrderDetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-[#f8faf9] px-2.5 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#718087]">{label}</dt>
      <dd className="mt-1 break-words text-xs font-semibold text-[#33494d]">{value}</dd>
    </div>
  );
}
function StatePill({ state }: { state: LaundryState }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset",
        stateTone[state],
      )}
    >
      {state}
    </span>
  );
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}
async function exportOrders(rows: LaundryOrder[]) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((order) => ({
      "Invoice no.": order.invoiceNumber,
      "Order no.": order.orderNumber,
      Customer: order.customer.name,
      Phone: order.customer.phone,
      "Order date": order.orderDate,
      "Delivery date": order.expectedDeliveryDate,
      Amount: order.grandTotal,
      "Payment mode": order.paymentMode,
      "Payment status": order.paymentStatus,
      Status: order.state,
      "Fulfilment mode": order.fulfillmentMode,
      Captain: order.deliveryRider?.name || order.pickupRider?.name || "",
    })),
  );
  sheet["!cols"] = [16, 16, 24, 16, 14, 16, 14, 16, 16, 18, 18, 22].map(
    (width) => ({ wch: width }),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Store Orders");
  XLSX.writeFile(
    workbook,
    `laundry-store-orders-${new Date().toISOString().slice(0, 10)}.xlsx`,
    { compression: true },
  );
}
