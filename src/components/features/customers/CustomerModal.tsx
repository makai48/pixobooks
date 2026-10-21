import { useEffect, useState } from "react";
import { X, Upload, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useUpsertCustomer } from "@/hooks/useCustomers";
import { processImageFile } from "@/lib/imageUpload";
import PhoneInput from "@/components/common/PhoneInput";
import type { Customer } from "@/types";

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

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {customer ? "Edit customer" : "New customer"}
            </div>
            <h2 className="font-display text-xl font-bold">
              {customer?.name || "Add to register"}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Circular profile picture */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full border-2 overflow-hidden bg-paper flex items-center justify-center shrink-0">
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-6 h-6 text-ink-mute" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <label className="btn btn-outline h-9 cursor-pointer">
                <Upload className="w-4 h-4" />
                {uploading ? "Uploading..." : "Upload photo"}
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
                  className="btn btn-ghost h-8 text-danger"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="cust-name" className="label">Name</label>
            <input
              id="cust-name"
              autoFocus
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cust-email" className="label">Email</label>
              <input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input mt-1"
              />
            </div>
            <PhoneInput
              label="Phone"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
          </div>
          <div>
            <label htmlFor="cust-notes" className="label">Notes</label>
            <textarea
              id="cust-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input mt-1 h-24"
              placeholder="Preferences, delivery instructions..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={upsert.isPending || uploading} className="btn btn-primary">
              {upsert.isPending ? "Saving..." : customer ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
