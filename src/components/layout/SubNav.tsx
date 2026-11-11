import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SubNavItem = {
  to?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  end?: boolean;
  onClick?: () => void;
  active?: boolean;
};

const ITEM_CLASS =
  "inline-flex items-center gap-1.5 max-md:gap-1 h-9 max-md:h-8 px-3 max-md:px-2 rounded-md border border-transparent text-xs max-md:text-[10px] font-semibold uppercase tracking-widest max-md:tracking-wide whitespace-nowrap transition";

/**
 * Compact horizontal sub-navigation used at the top of "merged" parent
 * pages (STOCK, Team & Payroll, Account Approvals, POS).
 * Preserves route + functionality of merged tabs while presenting them
 * as a single logical section in the sidebar.
 */
export default function SubNav({
  items,
  className,
}: {
  items: SubNavItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "paper-card p-1.5 max-md:p-1 flex items-center gap-1 max-md:gap-0.5 overflow-x-auto scrollbar-none",
        className
      )}
    >
      {items.map((i) => {
        // Same icon language as the mobile bottom navigation: Lucide outline,
        // slightly heavier stroke when active, consistent optical size.
        const renderContent = (active: boolean) => (
          <>
            {i.icon ? (
              <i.icon
                className="w-4 h-4 max-md:w-[15px] max-md:h-[15px] shrink-0"
                strokeWidth={active ? 2.25 : 2}
              />
            ) : null}
            <span>{i.label}</span>
          </>
        );
        const state = i.active
          ? "bg-ink text-paper shadow-sm"
          : "text-ink-soft hover:text-ink hover:bg-paper";

        if (i.onClick) {
          return (
            <button
              key={i.label}
              type="button"
              onClick={i.onClick}
              className={cn(ITEM_CLASS, state)}
            >
              {renderContent(!!i.active)}
            </button>
          );
        }

        return (
          <NavLink
            key={i.to ?? i.label}
            to={i.to ?? "/"}
            end={i.end}
            className={({ isActive }) => cn(ITEM_CLASS, isActive ? "bg-ink text-paper" : state)}
          >
            {({ isActive }) => renderContent(isActive)}
          </NavLink>
        );
      })}
    </div>
  );
}
