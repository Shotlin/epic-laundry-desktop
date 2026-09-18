import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface DashboardSummary {
  kpis: {
    today: number; ordersToday: number; mtd: number; mtdOrders: number;
    avgOrder: number; prevMonth: number; prevSlice: number; momPct: number;
  };
  finance: { receivables: number; payables: number; cash_position: number; gst_payable: number; net_profit: number };
  revenueSeries: { date: string; label: string; revenue: number; orders: number }[];
  ordersByHour: { hour: number; label: string; orders: number; revenue: number }[];
  paymentMix: { mode: string; count: number; value: number }[];
  topItems: { item: string; name: string; qty: number; revenue: number }[];
  alertCounts: { overdue: number; reorder: number; gst: number; subscriptions: number; budgets: number };
  anomalies: string[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiGet<DashboardSummary>("/dashboard/summary"),
  });
}
