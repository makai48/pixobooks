import { useState } from "react";
import {
  Upload,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
  DatabaseBackup,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  IMPORT_CATEGORIES,
  parseImportFile,
  detectImportCategory,
  countImportRows,
  type ImportCategory,
  type TableImportResult,
} from "@/lib/import";
import {
  resetImportJob,
  startImportJob,
  useImportJob,
} from "@/lib/importJob";
import { EXPORT_CATEGORIES, downloadExport, type ExportCategory } from "@/lib/export";

export type ImportBackupActor = { id: string; name: string; role?: string };

type Props = {
  /**
   * inline — render as the Settings section 10 body (the page itself);
   * popup  — render inside a dialog (the `Open Import` button).
   * Both share every class, so they are visually identical.
   */
  variant?: "popup" | "inline";
  open?: boolean;
  onClose?: () => void;
  actor?: ImportBackupActor;
};

type Phase = "pick" | "running" | "done" | "error";

export default function ImportBackupScreen({
  variant = "popup",
  open = true,
  onClose,
  actor,
}: Props) {
  const inline = variant === "inline";
  /** The run itself lives in `@/lib/importJob`, outside this component, so
   *  leaving Settings does not cancel it and returning shows live progress. */
  const job = useImportJob();
  const phase: Phase = job.phase === "idle" ? "pick" : job.phase;
  const progress = job.progress;
  const result = job.result;
  const [category, setCategory] = useState<ImportCategory>("sales");
  const [fileName, setFileName] = useState("");
  /** The selected File, held in state so Start can read it. Reaching back into
   *  the input's `files` is unreliable: clearing the input value (so the same
   *  file can be re-picked) also empties its FileList. */
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState<ImportCategory | null>(null);
  /** Row count of the parsed file for the selected category — lets the user
   *  confirm the size of the import before committing. */
  const [pendingRows, setPendingRows] = useState<number | null>(null);
  /** Category currently being exported inside this screen. */
  const [exporting, setExporting] = useState<ExportCategory | null>(null);
  /** Category chosen in the Export panel's dropdown. */
  const [exportCategory, setExportCategory] = useState<ExportCategory>("sales");

  if (variant === "popup" && !open) return null;

  const reset = () => {
    resetImportJob();
    setFileName("");
    setFile(null);
    setFileError(null);
    setAutoDetected(null);
    setPendingRows(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Clear the input value regardless, so picking the same file twice still
    // fires a change event.
    e.target.value = "";
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast.error("File too large — keep imports under 50MB");
      return;
    }
    setFile(f);
    setFileName(f.name);
    setFileError(null);

    try {
      const payload = await parseImportFile(f);
      const detected = detectImportCategory(payload);
      const effective = detected || category;
      if (detected) {
        setAutoDetected(detected);
        setCategory(detected);
      } else {
        setAutoDetected(null);
      }
      // Count rows for the category this file will actually import as.
      setPendingRows(countImportRows(payload, effective));
    } catch (err) {
      setPendingRows(null);
      setFileError(err instanceof Error ? err.message : "Import failed");
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const runImport = async () => {
    const target = file;
    // Guard against a stale/absent selection — never report success without
    // a file in hand.
    if (!target || !(target instanceof File)) {
      setFileError("Choose a JSON file first");
      return;
    }
    const effective = autoDetected || category;
    setFileError(null);
    // Fire-and-forget on purpose: the job is owned by the store, so this
    // component may unmount without interrupting it.
    await startImportJob({
      file: target,
      category: effective,
      actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : undefined,
    });
  };

  const handleChooseFile = () => {
    document.getElementById("import-file-input")?.click();
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as ImportCategory;
    setCategory(next);
    // The file names its own category; a manual change means the user wants a
    // different slice of the same bundle.
    if (autoDetected) {
      setAutoDetected(null);
      setPendingRows(null);
    }
  };

  const doExport = async (cat: ExportCategory) => {
    setExporting(cat);
    try {
      await downloadExport(cat);
      toast.success(`Exported ${EXPORT_CATEGORIES.find((c) => c.key === cat)?.label ?? cat}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  // While a job is active the label comes from the job, not the dropdown —
  // the user may have navigated away and back, resetting local state.
  const activeCategory = job.phase === "idle" ? category : job.category;
  const selectedLabel =
    IMPORT_CATEGORIES.find((c) => c.key === activeCategory)?.label || activeCategory;
  const pct =
    progress.rowsTotal > 0 ? Math.round((progress.rowsDone / progress.rowsTotal) * 100) : 0;
  const canStart = phase === "pick" && !!fileName && !fileError;
  const exportLabel =
    EXPORT_CATEGORIES.find((c) => c.key === exportCategory)?.label ?? exportCategory;
  const exportDesc =
    EXPORT_CATEGORIES.find((c) => c.key === exportCategory)?.description ?? "";

  /* ------------------------------------------------------------------ *
   * The two panels — identical markup in both variants.
   * ------------------------------------------------------------------ */
  const panels = (
    <div className="data-panels">
      {/* ---------------- Import panel ---------------- */}
      <div className="data-panel">
        <div className="data-panel-head">
          <div className="data-panel-badge is-import">
            <Upload className="w-4 h-4" />
          </div>
          <div className="data-panel-heading">
            <div className="data-panel-title">Import</div>
            <div className="data-panel-sub">Restore rows from a JSON export.</div>
          </div>
        </div>

        {phase === "pick" && (
          <div className="data-cat-list">
            {!autoDetected && (
              <div>
                <label className="field-label" htmlFor="import-category-select">
                  Data category
                </label>
                <select
                  id="import-category-select"
                  className="input"
                  value={category}
                  onChange={handleCategoryChange}
                >
                  {IMPORT_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <div className="field-hint">
                  Pick the dataset this file should be written into.
                </div>
              </div>
            )}

            {autoDetected && (
              <div className="picker-notice is-ok">
                <span className="picker-notice-dot" />
                <span>
                  Detected: <strong>{selectedLabel}</strong>
                </span>
              </div>
            )}

            <div>
              <label className="field-label">JSON file</label>
              <input
                id="import-file-input"
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
              <button type="button" onClick={handleChooseFile} className="data-dropzone">
                <FileText className="w-5 h-5" />
                <span className="text-sm font-semibold">
                  {fileName || "Choose JSON file"}
                </span>
                <span className="text-xs text-ink-mute">
                  {fileName ? "Tap to choose a different file" : "or drop a .json file here"}
                </span>
              </button>
              <div className="field-hint">
                Use a file exported from PixoBooks Settings → Import &amp; Backup.
              </div>
            </div>

            {pendingRows !== null && !fileError && (
              <div className="picker-notice is-ok">
                <span className="picker-notice-dot" />
                <span>
                  {pendingRows === 0
                    ? "No rows for this category."
                    : `${pendingRows.toLocaleString()} row${pendingRows === 1 ? "" : "s"} ready as ${selectedLabel}.`}
                </span>
              </div>
            )}

            {fileError && (
              <div className="picker-notice is-error">
                <span className="picker-notice-dot" />
                <span>{fileError}</span>
              </div>
            )}

            <div className="data-panel-actions data-import-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={runImport}
                disabled={!canStart}
              >
                <Upload className="icon" style={{ width: 13, height: 13 }} />
                Start import
              </button>
              <span className="data-import-cta-hint">
                {fileName ? fileName : "No file selected yet"}
              </span>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="data-cat-list">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-ink-mute shrink-0" />
              <span className="font-semibold">Importing {selectedLabel}</span>
              <span className="text-ink-mute truncate">{job.fileName || fileName}</span>
            </div>
            <div className="h-2 rounded bg-ink/10 overflow-hidden">
              <div
                className="h-full bg-magenta-reg transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-ink-mute tabular-nums">
              {progress.rowsDone.toLocaleString()} of {progress.rowsTotal.toLocaleString()} rows
              {progress.batchesTotal > 0 && ` · batch ${progress.batchesDone}/${progress.batchesTotal}`}
              {progress.table && <span className="text-ink-subtle"> · {progress.table}</span>}
            </div>
            <div className="field-hint">
              You can leave this screen — the import keeps running in the
              background and progress stays visible in the corner.
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="data-cat-list">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">Import finished</span>
                <span className="text-ink-mute">
                  {" "}
                  {result.totalInserted} new · {result.totalUpdated} updated · {result.totalErrors} error
                  {result.totalErrors !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {result.results.length > 0 && (
              <div className="border rounded-md overflow-hidden bg-paper">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-ink-mute uppercase tracking-widest">
                      <th className="p-2">Table</th>
                      <th className="p-2 text-right">New</th>
                      <th className="p-2 text-right">Upd</th>
                      <th className="p-2">Err</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r: TableImportResult, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 num">{r.table}</td>
                        <td className="p-2 num text-right">{r.inserted}</td>
                        <td className="p-2 num text-right">{r.updated}</td>
                        <td className="p-2">
                          {r.errors.length > 0 && (
                            <span className="text-danger">{r.errors.length}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.totalErrors > 0 && (
              <div className="p-2 rounded-md bg-yellow-reg/10 border border-yellow-reg/30">
                <div className="flex items-center gap-2 font-semibold text-yellow-reg text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" /> Some rows skipped
                </div>
                <ul className="mt-1 text-xs text-ink-mute max-h-24 overflow-auto list-disc pl-5">
                  {result.results
                    .flatMap((r) => r.errors)
                    .slice(0, 15)
                    .map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                </ul>
              </div>
            )}

            {result.totalWarnings > 0 && (
              <div className="p-2 rounded-md bg-paper border">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <Info className="w-3.5 h-3.5" /> Document numbers adjusted (
                  {result.totalWarnings})
                </div>
                <div className="field-hint mt-1">
                  These rows were imported, but their number was already used by
                  another record so it was suffixed to stay unique.
                </div>
                <ul className="mt-1 text-xs text-ink-mute max-h-24 overflow-auto list-disc pl-5">
                  {result.results
                    .flatMap((r) => r.warnings)
                    .slice(0, 15)
                    .map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                </ul>
              </div>
            )}

            <div className="data-panel-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={reset}
              >
                <Upload className="icon" style={{ width: 13, height: 13 }} />
                More imports
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => close()}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="data-cat-list">
            <div className="picker-notice is-error">
              <span className="picker-notice-dot" />
              <span>{job.error || "Import failed"}</span>
            </div>
            <div className="field-hint">
              Nothing else was started. You can pick another file and try again.
            </div>
            <div className="data-panel-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={reset}
              >
                Try again
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => close()}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- Export panel ---------------- */}
      <div className="data-panel">
        <div className="data-panel-head">
          <div className="data-panel-badge is-export">
            <Download className="w-4 h-4" />
          </div>
          <div className="data-panel-heading">
            <div className="data-panel-title">Export</div>
            <div className="data-panel-sub">Send a dataset out as structured JSON.</div>
          </div>
        </div>

        <div className="data-cat-list">
          <div>
            <label className="field-label" htmlFor="export-category-select">
              Data category
            </label>
            <select
              id="export-category-select"
              className="input"
              value={exportCategory}
              onChange={(e) => setExportCategory(e.target.value as ExportCategory)}
            >
              {EXPORT_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="field-hint">Pick the dataset you want to download.</div>
          </div>

          <div className="data-export-preview">
            <div className="data-export-preview-name">{exportLabel}</div>
            <div className="data-cat-meta">{exportDesc}</div>
          </div>

          <div className="data-panel-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => doExport(exportCategory)}
              disabled={exporting !== null}
            >
              <Download className="icon" style={{ width: 13, height: 13 }} />
              {exporting === exportCategory ? "Exporting…" : "Export JSON"}
            </button>
            <span className="data-import-cta-hint">
              {exporting === exportCategory ? "Preparing your file…" : "Downloads as .json"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const close = () => {
    reset();
    onClose?.();
  };

  /* ------------------------------------------------------------------ *
   * Inline — the Settings section 10 body.
   * ------------------------------------------------------------------ */
  if (inline) {
    return (
      <div className="data-inline-screen">
        {panels}
        <div className="data-inline-foot">
          <div className="picker-foot-hint">
            Import and export use the same category list. Exports download a .json file to your
            device.
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ *
   * Popup — the same content inside a dialog.
   * ------------------------------------------------------------------ */
  return (
    <div className="st picker-root" onClick={onClose}>
      <div className="picker-backdrop" />
      <div className="picker-window is-wide" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <div className="picker-head-icon">
            <DatabaseBackup className="w-5 h-5" />
          </div>
          <div className="picker-head-copy">
            <div className="picker-eyebrow">PIXOBOOKS</div>
            <div className="picker-title">Import &amp; Backup</div>
            <div className="picker-sub">
              Bring data in from a PixoBooks JSON export, or send any dataset out. Both panels work
              on the same category list.
            </div>
          </div>
          <button onClick={close} className="picker-close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="picker-body"
          style={{ padding: "16px 20px", overflowY: "auto", flex: "1 1 auto" }}
        >
          {panels}
        </div>

        <div className="picker-foot">
          {phase === "running" ? (
            <div className="flex-1 h-11 flex items-center justify-center text-xs text-ink-mute">
              Importing… you can close this window; the import keeps running.
            </div>
          ) : (
            <div className="picker-foot-hint">
              Import and export use the same category list. Exports download a .json file to your
              device.
            </div>
          )}

          <button type="button" className="btn btn-ghost h-11" onClick={close}>
            {phase === "pick" && !fileName ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
