import { Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileBottomNav from "./MobileBottomNav";
import InventoryTabs from "./InventoryTabs";
import ImportJobBanner from "@/components/features/settings/ImportJobBanner";
import {
  setActiveBusiness,
  useActiveBusiness,
  useBusinesses,
} from "@/hooks/useBusinesses";
import { useItems } from "@/hooks/useItems";
import { useCustomers } from "@/hooks/useCustomers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useUoms } from "@/hooks/useUoms";
import { useUnitConversions } from "@/hooks/useUnitConversions";
import { useBranches } from "@/hooks/useBranches";

const COLLAPSE_KEY = "pixobooks:sidebar_collapsed";

/**
 * Warm the cache for the POS / inventory catalog as soon as the active
 * business is known. These are the queries every selling screen needs, so
 * opening POS, Inventory or Statistics paints from cache instead of a
 * spinner. The hooks stay mounted (they are cheap, low-frequency polls) and
 * share the same cache entries as the pages.
 */
function CorePrefetch() {
  useItems();
  useCustomers();
  useShopSettings();
  useUoms();
  useUnitConversions();
  useBranches();
  return null;
}

export type AppOutletContext = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
};

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Sidebar collapse state is now user-driven ONLY. It never toggles
  // automatically on route changes — the collapse button is the single
  // source of truth. The last user choice is persisted across reloads.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Default the workspace to the first business the user can see so queries
  // are tenant-scoped from the very first render (never a combined dataset).
  const activeBusiness = useActiveBusiness();
  const { data: businesses = [] } = useBusinesses();
  useEffect(() => {
    if (businesses.length === 0) return;
    const ids = businesses.map((b) => b.id);
    if (activeBusiness === "none" || !ids.includes(activeBusiness)) {
      setActiveBusiness(businesses[0].id);
    }
  }, [activeBusiness, businesses]);

  // Global input UX enhancement: for every numeric input (type="number"
  // OR class "num"), select all content on focus so the default "0" or
  // any prior value visually clears and the user's first keystroke
  // replaces it. Applies app-wide to amount, discount, qty, price and
  // similar numeric fields without needing per-field wiring.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.readOnly || t.disabled) return;
      const isNumeric = t.type === "number" || t.classList.contains("num");
      if (!isNumeric) return;
      // Defer to next frame so browsers finish their default focus behavior
      requestAnimationFrame(() => {
        try {
          if (document.activeElement === t) t.select();
        } catch {
          /* some input types disallow select() — silently ignore */
        }
      });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col md:flex-row bg-paper text-ink">
      {activeBusiness !== "none" && <CorePrefetch />}
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
      </div>

      {/* Mobile / tablet drawer overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 md:w-64 animate-fade-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar
          onOpenMenu={() => setMobileOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
        <InventoryTabs />
        <main className="flex-1 overflow-auto pb-24 lg:pb-0 scroll-lined">
          <Outlet context={{ collapsed, setCollapsed } satisfies AppOutletContext} />
        </main>
        <ImportJobBanner />
        <div className="lg:hidden">
          <MobileBottomNav onOpenMore={() => setMobileOpen(true)} />
        </div>
      </div>
    </div>
  );
}
