import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { IMPORT_CATEGORIES } from "@/lib/import";
import { resetImportJob, useImportJob } from "@/lib/importJob";

/**
 * Floating progress card for a data import.
 *
 * The import runs in `@/lib/importJob`, so it survives route changes. Settings
 * shows the full panel; everywhere else this card keeps the progress visible
 * (and reports the result once the user has moved on).
 */
export default function ImportJobBanner() {
  const job = useImportJob();
  const location = useLocation();
  const navigate = useNavigate();

  if (job.phase === "idle") return null;
  // Settings already renders the full panel for the same job.
  if (location.pathname.startsWith("/settings")) return null;

  const label =
    IMPORT_CATEGORIES.find((c) => c.key === job.category)?.label ?? job.category;
  const pct =
    job.progress.rowsTotal > 0
      ? Math.round((job.progress.rowsDone / job.progress.rowsTotal) * 100)
      : 0;

  return (
    <div className="fixed bottom-20 md:bottom-4 right-3 md:right-4 z-40 w-[min(92vw,360px)] paper-card border p-3 shadow-xl">
      {job.phase === "running" && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-magenta-reg shrink-0" />
            <span className="font-semibold">Importing {label}</span>
            <span className="text-ink-mute text-xs truncate ml-auto">
              {job.fileName}
            </span>
          </div>
          <div className="mt-2 h-2 rounded bg-ink/10 overflow-hidden">
            <div
              className="h-full bg-magenta-reg transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-ink-mute tabular-nums">
            {job.progress.rowsDone.toLocaleString()} of{" "}
            {job.progress.rowsTotal.toLocaleString()} rows
            {job.progress.table && (
              <span className="text-ink-subtle"> · {job.progress.table}</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-ink-mute">
              Keeps running if you leave this page.
            </span>
            <button
              type="button"
              className="btn btn-ghost h-7 px-2 text-[11px]"
              onClick={() => navigate("/settings")}
            >
              View
            </button>
          </div>
        </>
      )}

      {job.phase === "done" && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <span className="font-semibold">Import finished</span>
            <span className="text-ink-mute text-xs ml-auto">{label}</span>
          </div>
          <div className="mt-1 text-[11px] text-ink-mute">
            {job.result?.totalInserted ?? 0} new ·{" "}
            {job.result?.totalUpdated ?? 0} updated ·{" "}
            {job.result?.totalErrors ?? 0} error
            {(job.result?.totalErrors ?? 0) === 1 ? "" : "s"}
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline h-7 px-2 text-[11px]"
              onClick={() => {
                resetImportJob();
                navigate("/settings");
              }}
            >
              <Upload className="w-3 h-3" /> More imports
            </button>
            <button
              type="button"
              className="btn btn-ghost h-7 px-2 text-[11px]"
              onClick={resetImportJob}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {job.phase === "error" && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
            <span className="font-semibold">Import failed</span>
            <span className="text-ink-mute text-xs ml-auto">{label}</span>
          </div>
          <div className="mt-1 text-[11px] text-ink-mute break-words">
            {job.error || "Unknown error"}
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline h-7 px-2 text-[11px]"
              onClick={() => {
                resetImportJob();
                navigate("/settings");
              }}
            >
              Try again
            </button>
            <button
              type="button"
              className="btn btn-ghost h-7 px-2 text-[11px]"
              onClick={resetImportJob}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
