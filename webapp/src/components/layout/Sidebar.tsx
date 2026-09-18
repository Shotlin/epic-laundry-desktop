import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, FileText, Users, MessageSquare, TrendingUp,
  Package, ShoppingBag, Factory, Landmark, Building2, ScrollText, RotateCcw,
  UserCog, FolderKanban, Wallet, Boxes, Sparkles, BadgeIndianRupee, Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { section: string; items: { to: string; label: string; icon: any }[] }[] = [
  { section: "Overview", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ]},
  { section: "Sell", items: [
    { to: "/pos", label: "POS Billing", icon: ShoppingCart },
    { to: "/invoices", label: "Invoices", icon: FileText },
    { to: "/crm", label: "CRM", icon: Users },
    { to: "/engage", label: "Engagement", icon: MessageSquare },
    { to: "/selling", label: "Quotations & Orders", icon: TrendingUp },
  ]},
  { section: "Stock", items: [
    { to: "/inventory", label: "Inventory", icon: Package },
    { to: "/buying", label: "Buying", icon: ShoppingBag },
    { to: "/manufacturing", label: "Manufacturing", icon: Factory },
  ]},
  { section: "Money", items: [
    { to: "/accounting", label: "Accounting", icon: Landmark },
    { to: "/banking", label: "Banking", icon: Building2 },
    { to: "/gst", label: "GST & e-Invoice", icon: BadgeIndianRupee },
    { to: "/compliance", label: "Compliance", icon: Scale },
    { to: "/returns", label: "Returns", icon: RotateCcw },
  ]},
  { section: "People & More", items: [
    { to: "/hr", label: "HR & Payroll", icon: UserCog },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/assets", label: "Fixed Assets", icon: Boxes },
    { to: "/ops", label: "Operations", icon: Wallet },
    { to: "/ai", label: "Epic AI", icon: Sparkles },
  ]},
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-card">
      <div className="flex h-[var(--header-height)] items-center gap-2 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">E</div>
        <div className="leading-tight">
          <div className="font-semibold">Epic BOS</div>
          <div className="text-[11px] text-muted-foreground">India Business OS</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((group) => (
          <div key={group.section} className="mb-5">
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.section}
            </div>
            {group.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <it.icon className="h-[18px] w-[18px]" />
                {it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
