import { useRef, useState } from "react";
import { Upload, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { currentBusinessId } from "@/lib/tenant";

type Props = {
  open: boolean;
  onClose: () => void;
  actor?: { id: string; name: string; role?: string };
};

type ImportData = {
  client_accounts?: Record<string, unknown>[];
  client_services?: Record<string, unknown>[];
  client_work_entries?: Record<string, unknown>[];
  client_billing_periods?: Record<string, unknown>[];
  client_invoices?: Record<string, unknown>[];
  client_invoice_payments?: Record<string, unknown>[];
};

export default function ImportClientBillingModal({ open, onClose, actor }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    accounts: number;
    services: number;
    workEntries: number;
    periods: number;
    invoices: number;
    payments: number;
    errors: string[];
  }>(null);

  if (!open) return null;

  const handleFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    const businessId = currentBusinessId();
    const errors: string[] = [];
    let accounts = 0;
    let services = 0;
    let workEntries = 0;
    let periods = 0;
    let invoices = 0;
    let payments = 0;

    try {
      const text = await file.text();
      const data: ImportData = JSON.parse(text);

      // Import client accounts
      if (Array.isArray(data.client_accounts) && data.client_accounts.length > 0) {
        for (const acc of data.client_accounts) {
          try {
            const { error } = await supabase.from("client_accounts").upsert(
              {
                id: acc.id || undefined,
                business_id: businessId,
                name: acc.name,
                address: acc.address || null,
                branch: acc.branch || null,
                po_box: acc.poBox || null,
                phone: acc.phone || null,
                email: acc.email || null,
                tin: acc.tin || null,
                vat: acc.vat || null,
                contact_persons: acc.contactPersons || [],
                staff: acc.staff || [],
                payment_details: acc.paymentDetails || {},
                active: acc.active !== false,
                invoice_generation_mode: acc.invoiceGenerationMode || "manual",
                notes: acc.notes || null,
                created_by: actor?.id ?? null,
                created_by_name: actor?.name ?? "system",
              },
              { onConflict: "id" }
            );
            if (error) throw error;
            accounts++;
          } catch (e) {
            errors.push(`Account "${(acc as { name?: unknown }).name}": ${e instanceof Error ? e.message : "Failed"}`);
          }
        }
      }

      // Import client services
      if (Array.isArray(data.client_services) && data.client_services.length > 0) {
        for (const svc of data.client_services) {
          try {
            const { error } = await supabase.from("client_services").upsert(
              {
                id: svc.id || undefined,
                business_id: businessId,
                client_id: svc.clientId,
                name: svc.name,
                description: svc.description || null,
                unit: svc.unit || "pc",
                unit_price: Number(svc.unitPrice || 0),
                active: svc.active !== false,
                created_at: svc.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
            if (error) throw error;
            services++;
          } catch (e) {
            errors.push(`Service "${String((svc as { name?: unknown }).name ?? "")}": ${e instanceof Error ? e.message : "Failed"}`);
          }
        }
      }

      // Import work entries
      if (Array.isArray(data.client_work_entries) && data.client_work_entries.length > 0) {
        for (const we of data.client_work_entries) {
          try {
            const { error } = await supabase.from("client_work_entries").upsert(
              {
                id: we.id || undefined,
                business_id: businessId,
                client_id: we.clientId,
                client_name: we.clientName || "",
                work_date: we.workDate || new Date().toISOString().slice(0, 10),
                officer: we.officer || null,
                service_id: we.serviceId || null,
                service_name: we.serviceName || "",
                description: we.description || null,
                quantity: Number(we.quantity || 0),
                unit: we.unit || "pc",
                unit_price: Number(we.unitPrice || 0),
                amount: Number(we.amount || 0),
                photo_url: we.photoUrl || null,
                billing_period: we.billingPeriod || null,
                validated: we.validated || false,
                invoice_id: we.invoiceId || null,
                status: we.status || "unbilled",
                recorded_by: (we.recordedBy || actor?.id) ?? null,
                recorded_by_name: (we.recordedByName || actor?.name) ?? "system",
                created_at: we.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
            if (error) throw error;
            workEntries++;
          } catch (e) {
            errors.push(`Work entry: ${e instanceof Error ? e.message : "Failed"}`);
          }
        }
      }

      // Import billing periods
      if (Array.isArray(data.client_billing_periods) && data.client_billing_periods.length > 0) {
        for (const bp of data.client_billing_periods) {
          try {
            const { error } = await supabase.from("client_billing_periods").upsert(
              {
                id: bp.id || undefined,
                business_id: businessId,
                client_id: bp.clientId,
                client_name: bp.clientName || "",
                period_start: bp.periodStart,
                period_end: bp.periodEnd,
                period_label: bp.periodLabel || "",
                status: bp.status || "open",
                invoice_id: bp.invoiceId || null,
                invoice_number: bp.invoiceNumber || null,
                work_count: Number(bp.workCount || 0),
                total_amount: Number(bp.totalAmount || 0),
                created_at: bp.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
            if (error) throw error;
            periods++;
          } catch (e) {
            errors.push(`Period "${String((bp as { periodLabel?: unknown }).periodLabel ?? "")}": ${e instanceof Error ? e.message : "Failed"}`);
          }
        }
      }

      // Import invoices
      if (Array.isArray(data.client_invoices) && data.client_invoices.length > 0) {
        for (const inv of data.client_invoices) {
          try {
            const { error } = await supabase.from("client_invoices").upsert(
              {
                id: inv.id || undefined,
                business_id: businessId,
                number: inv.number,
                client_id: inv.clientId,
                client_snapshot: inv.clientSnapshot || {},
                invoice_type: inv.invoiceType || "monthly",
                billing_period_id: inv.billingPeriodId || null,
                billing_period_label: inv.billingPeriodLabel || null,
                parent_invoice_id: inv.parentInvoiceId || null,
                issue_date: inv.issueDate || new Date().toISOString().slice(0, 10),
                due_date: inv.dueDate || null,
                subtotal: Number(inv.subtotal || 0),
                discount: Number(inv.discount || 0),
                other_charges: Number(inv.otherCharges || 0),
                tax: Number(inv.tax || 0),
                total: Number(inv.total || 0),
                amount_paid: Number(inv.amountPaid || 0),
                amount_due: Number(inv.amountDue || 0),
                status: inv.status || "unpaid",
                lines: inv.lines || [],
                breakdown: inv.breakdown || [],
                work_entry_ids: inv.workEntryIds || [],
                payment_details: inv.paymentDetails || {},
                amount_in_words: inv.amountInWords || null,
                notes: inv.notes || null,
                created_by: (inv.createdBy || actor?.id) ?? null,
                created_by_name: (inv.createdByName || actor?.name) ?? "system",
                cancelled_at: inv.cancelledAt || null,
                cancelled_by: inv.cancelledBy || null,
                cancelled_reason: inv.cancelledReason || null,
                created_at: inv.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
            if (error) throw error;
            invoices++;
          } catch (e) {
            errors.push(`Invoice "${String((inv as { number?: unknown }).number ?? "")}": ${e instanceof Error ? e.message : "Failed"}`);
          }
        }
      }

      // Import invoice payments
      if (Array.isArray(data.client_invoice_payments) && data.client_invoice_payments.length > 0) {
        for (const pay of data.client_invoice_payments) {
          try {
            const { error } = await supabase.from("client_invoice_payments").upsert(
              {
                id: pay.id || undefined,
                business_id: businessId,
                number: pay.number,
                invoice_id: pay.invoiceId,
                client_id: pay.clientId,
                payment_date: pay.paymentDate || new Date().toISOString().slice(0, 10),
                amount: Number(pay.amount || 0),
                payment_method: pay.paymentMethod || "cash",
                reference: pay.reference || null,
                notes: pay.notes || null,
                received_by: (pay.receivedBy || actor?.id) ?? null,
                received_by_name: (pay.receivedByName || actor?.name) ?? "system",
                cancelled: pay.cancelled || false,
                cancelled_at: pay.cancelledAt || null,
                cancelled_by: pay.cancelledBy || null,
                cancelled_reason: pay.cancelledReason || null,
                created_at: pay.createdAt || new Date().toISOString(),
              },
              { onConflict: "id" }
            );
            if (error) throw error;
            payments++;
          } catch (e) {
            errors.push(`Payment "${String((pay as { number?: unknown }).number ?? "")}": ${e instanceof Error ? e.message : "Failed"}`);
          }
        }
      }

      await logAudit(actor, "client_billing.import", "client_billing", null, {
        accounts,
        services,
        workEntries,
        periods,
        invoices,
        payments,
        errors: errors.length,
      });

      setResult({ accounts, services, workEntries, periods, invoices, payments, errors });
      if (errors.length === 0) {
        toast.success(`Import complete — ${accounts + services + workEntries + periods + invoices + payments} records`);
      } else {
        toast.warning(`Import finished with ${errors.length} issue${errors.length > 1 ? "s" : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const pickFile = () => {
    fileRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50" onClick={onClose}>
      <div className="paper-card w-full max-w-lg max-h-[90dvh] flex flex-col p-6 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            <Upload className="w-5 h-5" /> Import client billing data
          </h3>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-ink-mute mt-2">
          Choose the exported JSON file (Settings → Export → Client Billing). Existing records are matched by ID; new ones are inserted.
        </p>

        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFileChange} />

        {!result && (
          <button
            type="button"
            onClick={pickFile}
            disabled={busy}
            className="mt-4 w-full h-24 rounded-lg border-2 border-dashed border-line hover:border-ink transition flex flex-col items-center justify-center gap-1 text-ink-mute hover:text-ink"
          >
            <Upload className="w-6 h-6" />
            <span className="text-sm font-semibold">{busy ? "Importing…" : "Choose JSON file"}</span>
          </button>
        )}

        {result && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 p-3 rounded-md bg-success/10 border border-success/30">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              <div>
                <div className="font-semibold">Import finished</div>
                <div className="text-xs text-ink-mute">
                  {result.accounts} clients · {result.services} services · {result.workEntries} work entries · {result.periods} periods · {result.invoices} invoices · {result.payments} payments
                </div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="p-3 rounded-md bg-yellow-reg/10 border border-yellow-reg/30">
                <div className="flex items-center gap-2 font-semibold text-yellow-reg">
                  <AlertTriangle className="w-4 h-4" /> {result.errors.length} issue{result.errors.length > 1 ? "s" : ""}
                </div>
                <ul className="mt-1 text-xs text-ink-mute max-h-32 overflow-auto list-disc pl-5">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={onClose} className="btn btn-primary w-full h-11">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
