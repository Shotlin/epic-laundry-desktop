import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LaundryShell } from "@/components/laundry/LaundryShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { canUseUi, type UiPermission } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { isWebOnly, sessionFromStoredCloud } from "@/lib/cloudAuth";
import NotOnWeb from "@/components/laundry/NotOnWeb";

// Operational pages are independently loaded. A counter opening the dashboard
// should not pay the startup cost of reports, statutory controls, imports, or
// print-centre code that they may never visit in that session.
const LaundryDashboard = lazy(() => import("@/pages/laundry/LaundryDashboard"));
const LaundryBooking = lazy(() => import("@/pages/laundry/LaundryBooking"));
const LaundryOrders = lazy(() => import("@/pages/laundry/LaundryOrders"));
const LaundryCatalogue = lazy(() => import("@/pages/laundry/LaundryCatalogue"));
const LaundryExpenses = lazy(() => import("@/pages/laundry/LaundryExpenses"));
const LaundryReports = lazy(() => import("@/pages/laundry/LaundryReports"));
const LaundryImport = lazy(() => import("@/pages/laundry/LaundryImport"));
const LaundryMessageTemplates = lazy(() => import("@/pages/laundry/LaundryMessageTemplates"));
const LaundryOrderNoSeries = lazy(() => import("@/pages/laundry/LaundryOrderNoSeries"));
const LaundryStoreDiscounts = lazy(() => import("@/pages/laundry/LaundryStoreDiscounts"));
const LaundryStoreCharges = lazy(() => import("@/pages/laundry/LaundryStoreCharges"));
const LaundryServiceUnits = lazy(() => import("@/pages/laundry/LaundryServiceUnits"));
const LaundryCategories = lazy(() => import("@/pages/laundry/LaundryCategories"));
const LaundryServices = lazy(() => import("@/pages/laundry/LaundryServices"));
const LaundryStoreUsers = lazy(() => import("@/pages/laundry/LaundryStoreUsers"));
const LaundryStorePackages = lazy(() => import("@/pages/laundry/LaundryStorePackages"));
const LaundryCatalogueImport = lazy(() => import("@/pages/laundry/LaundryCatalogueImport"));
const LaundryDispatch = lazy(() => import("@/pages/laundry/LaundryDispatch"));
const LaundrySettings = lazy(() => import("@/pages/laundry/LaundrySettings"));
const LaundryCustomers = lazy(() => import("@/pages/laundry/LaundryCustomers"));
const LaundryPackages = lazy(() => import("@/pages/laundry/LaundryPackages"));
const LaundryPrintCentre = lazy(() => import("@/pages/laundry/LaundryPrintCentre"));
const LaundrySettlements = lazy(() => import("@/pages/laundry/LaundrySettlements"));
const LaundryReportDetail = lazy(() => import("@/pages/laundry/LaundryReportDetail"));
const LaundryStatistics = lazy(() => import("@/pages/laundry/LaundryStatistics"));
const LaundryGarmentTracking = lazy(() => import("@/pages/laundry/LaundryGarmentTracking"));
const LaundryCashClosing = lazy(() => import("@/pages/laundry/LaundryCashClosing"));
const LaundryProductionQueue = lazy(() => import("@/pages/laundry/LaundryProductionQueue"));
const LaundryQualityClaims = lazy(() => import("@/pages/laundry/LaundryQualityClaims"));
const LaundryCorrections = lazy(() => import("@/pages/laundry/LaundryCorrections"));
const LaundryRoutes = lazy(() => import("@/pages/laundry/LaundryRoutes"));
const LaundryOnlineOrders = lazy(() => import("@/pages/laundry/LaundryOnlineOrders"));
const LaundryMarketplaceCatalogue = lazy(() => import("@/pages/laundry/LaundryMarketplaceCatalogue"));
const LaundryPlatformControl = lazy(() => import("@/pages/laundry/LaundryPlatformControl"));
const LaundryPlatformOrders = lazy(() => import("@/pages/laundry/LaundryPlatformOrders"));
const LaundryPlatformAudit = lazy(() => import("@/pages/laundry/LaundryPlatformAudit"));
const LaundryPlatformFinance = lazy(() => import("@/pages/laundry/LaundryPlatformFinance"));
const LaundrySyncStatus = lazy(() => import("@/pages/laundry/LaundrySyncStatus"));
const LaundryOperationsHub = lazy(() => import("@/pages/laundry/LaundryOperationsHub"));
const LaundryFinanceCommandCenter = lazy(() => import("@/pages/laundry/LaundryFinanceCommandCenter"));
const LaundryManagement = lazy(() => import("@/pages/laundry/LaundryManagement"));
const LaundryReturns = lazy(() => import("@/pages/laundry/LaundryReturns"));
const LaundryFinanceSetup = lazy(() => import("@/pages/laundry/LaundryFinanceSetup"));
const LaundryStatutoryFinance = lazy(() => import("@/pages/laundry/LaundryStatutoryFinance"));
// The website reads Finance / Statutory from the real backend report (channel + period filters); the desktop keeps its own pages.
const LaundryWebFinance = lazy(() => import("@/pages/laundry/LaundryWebFinance"));
const LaundryWebStatutory = lazy(() => import("@/pages/laundry/LaundryWebStatutory"));

export function App() {
  return (
    <AuthGate>
    <Suspense fallback={<RouteLoading />}>
    <Routes>
      <Route path="/" element={<LaundryLanding />} />
      <Route path="/laundry" element={<LaundryShell />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PermissionGate permission="orders.read"><LaundryDashboard /></PermissionGate>} />
        <Route path="operations" element={<PermissionGate permission="orders.read"><LaundryOperationsHub /></PermissionGate>} />
        <Route path="finance" element={<PermissionGate permission="settings.manage">{isWebOnly ? <LaundryWebFinance /> : <LaundryFinanceCommandCenter />}</PermissionGate>} />
        <Route path="finance/statutory" element={<PermissionGate permission="settings.manage">{isWebOnly ? <LaundryWebStatutory /> : <LaundryStatutoryFinance />}</PermissionGate>} />
        <Route path="management" element={<PermissionGate permission="settings.manage"><LaundryManagement /></PermissionGate>} />
        <Route path="finance-setup" element={<PermissionGate permission="settings.manage">{isWebOnly ? <NotOnWeb title="Finance setup" reason="Legal-entity, PAN/TAN and statutory ledger setup is only used by the desktop accounting module. Your GST and finance reports are on the Finance and Statutory pages." /> : <LaundryFinanceSetup />}</PermissionGate>} />
        <Route path="customers" element={<PermissionGate permission="customers.read"><LaundryCustomers /></PermissionGate>} />
        <Route path="customers/:id" element={<PermissionGate permission="customers.read"><LaundryCustomers /></PermissionGate>} />
        <Route path="packages" element={<PermissionGate permission="packages.read"><LaundryPackages /></PermissionGate>} />
        <Route path="new-order" element={<OrderBuilderGate />} />
        <Route path="orders" element={<PermissionGate permission="orders.read"><LaundryOrders /></PermissionGate>} />
        <Route path="orders/:id" element={<PermissionGate permission="orders.read"><LaundryOrders /></PermissionGate>} />
        <Route path="online-orders" element={<PermissionGate permission="orders.read"><LaundryOnlineOrders /></PermissionGate>} />
        <Route path="marketplace-catalogue" element={<PermissionGate permission="catalogue.read"><LaundryMarketplaceCatalogue /></PermissionGate>} />
        <Route path="platform-control" element={<PermissionGate permission="settings.manage">{isWebOnly ? <NotOnWeb title="Platform Control" reason="LNDRY platform administration is done by the LNDRY team in the admin dashboard, not from a shop website." /> : <LaundryPlatformControl />}</PermissionGate>} />
        <Route path="platform-orders" element={<PermissionGate permission="settings.manage">{isWebOnly ? <NotOnWeb title="Platform orders" reason="LNDRY platform administration is done by the LNDRY team in the admin dashboard, not from a shop website." /> : <LaundryPlatformOrders />}</PermissionGate>} />
        <Route path="platform-audit" element={<PermissionGate permission="settings.manage">{isWebOnly ? <NotOnWeb title="Platform audit trail" reason="LNDRY platform administration is done by the LNDRY team in the admin dashboard, not from a shop website." /> : <LaundryPlatformAudit />}</PermissionGate>} />
        <Route path="platform-finance" element={<PermissionGate permission="settings.manage">{isWebOnly ? <NotOnWeb title="Platform finance" reason="LNDRY platform administration is done by the LNDRY team in the admin dashboard, not from a shop website." /> : <LaundryPlatformFinance />}</PermissionGate>} />
        <Route path="sync-status" element={<PermissionGate permission="settings.manage"><LaundrySyncStatus /></PermissionGate>} />
        <Route path="garment-tracking" element={<PermissionGate permission="garments.read"><LaundryGarmentTracking /></PermissionGate>} />
        <Route path="cash-closing" element={<PermissionGate permission="cash.read"><LaundryCashClosing /></PermissionGate>} />
        <Route path="production-queue" element={<PermissionGate permission="production.read"><LaundryProductionQueue /></PermissionGate>} />
        <Route path="quality-claims" element={<PermissionGate permission="quality.read"><LaundryQualityClaims /></PermissionGate>} />
        <Route path="corrections" element={<PermissionGate permission="quality.read"><LaundryCorrections /></PermissionGate>} />
        <Route path="returns" element={<PermissionGate permission="quality.read"><LaundryReturns /></PermissionGate>} />
        <Route path="routes" element={<PermissionGate permission="routes.read"><LaundryRoutes /></PermissionGate>} />
        <Route path="print-centre" element={<PermissionGate permission="orders.read"><LaundryPrintCentre /></PermissionGate>} />
        <Route path="settlements" element={<PermissionGate permission="orders.read"><LaundrySettlements /></PermissionGate>} />
        <Route path="dispatch" element={<PermissionGate permission="orders.read"><LaundryDispatch /></PermissionGate>} />
        <Route path="expenses" element={<PermissionGate permission="expenses.create"><LaundryExpenses /></PermissionGate>} />
        <Route path="reports" element={<PermissionGate permission="reports.read"><LaundryReports /></PermissionGate>} />
        <Route path="reports/:kind" element={<PermissionGate permission="reports.read"><LaundryReportDetail /></PermissionGate>} />
        <Route path="statistics" element={<PermissionGate permission="orders.read"><LaundryStatistics /></PermissionGate>} />
        <Route path="import-prices" element={<PermissionGate permission="settings.manage"><LaundryImport mode="prices" /></PermissionGate>} />
        <Route path="import-customers" element={<PermissionGate permission="settings.manage"><LaundryImport mode="customers" /></PermissionGate>} />
        <Route path="message-templates" element={<PermissionGate permission="settings.manage"><LaundryMessageTemplates /></PermissionGate>} />
        <Route path="order-series" element={<PermissionGate permission="settings.manage"><LaundryOrderNoSeries /></PermissionGate>} />
        <Route path="settings/discounts" element={<PermissionGate permission="settings.manage"><LaundryStoreDiscounts /></PermissionGate>} />
        <Route path="settings/charges" element={<PermissionGate permission="settings.manage"><LaundryStoreCharges /></PermissionGate>} />
        <Route path="settings/service-units" element={<PermissionGate permission="settings.manage"><LaundryServiceUnits /></PermissionGate>} />
        <Route path="settings/categories" element={<PermissionGate permission="settings.manage"><LaundryCategories /></PermissionGate>} />
        <Route path="settings/services" element={<PermissionGate permission="settings.manage"><LaundryServices /></PermissionGate>} />
        <Route path="settings/store-users" element={<PermissionGate permission="settings.manage"><LaundryStoreUsers /></PermissionGate>} />
        <Route path="settings/store-packages" element={<PermissionGate permission="settings.manage"><LaundryStorePackages /></PermissionGate>} />
        <Route path="import-catalogue" element={<PermissionGate permission="settings.manage"><LaundryCatalogueImport /></PermissionGate>} />
        <Route path="catalogue" element={<PermissionGate permission="catalogue.read"><LaundryCatalogue /></PermissionGate>} />
        <Route path="settings" element={<PermissionGate permission="settings.manage"><LaundrySettings /></PermissionGate>} />
      </Route>
      <Route path="*" element={<Navigate to="/laundry/dashboard" replace />} />
    </Routes>
    </Suspense>
    </AuthGate>
  );
}

function RouteLoading() {
  return <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Opening workspace…</div>;
}

function LaundryLanding() {
  const session = useQuery({ queryKey: ['auth-session'], queryFn: () => isWebOnly ? Promise.resolve(sessionFromStoredCloud()) : apiGet<{ user: { roles: string[] } | null }>('/auth/session') })
  if (session.isLoading) return <div className="grid h-screen place-items-center text-sm text-muted-foreground">Opening your laundry workspace…</div>
  const roles = session.data?.user?.roles || []
  const target = roles.includes('owner')
    ? '/laundry/dashboard'
    : roles.includes('counter_staff')
      ? '/laundry/new-order'
      : roles.includes('processing_staff')
        ? '/laundry/production-queue'
        : roles.includes('rider')
          ? '/laundry/routes'
          : '/laundry/dashboard'
  return <Navigate to={target} replace />
}

function PermissionGate({ permission, children }: { permission: UiPermission; children: ReactNode }) {
  const session = useQuery({ queryKey: ['auth-session'], queryFn: () => isWebOnly ? Promise.resolve(sessionFromStoredCloud()) : apiGet<{ user: { roles: string[] } | null }>('/auth/session') })
  if (session.isLoading) return <div className="grid h-72 place-items-center text-sm text-muted-foreground">Checking your workspace access…</div>
  if (!canUseUi(session.data?.user?.roles, permission)) return <section className="mx-auto mt-16 max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-7 text-center text-amber-950"><h1 className="font-serif text-2xl">This workspace is not assigned to your role.</h1><p className="mt-2 text-sm leading-6">Ask an owner to update your branch access if you need this part of Epic Laundry.</p></section>
  return <>{children}</>
}

function OrderBuilderGate() {
  const location = useLocation()
  const isAmendment = Boolean(new URLSearchParams(location.search).get('edit'))
  return <PermissionGate permission={isAmendment ? 'orders.edit' : 'orders.create'}><LaundryBooking /></PermissionGate>
}
