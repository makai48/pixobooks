import { NavLink } from "react-router-dom";
import {
  ScanBarcode,
  ShoppingBag,
  Wallet,
  Boxes,
  MoreHorizontal,
  Users,
  BarChart3,
  Landmark,
  UserCog,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { Permission } from "@/types";

type Tab = {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: Permission;
  anyPerm?: Permission[];
  end?: boolean;
};

// Mobile roster — mirrors the merged desktop sidebar. Quotes, POs,
// Suppliers, Held Tickets, Payroll History and Password Requests are
// reached from within their parent tab's sub-navigation.
const ALL_TABS: Tab[] = [
  { to: "/", label: "POS", icon: ScanBarcode, perm: "pos.sell", end: true },
  { to: "/sales-report", label: "Sales", icon: ShoppingBag, perm: "sales.view" },
  { to: "/expenses", label: "Expenses", icon: Wallet, perm: "expenses.view" },
  { to: "/inventory", label: "Inventory", icon: Boxes, perm: "inventory.view" },
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
    <nav aria-label="Primary" className="no-print">
      {/* The black glass surface is its own layer so the multiply blend darkens
          the page behind it without tinting the icons and labels. */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-30 h-12 w-[calc(100%-0.5rem)] max-w-[349px] -translate-x-1/2 rounded-full bg-black/85 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)] outline outline-1 -outline-offset-1 outline-white/10 mix-blend-multiply"
      />

      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex h-12 w-[calc(100%-0.5rem)] max-w-[349px] -translate-x-1/2 items-stretch rounded-full p-1.5">
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          {primary.slice(0, 2).map((tab) => (
            <NavItem key={tab.to} tab={tab} />
          ))}
        </div>

        <div className="w-11 shrink-0" aria-hidden />

        <div className="grid flex-1 grid-cols-2 gap-1.5">
          {primary.slice(2).map((tab) => (
            <NavItem key={tab.to} tab={tab} />
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenMore}
          aria-label="More"
          className="group absolute left-1/2 top-0 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-none"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-paper bg-brand text-brand-fg shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand">
            <MoreHorizontal size={17.6} strokeWidth={2.25} />
          </span>
        </button>
      </div>
    </nav>
  );
}

function NavItem({ tab }: { tab: Tab }) {
  const { to, label, icon: Icon, end } = tab;

  return (
    <NavLink
      to={to}
      end={end}
      className="group flex h-full min-w-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {({ isActive }) => (
        <span
          className={cn(
            "flex min-w-[58px] flex-col items-center justify-center gap-[2px] rounded-[8px] px-1.5 py-1",
            isActive
              ? "bg-brand text-brand-fg shadow-sm"
              : "text-white group-hover:bg-white/15 group-hover:text-white"
          )}
        >
          <Icon
            className="h-[18px] w-[18px] shrink-0"
            strokeWidth={isActive ? 2.25 : 2}
          />
          <span
            className={cn(
              "whitespace-nowrap text-[9.5px] leading-[1.15]",
              isActive ? "font-bold" : "font-semibold"
            )}
          >
            {label}
          </span>
        </span>
      )}
    </NavLink>
  );
}


