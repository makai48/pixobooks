import { useEffect, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Truck,
  User as UserIcon,
  Mail,
  Home,
  MapPin,
  StickyNote,
  Camera,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useUpsertSupplier } from "@/hooks/useSuppliers";
import { useItems } from "@/hooks/useItems";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { processImageFile } from "@/lib/imageUpload";
import PhoneInput from "@/components/common/PhoneInput";
import GlassSelect from "@/components/ui/GlassSelect";
import AmountInput from "@/components/ui/AmountInput";
import AuthModal from "@/components/auth/AuthModal";
import AuthField from "@/components/auth/AuthField";
import "@/styles/sheet.css";
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

/**
 * Add / edit supplier sheet.
 *
 * Built on the shared V3 primitives (`AuthModal`, `AuthField`) and the shared
 * sheet styles (`src/styles/sheet.css`), so it is a sibling of the customer
 * sheet: same dialog, same fields, same footer. On phones it is a bottom sheet.
 */
export default function SupplierModal({
  supplier,
  onClose,
  defaultName = "",
  onSaved,
}: {
  supplier: SupplierRecord | null;
  onClose: () => void;
  /** Seeds the name when opened from another form (e.g. a typed supplier). */
  defaultName?: string;
  /** Reports the saved record so the opener can select it immediately. */
  onSaved?: (supplier: SupplierRecord) => void;
}) {
  const { profile } = useAuth();
  const { data: items = [] } = useItems();
  const { data: settings } = useShopSettings();
  const upsert = useUpsertSupplier();
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState<Draft>({
    name: defaultName,
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
      const saved = await upsert.mutateAsync({
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
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const initials =
    form.name.trim().charAt(0).toUpperCase() ||
    supplier?.name.trim().charAt(0).toUpperCase() ||
    "?";

  return (
    <div className="v3-scope v3-scope-host v3-sheet-scope">
      <AuthModal
        wide
        kicker={supplier ? "Supplier register" : "New supplier"}
        title={supplier ? supplier.name : "Add a supplier"}
        onClose={onClose}
        footer={
          <>
            <button
              type="submit"
              form="supplier-form"
              disabled={upsert.isPending || uploading}
              className="reg-submit"
            >
              <Check aria-hidden="true" />
              {upsert.isPending
                ? "Saving…"
                : supplier
                ? "Save changes"
                : "Add supplier"}
            </button>
            <button type="button" onClick={onClose} className="reg-back">
              Cancel
            </button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={submit} className="v3-sheet">
          {/* Identity strip — the supplier is the picture, the lines are the detail. */}
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
                {form.name.trim() || "New supplier"}
              </div>
              <div className="sheet-identity-meta">
                {form.location.trim() || form.contactPerson.trim() || "No contact details yet"}
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
              htmlFor="sup-name"
              label="Supplier name"
              required
              icon={Truck}
            >
              <input
                id="sup-name"
                autoFocus
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Kampala Paper Mills"
                className="input reg-with-icon"
              />
            </AuthField>

            <AuthField
              htmlFor="sup-contact"
              label="Contact person"
              icon={UserIcon}
            >
              <input
                id="sup-contact"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="Full name"
                className="input reg-with-icon"
              />
            </AuthField>

            <AuthField htmlFor="sup-email" label="Email" icon={Mail}>
              <input
                id="sup-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="orders@example.com"
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

            <AuthField htmlFor="sup-address" label="Address" icon={Home}>
              <input
                id="sup-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street / building"
                className="input reg-with-icon"
              />
            </AuthField>

            <AuthField htmlFor="sup-location" label="Location / City" icon={MapPin}>
              <input
                id="sup-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Kampala, Uganda"
                className="input reg-with-icon"
              />
            </AuthField>
          </div>

          <AuthField
            htmlFor="sup-notes"
            label="Notes"
            icon={StickyNote}
            hint="Payment terms, discounts, delivery days — anything the buyer should know."
          >
            <textarea
              id="sup-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional"
              rows={3}
              className="input reg-with-icon sheet-notes"
            />
          </AuthField>

          {/* Items supplied — the reason this supplier is on the register. */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <div className="font-display text-sm font-bold">Items supplied</div>
                <div className="text-[12px] text-ink-mute">
                  Typical quantities and prices for this supplier.
                </div>
              </div>
              <button type="button" onClick={addLine} className="reg-secondary sheet-photo-btn">
                <Plus aria-hidden="true" />
                <span>Add item</span>
              </button>
            </div>

            {form.items.length === 0 ? (
              <div className="sheet-empty">No items yet — add the first one.</div>
            ) : (
              <div className="sheet-lines">
                {form.items.map((line, i) => (
                  <div key={i} className="sheet-line">
                    <div className="is-name">
                      <label className="reg-label" htmlFor={`sup-item-${i}`}>
                        Item
                      </label>
                      <GlassSelect
                        id={`sup-item-${i}`}
                        value={line.itemId || ""}
                        onChange={(v) => pickItem(i, v)}
                        ariaLabel="Item"
                        options={[
                          { value: "", label: "Custom / not tracked" },
                          ...items.map((it) => ({ value: it.id, label: it.name })),
                        ]}
                        className="input select-glass"
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
                    <div className="is-qty">
                      <label className="reg-label" htmlFor={`sup-qty-${i}`}>
                        Qty
                      </label>
                      <input
                        id={`sup-qty-${i}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.qty}
                        onChange={(e) =>
                          updateLine(i, { qty: Number(e.target.value) })
                        }
                        className="input num text-right"
                      />
                    </div>
                    <div className="is-uom">
                      <label className="reg-label" htmlFor={`sup-uom-${i}`}>
                        UOM
                      </label>
                      <input
                        id={`sup-uom-${i}`}
                        value={line.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        placeholder="pc"
                      />
                    </div>
                    <div className="is-price">
                      <label className="reg-label" htmlFor={`sup-price-${i}`}>
                        Unit price
                      </label>
                      <AmountInput
                        id={`sup-price-${i}`}
                        step="0.01"
                        min={0}
                        value={line.unitPrice}
                        onChange={(v) => updateLine(i, { unitPrice: v })}
                        className="input num text-right"
                        ariaLabel={`Unit price for line ${i + 1}`}
                      />
                    </div>
                    <div className="is-remove">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="sheet-line-remove"
                        title="Remove this item"
                        aria-label="Remove this item"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </AuthModal>
    </div>
  );
}
