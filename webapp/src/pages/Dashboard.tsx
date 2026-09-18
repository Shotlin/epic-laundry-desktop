import { useDashboard } from "@/hooks/useDashboard"
import { formatINR, formatShort, formatNumber } from "@/lib/utils"
import { KpiCard } from "@/components/dashboard/KpiCard"
import { RevenueTrend } from "@/components/dashboard/RevenueTrend"
import { PaymentMix } from "@/components/dashboard/PaymentMix"
import { TopProducts } from "@/components/dashboard/TopProducts"
import { BusyHours } from "@/components/dashboard/BusyHours"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  IndianRupee, ShoppingCart, TrendingUp, Wallet, Landmark,
  ArrowDownRight, ArrowUpRight, AlertTriangle, Receipt, Users,
} from "lucide-react"

export default function Dashboard() {
  const { data, isLoading, isError } = useDashboard()

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Could not reach the server. Is the backend running?
      </div>
    )
  }

  const k = data?.kpis
  const f = data?.finance

  return (
    <div className="space-y-6">
      {/* Headline KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={isLoading ? undefined : formatINR(k?.today ?? 0)}
          sub={`${k?.ordersToday ?? 0} orders today`}
          icon={<IndianRupee className="h-5 w-5" />}
          variant="primary"
          spark={data?.revenueSeries?.map((d) => d.revenue)}
        />
        <KpiCard
          label="This Month"
          value={isLoading ? undefined : formatINR(k?.mtd ?? 0)}
          change={k?.momPct}
          sub="vs last month"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          label="Avg Order Value"
          value={isLoading ? undefined : formatINR(k?.avgOrder ?? 0)}
          sub={`${formatNumber(k?.mtdOrders ?? 0)} orders MTD`}
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <KpiCard
          label="Cash in Hand"
          value={isLoading ? undefined : formatINR(f?.cash_position ?? 0)}
          sub="net liquid position"
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      {/* Revenue trend + payment mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrend data={data?.revenueSeries} loading={isLoading} />
        </div>
        <PaymentMix data={data?.paymentMix} loading={isLoading} />
      </div>

      {/* Money strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyStat label="Receivables" value={f?.receivables} icon={<ArrowDownRight className="h-4 w-4 text-success" />} loading={isLoading} tone="success" />
        <MoneyStat label="Payables" value={f?.payables} icon={<ArrowUpRight className="h-4 w-4 text-danger" />} loading={isLoading} tone="danger" />
        <MoneyStat label="Net GST Payable" value={f?.gst_payable} icon={<Landmark className="h-4 w-4 text-info" />} loading={isLoading} tone="info" />
        <MoneyStat label="Net Profit (MTD)" value={f?.net_profit} icon={<Receipt className="h-4 w-4 text-brand-500" />} loading={isLoading} tone="brand" />
      </div>

      {/* Top products + busy hours */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProducts items={data?.topItems} loading={isLoading} />
        <BusyHours data={data?.ordersByHour} loading={isLoading} />
      </div>

      {/* Alerts */}
      {data?.anomalies && data.anomalies.length > 0 && (
        <Card className="border-warning/30 bg-warning-bg/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.anomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                {a}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MoneyStat({
  label, value, icon, loading, tone,
}: {
  label: string; value?: number; icon: React.ReactNode; loading?: boolean
  tone: "success" | "danger" | "info" | "brand"
}) {
  const toneRing = {
    success: "bg-success-bg", danger: "bg-danger-bg", info: "bg-info-bg", brand: "bg-brand-50",
  }[tone]
  return (
    <Card className="border shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneRing}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-20" />
          ) : (
            <div className="text-lg font-semibold tabular-nums">{formatINR(value ?? 0)}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
