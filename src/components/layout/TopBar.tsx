import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, RefreshCw, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import BusinessSwitcher from "@/components/layout/BusinessSwitcher";
import OfflineIndicator from "@/components/layout/OfflineIndicator";

const TITLES: Record<string, string> = {
  "/": "Sales Counter",
  "/held": "Held Tickets",
  "/quotes": "Quotes & Estimates",
  "/inventory": "Inventory",
  "/stock-taking": "Stock Take",
  "/purchase-orders": "Purchase Orders",
  "/customers": "Customer Register",
  "/client-billing": "Client Billing",
  "/sales-report": "Sales Report",
  "/expenses": "Expenses",
  "/financial-statements": "Financial Statements",
  "/statistics": "Financial Statistics",
  "/employees": "Team & Permissions",
  "/payroll-history": "Payroll History",
  "/audit-log": "Admin Audit Log",
  "/password-resets": "Password Requests",
  "/account-approvals": "Account Approvals",
  "/settings": "Shop Settings",
  "/suppliers": "Suppliers",
};

type Props = {
  onOpenMenu?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function TopBar({ onOpenMenu, collapsed, onToggleCollapse }: Props) {
  const nav = useNavigate();
  const loc = useLocation();
  const { logout, profile } = useAuth();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const title = TITLES[loc.pathname] || "PixoBooks";

  return (
      <header className="relative z-30 h-12 md:h-14 shrink-0 border-b bg-card/80 backdrop-blur px-3 md:px-6 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onOpenMenu}
          className="md:hidden btn btn-ghost h-9 w-9 p-0 shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex btn btn-ghost h-9 w-9 p-0 shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-6 h-6" />
            ) : (
              <PanelLeftClose className="w-6 h-6" />
            )}
          </button>
        )}
        <div className="min-w-0">
          <div className="text-[10px] md:text-[11px] uppercase tracking-widest text-ink-mute truncate">
            {profile?.role} workstation
          </div>
          <h1 className="font-display text-base md:text-xl font-bold leading-tight truncate">
            {title}
          </h1>
        </div>
      </div>
<div className="flex items-center gap-2 md:gap-3 shrink-0">
          <BusinessSwitcher />
          <OfflineIndicator />
        <div className="hidden lg:flex items-center gap-2 text-xs text-ink-mute">
          <RefreshCw className="w-5 h-5" />
          {formatDateTime(now)}
        </div>
        <button
          className="btn btn-primary btn-sm md:h-9 md:px-4"
          onClick={async () => {
            await logout();
            toast.success("Signed out");
            nav("/login");
          }}
        >
          <LogOut className="w-4 h-4 md:w-6 md:h-6" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
