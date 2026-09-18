import { Search, Bell, Moon, Sun, Plus, Command } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function Header({ onOpenCommand }: { onOpenCommand: () => void }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b bg-card px-5">
      {/* Command trigger — the ERP power-user entry point (Ctrl+K) */}
      <button
        onClick={onOpenCommand}
        className="group flex h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={onOpenCommand}>
          <Plus className="h-4 w-4" /> New
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger" />
        </Button>
        <div className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          ST
        </div>
      </div>
    </header>
  );
}
