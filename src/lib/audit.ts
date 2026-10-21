import { supabase } from "./supabase";
import { currentBusinessId } from "./tenant";
import type { Employee } from "@/types";

/**
 * Fire-and-forget audit trail write. Never blocks the caller and never throws.
 * Use for owner-observable actions: password reset approvals, shop/user
 * invites, sales voids, salary changes, etc.
 */
export async function logAudit(
  actor: Pick<Employee, "id" | "name"> & { role?: string } | null | undefined,
  action: string,
  entity?: string | null,
  entityId?: string | null,
  meta: Record<string, unknown> = {}
) {
  try {
    await supabase.from("audit_logs").insert({
      business_id: currentBusinessId() ?? undefined,
      actor_id: actor?.id || null,
      actor_name: actor?.name || "system",
      actor_role: actor?.role || null,
      action,
      entity: entity || null,
      entity_id: entityId || null,
      meta,
    });
  } catch {
    // Never break UX on audit failure
  }
}
