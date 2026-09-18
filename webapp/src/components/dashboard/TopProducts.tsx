import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatINR, formatNumber } from "@/lib/utils"

interface TopItem {
  item: string
  name: string
  qty: number
  revenue: number
}

export function TopProducts({ items = [] }: { items?: TopItem[]; loading?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.revenue))
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Top Products</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No sales yet.</p>
        )}
        {items.map((it, i) => (
          <div key={it.item} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 truncate">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-600">
                  {i + 1}
                </span>
                <span className="truncate font-medium">{it.name}</span>
              </span>
              <span className="shrink-0 tabular-nums font-semibold">{formatINR(it.revenue)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.round((it.revenue / max) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatNumber(it.qty)} sold
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
