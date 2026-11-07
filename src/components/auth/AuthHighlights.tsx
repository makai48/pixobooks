import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Boxes,
  Calculator,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SLIDES: { I: LucideIcon; text: string }[] = [
  { I: Calculator, text: "Accounting that closes books in minutes." },
  { I: Boxes, text: "Live inventory across every store and warehouse." },
  { I: ShoppingCart, text: "Sales, invoices and payments in one flow." },
  { I: BarChart3, text: "Real-time reports to guide every decision." },
];

const SLIDE_DWELL = 5000;
const SLIDE_OUT_MS = 220;

/**
 * V3 rotating one-line highlight. Dwell 5s, out 220ms, in 340ms; pauses on
 * hover and respects the reduced-motion overrides in auth.css.
 */
export default function AuthHighlights() {
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);
  const [paused, setPaused] = useState(false);
  const next = useRef<number | null>(null);

  useEffect(() => {
    if (paused && !out) return;
    if (out) {
      const t = setTimeout(() => {
        setI(next.current ?? (i + 1) % SLIDES.length);
        next.current = null;
        setOut(false);
      }, SLIDE_OUT_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setOut(true), SLIDE_DWELL);
    return () => clearTimeout(t);
  }, [i, out, paused]);

  const go = (n: number) => {
    if (n === i && !out) return;
    next.current = n;
    setOut(true);
  };

  const slide = SLIDES[i] ?? SLIDES[0];
  const Icon = slide.I;

  return (
    <div
      className="reg-highlights"
      aria-roledescription="carousel"
      aria-label="PixoBooks highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div aria-live="polite" className="reg-highlight-stage">
        <span
          key={`${i}-${out}`}
          className={cn("reg-highlight", out ? "reg-adv-out" : "reg-adv-in")}
        >
          <span className="reg-highlight-icon">
            <Icon size={15} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="reg-highlight-text">{slide.text}</span>
        </span>
      </div>
      <div className="reg-highlight-dots">
        {SLIDES.map((_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => go(n)}
            aria-label={`Show highlight ${n + 1}`}
            aria-current={n === i}
            className={cn("reg-dot", n === i && "is-active")}
          />
        ))}
      </div>
    </div>
  );
}
