import { useEffect, useState } from "react";
import {
  X,
  User as UserIcon,
  Mail,
  StickyNote,
  Camera,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useUpsertCustomer } from "@/hooks/useCustomers";
import { processImageFile } from "@/lib/imageUpload";
import PhoneInput from "@/components/common/PhoneInput";
import AuthModal from "@/components/auth/AuthModal";
import AuthField from "@/components/auth/AuthField";
import "@/styles/sheet.css";
import type { Customer } from "@/types";

/**
 * Add / edit customer sheet.
 *
 * Built on the shared V3 primitives (`AuthModal`, `AuthField`) so it speaks
 * the same design language as the rest of the product: brand-yellow CTA, 20px
 * card radius, floating icon fields and sentence-case labels. The phone width
 * turns the dialog into a bottom sheet (see `customers.css`).
 */
export default function CustomerModal({
  customer,
  onClose,
  onCreated,
}: {
  customer: Customer | null;
  onClose: () => void;
  onCreated?: (customer: Customer) => void;
}) {
  const upsert = useUpsertCustomer();
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
    avatarUrl: "",
  });

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone || "",
        notes: customer.notes || "",
        avatarUrl: customer.avatarUrl || "",
      });
    }
  }, [customer]);

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const url = await processImageFile(file, "customers");
      setForm((f) => ({ ...f, avatarUrl: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    try {
      const saved = await upsert.mutateAsync({
        id: customer?.id,
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        avatarUrl: form.avatarUrl || null,
      });
      toast.success(customer ? "Customer updated" : "Customer added");
      if (!customer && onCreated && saved) onCreated(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const initials =
    form.name.trim().charAt(0).toUpperCase() ||
    customer?.name.trim().charAt(0).toUpperCase() ||
    "?";

  return (
    <div className="v3-scope v3-scope-host v3-sheet-scope">
      <AuthModal
        kicker={customer ? "Customer register" : "New customer"}
        title={customer ? customer.name : "Add a customer"}
        onClose={onClose}
        footer={
          <>
            <button
              type="submit"
              form="customer-form"
              disabled={upsert.isPending || uploading}
              className="reg-submit"
            >
              <Check aria-hidden="true" />
              {upsert.isPending
                ? "Saving…"
                : customer
                ? "Save changes"
                : "Add to register"}
            </button>
            <button type="button" onClick={onClose} className="reg-back">
              Cancel
            </button>
          </>
        }
      >
        <form
          id="customer-form"
          onSubmit={submit}
          className="v3-sheet"
        >
          {/* Identity strip — the one picture that tells the customer apart. */}
          <div className="sheet-identity">
            <div className="sheet-avatar">
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="sheet-identity-copy">
              <div className="sheet-identity-name">
                {form.name.trim() || "New customer"}
              </div>
              <div className="sheet-identity-meta">
                {form.email.trim() || form.phone.trim() || "No contact details yet"}
              </div>
            </div>
            <div className="sheet-identity-actions">
              <label className="reg-secondary sheet-photo-btn">
                <Camera aria-hidden="true" />
                <span>{uploading ? "Uploading…" : "Photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                  }}
                />
              </label>
              {form.avatarUrl && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, avatarUrl: "" })}
                  className="sheet-photo-remove"
                  title="Remove photo"
                  aria-label="Remove photo"
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="reg-fields">
            <AuthField
              htmlFor="cust-name"
              label="Full name"
              required
              icon={UserIcon}
            >
              <input
                id="cust-name"
                autoFocus
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Amara Nabatanzi"
                className="input reg-with-icon"
              />
            </AuthField>

            <AuthField htmlFor="cust-email" label="Email" icon={Mail}>
              <input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@business.co"
                className="input reg-with-icon"
              />
            </AuthField>

            <div className="reg-field">
              <PhoneInput
                label="Phone"
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
                placeholder="712 345 678"
              />
            </div>

            <AuthField
              htmlFor="cust-notes"
              label="Notes"
              icon={StickyNote}
              hint="Delivery instructions, preferences, or anything the counter should know."
            >
              <textarea
                id="cust-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
                className="input reg-with-icon sheet-notes"
                rows={3}
              />
            </AuthField>
          </div>
        </form>
      </AuthModal>
    </div>
  );
}
