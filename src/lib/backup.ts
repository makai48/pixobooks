import { supabase } from "@/lib/supabase";
import { buildExport, type ExportCategory } from "@/lib/export";

/**
 * Full off-site backup: builds every export category and uploads a single
 * timestamped JSON to the `backups` storage bucket (create it as private).
 * Call from Settings → Data or a nightly cron/edge function.
 */
export async function backupAllToStorage(): Promise<{ path: string; bytes: number }> {
  const cats: ExportCategory[] = [
    "sales",
    "purchases",
    "inventory",
    "boms",
    "customers",
    "suppliers",
    "expenses",
    "employees",
    "statistics",
    "receipts",
    "loyalty",
    "client_billing",
    "audit",
  ];
  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    app: "pixobooks",
    categories: {},
  };
  for (const c of cats) {
    try {
      (payload.categories as Record<string, unknown>)[c] = await buildExport(c);
    } catch (e) {
      (payload.categories as Record<string, unknown>)[c] = {
        error: e instanceof Error ? e.message : "export failed",
      };
    }
  }
  const body = JSON.stringify(payload);
  // Unique per run: same-day re-backups must not collide on one path.
  // (Collisions turn the upload into an UPDATE, which needs a separate
  // storage policy — see supabase/migrations/*_backups*.sql.)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = `pixobooks-full-${stamp}.json`;
  const { error } = await supabase.storage
    .from("backups")
    .upload(path, new Blob([body], { type: "application/json" }), { upsert: false });
  if (error) {
    throw new Error(
      `Backup upload failed (${error.message || "storage error"}). ` +
        `Check the private "backups" bucket and its storage policies.`
    );
  }
  return { path, bytes: body.length };
}
