import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapSettings } from "@/lib/mappers";
import { toError } from "@/lib/utils";
import type { Settings } from "@/types";
import { getActiveBusinessId, useActiveBusiness } from "@/hooks/useBusinesses";

export function useShopSettings(options: { enabled?: boolean } = {}) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["shop_settings", businessId],
    enabled: options.enabled ?? true,
    queryFn: async () => {
      let q = supabase.from("shop_settings").select("*");
      q = businessId ? q.eq("business_id", businessId) : q.eq("id", "main");
      const { data, error } = await q.maybeSingle();
      if (error) {
        console.error("shop_settings fetch failed", error);
        throw toError(error, "Failed to load settings");
      }
      if (!data) {
        const insertRes = businessId
          ? await supabase
              .from("shop_settings")
              .insert({ id: businessId, business_id: businessId })
              .select()
              .single()
          : await supabase
              .from("shop_settings")
              .insert({ id: "main" })
              .select()
              .single();
        const { data: inserted, error: insertErr } = insertRes;
        if (insertErr || !inserted) {
          // A non-admin (or a legacy row the policies hide) cannot create the
          // row. Reading settings must still work, so fall back to defaults
          // instead of taking down every page that prefetches this query.
          if ((insertErr as { code?: string } | null)?.code === "42501") {
            console.warn(
              "shop_settings bootstrap blocked by row-level security — using defaults"
            );
            return mapSettings({ id: businessId ?? "main" });
          }
          console.error("shop_settings bootstrap failed", insertErr);
          throw toError(insertErr, "Failed to initialize settings");
        }
        return mapSettings(inserted);
      }
      return mapSettings(data);
    },
    refetchInterval: 60000,
  });
}

export function useUpdateShopSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.shopName !== undefined) payload.shop_name = patch.shopName;
      if (patch.currency !== undefined) payload.currency = patch.currency;
      if (patch.taxRate !== undefined) payload.tax_rate = patch.taxRate;
      if (patch.logoUrl !== undefined) payload.logo_url = patch.logoUrl;
      if (patch.address !== undefined) payload.address = patch.address;
      if (patch.phone !== undefined) payload.phone = patch.phone;
      if (patch.email !== undefined) payload.email = patch.email;
      if (patch.categories !== undefined) payload.categories = patch.categories;
      if (patch.weekStart !== undefined) payload.week_start = patch.weekStart;
      if (patch.dateFormat !== undefined) payload.date_format = patch.dateFormat;
      if (patch.expenseCategories !== undefined)
        payload.expense_categories = patch.expenseCategories;
      if (patch.country !== undefined) payload.country = patch.country;
      if (patch.timezone !== undefined) payload.timezone = patch.timezone;
      if (patch.businessType !== undefined) payload.business_type = patch.businessType;
      if (patch.digitGrouping !== undefined) payload.digit_grouping = patch.digitGrouping;
      if (patch.decimalPlaces !== undefined) payload.decimal_places = patch.decimalPlaces;
      if (patch.thousandSeparator !== undefined) payload.thousand_separator = patch.thousandSeparator;
      if (patch.decimalSeparator !== undefined) payload.decimal_separator = patch.decimalSeparator;
      if (patch.mobile !== undefined) payload.mobile = patch.mobile;
      if (patch.officePhone !== undefined) payload.office_phone = patch.officePhone;
      if (patch.whatsapp !== undefined) payload.whatsapp = patch.whatsapp;
      if (patch.termsVersion !== undefined) payload.terms_version = patch.termsVersion;
      if (patch.privacyVersion !== undefined) payload.privacy_version = patch.privacyVersion;
      if (patch.receipt !== undefined) payload.receipt = patch.receipt;
      if (patch.invoice !== undefined) payload.invoice = patch.invoice;
      if (patch.printer !== undefined) payload.printer = patch.printer;
      if (patch.loyalty !== undefined) payload.loyalty = patch.loyalty;
      if (patch.discount !== undefined) payload.discount = patch.discount;
      if (patch.theme !== undefined) payload.theme = patch.theme;
      if (patch.transactionAllowancePolicy !== undefined)
        payload.transaction_allowance_policy = patch.transactionAllowancePolicy;
      if (patch.pendingTxnAllowances !== undefined)
        payload.pending_txn_allowances = patch.pendingTxnAllowances;

      const businessId = getActiveBusinessId();
      const existing = await findSettingsRow(businessId);

      // Update the row we already read instead of upserting. An upsert also
      // runs the INSERT policy's WITH CHECK against the proposed row, so a
      // legacy `main` row (or a row whose business_id comes from an older
      // workspace) can raise 42501 even though the UPDATE itself is allowed.
      if (existing) {
        const result = await writeSettingsRow(payload, existing.id);
        if (result.error) {
          console.error("shop_settings save failed", result.error);
          throw saveError(result.error);
        }
        if (!result.data || result.data.length === 0) {
          throw new Error(
            "Settings were not saved — your role can read this workspace but cannot change it. Ask an owner, manager or admin to update your access."
          );
        }
        return;
      }

      // No row yet: create it with an explicit tenant so the INSERT policy can
      // evaluate `business_id` (never rely on the column default, which picks
      // the caller's oldest membership and can point at another workspace).
      const id = businessId ?? "main";
      const insertRow: Record<string, unknown> = { ...payload, id };
      if (businessId) insertRow.business_id = businessId;

      let result = await writeSettingsRow(insertRow);
      // A concurrent bootstrap can create the row between the read and insert.
      if (result.error?.code === "23505") {
        result = await writeSettingsRow(payload, id);
      }
      if (result.error) {
        console.error("shop_settings save failed", result.error);
        throw saveError(result.error);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_settings"] }),
  });
}

type SettingsRowRef = { id: string; business_id: string | null };
type SaveError = { message: string; code?: string };
type WriteResult = { data: SettingsRowRef[] | null; error: SaveError | null };

/** Locate the settings row the same way the read hook does. */
async function findSettingsRow(
  businessId: string | null
): Promise<SettingsRowRef | null> {
  let q = supabase.from("shop_settings").select("id, business_id");
  q = businessId ? q.eq("business_id", businessId) : q.eq("id", "main");
  const { data, error } = await q.maybeSingle();
  if (error) throw toError(error, "Failed to locate settings");
  return data ? { id: String(data.id), business_id: data.business_id ?? null } : null;
}

/**
 * Update by row id, or insert when `rowId` is omitted. Retries once without a
 * newly-added column when the deployment has not run that migration yet, so an
 * unrelated settings save is never blocked by one missing column.
 */
async function writeSettingsRow(
  row: Record<string, unknown>,
  rowId?: string
): Promise<WriteResult> {
  const run = async (candidate: Record<string, unknown>): Promise<WriteResult> => {
    const query = rowId
      ? supabase.from("shop_settings").update(candidate).eq("id", rowId).select("id, business_id")
      : supabase.from("shop_settings").insert(candidate).select("id, business_id");
    const { data, error } = await query;
    return {
      data: (data as SettingsRowRef[] | null) ?? null,
      error: (error as SaveError | null) ?? null,
    };
  };

  let result = await run(row);
  if (result.error && /week_start|date_format/i.test(result.error.message)) {
    if (import.meta.env.DEV) {
      console.warn(
        "[settings] newer settings column missing — apply the pending shop settings migration"
      );
    }
    const fallback = { ...row };
    if (/week_start/i.test(result.error.message)) delete fallback.week_start;
    if (/date_format/i.test(result.error.message)) delete fallback.date_format;
    result = await run(fallback);
  }
  return result;
}

/** Turn a policy denial into an actionable message instead of raw PostgREST. */
function saveError(error: SaveError): Error {
  if (error.code === "42501") {
    return new Error(
      "Your role can view this workspace but cannot save its settings. Ask an owner or admin to grant your team role Owner, Manager or Admin, then save again."
    );
  }
  return toError(error, "Save failed");
}
