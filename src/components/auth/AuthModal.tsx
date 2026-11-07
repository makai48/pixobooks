import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";

export type AuthModalProps = {
  kicker: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider reading surface for legal text. */
  wide?: boolean;
};

/**
 * Shared V3 modal used by the legal reader and the forgot-password flow.
 * Backdrop click and Escape close; content stops propagation.
 */
export default function AuthModal({
  kicker,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: AuthModalProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="reg-modal-backdrop" onClick={onClose}>
      <div
        className={wide ? "reg-modal reg-modal-wide" : "reg-modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reg-modal-head">
          <div>
            <p className="reg-step">{kicker}</p>
            <h2 id={titleId} className="reg-modal-title">
              {title}
            </h2>
          </div>
          <button onClick={onClose} className="reg-modal-close" aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="reg-modal-body">{children}</div>
        {footer && <div className="reg-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
