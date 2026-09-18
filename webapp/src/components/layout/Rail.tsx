import { useNavigate } from "react-router-dom";
import { WORKSPACES, workspaceForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Navy workspace rail — the primary switcher (Odoo/ERPNext desk pattern). */
export function Rail({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const active = workspaceForPath(pathname);

  return (
    <div
      className="hidden md:flex w-[var(--rail-width)] shrink-0 flex-col items-center gap-1 py-3"
      style={{ background: "hsl(var(--rail))", color: "hsl(var(--rail-foreground))" }}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl grad-blue text-white font-black text-lg shadow-lg">
        E
      </div>
      <TooltipProvider delayDuration={200}>
        {WORKSPACES.map((ws) => {
          const isActive = ws.id === active.id;
          return (
            <Tooltip key={ws.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(ws.items[0].to)}
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ring-focus",
                    isActive ? "bg-primary text-white shadow-md" : "hover:bg-[hsl(var(--rail-hover))]"
                  )}
                  style={!isActive ? { color: "hsl(var(--rail-muted))" } : undefined}
                  aria-label={ws.label}
                >
                  <ws.icon className="h-[22px] w-[22px]" />
                  {isActive && <span className="absolute -left-3 h-6 w-1 rounded-r bg-white" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{ws.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}
