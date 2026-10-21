import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SubNavItem = {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  end?: boolean;
};

/**
 * Compact horizontal sub-navigation used at the top of "merged" parent
 * pages (Inventory & BOM, Team & Payroll, Account Approvals, Sales POS).
 * Preserves route + functionality of merged tabs while presenting them
 * as a single logical section in the sidebar.
 */
export default function SubNav({ items }: { items: SubNavItem[] }) {
  return (
    <div className="paper-card p-1.5 flex items-center gap-1 overflow-x-auto scrollbar-none">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-semibold uppercase tracking-widest whitespace-nowrap transition",
              isActive
                ? "bg-ink text-paper"
                : "text-ink-mute hover:text-ink hover:bg-paper"
            )
          }
        >
          {i.icon ? <i.icon className="w-3.5 h-3.5" /> : null}
          {i.label}
        </NavLink>
      ))}
    </div>
  );
}
