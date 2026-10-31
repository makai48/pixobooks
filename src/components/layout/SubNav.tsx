import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SubNavItem = {
  to?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  end?: boolean;
  onClick?: () => void;
  active?: boolean;
};

const ITEM_CLASS =
  "inline-flex items-center gap-1.5 max-md:gap-1 h-9 max-md:h-7 px-3 max-md:px-2 rounded-md text-xs max-md:text-[10px] font-semibold uppercase tracking-widest max-md:tracking-wide whitespace-nowrap transition";

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
        const content = (
          <>
            {i.icon ? <i.icon className="w-3.5 h-3.5 max-md:w-3 max-md:h-3" /> : null}
            {i.label}
          </>
        );
        const state = i.active
          ? "bg-ink text-paper"
          : "text-ink-mute hover:text-ink hover:bg-paper";

        if (i.onClick) {
          return (
            <button
              key={i.label}
              type="button"
              onClick={i.onClick}
              className={cn(ITEM_CLASS, state)}
            >
              {content}
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
            {content}
          </NavLink>
        );
      })}
    </div>
  );
}
