/**
 * Client Billing schema guard.
 *
 * Client billing lives in six `client_*` tables created by
 * `supabase/migrations/20251006000008_client_billing.sql`. Environments that
 * have not applied that migration answer PostgREST/Postgres with a
 * "missing table" error, which must not take down exports, sync or unrelated
 * pages. These predicates let callers degrade to an empty result instead.
 */

export const CLIENT_BILLING_MIGRATION_FILE = "20251006000008_client_billing.sql";
export const CLIENT_BILLING_CRON_MIGRATION_FILE = "20251006000009_client_billing_cron.sql";

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function errorText(error: ErrorLike): string {
  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

/** True when an error says the `client_*` billing tables are absent. */
export function isMissingBillingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const text = errorText(error as ErrorLike);
  if (!text) return false;
  return (
    /Could not find the table 'public\.client_/i.test(text) ||
    /relation "public\.client_[a-z_]+" does not exist/i.test(text)
  );
}

/** True when any supplied query error reports missing billing tables. */
export function hasMissingBillingTables(errors: readonly unknown[]): boolean {
  return errors.some(isMissingBillingTable);
}
