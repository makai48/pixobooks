import { getActiveBusinessId } from "@/hooks/useBusinesses";

/**
 * Multi-tenant helpers.
 *
 * RLS restricts rows to every business the signed-in user belongs to, so the
 * client must also scope to the *active* business to keep a user who owns more
 * than one workspace from seeing a combined dataset. When no business is
 * selected we leave the query unscoped (legacy single-shop behaviour).
 */
export function currentBusinessId(): string | null {
  return getActiveBusinessId();
}

/** Stable suffix for React Query keys so switching businesses refetches. */
export function businessKey(): string {
  return getActiveBusinessId() ?? "none";
}

/** Stamp the active business onto a single insert payload. */
export function withBusiness<T extends Record<string, unknown>>(
  payload: T
): T & { business_id?: string } {
  const id = getActiveBusinessId();
  return id ? { ...payload, business_id: id } : payload;
}

/** Stamp the active business onto a batch insert payload. */
export function withBusinessAll<T extends Record<string, unknown>>(
  rows: T[]
): (T & { business_id?: string })[] {
  const id = getActiveBusinessId();
  return id ? rows.map((row) => ({ ...row, business_id: id })) : rows;
}
