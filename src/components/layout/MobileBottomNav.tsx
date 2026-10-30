import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Receipt,
  Wallet,
  MoreHorizontal,
  Users,
  BarChart3,
  Landmark,
  UserCog,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { Permission } from "@/types";
import type { ComponentType, CSSProperties } from "react";

type Tab = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  perm: Permission;
  anyPerm?: Permission[];
  end?: boolean;
};

// Mobile roster — mirrors the merged desktop sidebar. Quotes, POs,
// Suppliers, Held Tickets, Payroll History and Password Requests are
// reached from within their parent tab's sub-navigation.
const ALL_TABS: Tab[] = [
  { to: "/", label: "Sales POS", icon: LayoutDashboard, perm: "pos.sell", end: true },
  { to: "/inventory", label: "Inventory", icon: Boxes, perm: "inventory.view" },
  { to: "/sales-report", label: "Sales", icon: Receipt, perm: "sales.view" },
  { to: "/expenses", label: "Expenses", icon: Wallet, perm: "expenses.view" },
  { to: "/financial-statements", label: "Finance", icon: Landmark, perm: "finance.view", anyPerm: ["finance.cashbook.view", "finance.bank.view", "finance.bank.manage", "finance.bank.delete", "finance.pnl.view", "finance.orders.view", "finance.orders.manage", "finance.orders.delete"] },
  { to: "/client-billing", label: "Billing", icon: BookOpen, perm: "finance.view" },
  { to: "/customers", label: "Customers", icon: Users, perm: "customers.manage" },
  { to: "/statistics", label: "Stats", icon: BarChart3, perm: "stats.view" },
  { to: "/employees", label: "Team", icon: UserCog, perm: "employees.manage" },
];

export default function MobileBottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const { can } = useAuth();
  const visible = ALL_TABS.filter(
    (t) => can(t.perm) || (t.anyPerm ? t.anyPerm.some((p) => can(p)) : false)
  );
  const primary = visible.slice(0, 4);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 border-t bg-ink text-white no-print"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
      >
        {primary.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 pt-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider relative transition min-h-[56px]",
                isActive ? "text-magenta-reg" : "text-white/85 active:text-white"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    "w-6 h-6",
                    isActive ? "text-magenta-reg" : "text-white"
                  )}
                  style={!isActive ? { color: "#FFFFFF" } : undefined}
                />
                <span>{label}</span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-magenta-reg rounded-b" />
                )}
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={onOpenMore}
          className="flex flex-col items-center justify-center gap-0.5 pt-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white active:opacity-80 min-h-[56px]"
          aria-label="More"
        >
          <MoreHorizontal className="w-6 h-6" style={{ color: "#FFFFFF" }} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
