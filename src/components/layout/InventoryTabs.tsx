import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Boxes, ClipboardList, ShoppingBag, Truck, Ruler } from "lucide-react";
import SubNav, { type SubNavItem } from "./SubNav";
import UomManagerModal from "@/components/features/uom/UomManagerModal";
import { useAuth } from "@/hooks/useAuth";

const ROUTES = ["/inventory", "/stock-taking", "/purchase-orders", "/suppliers"];

export default function InventoryTabs() {
  const { pathname } = useLocation();
  const { can } = useAuth();
  const [unitsOpen, setUnitsOpen] = useState(false);

  if (!ROUTES.includes(pathname)) return null;

  const canUnits = can("settings.units") || can("settings.manage");

  const items: SubNavItem[] = [
    { to: "/inventory", label: "Inventory & BOM", icon: Boxes },
    { to: "/stock-taking", label: "Stock Taking", icon: ClipboardList },
    { to: "/purchase-orders", label: "Purchase Orders", icon: ShoppingBag },
    { to: "/suppliers", label: "Suppliers", icon: Truck },
  ];

  if (canUnits) {
    items.push({
      label: "Units",
      icon: Ruler,
      onClick: () => setUnitsOpen(true),
      active: unitsOpen,
    });
  }

  return (
    <>
      <div className="shrink-0 border-b bg-card/80 backdrop-blur px-3 md:px-6 py-2">
        <SubNav items={items} className="!bg-transparent !border-0 !shadow-none !p-0" />
      </div>
      {unitsOpen && <UomManagerModal onClose={() => setUnitsOpen(false)} />}
    </>
  );
}
