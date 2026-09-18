import { NavLink } from "react-router-dom";
import { workspaceForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Contextual sub-sidebar — lists the modules within the active workspace. */
export function SubSidebar({ pathname }: { pathname: string }) {
  const ws = workspaceForPath(pathname);
  return (
    <aside className="hidden lg:flex w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-card">
      <div className="flex h-[var(--header-height)] items-center gap-2.5 border-b px-5">
        <ws.icon className="h-[18px] w-[18px] text-primary" />
        <div className="leading-tight">
          <div className="font-semibold text-[15px]">{ws.label}</div>
          <div className="text-[11px] text-muted-foreground">{ws.tagline}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {ws.items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <it.icon className="h-[18px] w-[18px]" />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" /> Offline-ready · Data on this device
        </span>
      </div>
    </aside>
  );
}
