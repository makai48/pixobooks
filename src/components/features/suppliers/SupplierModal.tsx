import { useEffect, useState } from "react";
import { X, Plus, Trash2, Upload, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useUpsertSupplier } from "@/hooks/useSuppliers";
import { useItems } from "@/hooks/useItems";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { processImageFile } from "@/lib/imageUpload";
import PhoneInput from "@/components/common/PhoneInput";
import GlassSelect from "@/components/ui/GlassSelect";
import type { SupplierItem, SupplierRecord } from "@/types";

type Draft = {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  location: string;
  avatarUrl: string;
  notes: string;
  items: SupplierItem[];
};

export default function SupplierModal({
  supplier,
  onClose,
}: {
  supplier: SupplierRecord | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { data: items = [] } = useItems();
  const { data: settings } = useShopSettings();
  const upsert = useUpsertSupplier();
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState<Draft>({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    location: "",
    avatarUrl: "",
    notes: "",
    items: [],
  });

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name,
        contactPerson: supplier.contactPerson || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        location: supplier.location || "",
        avatarUrl: supplier.avatarUrl || "",
        notes: supplier.notes || "",
        items: supplier.items || [],
      });
    }
  }, [supplier]);

  const addLine = () =>
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { itemName: "", qty: 1, unit: "pc", unitPrice: 0, currency: settings?.currency },
      ],
    }));

  const updateLine = (i: number, patch: Partial<SupplierItem>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    }));

  const removeLine = (i: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const pickItem = (i: number, itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) {
      updateLine(i, { itemId: null, itemName: "" });
      return;
    }
    updateLine(i, {
      itemId: it.id,
      itemName: it.name,
      unit: it.baseUnit,
      sku: it.sku,
      unitPrice: it.cost,
    });
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const url = await processImageFile(file, "suppliers");
      setForm((f) => ({ ...f, avatarUrl: url }));
      toast.success("Photo attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Supplier name required");
    try {
      await upsert.mutateAsync({
        id: supplier?.id,
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        location: form.location.trim() || null,
        avatarUrl: form.avatarUrl || null,
        notes: form.notes.trim() || null,
        items: form.items,
        createdBy: profile?.id,
      });
      toast.success(supplier ? "Supplier updated" : "Supplier added");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-3xl overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {supplier ? "Edit supplier" : "New supplier"}
            </div>
            <h2 className="font-display text-xl md:text-2xl font-bold">
              Purchase source
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 md:p-5 space-y-5 overflow-auto">
          {/* Profile */}
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-24 h-24 rounded-full border-2 overflow-hidden bg-paper flex items-center justify-center shrink-0">
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-8 h-8 text-ink-mute" />
              )}
            </div>
            <div className="flex-1 w-full space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn btn-outline h-9 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Photo"}
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
                    className="btn btn-ghost h-9 text-danger"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                value={form.avatarUrl}
                onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                className="input"
                placeholder="Or paste image URL / base64"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sup-name" className="label">Supplier name *</label>
              <input
                id="sup-name"
                autoFocus
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input mt-1"
                placeholder="e.g. Kampala Paper Mills"
              />
            </div>
            <div>
              <label htmlFor="sup-contact" className="label">Contact person</label>
              <input
                id="sup-contact"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="input mt-1"
                placeholder="Full name"
              />
            </div>
            <div>
              <label htmlFor="sup-email" className="label">Email</label>
              <input
                id="sup-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input mt-1"
                placeholder="orders@example.com"
              />
            </div>
            <PhoneInput
              label="Phone"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+256 700 000 000"
            />
            <div>
              <label htmlFor="sup-address" className="label">Address</label>
              <input
                id="sup-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input mt-1"
                placeholder="Street / building"
              />
            </div>
            <div>
              <label htmlFor="sup-location" className="label">Location / City</label>
              <input
                id="sup-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="input mt-1"
                placeholder="Kampala, Uganda"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sup-notes" className="label">Notes</label>
            <textarea
              id="sup-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input mt-1 h-20"
              placeholder="Payment terms, discounts, delivery days..."
            />
          </div>

          {/* Items supplied */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-display font-bold">Items supplied</div>
                <div className="text-xs text-ink-mute">
                  Attach materials this supplier provides with typical quantities & prices.
                </div>
              </div>
              <button type="button" onClick={addLine} className="btn btn-outline h-9">
                <Plus className="w-4 h-4" /> Add item
              </button>
            </div>

            {form.items.length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-sm text-ink-mute text-center">
                No items yet. Click "Add item".
              </div>
            ) : (
              <div className="space-y-2">
                {form.items.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-4">
                      <label htmlFor={`sup-item-${i}`} className="label">Item</label>
                      <GlassSelect
                        id={`sup-item-${i}`}
                        value={line.itemId || ""}
                        onChange={(v) => pickItem(i, v)}
                        ariaLabel="Item"
                        options={[
                          { value: "", label: "Custom / not tracked" },
                          ...items.map((it) => ({ value: it.id, label: it.name })),
                        ]}
                        className="input select-glass mt-1"
                      />
                      {!line.itemId && (
                        <input
                          value={line.itemName}
                          onChange={(e) =>
                            updateLine(i, { itemName: e.target.value })
                          }
                          className="input mt-1"
                          placeholder="Item name"
                          aria-label="Custom item name"
                        />
                      )}
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label htmlFor={`sup-qty-${i}`} className="label">Qty</label>
                      <input
                        id={`sup-qty-${i}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.qty}
                        onChange={(e) =>
                          updateLine(i, { qty: Number(e.target.value) })
                        }
                        className="input mt-1 num text-right"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label htmlFor={`sup-uom-${i}`} className="label">UOM</label>
                      <input
                        id={`sup-uom-${i}`}
                        value={line.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        className="input mt-1"
                        placeholder="pc, ream, kg"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-3">
                      <label htmlFor={`sup-price-${i}`} className="label">Unit price</label>
                      <input
                        id={`sup-price-${i}`}
                        type="number"
                        step="0.01"
                        min={0}
                        value={line.unitPrice}
                        onChange={(e) =>
                          updateLine(i, { unitPrice: Number(e.target.value) })
                        }
                        className="input mt-1 num text-right"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="btn btn-ghost h-9 w-9 p-0 text-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
        <div className="p-4 border-t flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={upsert.isPending || uploading}
            className="btn btn-primary"
          >
            {upsert.isPending ? "Saving..." : supplier ? "Save" : "Add supplier"}
          </button>
        </div>
      </div>
    </div>
  );
}
