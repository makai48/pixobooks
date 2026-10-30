import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  WIPE_SCOPES,
  runWipe,
  wipeScope,
  wipeTables,
  type WipeActor,
  type WipeResult,
  type WipeScopeKey,
} from "@/lib/wipe";

type Phase = "idle" | "running" | "done" | "error";

/**
 * Section 10 "delete data" control: a scope dropdown + a danger button.
 *
 * Deliberately boring and explicit — the dropdown lists exactly the datasets
 * that can be exported (plus "All app data"), the panel spells out what the
 * selected scope removes, and the button opens a modal that requires the user
 * to type a confirmation phrase. Nothing is deleted on the first click.
 */
export default function WipeDataPanel({ actor }: { actor?: WipeActor }) {
  const [scope, setScope] = useState<WipeScopeKey>("all");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<WipeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = wipeScope(scope);
  const tables = wipeTables(scope);
  const hasData = tables.length > 0 || (selected.clears?.length ?? 0) > 0;
  const phrase = scope === "all" ? "WIPE ALL" : "WIPE";
  const matches = typed.trim().toUpperCase() === phrase;

  const pickScope = (next: WipeScopeKey) => {
    setScope(next);
    setPhase("idle");
    setResult(null);
    setError(null);
  };

  const openConfirm = () => {
    setTyped("");
    setError(null);
    setConfirming(true);
  };

  const closeConfirm = () => {
    if (phase === "running") return;
    setConfirming(false);
    setTyped("");
  };

  const doWipe = async () => {
    if (!matches || !hasData || phase === "running") return;
    setPhase("running");
    setError(null);
    setResult(null);
    try {
      const res = await runWipe(scope, actor);
      setResult(res);
      setPhase("done");
      setConfirming(false);
      setTyped("");
      if (res.errors.length > 0) {
        toast.warning(
          `Deleted ${res.totalDeleted.toLocaleString()} record${
            res.totalDeleted === 1 ? "" : "s"
          } — ${res.errors.length} table${res.errors.length === 1 ? "" : "s"} failed`
        );
      } else {
        toast.success(
          `Deleted ${res.totalDeleted.toLocaleString()} record${
            res.totalDeleted === 1 ? "" : "s"
          }`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete data";
      setError(message);
      setPhase("error");
      setConfirming(false);
      toast.error(message);
    }
  };

  const deletedRows = result?.tables.filter((t) => t.deleted > 0) ?? [];

  return (
    <div className="data-panel data-wipe-panel">
      <div className="data-panel-head">
        <div className="data-panel-badge is-danger">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="data-panel-heading">
          <div className="data-panel-title">Delete data</div>
          <div className="data-panel-sub">
            Permanently erase the data PixoBooks can import or export. This cannot be undone.
          </div>
        </div>
      </div>

      <div className="data-cat-list">
        <div>
          <label className="field-label" htmlFor="wipe-scope-select">
            Data to delete
          </label>
          <select
            id="wipe-scope-select"
            className="input"
            value={scope}
            onChange={(e) => pickScope(e.target.value as WipeScopeKey)}
          >
            {WIPE_SCOPES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="field-hint">{selected.description}</div>
        </div>

        {selected.note && (
          <div className="picker-notice">
            <span className="picker-notice-dot" />
            <span>{selected.note}</span>
          </div>
        )}

        <div className="data-panel-actions">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={openConfirm}
            disabled={!hasData || phase === "running"}
          >
            {phase === "running" ? (
              <Loader2 className="icon animate-spin" style={{ width: 13, height: 13 }} />
            ) : (
              <Trash2 className="icon" style={{ width: 13, height: 13 }} />
            )}
            {phase === "running" ? "Deleting…" : `Delete ${selected.label}`}
          </button>
          <span className="data-import-cta-hint">
            {hasData
              ? "You will be asked to confirm"
              : "Nothing is stored for this dataset"}
          </span>
        </div>

        {phase === "done" && result && (
          <div className="data-cat-list">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">
                  Deleted {result.totalDeleted.toLocaleString()} record
                  {result.totalDeleted === 1 ? "" : "s"}
                </span>
                <span className="text-ink-mute"> · {selected.label}</span>
              </div>
            </div>

            {deletedRows.length > 0 && (
              <div className="border rounded-md overflow-hidden bg-paper">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-ink-mute uppercase tracking-widest">
                      <th className="p-2">Table</th>
                      <th className="p-2 text-right">Deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedRows.map((t) => (
                      <tr key={t.table} className="border-t">
                        <td className="p-2 num">{t.table}</td>
                        <td className="p-2 num text-right">
                          {t.deleted.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {result.cleared
                      .filter((c) => c.updated > 0)
                      .map((c) => (
                        <tr key={`${c.table}.${c.column}`} className="border-t">
                          <td className="p-2 num">
                            {c.table}.{c.column}
                          </td>
                          <td className="p-2 num text-right">
                            {c.updated.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="picker-notice is-error">
                <span className="picker-notice-dot" />
                <span>
                  {result.errors.length} table
                  {result.errors.length === 1 ? "" : "s"} could not be cleared:{" "}
                  {result.errors.slice(0, 3).join("; ")}
                </span>
              </div>
            )}
          </div>
        )}

        {phase === "error" && error && (
          <div className="picker-notice is-error">
            <span className="picker-notice-dot" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {confirming && (
        <div className="st picker-root" role="presentation" onClick={closeConfirm}>
          <div className="picker-backdrop" />
          <div
            className="picker-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wipe-confirm-title"
            aria-describedby="wipe-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="picker-head">
              <div className="picker-head-icon">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="picker-head-copy">
                <div className="picker-eyebrow">Danger zone</div>
                <div className="picker-title" id="wipe-confirm-title">
                  Delete {selected.label}?
                </div>
                <div className="picker-sub" id="wipe-confirm-desc">
                  This permanently removes rows from your workspace. It cannot be undone.
                </div>
              </div>
              <button
                type="button"
                onClick={closeConfirm}
                className="picker-close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="picker-body" style={{ padding: "16px 20px", overflowY: "auto" }}>
              <div className="data-cat-list">
                <div className="picker-notice is-error">
                  <span className="picker-notice-dot" />
                  <span>
                    {selected.clears?.length
                      ? `This empties ${selected.clears
                          .map((c) => `${c.table}.${c.column}`)
                          .join(", ")} for every record.`
                      : `This deletes every row in ${tables.join(", ")}.`}
                  </span>
                </div>

                <div>
                  <label className="field-label" htmlFor="wipe-confirm-input">
                    Type <strong>{phrase}</strong> to confirm
                  </label>
                  <input
                    id="wipe-confirm-input"
                    className="input"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && matches) void doWipe();
                    }}
                    placeholder={phrase}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="wipe-confirm-hint"
                  />
                  <div className="field-hint" id="wipe-confirm-hint" aria-live="polite">
                    {matches
                      ? "Confirmed — press Delete permanently to finish."
                      : `Type ${phrase} exactly to enable the delete button.`}
                  </div>
                </div>
              </div>
            </div>

            <div className="picker-foot">
              <div className="picker-foot-hint">
                {hasData
                  ? "Deleted rows are gone from this device and from the cloud."
                  : "Nothing is stored for this dataset."}
              </div>
              <div className="data-panel-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={closeConfirm}
                  disabled={phase === "running"}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void doWipe()}
                  disabled={!matches || !hasData || phase === "running"}
                >
                  {phase === "running" ? (
                    <Loader2 className="icon animate-spin" style={{ width: 13, height: 13 }} />
                  ) : (
                    <Trash2 className="icon" style={{ width: 13, height: 13 }} />
                  )}
                  {phase === "running" ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
