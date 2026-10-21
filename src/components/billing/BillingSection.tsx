import { useState } from "react";
import { toast } from "sonner";
import { useSubscription } from "@/hooks/useSubscription";
import { PLAN_LIMITS, PLAN_NAMES } from "@/lib/billing";
import type { BillingInfo } from "@/types";
import { backupAllToStorage } from "@/lib/backup";
import PlanBadge from "@/components/billing/PlanBadge";

export default function BillingSection() {
  const { billing, limits, trialDaysLeft, isActive } = useSubscription();
  const [backupBusy, setBackupBusy] = useState(false);

  const runBackup = async () => {
    setBackupBusy(true);
    try {
      const out = await backupAllToStorage();
      const { markBackupDone } = await import("@/lib/onboarding");
      markBackupDone();
      toast.success(`Backup uploaded: ${out.path} (${Math.round(out.bytes / 1024)} KB)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed — create the private `backups` bucket first");
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div>
      <div className="billing-hero">
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="billing-eyebrow">Current plan</div>
          <div className="billing-plan">
            <span className="billing-plan-name">{PLAN_NAMES[billing.plan]}</span>
            <PlanBadge />
          </div>
          <div className="billing-status">
            {billing.status === "trialing"
              ? trialDaysLeft !== null
                ? `${trialDaysLeft} trial days left`
                : "Trial"
              : `Status: ${billing.status}`}
          </div>
        </div>
        <button
          type="button"
          onClick={runBackup}
          disabled={backupBusy}
          className="btn btn-primary"
        >
          {backupBusy ? "Backing up…" : "Backup now"}
        </button>
      </div>

      <div className="grid-3 billing-limits">
        <Limit label="Branches" value={limits.branches} />
        <Limit label="Users" value={limits.users} />
        <Limit label="Items" value={limits.items} />
        <Limit label="Client billing" value={limits.clientBilling ? "Yes" : "—"} />
        <Limit label="Payroll" value={limits.payroll ? "Yes" : "—"} />
        <Limit label="API" value={limits.api ? "Yes" : "—"} />
      </div>

      {!isActive && (
        <div className="billing-alert">
          Subscription needs attention — update payment in the billing portal to avoid interruption.
        </div>
      )}

      <details className="billing-plans">
        <summary>Compare plans</summary>
        <div className="billing-plans-list">
          {(Object.keys(PLAN_LIMITS) as (keyof typeof PLAN_LIMITS)[]).map((p) => (
            <div key={p} className={isCurrent(billing, p) ? "current" : undefined}>
              <span style={{ fontWeight: 700 }}>{PLAN_NAMES[p]}</span>
              {": "}
              {PLAN_LIMITS[p].branches} branches, {PLAN_LIMITS[p].users} users,{" "}
              {PLAN_LIMITS[p].items} items
              {PLAN_LIMITS[p].clientBilling ? ", client billing" : ""}
              {PLAN_LIMITS[p].payroll ? ", payroll" : ""}
              {PLAN_LIMITS[p].api ? ", API" : ""}
              {isCurrent(billing, p) ? " — current" : ""}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function isCurrent(b: BillingInfo, p: keyof typeof PLAN_LIMITS): boolean {
  return b.plan === p;
}

function Limit({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="billing-limit">
      <div className="billing-limit-label">{label}</div>
      <div className="billing-limit-value num">{value}</div>
    </div>
  );
}
