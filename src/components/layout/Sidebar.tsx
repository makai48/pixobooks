import { NavLink } from "react-router-dom";
import {
  ScanBarcode,
  Boxes,
  Users,
  UserCog,
  BarChart3,
  Settings as SettingsIcon,
  Wallet,
  LogOut,
  Store,
  Landmark,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useHeldTickets } from "@/hooks/useHeldTickets";
import { usePasswordResetRequests } from "@/hooks/usePasswordResets";
import { useAccountApprovalRequests } from "@/hooks/useAccountApprovals";
import type { Permission } from "@/types";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { ComponentType } from "react";
import CreateWorkspaceDialog from "@/components/layout/CreateWorkspaceDialog";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: string | number }>;
  perm: Permission;
  /** Shown if either `perm` or this alternative is granted. Lets a
   *  read-only key (customers.view) open a page whose older key was
   *  manage-level. */
  altPerm?: Permission;
  /** Shown if ANY of these is granted. Used where a page has been split into
   *  granular keys (e.g. the finance tabs) and the legacy key is only one of
   *  several ways in. */
  anyPerm?: Permission[];
  end?: boolean;
  adminOnly?: boolean;
  badge?: number;
};

type Props = {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function Sidebar({ onNavigate, collapsed, onToggleCollapse }: Props) {
  const { can, profile, logout, isAppAdmin } = useAuth();
  const { data: settings } = useShopSettings();
  const { data: heldTickets } = useHeldTickets();
  const { data: resetRequests } = usePasswordResetRequests();
  const { data: approvalRequests } = useAccountApprovalRequests();
  const heldCount = heldTickets?.length ?? 0;
  const pendingResets = (resetRequests || []).filter((r) => r.status === "pending").length;
  const pendingApprovals = (approvalRequests || []).filter((r) => r.status === "pending").length;
  const nav = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  // Sales Report lives inside the POS sub-nav only — it is no longer
  // listed here to avoid duplication.
  const posBadge = heldCount;
  const teamBadge = pendingApprovals + pendingResets;

  const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
    {
      title: "Point of Sale",
      items: [
        { to: "/", label: "POS", icon: ScanBarcode, perm: "pos.sell", end: true, badge: posBadge },
      ],
    },
    {
      title: "Inventory & Ops",
      items: [
        { to: "/inventory", label: "Inventory", icon: Boxes, perm: "inventory.view" },
      ],
    },
    {
      title: "Customers & Clients",
      items: [
        { to: "/customers", label: "Customer Register", icon: Users, perm: "customers.manage", altPerm: "customers.view" },
        { to: "/client-billing", label: "Client Billing", icon: BookOpen, perm: "finance.view" },
      ],
    },
    {
      title: "Finance",
      items: [
        { to: "/expenses", label: "Expenses", icon: Wallet, perm: "expenses.view" },
        { to: "/financial-statements", label: "Financial Statements", icon: Landmark, perm: "finance.view", anyPerm: ["finance.cashbook.view", "finance.bank.view", "finance.bank.manage", "finance.bank.delete", "finance.pnl.view", "finance.orders.view", "finance.orders.manage", "finance.orders.delete"] },
        { to: "/statistics", label: "Statistics", icon: BarChart3, perm: "stats.view" },
      ],
    },
    {
      title: "Admin",
      items: [
        { to: "/employees", label: "Team & Payroll", icon: UserCog, perm: "employees.manage", badge: teamBadge },
        { to: "/settings", label: "Shop Settings", icon: SettingsIcon, perm: "settings.manage" },
      ],
    },
  ];

  const shopName = settings?.shopName || "Your Shop";
  const shopLogo = settings?.logoUrl;

  return (
    <>
    <aside
      className={cn(
        "shrink-0 h-full sb-sidebar bg-ink text-white flex flex-col border-r border-white/10 transition-[width] duration-200",
        collapsed ? "sidebar-collapsed" : "w-72 md:w-64"
      )}
    >
      {/* Brand — business identity, kept quiet so navigation leads. */}
      <div className="p-3 md:p-4 pb-2 md:pb-2">
        <div className="sb-brand flex items-center gap-3">
          <div className="sb-brand-logo w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-white/10">
            {shopLogo ? (
              <img
                src={shopLogo}
                alt={shopName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <Store className="w-5 h-5 text-ink-mute" />
            )}
          </div>
          <div className="min-w-0 sb-title">
            <div className="font-display text-[15px] md:text-base font-bold leading-tight text-white truncate">
              {shopName}
            </div>
            <div className="sb-subtitle text-[9px] leading-[1.3] text-white/55 mt-0.5 tracking-[0.01em] line-clamp-2">
              {settings?.address || "Business workspace"}
            </div>
          </div>
        </div>
      </div>

      {onToggleCollapse && (
        <div className="hidden md:flex justify-end px-3 -mt-1 pb-1">
          <button
            onClick={onToggleCollapse}
            className="grid h-6 w-6 place-items-center rounded-md text-white/45 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            )}
          </button>
        </div>
      )}

      <nav className="flex-1 px-2.5 pb-3 space-y-4 overflow-auto scroll-lined">
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            onNavigate?.();
          }}
          className="sb-create w-full flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.055] hover:bg-white/10 px-2.5 h-9 text-[12px] font-semibold text-white/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title="Create a business"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand text-brand-fg">
            <PlusCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="sb-label flex-1 text-left">Create business</span>
          <span className="sb-create-badge chip bg-white/10 text-white/55 text-[9px] uppercase tracking-wide">
            New
          </span>
        </button>

        {NAV_GROUPS.map((g, groupIndex) => {
          const visible = g.items.filter(
            (i) =>
              can(i.perm) ||
              (i.altPerm ? can(i.altPerm) : false) ||
              (i.anyPerm ? i.anyPerm.some((p) => can(p)) : false) ||
              (isAppAdmin && (i.perm === "audit.view" || i.perm === "password.approve"))
          );
          if (visible.length === 0) return null;
          return (
            <div
              key={g.title}
              className={cn(groupIndex > 0 && "border-t border-white/[0.06] pt-3")}
            >
              <div className="sb-group-title text-[9px] font-semibold uppercase tracking-[0.16em] text-white/55 px-2.5 mb-1.5">
                {g.title}
              </div>
              <div className="space-y-0.5">
                {visible.map(({ to, label, icon: Icon, end, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "sb-item group flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold tracking-[-0.01em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        isActive
                          ? "bg-brand text-brand-fg shadow-[0_6px_18px_-10px_rgba(0,0,0,0.35)]"
                          : "text-white/90 hover:bg-white/[0.09] hover:text-white"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className="h-[17.6px] w-[17.6px] shrink-0"
                          strokeWidth={isActive ? 2.25 : 1.75}
                        />
                        <span className="sb-label flex-1 truncate">{label}</span>
                        {badge && badge > 0 ? (
                          <span
                            className={cn(
                              "sb-chip num min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none",
                              isActive
                                ? "bg-black/15 text-black"
                                : "bg-white/12 text-white/80"
                            )}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer: signed-in identity remains anchored at the bottom. */}
      <div className="p-2.5 border-t border-white/10 space-y-2">
        <div className="sb-signed-in rounded-xl bg-white/[0.045] border-2 border-brand p-2.5">
          <div className="flex items-center gap-2.5">
            <div className="sb-avatar w-[42px] h-[42px] rounded-full bg-brand flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden text-brand-fg">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                profile?.name.charAt(0).toUpperCase() || "?"
              )}
            </div>
            <div className="min-w-0 flex-1 sb-label">
              <div className="text-[12.5px] font-semibold truncate text-white">{profile?.name}</div>
              <div className="text-[10px] text-white/60 truncate">{profile?.role}</div>
            </div>
            <button
              onClick={async () => {
                await logout();
                nav("/login");
                onNavigate?.();
              }}
              className="sb-signout grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="sb-footer-status flex items-center gap-2 text-[10px] text-white/65 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span className="sb-label">Cloud sync active · PWA ready</span>
        </div>
        <div className="sb-label px-1 text-[8.5px] text-white/40 num">
          build {typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev"}
        </div>
      </div>
    </aside>
    {createOpen && <CreateWorkspaceDialog onClose={() => setCreateOpen(false)} />}
    </>
  );
}




