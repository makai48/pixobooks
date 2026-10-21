import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Copy,
  Layers,
  Wrench,
  AlertTriangle,
  Boxes,
  ShoppingBag,
  Truck,
  Ruler,
  ClipboardList,
  Package,
  Upload,
} from "lucide-react";
import SubNav from "@/components/layout/SubNav";
// Item image column removed from list views by design — images remain in ItemModal edit view.
import { toast } from "sonner";
import { useItems, useDeleteItem, useSeedSampleData, usePurgeDemoData } from "@/hooks/useItems";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatCurrency } from "@/lib/utils";
import { computeItemCost, producibleFromBOM } from "@/lib/pos";
import { ITEM_TYPE_META, type Item, type ItemType } from "@/types";
import ItemModal from "@/components/features/inventory/ItemModal";
import ImportModal from "@/components/features/inventory/ImportModal";

type Tab = "all" | ItemType | "low";

export default function Inventory() {
  const { can, profile } = useAuth();
  const { data: items = [], isLoading } = useItems();
  const { data: settings } = useShopSettings();
  const del = useDeleteItem();
  const seed = useSeedSampleData();
  const purge = usePurgeDemoData();

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  /** When set, ItemModal is opened as a new item pre-filled with this
   *  item's fields. Kept separate from `editItem` so the modal can tell
   *  the difference between edit vs clone and the save path treats it
   *  as a fresh insert. */
  const [cloneFrom, setCloneFrom] = useState<Item | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const query = q.toLowerCase();
      const matchQ =
        !query ||
        i.name.toLowerCase().includes(query) ||
        i.sku.toLowerCase().includes(query) ||
        (i.barcode || "").toLowerCase().includes(query);
      let matchTab = false;
      if (tab === "all") matchTab = true;
      else if (tab === "low")
        matchTab =
          (i.itemType === "material" || i.itemType === "intermediate") &&
          i.stock <= (i.lowStockThreshold ?? 10);
      else matchTab = i.itemType === tab;
      return matchQ && matchTab;
    });
  }, [items, q, tab]);

  const stats = useMemo(() => {
    const products = items.filter((i) => i.itemType === "product").length;
    const ready = items.filter((i) => i.itemType === "ready").length;
    const materials = items.filter((i) => i.itemType === "material").length;
    const intermediate = items.filter((i) => i.itemType === "intermediate").length;
    const stocked = items.filter(
      (i) => i.itemType === "material" || i.itemType === "intermediate" || i.itemType === "ready"
    );
    const invValue = stocked.reduce((s, m) => s + m.stock * m.cost, 0);
    const low = stocked.filter(
      (m) => m.stock <= (m.lowStockThreshold ?? 10)
    ).length;
    return { products, ready, materials, intermediate, invValue, low };
  }, [items]);

  const openNew = () => {
    setEditItem(null);
    setCloneFrom(null);
    setModalOpen(true);
  };

  const openEdit = (i: Item) => {
    setEditItem(i);
    setCloneFrom(null);
    setModalOpen(true);
  };

  const openClone = (i: Item) => {
    setEditItem(null);
    setCloneFrom(i);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditItem(null);
    setCloneFrom(null);
  };

  const remove = (i: Item) => {
    if (!confirm(`Delete "${i.name}"?`)) return;
    del.mutate(i.id, {
      onSuccess: () => toast.success(`Deleted ${i.name}`),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <SubNav
        items={[
          { to: "/inventory", label: "Inventory & BOM", icon: Boxes },
          { to: "/purchase-orders", label: "Purchase Orders", icon: ShoppingBag },
          { to: "/suppliers", label: "Suppliers", icon: Truck },
          { to: "/stock-taking", label: "Stock Taking", icon: ClipboardList },
          { to: "/unit-conversions", label: "Unit Conversions", icon: Ruler },
        ]}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Products (BOM)" value={String(stats.products)} icon={Layers} />
        <Stat label="Ready items" value={String(stats.ready)} />
        <Stat label="Materials" value={String(stats.materials + stats.intermediate)} icon={Wrench} />
        <Stat
          label="Low stock alerts"
          value={String(stats.low)}
          tone={stats.low > 0 ? "warn" : undefined}
        />
        <div className="col-span-2 md:col-span-4 paper-card p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Inventory value on hand
            </div>
            <div className="font-display text-3xl font-bold num">
              {formatCurrency(stats.invValue, settings?.currency)}
            </div>
          </div>
        </div>
      </div>

      <div className="paper-card p-4 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search SKU, name, or barcode"
              aria-label="Search inventory"
              className="input pl-9"
            />
          </div>
          {can("inventory.edit") && (
            <>
              <button onClick={() => setImportOpen(true)} className="btn btn-outline" title="Import inventory JSON from another shop">
                <Upload className="w-4 h-4" /> Import
              </button>
              <button
                onClick={() => {
                  if (!confirm("Remove bundled sample items and customers? Your own records are untouched.")) return;
                  purge.mutate(undefined, {
                    onSuccess: () => toast.success("Sample data removed"),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Purge failed"),
                  });
                }}
                disabled={purge.isPending}
                className="btn btn-ghost"
                title="Remove bundled sample items and customers"
              >
                <Trash2 className="w-4 h-4" /> Purge demo
              </button>
              <button onClick={openNew} className="btn btn-primary">
                <Plus className="w-4 h-4" /> New item
              </button>
            </>
          )}
        </div>
        <div className="flex bg-paper border rounded-md p-0.5 overflow-x-auto scrollbar-none">
          {(
            [
              ["all", "All"],
              ["product", "Products"],
              ["ready", "Ready"],
              ["material", "Materials"],
              ["intermediate", "Intermediate"],
              ["low", "Low stock"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "px-3 h-8 text-xs uppercase tracking-widest rounded whitespace-nowrap",
                tab === k ? "bg-ink text-paper" : "text-ink-mute"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">Loading...</div>
      ) : items.length === 0 ? (
        <div className="paper-card p-10 text-center">
          <div className="font-display font-bold text-lg">Empty catalog</div>
          <p className="text-ink-mute text-sm mt-1">
            Add items manually or load starter print-shop data.
          </p>
          <div className="mt-4 flex flex-col md:flex-row justify-center gap-2">
            <button className="btn btn-outline" onClick={openNew}>
              <Plus className="w-4 h-4" /> Add first item
            </button>
            <button
              disabled={seed.isPending}
              className="btn btn-primary"
              onClick={() =>
                seed.mutate(undefined, {
                  onSuccess: () => toast.success("Sample data loaded"),
                })
              }
            >
              {seed.isPending ? "Loading..." : "Load sample data"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block paper-card overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute bg-paper/60">
                    <th className="p-3 pl-5 w-[4%]"></th>
                    <th className="p-3 w-[24%]">Item</th>
                    <th className="p-3 w-[9%]">Type</th>
                    <th className="p-3 w-[13%]">SKU / Barcode</th>
                    <th className="p-3 w-[11%]">Category</th>
                    <th className="p-3 text-right w-[10%]">Stock</th>
                    <th className="p-3 text-right w-[8%]">Cost</th>
                    <th className="p-3 text-right w-[8%]">Price</th>
                    <th className="p-3 text-right w-[5%]">Margin</th>
                    <th className="p-3 text-right pr-5 w-[4%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const cost = computeItemCost(it, items);
                    const margin =
                      it.price > 0 ? ((it.price - cost) / it.price) * 100 : 0;
                    const meta = ITEM_TYPE_META[it.itemType];
                    const stocked =
                      it.itemType === "material" ||
                      it.itemType === "intermediate" ||
                      it.itemType === "ready";
                    const low = stocked && it.stock <= (it.lowStockThreshold ?? 10);
                    // For products, remaining stock = BOM-limited producible qty.
                    const isProductWithBom =
                      it.itemType === "product" && !!it.bom && it.bom.length > 0;
                    const producible = isProductWithBom
                      ? producibleFromBOM(it, items)
                      : { qty: 0 };
                    return (
                      <tr key={it.id} className="border-t hover:bg-paper/40">
                        <td className="p-3 pl-5">
                          <div className="w-9 h-9 rounded-md overflow-hidden bg-paper border flex items-center justify-center shrink-0">
                            {it.imageUrl ? (
                              <img
                                src={it.imageUrl}
                                alt={it.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <Package className="w-4 h-4 text-ink-mute" />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{it.name}</div>
                            {it.bom && it.bom.length > 0 && (
                              <div className="text-[11px] text-ink-mute">
                                BOM · {it.bom.length} material
                                {it.bom.length !== 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={cn("chip", meta.color)}>{meta.short}</span>
                        </td>
                        <td className="p-3">
                          <div className="num text-xs">{it.sku}</div>
                          {it.barcode && (
                            <div className="num text-xs text-ink-mute">{it.barcode}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="chip bg-ink/5 border">{it.category}</span>
                        </td>
                        <td className="p-3 text-right num">
                          {stocked ? (
                            <span className={cn(low && "text-danger font-semibold")}>
                              {`${it.stock.toLocaleString()} ${it.baseUnit}`}
                            </span>
                          ) : isProductWithBom ? (
                            <span className={cn(producible.qty === 0 && "text-warning font-semibold")}>
                              {`${producible.qty.toLocaleString()} ${it.baseUnit}`}
                            </span>
                          ) : (
                            <span className="text-ink-mute">Made to order</span>
                          )}
                          {low && (
                            <div className="inline-flex items-center gap-1 text-[11px] text-danger">
                              <AlertTriangle className="w-3 h-3" /> Low
                            </div>
                          )}
                          {isProductWithBom && (
                            <div className="text-[10px] text-ink-mute uppercase tracking-wider">
                              {producible.limiting
                                ? `Limit: ${producible.limiting.name}`
                                : "From BOM"}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right num">
                          {formatCurrency(cost, settings?.currency)}
                        </td>
                        <td className="p-3 text-right num font-semibold">
                          {meta.sellable ? formatCurrency(it.price, settings?.currency) : "—"}
                        </td>
                        <td className="p-3 text-right num">
                          {it.price > 0 ? `${margin.toFixed(0)}%` : "—"}
                        </td>
                        <td className="p-3 pr-5 text-right">
                          <div className="flex justify-end gap-1">
                            {can("inventory.edit") && (
                              <button
                                onClick={() => openEdit(it)}
                                className="btn btn-ghost h-8 w-8 p-0"
                                title="Edit item"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                            {can("inventory.edit") && (
                              <button
                                onClick={() => openClone(it)}
                                className="btn btn-ghost h-8 w-8 p-0"
                                title="Clone item (duplicate as a new variant)"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                            {can("inventory.delete") && (
                              <button
                                onClick={() => remove(it)}
                                className="btn btn-ghost h-8 w-8 p-0 text-danger"
                                title="Delete item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-ink-mute">
                        {/* colspan matches 10 visible columns */}
                        No items match.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.length === 0 ? (
              <div className="paper-card p-10 text-center text-ink-mute">No items match.</div>
            ) : (
              filtered.map((it) => {
                const cost = computeItemCost(it, items);
                const meta = ITEM_TYPE_META[it.itemType];
                const stocked =
                  it.itemType === "material" ||
                  it.itemType === "intermediate" ||
                  it.itemType === "ready";
                const low = stocked && it.stock <= (it.lowStockThreshold ?? 10);
                const isProductWithBom =
                  it.itemType === "product" && !!it.bom && it.bom.length > 0;
                const producible = isProductWithBom
                  ? producibleFromBOM(it, items)
                  : { qty: 0 };
                return (
                  <div key={it.id} className="paper-card p-3 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-paper border flex items-center justify-center shrink-0">
                      {it.imageUrl ? (
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Package className="w-5 h-5 text-ink-mute" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold truncate">{it.name}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("chip text-[10px] px-2 py-0", meta.color)}>
                          {meta.short}
                        </span>
                        <div className="text-[11px] text-ink-mute truncate">{it.category}</div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[11px] text-ink-mute num">
                          {stocked ? (
                            <span className={cn(low && "text-danger font-semibold")}>
                              {it.stock} {it.baseUnit}
                            </span>
                          ) : isProductWithBom ? (
                            <span className={cn(producible.qty === 0 && "text-warning font-semibold")}>
                              {producible.qty} {it.baseUnit}
                            </span>
                          ) : null}
                          {" · cost "}{formatCurrency(cost, settings?.currency)}
                        </div>
                        {meta.sellable && (
                          <div className="num font-bold">
                            {formatCurrency(it.price, settings?.currency)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {can("inventory.edit") && (
                        <button onClick={() => openEdit(it)} className="btn btn-ghost h-8 w-8 p-0" title="Edit">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {can("inventory.edit") && (
                        <button onClick={() => openClone(it)} className="btn btn-ghost h-8 w-8 p-0" title="Clone item">
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {can("inventory.delete") && (
                        <button onClick={() => remove(it)} className="btn btn-ghost h-8 w-8 p-0 text-danger" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <ItemModal item={editItem} cloneFrom={cloneFrom} onClose={closeModal} />
      )}
      {importOpen && (
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          existing={items}
          actor={{ id: profile?.id || "", name: profile?.name || "", role: profile?.role || "Staff" }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "warn";
}) {
  return (
    <div className="paper-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] md:text-[11px] uppercase tracking-widest text-ink-mute">
          {label}
        </div>
        {Icon && <Icon className="w-4 h-4 text-ink-mute" />}
      </div>
      <div
        className={cn(
          "font-display text-2xl font-bold num mt-1",
          tone === "warn" && "text-warning"
        )}
      >
        {value}
      </div>
    </div>
  );
}
