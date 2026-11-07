import {
  useEffect,
  useRef,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import {
  Banknote,
  BarChart3,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  Coins,
  CreditCard,
  FileText,
  Files,
  Landmark,
  LineChart,
  Package,
  PieChart,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hand-placed business icons drifting over the V3 auth canvas.
 * `m` marks the subset kept on small screens; `a` marks brand accents.
 */
type Deco = {
  I: LucideIcon;
  x: string;
  y: string;
  s: number;
  r: number;
  a?: boolean;
  m?: boolean;
};

const DECO: Deco[] = [
  { I: Calculator, x: "6%", y: "9%", s: 44, r: -12, m: true },
  { I: Receipt, x: "17%", y: "24%", s: 30, r: 8 },
  { I: Coins, x: "4%", y: "40%", s: 34, r: 0, a: true, m: true },
  { I: LineChart, x: "13%", y: "58%", s: 52, r: -6 },
  { I: Wallet, x: "5%", y: "78%", s: 38, r: 10, m: true },
  { I: FileText, x: "20%", y: "88%", s: 28, r: -10 },
  { I: Landmark, x: "27%", y: "6%", s: 30, r: 4 },
  { I: Briefcase, x: "88%", y: "8%", s: 40, r: 10, m: true },
  { I: BarChart3, x: "76%", y: "18%", s: 32, r: -8, a: true },
  { I: CreditCard, x: "92%", y: "34%", s: 36, r: 14, m: true },
  { I: ShoppingCart, x: "80%", y: "50%", s: 30, r: -4 },
  { I: Package, x: "93%", y: "64%", s: 42, r: 6, m: true },
  { I: Building2, x: "78%", y: "80%", s: 46, r: -6, m: true },
  { I: Banknote, x: "91%", y: "90%", s: 32, r: 12, a: true, m: true },
  { I: Files, x: "68%", y: "92%", s: 26, r: 6 },
  { I: Boxes, x: "70%", y: "5%", s: 26, r: -14 },
  { I: TrendingUp, x: "32%", y: "93%", s: 30, r: 0 },
  { I: PieChart, x: "62%", y: "14%", s: 30, r: 8 },
  { I: Calculator, x: "95%", y: "48%", s: 28, r: -10, m: true },
  { I: Receipt, x: "86%", y: "74%", s: 26, r: 14, a: true, m: true },
  { I: Wallet, x: "60%", y: "84%", s: 30, r: -8 },
  { I: Coins, x: "45%", y: "95%", s: 24, r: 0 },
  { I: CreditCard, x: "40%", y: "3%", s: 26, r: 10, a: true },
  { I: FileText, x: "54%", y: "4%", s: 24, r: -6 },
  { I: Package, x: "25%", y: "40%", s: 28, r: 12 },
  { I: ShoppingCart, x: "9%", y: "26%", s: 26, r: -14, m: true },
  { I: Landmark, x: "24%", y: "72%", s: 34, r: 6 },
  { I: Banknote, x: "2%", y: "62%", s: 30, r: -12, m: true },
  { I: Boxes, x: "13%", y: "4%", s: 28, r: 6 },
  { I: TrendingUp, x: "72%", y: "34%", s: 28, r: -6, a: true },
  { I: BarChart3, x: "71%", y: "66%", s: 32, r: 8 },
  { I: Briefcase, x: "28%", y: "18%", s: 26, r: -8 },
  { I: Files, x: "11%", y: "93%", s: 28, r: 10, m: true },
  { I: Building2, x: "33%", y: "84%", s: 26, r: -4 },
  { I: LineChart, x: "84%", y: "95%", s: 26, r: 0, m: true },
  { I: PieChart, x: "96%", y: "4%", s: 24, r: 12, m: true },
  { I: Coins, x: "88%", y: "56%", s: 26, r: -8, m: true },
  { I: Wallet, x: "38%", y: "12%", s: 22, r: 10 },
  { I: Receipt, x: "58%", y: "22%", s: 22, r: -12 },
  { I: Calculator, x: "36%", y: "78%", s: 24, r: 8 },
  { I: CreditCard, x: "57%", y: "90%", s: 24, r: -10, a: true },
  { I: Landmark, x: "66%", y: "44%", s: 24, r: 4 },
  { I: Package, x: "30%", y: "56%", s: 24, r: -8 },
  { I: TrendingUp, x: "18%", y: "47%", s: 26, r: 6, a: true },
  { I: Boxes, x: "84%", y: "40%", s: 26, r: -6, m: true },
  { I: FileText, x: "97%", y: "78%", s: 22, r: 12, m: true },
  { I: Banknote, x: "1%", y: "18%", s: 26, r: 8, m: true },
  { I: PieChart, x: "8%", y: "68%", s: 22, r: -6, a: true, m: true },
  { I: ShoppingCart, x: "75%", y: "96%", s: 22, r: 10 },
  { I: Coins, x: "21%", y: "12%", s: 22, r: -10, m: true },
  { I: Briefcase, x: "92%", y: "16%", s: 22, r: 6, m: true },
  { I: BarChart3, x: "3%", y: "50%", s: 22, r: 0, m: true },
  { I: Receipt, x: "94%", y: "70%", s: 22, r: -8, m: true },
  { I: Building2, x: "48%", y: "1%", s: 22, r: 0 },
  { I: Files, x: "80%", y: "28%", s: 22, r: 10 },
];

function DecoIcons({ tone }: { tone: "base" | "lit" }) {
  return (
    <>
      {DECO.map(({ I, x, y, s, r, a, m }, i) => (
        <I
          key={`${tone}-${i}`}
          strokeWidth={1.25}
          aria-hidden="true"
          className={cn(
            "reg-deco-icon",
            !m && "reg-deco-desktop",
            a && "is-accent",
            tone === "lit" && "is-lit"
          )}
          style={{
            left: x,
            top: y,
            width: s,
            height: s,
            rotate: `${r}deg`,
            animationDelay: `${-i * 0.7}s`,
          }}
        />
      ))}
    </>
  );
}

export function AuthBrand() {
  return (
    <header className="register-brand">
      <div className="register-brand-logo">
        <img src={`${import.meta.env.BASE_URL}app-logo.png`} alt="PixoBooks" />
      </div>
      <div className="register-brand-copy">
        <span className="register-brand-name">PixoBooks</span>
        <span className="register-brand-subtitle">Business Operating System</span>
      </div>
    </header>
  );
}

export type AuthShellProps = {
  children: ReactNode;
  /** Full-page loading state while auth/setup queries resolve. */
  loading?: boolean;
  loadingLabel?: string;
  /** Extra row under the brand (workplace switch, etc.). */
  headerSlot?: ReactNode;
  footer?: ReactNode;
  /** Portals/DOM overlays that must escape the centred column. */
  overlay?: ReactNode;
  className?: string;
  /** Hide the year line on short viewports? Handled by CSS; kept for parity. */
  copyright?: boolean;
  /** Remove the logo/name/slogan header (Register wide layout). */
  hideBrand?: boolean;
};

/**
 * Shared V3 auth surface: warm canvas, drifting business icons, centre-quiet
 * fade, cursor spotlight, brand row, loading state, footer and copyright.
 * Login and Register render inside the same shell so switching between them
 * feels like one continuous experience.
 */
export default function AuthShell({
  children,
  loading = false,
  loadingLabel = "Preparing setup…",
  headerSlot,
  footer,
  overlay,
  className,
  copyright = true,
  hideBrand = false,
}: AuthShellProps) {
  /* V3 cursor spotlight: only for hover-capable, motion-friendly pointers. */
  const mainRef = useRef<HTMLElement>(null);
  const spotOk = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
    );
    const set = () => {
      spotOk.current = mq.matches;
      if (!mq.matches) mainRef.current?.removeAttribute("data-spot");
    };
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const el = mainRef.current;
    if (!el || !spotOk.current || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
    el.setAttribute("data-spot", "");
  };
  const onLeave = () => mainRef.current?.removeAttribute("data-spot");

  return (
    <main
      ref={mainRef}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn("register-page", className)}
    >
      <div aria-hidden="true" className="reg-deco">
        <DecoIcons tone="base" />
        <div className="reg-deco-mask">
          <DecoIcons tone="lit" />
        </div>
        <div className="reg-deco-quiet" />
        <div className="reg-deco-glow" />
      </div>

      {loading ? (
        <div className="register-loading-state">
          {!hideBrand && (
            <div className="register-brand-logo">
              <img src={`${import.meta.env.BASE_URL}app-logo.png`} alt="PixoBooks" />
            </div>
          )}
          <p className="register-loading">{loadingLabel}</p>
        </div>
      ) : (
        <div className="register-shell">
          {!hideBrand && <AuthBrand />}
          {headerSlot}
          {children}
          {footer}
          {copyright && (
            <p className="register-copyright">
              © {new Date().getFullYear()} PixoBooks
            </p>
          )}
        </div>
      )}

      {overlay}
    </main>
  );
}
