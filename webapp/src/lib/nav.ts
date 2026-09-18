import {
  LayoutDashboard, ShoppingCart, FileText, Users, MessageSquare, TrendingUp,
  Package, ShoppingBag, Factory, Landmark, Building2, RotateCcw,
  UserCog, FolderKanban, Wallet, Boxes, Sparkles, BadgeIndianRupee, Scale,
  Receipt, LineChart, Truck, ClipboardList, type LucideIcon,
} from "lucide-react";

export interface NavItem { to: string; label: string; icon: LucideIcon; badge?: string }
export interface NavGroup { id: string; label: string; tagline: string; icon: LucideIcon; items: NavItem[] }

/** Workspaces — the primary navy rail. Each opens a contextual sub-nav (Odoo/ERPNext desk pattern). */
export const WORKSPACES: NavGroup[] = [
  {
    id: "home", label: "Home", tagline: "Overview & insights", icon: LayoutDashboard,
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/reports", label: "Reports & Analytics", icon: LineChart },
      { to: "/ai", label: "Epic AI Copilot", icon: Sparkles },
    ],
  },
  {
    id: "sell", label: "Sales", tagline: "Revenue & customers", icon: TrendingUp,
    items: [
      { to: "/pos", label: "POS Billing", icon: ShoppingCart },
      { to: "/invoices", label: "Sales Invoices", icon: FileText },
      { to: "/selling", label: "Quotations & Orders", icon: ClipboardList },
      { to: "/crm", label: "CRM", icon: Users },
      { to: "/engage", label: "Engagement", icon: MessageSquare },
      { to: "/returns", label: "Sales Returns", icon: RotateCcw },
    ],
  },
  {
    id: "stock", label: "Inventory", tagline: "Stock & supply chain", icon: Package,
    items: [
      { to: "/inventory", label: "Stock & Items", icon: Package },
      { to: "/buying", label: "Purchase", icon: ShoppingBag },
      { to: "/suppliers", label: "Suppliers", icon: Truck },
      { to: "/manufacturing", label: "Manufacturing", icon: Factory },
    ],
  },
  {
    id: "money", label: "Finance", tagline: "Accounting & compliance", icon: Landmark,
    items: [
      { to: "/accounting", label: "Accounting", icon: Landmark },
      { to: "/banking", label: "Banking", icon: Building2 },
      { to: "/gst", label: "GST & e-Invoice", icon: BadgeIndianRupee },
      { to: "/payments", label: "Payments", icon: Receipt },
      { to: "/compliance", label: "Compliance", icon: Scale },
    ],
  },
  {
    id: "ops", label: "Operations", tagline: "People, projects & assets", icon: FolderKanban,
    items: [
      { to: "/hr", label: "HR & Payroll", icon: UserCog },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/assets", label: "Fixed Assets", icon: Boxes },
      { to: "/expenses", label: "Expenses", icon: Wallet },
    ],
  },
];

/** Flat list for the command palette / global search. */
export const ALL_PAGES: NavItem[] = WORKSPACES.flatMap((g) => g.items);

export interface Destination { to: string; label: string; icon: LucideIcon; ws: string }
export const ALL_DESTINATIONS: Destination[] = WORKSPACES.flatMap((g) =>
  g.items.map((i) => ({ to: i.to, label: i.label, icon: i.icon, ws: g.label }))
);

export function workspaceForPath(path: string): NavGroup {
  return WORKSPACES.find((g) => g.items.some((i) => path.startsWith(i.to))) ?? WORKSPACES[0];
}
