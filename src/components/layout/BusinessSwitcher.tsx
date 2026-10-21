import { useEffect, useRef, useState } from "react";
import { Briefcase, Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useActiveBusiness,
  useBusinesses,
  setActiveBusiness,
  type Business,
} from "@/hooks/useBusinesses";
import CreateWorkspaceDialog from "@/components/layout/CreateWorkspaceDialog";

/**
 * Business switcher (TopBar). Sits above the branch switcher: the active
 * business scopes every query and write, while the branch scopes documents
 * within that business. Hidden until the multitenancy tables are available so
 * pre-migration deployments are unaffected.
 */
export default function BusinessSwitcher() {
  const { data: businesses = [], isLoading, isError } = useBusinesses();
  const activeId = useActiveBusiness();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (businesses.length === 0) return;
    if (!businesses.some((b) => b.id === activeId)) {
      setActiveBusiness(businesses[0].id);
    }
  }, [businesses, activeId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (isError) return null;

  const current = businesses.find((b) => b.id === activeId) || null;

  const pick = (b: Business) => {
    setActiveBusiness(b.id);
    setOpen(false);
    toast.success(`${b.name} active`);
  };

  return (
    <>
      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn btn-ghost h-11 px-3 flex items-center gap-2 max-w-[220px]"
          aria-haspopup="listbox"
          aria-expanded={open}
          title="Switch business"
        >
          <Briefcase className="w-5 h-5 shrink-0" />
          <span className="truncate text-xs font-semibold hidden sm:inline">
            {isLoading ? "Business…" : current ? current.name : "No business"}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </button>
        {open && (
          <div
            className="absolute right-0 mt-2 w-64 paper-card p-2 z-50"
            role="listbox"
            aria-label="Businesses"
          >
            {businesses.map((b) => (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={activeId === b.id}
                onClick={() => pick(b)}
                className="w-full flex items-center gap-2 px-3 h-10 rounded-lg text-sm hover:bg-ink/5 min-w-0"
              >
                <span className="w-4 shrink-0">
                  {activeId === b.id && <Check className="w-4 h-4" />}
                </span>
                <span className="truncate">{b.name}</span>
              </button>
            ))}
            {businesses.length === 0 && !isLoading && (
              <p className="px-3 py-2 text-xs text-ink-mute">No businesses yet.</p>
            )}
            <div className="mt-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 h-10 rounded-lg text-sm font-semibold hover:bg-ink/5"
              >
                <Plus className="w-4 h-4" />
                New business
              </button>
            </div>
          </div>
        )}
      </div>
      {createOpen && (
        <CreateWorkspaceDialog
          initialMode="business"
          onClose={() => setCreateOpen(false)}
        />
      )}
    </>
  );
}
