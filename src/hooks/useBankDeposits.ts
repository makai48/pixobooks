import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapBankDeposit } from "@/lib/mappers";
import type { BankDeposit } from "@/types";
import { logAudit } from "@/lib/audit";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useBankDeposits(fromDate?: string, toDate?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["bank_deposits", businessId, fromDate, toDate],
    queryFn: async () => {
      let q = supabase
        .from("bank_deposits")
        .select("*")
        .order("deposited_at", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (fromDate) q = q.gte("deposited_at", fromDate);
      if (toDate) q = q.lte("deposited_at", toDate);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data || []).map(mapBankDeposit);
    },
    refetchInterval: 30000,
  });
}

export type BankDepositInput = Partial<BankDeposit> & {
  actor?: { id: string; name: string; role?: string };
};

export function useCreateBankDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: BankDepositInput) => {
      // Banking is strictly a Till → Bank transfer:
      //   • Cashbook (till) is CREDITED by `amount`   (cash out)
      //   • Bank Statement is DEBITED by `amount`     (cash in)
      // It is NOT a sale, income, or expense. A single bank_deposit row
      // is the sole ledger entry — the Cashbook and Bank Statement views
      // in FinancialStatements derive both movements from this one row,
      // guaranteeing they can never diverge and are never double-counted.
      const payload = {
        amount: Number(p.amount || 0),
        from_source: p.fromSource || "cash",
        bank_name: p.bankName || null,
        reference: p.reference || null,
        notes: p.notes || null,
        // Default the business date to `deposited_at` if provided,
        // otherwise business-local today (not UTC).
        deposited_at:
          p.depositedAt ||
          (() => {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
          })(),
        created_by: p.actor?.id || null,
        created_by_name: p.actor?.name || null,
      };
      const { data, error } = await supabase
        .from("bank_deposits")
        .insert(withBusiness(payload))
        .select()
        .single();
      if (error) throw error;
      if (p.actor) {
        await logAudit(p.actor, "bank.deposit", "bank_deposit", data.id, {
          amount: payload.amount,
          bank: payload.bank_name,
        });
      }
      return mapBankDeposit(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_deposits"] });
      // A new deposit changes the till → so the live b/f for every
      // day AFTER this deposit's date must be re-derived.
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
      // The most-recently-used bank/account may have changed too.
      qc.invalidateQueries({ queryKey: ["mru_bank_account"] });
    },
  });
}

export function useUpdateBankDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      p: Partial<BankDeposit> & {
        id: string;
        actor?: { id: string; name: string; role?: string };
      }
    ) => {
      const patch: Record<string, unknown> = {};
      if (p.amount !== undefined) patch.amount = Number(p.amount || 0);
      if (p.depositedAt) patch.deposited_at = p.depositedAt;
      if (p.bankName !== undefined) patch.bank_name = p.bankName || null;
      if (p.reference !== undefined) patch.reference = p.reference || null;
      if (p.notes !== undefined) patch.notes = p.notes || null;

      const { data, error } = await supabase
        .from("bank_deposits")
        .update(patch)
        .eq("id", p.id)
        .select()
        .single();
      if (error) throw error;
      if (p.actor) {
        await logAudit(p.actor, "bank.deposit.update", "bank_deposit", p.id, patch);
      }
      return mapBankDeposit(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_deposits"] });
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
      qc.invalidateQueries({ queryKey: ["mru_bank_account"] });
    },
  });
}

export function useDeleteBankDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_deposits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_deposits"] });
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
      qc.invalidateQueries({ queryKey: ["mru_bank_account"] });
    },
  });
}
/**
 * Most-recently-used Bank/Account name — used to auto-select the
 * Bank/Account dropdown in the Daily Balancing modal. Falls back to
 * `null` when the shop has never banked before, in which case the
 * form starts empty. Automatically re-fetches when a new deposit is
 * created / deleted (see invalidations above).
 *
 * Note: this returns the last NON-EMPTY bank_name, so the auto-select
 * never suggests a placeholder value.
 */
export function useMostRecentBankAccount() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["mru_bank_account", businessId],
    queryFn: async () => {
      let q = supabase
        .from("bank_deposits")
        .select("bank_name")
        .not("bank_name", "is", null)
        .neq("bank_name", "")
        .order("created_at", { ascending: false })
        .limit(1);
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q.maybeSingle();
      if (error) return null;
      const name = data?.bank_name || null;
      return name && name.trim() ? name.trim() : null;
    },
    staleTime: 30000,
  });
}
