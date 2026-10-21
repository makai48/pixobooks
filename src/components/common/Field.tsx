// Shared form Field — label + control with guaranteed association.
// Generates a stable id per instance (useId) and injects it into the FIRST
// native input/select/textarea found in the child subtree (deep search, so
// icon-wrapper divs work too), wiring htmlFor automatically. This is the
// ONLY sanctioned way to render a label element in this codebase: bare
// labels without association fail accessibility audits.
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

function injectId(node: ReactNode, id: string): { node: ReactNode; done: boolean } {
  if (!isValidElement<{ id?: string }>(node)) return { node, done: false };
  const el = node as ReactElement<{ id?: string; children?: ReactNode }>;
  if (typeof el.type === "string" && ["input", "select", "textarea"].includes(el.type)) {
    if (el.props.id) return { node, done: true };
    return { node: cloneElement(el, { id }), done: true };
  }
  const kids = el.props.children;
  if (kids == null) return { node, done: false };
  let done = false;
  const next = Children.map(kids, (c) => {
    if (done) return c;
    const r = injectId(c, id);
    if (r.done) done = true;
    return r.node;
  });
  if (!done) return { node, done: false };
  return { node: cloneElement(el, { children: next }), done };
}

export default function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const autoId = useId().replace(/[^A-Za-z0-9-_]/g, "");
  const id = `f-${autoId}`;
  const { node } = injectId(children, id);
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <div className="mt-1">{node}</div>
      {error && <div className="text-[11px] text-danger mt-1">{error}</div>}
    </div>
  );
}
