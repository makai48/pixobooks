import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  importData,
  parseImportFile,
  type ImportCategory,
  type ImportProgress,
  type ImportResult,
} from "@/lib/import";
import { queryClient } from "@/lib/appQueryClient";
import type { Employee } from "@/types";

/** Same actor shape `importData` accepts (for the audit trail). */
export type ImportActor = Pick<Employee, "id" | "name"> & { role?: string };

export type ImportJobPhase = "idle" | "running" | "done" | "error";

export type ImportJob = {
  phase: ImportJobPhase;
  category: ImportCategory;
  fileName: string;
  progress: ImportProgress;
  result: ImportResult | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

const EMPTY_PROGRESS: ImportProgress = {
  table: "",
  rowsDone: 0,
  rowsTotal: 0,
  batchesDone: 0,
  batchesTotal: 0,
};

const IDLE: ImportJob = {
  phase: "idle",
  category: "sales",
  fileName: "",
  progress: EMPTY_PROGRESS,
  result: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

/**
 * The import lives OUTSIDE React on purpose.
 *
 * Settings renders the import screen inline, so navigating to any other page
 * unmounts it. When the run was owned by the component, the promises kept
 * going but every `setProgress` landed on a dead component and the user lost
 * all sight of it. Keeping the job here means:
 *   • the import keeps running while the user works elsewhere,
 *   • returning to Settings shows the live progress/result again,
 *   • the floating banner can show progress on any page.
 */
let job: ImportJob = IDLE;
const listeners = new Set<() => void>();
/** Incremented by every start/reset; stale async completions are ignored. */
let runId = 0;

function emit() {
  for (const listener of listeners) listener();
}

function setJob(next: ImportJob) {
  job = next;
  emit();
}

export function getImportJob(): ImportJob {
  return job;
}

export function subscribeImportJob(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding. `getServerSnapshot` keeps SSR/tests happy. */
export function useImportJob(): ImportJob {
  return useSyncExternalStore(subscribeImportJob, getImportJob, getImportJob);
}

/** Dismiss the current job (after completion or error). */
export function resetImportJob() {
  runId += 1;
  setJob(IDLE);
}

export async function startImportJob(opts: {
  file: File;
  category: ImportCategory;
  actor?: ImportActor | null;
  /** Keep each row's original `created_at` (default true). */
  keepOriginalDates?: boolean;
}): Promise<void> {
  const id = ++runId;
  const { file, category, actor } = opts;

  setJob({
    phase: "running",
    category,
    fileName: file.name,
    progress: EMPTY_PROGRESS,
    result: null,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  });

  try {
    const payload = await parseImportFile(file);
    if (id !== runId) return;

    const result = await importData(
      category,
      payload,
      actor ?? undefined,
      (p) => {
        if (id !== runId) return;
        setJob({ ...job, progress: p });
      },
      { keepOriginalDates: opts.keepOriginalDates !== false }
    );
    if (id !== runId) return;

    setJob({ ...job, phase: "done", result, finishedAt: Date.now() });

    // Rows were written directly to Supabase, bypassing every mutation hook,
    // so every cached list is stale. Invalidate now so the Sales Report (and
    // the rest of the app) shows imported transactions immediately, on their
    // real transaction dates, instead of waiting for the next poll.
    void queryClient.invalidateQueries();

    if (result.totalErrors === 0) {
      toast.success(
        `Import complete — ${result.totalInserted} new, ${result.totalUpdated} updated`
      );
    } else {
      toast.warning(
        `Import finished with ${result.totalErrors} issue${
          result.totalErrors > 1 ? "s" : ""
        }`
      );
    }
  } catch (err) {
    if (id !== runId) return;
    const message = err instanceof Error ? err.message : "Import failed";
    setJob({ ...job, phase: "error", error: message, finishedAt: Date.now() });
    toast.error(message);
  }
}
