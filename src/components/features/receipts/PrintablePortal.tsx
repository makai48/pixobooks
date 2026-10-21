import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders `children` to a dedicated `.print-portal > .print-page` container
 * mounted as a direct child of <body>. On screen the portal is hidden by CSS.
 * During `@media print` the whole `#root` is hidden and ONLY this portal
 * prints — giving reliable, single-document output with no blank pages.
 */
export default function PrintablePortal({ children }: { children: ReactNode }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  if (elRef.current === null && typeof document !== "undefined") {
    const el = document.createElement("div");
    el.className = "print-portal";
    // Screen-off default; @media print will override
    el.setAttribute("aria-hidden", "true");
    elRef.current = el;
  }
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    document.body.appendChild(el);
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);
  if (!elRef.current) return null;
  return createPortal(<div className="print-page">{children}</div>, elRef.current);
}
