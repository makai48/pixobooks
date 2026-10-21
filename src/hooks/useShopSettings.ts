import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapSettings } from "@/lib/mappers";
import { toError } from "@/lib/utils";
import type { Settings } from "@/types";
import { getActiveBusinessId, useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useShopSettings() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["shop_settings", businessId],
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

      const { error } = await supabase
        .from("shop_settings")
        .upsert(await settingsRow(payload), { onConflict: "id" });
      if (error) {
        console.error("shop_settings save failed", error);
        throw toError(error, "Save failed");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_settings"] }),
  });
}

/**
 * Resolve the settings row for the active business. The original shop keeps
 * `id = 'main'`; each additional business gets a row keyed by its uuid.
 */
async function settingsRow(payload: Record<string, unknown>) {
  const businessId = getActiveBusinessId();
  if (!businessId) return { id: "main", ...payload };
  const { data } = await supabase
    .from("shop_settings")
    .select("id")
    .eq("business_id", businessId)
    .maybeSingle();
  const id = data?.id || businessId;
  return withBusiness({ id, ...payload });
}
