import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
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
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import CreateWorkspaceDialog from "@/components/layout/CreateWorkspaceDialog";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  perm: Permission;
  end?: boolean;
  ownerOnly?: boolean;
  badge?: number;
};

type Props = {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

const WHITE = "#FFFFFF";

export default function Sidebar({ onNavigate, collapsed, onToggleCollapse }: Props) {
  const { can, profile, logout, isAppOwner } = useAuth();
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
        { to: "/", label: "Sales POS", icon: LayoutDashboard, perm: "pos.sell", end: true, badge: posBadge },
      ],
    },
    {
      title: "Inventory & Ops",
      items: [
        { to: "/inventory", label: "Inventory & BOM", icon: Boxes, perm: "inventory.view" },
      ],
    },
    {
      title: "Customers & Clients",
      items: [
        { to: "/customers", label: "Customer Register", icon: Users, perm: "customers.manage" },
        { to: "/client-billing", label: "Client Billing", icon: BookOpen, perm: "finance.view" },
      ],
    },
    {
      title: "Finance",
      items: [
        { to: "/expenses", label: "Expenses", icon: Wallet, perm: "expenses.view" },
        { to: "/financial-statements", label: "Financial Statements", icon: Landmark, perm: "finance.view" },
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
        "shrink-0 h-full bg-ink text-white flex flex-col transition-[width] duration-200",
        collapsed ? "sidebar-collapsed" : "w-72 md:w-64"
      )}
    >
      {/* Brand — replaced with the business/shop identity */}
      <div className="p-3 md:p-4 border-b border-white/10">
        <div className="sb-brand flex items-center gap-3">
          <div className="sb-brand-logo w-11 h-11 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 border-2 border-white/25">
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
            <div className="font-display text-lg font-bold leading-tight text-white truncate">
              {shopName}
            </div>
            <div className="sb-subtitle text-[10px] text-white/50 mt-0.5 uppercase tracking-widest truncate">
              {settings?.address || "Business workspace"}
            </div>
          </div>
        </div>
      </div>

      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex mx-3 mt-2 h-8 rounded-md bg-white/5 hover:bg-white/10 text-white/80 items-center justify-center gap-2 text-xs font-semibold"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" style={{ color: WHITE }} />
          ) : (
            <>
              <ChevronLeft className="w-3.5 h-3.5" style={{ color: WHITE }} />
              <span className="sb-label">Collapse</span>
            </>
          )}
        </button>
      )}

      <nav className="flex-1 p-2 space-y-3 overflow-auto mt-2 scroll-lined">
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            onNavigate?.();
          }}
          className="sb-create w-full flex items-center gap-3 rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 px-3 h-10 text-sm font-semibold text-white transition"
          title="Create a business"
        >
          <PlusCircle className="w-5 h-5 shrink-0 text-magenta-reg" />
          <span className="sb-label flex-1 text-left">Create Business</span>
          <span className="sb-create-badge chip bg-magenta-reg/25 text-white text-[10px] uppercase tracking-wide">
            New
          </span>
        </button>
        {NAV_GROUPS.map((g) => {
          const visible = g.items.filter(
            (i) =>
              can(i.perm) ||
              (isAppOwner && (i.perm === "audit.view" || i.perm === "password.approve"))
          );
          if (visible.length === 0) return null;
          return (
            <div key={g.title}>
              <div className="sb-group-title text-[10px] uppercase tracking-widest text-white/40 px-3 mb-1">
                {g.title}
              </div>
              <div className="space-y-1">
                {visible.map(({ to, label, icon: Icon, end, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "sb-item group flex items-center gap-3 rounded-md px-3 h-10 text-sm font-medium transition",
                        isActive
                          ? "bg-paper text-ink"
                          : "text-white hover:bg-white/10"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn(
                            "w-6 h-6 shrink-0",
                            isActive ? "text-magenta-reg" : ""
                          )}
                          style={!isActive ? { color: WHITE } : undefined}
                        />
                        <span className="sb-label flex-1">{label}</span>
                        {badge && badge > 0 ? (
                          <span className="sb-chip chip bg-magenta-reg/20 text-magenta-reg num text-[11px]">
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

      {/* Footer: Signed-in chip is now anchored at the very bottom,
          directly above the cloud-sync heartbeat. */}
      <div className="p-2 border-t border-white/10 space-y-2">
        <div className="sb-signed-in rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="sb-label text-[10px] uppercase tracking-widest text-white/50">
            Signed in
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="sb-avatar w-9 h-9 rounded-full bg-magenta-reg/90 flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden border-2 border-white/10 text-white">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                profile?.name.charAt(0).toUpperCase() || "?"
              )}
            </div>
            <div className="min-w-0 sb-label">
              <div className="text-sm font-semibold truncate text-white">{profile?.name}</div>
              <div className="text-[11px] text-white/60 truncate">
                {profile?.role} · {profile?.email}
              </div>
            </div>
          </div>
        </div>

        <div className="sb-footer-status flex items-center gap-2 text-xs text-white/70 px-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span className="sb-label">Cloud sync active · PWA ready</span>
        </div>

        <button
          onClick={async () => {
            await logout();
            toast.success("Signed out");
            nav("/login");
            onNavigate?.();
          }}
          className="md:hidden w-full h-9 rounded-md bg-white/5 hover:bg-white/10 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-4 h-4" style={{ color: WHITE }} /> Sign out
        </button>
      </div>
    </aside>
    {createOpen && <CreateWorkspaceDialog onClose={() => setCreateOpen(false)} />}
    </>
  );
}
