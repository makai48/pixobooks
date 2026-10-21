import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Ruler, X, Boxes, ShoppingBag, Truck, ClipboardList,
  Pencil, Power,
} from "lucide-react";
import { toast } from "sonner";
import SubNav from "@/components/layout/SubNav";
import SharedField from "@/components/common/Field";
import {
  useUnitConversions,
  useUpsertUnitConversion,
  useDeleteUnitConversion,
} from "@/hooks/useUnitConversions";
import {
  useUoms,
  useUpsertUom,
  useDeleteUom,
} from "@/hooks/useUoms";
import {
  useUomCategories,
  useUpsertUomCategory,
  refreshUomRatios,
} from "@/hooks/useUomCategories";
import { findUomDependencies, type UomDependencyCounts } from "@/lib/uomDependencies";
import { useAuth } from "@/hooks/useAuth";
import { UNIT_CATEGORIES, type UnitConversion, type Uom, type UomCategory } from "@/types";
import { describeRelationship } from "@/lib/uom";
import { cn } from "@/lib/utils";

/**
 * UOM master — Odoo-style list management for units, conversions and
 * families. Units live in a list view with full CRUD; conversions in
 * their own table; categories anchor each family's reference UOM.
 * All math/validation still flows through the central engine + hooks.
 */
type Tab = "units" | "conversions" | "categories";

export default function UnitConversions() {
  const { profile, can, isAppOwner } = useAuth();
  const { data: conversions = [], isLoading } = useUnitConversions();
  const { data: uoms = [], isLoading: uomsLoading } = useUoms();
  const { data: categories = [] } = useUomCategories();
  const upsert = useUpsertUnitConversion();
  const del = useDeleteUnitConversion();
  const upsertUom = useUpsertUom();
  const upsertCategory = useUpsertUomCategory();

  const canManage = can("settings.units") || can("settings.manage") || isAppOwner;

  const [tab, setTab] = useState<Tab>("units");
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const [unitModal, setUnitModal] = useState<null | { uom: Uom | null }>(null);
  const [convModal, setConvModal] = useState<null | { conv: UnitConversion | null }>(null);
  const [catModal, setCatModal] = useState<null | { cat: UomCategory | null }>(null);
  const [deleteUomTarget, setDeleteUomTarget] = useState<Uom | null>(null);

  const query = q.trim().toLowerCase();
  const visibleUoms = useMemo(() => {
    return uoms.filter((u) => {
      if (!query) return true;
      return (
        u.code.toLowerCase().includes(query) ||
        u.name.toLowerCase().includes(query) ||
        (u.symbol || "").toLowerCase().includes(query)
      );
    });
  }, [uoms, query]);

  const visibleConversions = useMemo(() => {
    return conversions.filter((c) => {
      if (categoryFilter !== "All" && c.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        c.fromUnit.toLowerCase().includes(query) ||
        c.toUnit.toLowerCase().includes(query) ||
        (c.notes || "").toLowerCase().includes(query)
      );
    });
  }, [conversions, query, categoryFilter]);

  const visibleCategories = useMemo(() => {
    if (!query) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.description || "").toLowerCase().includes(query)
    );
  }, [categories, query]);

  const refCodeFor = (categoryId?: string | null): string | null => {
    if (!categoryId) return null;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat?.referenceUomId) return null;
    return uoms.find((u) => u.id === cat.referenceUomId)?.code ?? null;
  };

  const saveUnit = async (input: {
    id?: string;
    code: string;
    name: string;
    symbol: string;
    discrete: boolean;
    categoryId: string;
    rounding: string;
    isActive: boolean;
  }) => {
    if (!input.code.trim() || !input.name.trim())
      throw new Error("Unit code and name are required");
    const rounding = input.rounding.trim() === "" ? null : Number(input.rounding);
    if (rounding !== null && (!Number.isFinite(rounding) || rounding <= 0))
      throw new Error("Rounding increment must be greater than 0");
    await upsertUom.mutateAsync({
      id: input.id,
      code: input.code,
      name: input.name,
      symbol: input.symbol || null,
      discrete: input.discrete,
      isActive: input.isActive,
      categoryId: input.categoryId || null,
      rounding,
    });
  };

  const saveConversion = async (input: {
    id?: string;
    fromUnit: string;
    toUnit: string;
    factor: number;
    category: string;
    notes: string;
  }) => {
    if (!input.fromUnit.trim() || !input.toUnit.trim())
      throw new Error("From and To units are required");
    await upsert.mutateAsync({
      id: input.id,
      fromUnit: input.fromUnit,
      toUnit: input.toUnit,
      factor: input.factor,
      category: input.category,
      notes: input.notes || null,
      createdBy: profile?.id,
    });
  };

  const saveCategory = async (input: {
    id?: string;
    name: string;
    referenceUomId: string;
    description: string;
  }) => {
    if (!input.name.trim()) throw new Error("Category name is required");
    const saved = await upsertCategory.mutateAsync({
      id: input.id,
      name: input.name,
      referenceUomId: input.referenceUomId || null,
      description: input.description || null,
    });
    // A new/changed reference re-anchors the family's math.
    await refreshUomRatios(saved.id).catch(() => undefined);
  };

  const toggleUomActive = (u: Uom) => {
    upsertUom.mutate(
      { id: u.id, code: u.code, name: u.name, symbol: u.symbol, discrete: u.discrete, isActive: !u.isActive },
      {
        onSuccess: () => toast.success(u.isActive ? "Unit deactivated" : "Unit reactivated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
      }
    );
  };

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "units", label: "Units", count: uoms.length },
    { id: "conversions", label: "Conversions", count: conversions.length },
    { id: "categories", label: "Categories", count: categories.length },
  ];

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold">Units of Measure</h1>
          <p className="text-xs text-ink-mute mt-0.5">
            One master list of units, one conversion table, one family per category.
            All quantity math across the app resolves through this data.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {tab === "units" && (
              <button type="button" onClick={() => setUnitModal({ uom: null })} className="btn btn-primary h-9">
                <Plus className="w-4 h-4" /> New unit
              </button>
            )}
            {tab === "conversions" && (
              <button type="button" onClick={() => setConvModal({ conv: null })} className="btn btn-primary h-9">
                <Plus className="w-4 h-4" /> New conversion
              </button>
            )}
            {tab === "categories" && (
              <button type="button" onClick={() => setCatModal({ cat: null })} className="btn btn-primary h-9">
                <Plus className="w-4 h-4" /> New category
              </button>
            )}
          </div>
        )}
      </div>

      {!canManage && (
        <div className="paper-card p-4 flex items-center gap-3 border-warning/40 bg-warning/5">
          <div className="w-10 h-10 rounded-full bg-warning/10 text-warning flex items-center justify-center">
            <Ruler className="w-4 h-4" />
          </div>
          <div className="flex-1 text-sm text-ink-mute">
            You can view units but only Admin/Owner users can add, edit or delete them.
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 h-11 text-sm font-semibold border-b-2 transition whitespace-nowrap",
              tab === t.id
                ? "border-magenta-reg text-magenta-reg"
                : "border-transparent text-ink-mute hover:text-ink"
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] num opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="paper-card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "units" ? "Search code, name or symbol" : tab === "conversions" ? "Search from/to unit or notes" : "Search categories"}
          className="input"
          aria-label="Search"
        />
        {tab === "conversions" ? (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input"
            aria-label="Filter by category"
          >
            <option value="All">All categories</option>
            {UNIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <div className="text-xs text-ink-mute self-center">
            {tab === "units"
              ? "Discrete units accept whole numbers only; divisible units accept fractions per their step."
              : "Each family converts only within itself, anchored at its reference unit."}
          </div>
        )}
      </div>

      {tab === "units" && (
        <UnitsTable
          rows={visibleUoms}
          loading={uomsLoading}
          categories={categories}
          refCodeFor={refCodeFor}
          canManage={canManage}
          onEdit={(uom) => setUnitModal({ uom })}
          onToggleActive={toggleUomActive}
          onDelete={(uom) => setDeleteUomTarget(uom)}
          hasMasterRows={uoms.length > 0}
          hasConversions={conversions.length > 0}
        />
      )}

      {tab === "conversions" && (
        <ConversionsTable
          rows={visibleConversions}
          loading={isLoading}
          canManage={canManage}
          onEdit={(conv) => setConvModal({ conv })}
          onDelete={(conv) => {
            if (!confirm(`Delete ${conv.fromUnit} → ${conv.toUnit}?`)) return;
            del.mutate(conv.id, {
              onSuccess: () => toast.success("Deleted"),
              onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
            });
          }}
        />
      )}

      {tab === "categories" && (
        <CategoriesTable
          rows={visibleCategories}
          uoms={uoms}
          canManage={canManage}
          onEdit={(cat) => setCatModal({ cat })}
        />
      )}

      {unitModal && (
        <UnitModal
          key={unitModal.uom?.id || "new"}
          initial={unitModal.uom}
          categories={categories}
          saving={upsertUom.isPending}
          onClose={() => setUnitModal(null)}
          onSave={async (input) => {
            await saveUnit({ id: unitModal.uom?.id, ...input });
            setUnitModal(null);
            toast.success(unitModal.uom ? "Unit updated" : "Unit added");
          }}
        />
      )}

      {convModal && (
        <ConversionModal
          key={convModal.conv?.id || "new"}
          initial={convModal.conv}
          conversions={conversions}
          uoms={uoms}
          saving={upsert.isPending}
          onClose={() => setConvModal(null)}
          onSave={async (input) => {
            await saveConversion({ id: convModal.conv?.id, ...input });
            setConvModal(null);
            toast.success(convModal.conv ? "Conversion updated" : "Conversion added");
          }}
        />
      )}

      {catModal && (
        <CategoryModal
          key={catModal.cat?.id || "new"}
          initial={catModal.cat}
          uoms={uoms}
          saving={upsertCategory.isPending}
          onClose={() => setCatModal(null)}
          onSave={async (input) => {
            await saveCategory({ id: catModal.cat?.id, ...input });
            setCatModal(null);
            toast.success(catModal.cat ? "Category updated" : "Category added");
          }}
        />
      )}

      {deleteUomTarget && (
        <DeleteUomDialog
          uom={deleteUomTarget}
          onClose={() => setDeleteUomTarget(null)}
          onDeleted={() => setDeleteUomTarget(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Units ------------------------------- */

function UnitsTable({
  rows,
  loading,
  categories,
  refCodeFor,
  canManage,
  onEdit,
  onToggleActive,
  onDelete,
  hasMasterRows,
  hasConversions,
}: {
  rows: Uom[];
  loading: boolean;
  categories: { id: string; name: string }[];
  refCodeFor: (categoryId?: string | null) => string | null;
  canManage: boolean;
  onEdit: (u: Uom) => void;
  onToggleActive: (u: Uom) => void;
  onDelete: (u: Uom) => void;
  hasMasterRows: boolean;
  hasConversions: boolean;
}) {
  const catName = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name || "—";
  const refRatio = (u: Uom): string => {
    if (u.ratio == null || !Number.isFinite(u.ratio) || u.ratio <= 0) return "—";
    const ref = refCodeFor(u.categoryId);
    if (!ref || ref === u.code) return ref === u.code ? "reference" : "—";
    const val =
      Math.abs(u.ratio - Math.round(u.ratio)) < 1e-9
        ? String(Math.round(u.ratio))
        : String(u.ratio);
    return `1 ${u.code} = ${val} ${ref}`;
  };
  return (
    <div className="paper-card overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute bg-paper/40">
              <th className="p-2 pl-4">Unit</th>
              <th className="p-2">Category</th>
              <th className="p-2">Behavior</th>
              <th className="p-2">Reference ratio</th>
              <th className="p-2">Status</th>
              {canManage && <th className="p-2 pr-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canManage ? 6 : 5} className="p-8 text-center text-ink-mute text-sm">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="p-10 text-center text-ink-mute text-sm">
                  {hasMasterRows
                    ? "No units match."
                    : hasConversions
                      ? "No master rows yet — run migration 20251006000003, then units appear here."
                      : "No units yet. Add your first unit above."}
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className={cn("border-t hover:bg-paper/40", !u.isActive && "opacity-60")}>
                  <td className="p-2 pl-4">
                    <span className="font-semibold num">{u.code}</span>
                    <span className="text-ink-mute text-xs ml-2">{u.name}</span>
                    {u.symbol && <span className="text-ink-mute text-xs ml-1">({u.symbol})</span>}
                  </td>
                  <td className="p-2 text-xs">{catName(u.categoryId)}</td>
                  <td className="p-2 text-xs">
                    {u.discrete ? "Whole numbers" : `Fractions · step ${u.rounding ?? 0.001}`}
                  </td>
                  <td className="p-2 text-xs num text-ink-mute">{refRatio(u)}</td>
                  <td className="p-2">
                    <span className={cn(
                      "chip text-[10px] uppercase",
                      u.isActive ? "text-success" : "text-ink-mute"
                    )}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="p-2 pr-4">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => onEdit(u)} className="btn btn-ghost h-8 w-8 p-0" title={`Edit ${u.code}`}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => onToggleActive(u)} className="btn btn-ghost h-8 w-8 p-0" title={u.isActive ? `Deactivate ${u.code}` : `Reactivate ${u.code}`}>
                          <Power className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => onDelete(u)} className="btn btn-ghost h-8 w-8 p-0 text-danger" title={`Delete ${u.code}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnitModal({
  initial,
  categories,
  saving,
  onClose,
  onSave,
}: {
  initial: Uom | null;
  categories: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    code: string; name: string; symbol: string; discrete: boolean;
    categoryId: string; rounding: string; isActive: boolean;
  }) => Promise<void>;
}) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [symbol, setSymbol] = useState(initial?.symbol || "");
  const [discrete, setDiscrete] = useState(initial ? initial.discrete : true);
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [rounding, setRounding] = useState(
    initial?.rounding != null ? String(initial.rounding) : ""
  );
  const [failed, setFailed] = useState<string | null>(null);
  const submit = async () => {
    setFailed(null);
    try {
      await onSave({ code, name, symbol, discrete, categoryId, rounding, isActive: initial?.isActive ?? true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setFailed(msg);
      toast.error(msg);
    }
  };
  return (
    <ModalShell title={initial ? `Edit unit ${initial.code}` : "New unit"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <SharedField label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value)} className="input" placeholder="sheet" disabled={!!initial} />
        </SharedField>
        <SharedField label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Sheet" />
        </SharedField>
        <SharedField label="Symbol (optional)">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="input" placeholder="sh" />
        </SharedField>
        <SharedField label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </SharedField>
        <SharedField label="Behavior">
          <select value={discrete ? "discrete" : "divisible"} onChange={(e) => setDiscrete(e.target.value === "discrete")} className="input">
            <option value="discrete">Discrete — whole numbers only</option>
            <option value="divisible">Divisible — fractions allowed</option>
          </select>
        </SharedField>
        <SharedField label="Rounding step">
          <input value={rounding} onChange={(e) => setRounding(e.target.value)} className="input num" inputMode="decimal" placeholder={discrete ? "1" : "0.001"} />
        </SharedField>
      </div>
      {failed && <p className="text-xs text-danger mt-3">{failed}</p>}
      <ModalFooter saving={saving} submitLabel={initial ? "Save" : "Add unit"} onClose={onClose} onSubmit={submit} />
    </ModalShell>
  );
}

function DeleteUomDialog({
  uom,
  onClose,
  onDeleted,
}: {
  uom: Uom;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const delUom = useDeleteUom();
  const [deps, setDeps] = useState<UomDependencyCounts | null>(null);
  const [replacement, setReplacement] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    findUomDependencies(uom.id).then((d) => {
      if (live) setDeps(d);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [uom.id]);
  const total = deps ? deps.items + deps.conversions + deps.purchaseLines + deps.salesLines : 0;
  const hasHistory = !!deps && (deps.purchaseLines > 0 || deps.salesLines > 0);
  const runDelete = (rep?: string) => {
    setFailed(null);
    delUom.mutate(
      { id: uom.id, replacementCode: rep },
      {
        onSuccess: () => {
          toast.success(rep ? `Deleted — references moved to ${rep}` : "Unit deleted");
          onDeleted();
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Delete failed";
          setFailed(msg);
          toast.error(msg);
        },
      }
    );
  };
  return (
    <ModalShell title={`Delete ${uom.code}?`} onClose={onClose}>
      <p className="text-sm text-ink-mute">
        {deps == null
          ? "Checking where this unit is used…"
          : total === 0
            ? "Nothing references this unit. Safe to delete."
            : `${total} reference${total > 1 ? "s" : ""}: ` +
              [
                deps.items > 0 && `${deps.items} item${deps.items > 1 ? "s" : ""}`,
                deps.conversions > 0 && `${deps.conversions} conversion${deps.conversions > 1 ? "s" : ""}`,
                deps.purchaseLines > 0 && `${deps.purchaseLines} PO line${deps.purchaseLines > 1 ? "s" : ""}`,
                deps.salesLines > 0 && `${deps.salesLines} sale line${deps.salesLines > 1 ? "s" : ""}`,
              ].filter(Boolean).join(", ") +
              "."}
      </p>
      {hasHistory && (
        <p className="text-xs text-danger mt-2">
          Historical transactions reference this unit — history is immutable, so only deactivation is available.
        </p>
      )}
      {!hasHistory && total > 0 && (
        <div className="mt-3">
          <SharedField label="Replacement unit code (moves all references)">
            <input value={replacement} onChange={(e) => setReplacement(e.target.value)} className="input" placeholder="e.g. pc" />
          </SharedField>
        </div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn btn-outline h-9">Cancel</button>
        {!hasHistory && (
          <button
            type="button"
            disabled={delUom.isPending || (total > 0 && !replacement.trim())}
            onClick={() => runDelete(total > 0 ? replacement.trim() : undefined)}
            className="btn btn-primary h-9"
          >
            {delUom.isPending ? "Deleting…" : total > 0 ? "Replace & delete" : "Delete"}
          </button>
        )}
      </div>
      {failed && <p className="text-xs text-danger mt-2">{failed}</p>}
    </ModalShell>
  );
}

/* ---------------------------- Conversions ---------------------------- */

function ConversionsTable({
  rows,
  loading,
  canManage,
  onEdit,
  onDelete,
}: {
  rows: UnitConversion[];
  loading: boolean;
  canManage: boolean;
  onEdit: (c: UnitConversion) => void;
  onDelete: (c: UnitConversion) => void;
}) {
  return (
    <div className="paper-card overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute bg-paper/40">
              <th className="p-2 pl-4">Conversion</th>
              <th className="p-2 text-right">Factor</th>
              <th className="p-2">Category</th>
              <th className="p-2">Notes</th>
              {canManage && <th className="p-2 pr-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canManage ? 5 : 4} className="p-8 text-center text-ink-mute text-sm">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={canManage ? 5 : 4} className="p-10 text-center text-ink-mute text-sm">No conversions match. Add the first fundamental relationship above.</td></tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-t hover:bg-paper/40">
                  <td className="p-2 pl-4 num font-semibold">
                    1 {c.fromUnit} = {c.factor} {c.toUnit}
                  </td>
                  <td className="p-2 text-right num">{c.factor}</td>
                  <td className="p-2 text-xs">{c.category}</td>
                  <td className="p-2 text-xs text-ink-mute">{c.notes || ""}</td>
                  {canManage && (
                    <td className="p-2 pr-4">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => onEdit(c)} className="btn btn-ghost h-8 w-8 p-0" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => onDelete(c)} className="btn btn-ghost h-8 w-8 p-0 text-danger" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConversionModal({
  initial,
  conversions,
  uoms,
  saving,
  onClose,
  onSave,
}: {
  initial: UnitConversion | null;
  conversions: UnitConversion[];
  uoms: Uom[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    fromUnit: string; toUnit: string; factor: number; category: string; notes: string;
  }) => Promise<void>;
}) {
  const [fromUnit, setFromUnit] = useState(initial?.fromUnit || "");
  const [toUnit, setToUnit] = useState(initial?.toUnit || "");
  const [factor, setFactor] = useState(initial?.factor ?? 1);
  const [category, setCategory] = useState(initial?.category || "general");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [failed, setFailed] = useState<string | null>(null);
  // Master first; conversion-derived codes keep the picker useful
  // before the master migration has run.
  const known = (uoms.length > 0
    ? uoms.map((u) => u.code)
    : conversions.flatMap((c) => [c.fromUnit, c.toUnit])
  ).sort((a, b) => a.localeCompare(b));
  const preview =
    fromUnit.trim() && toUnit.trim()
      ? describeRelationship(
          fromUnit,
          toUnit,
          conversions.filter((c) => c.id !== initial?.id)
        )
      : null;
  const submit = async () => {
    setFailed(null);
    try {
      await onSave({ fromUnit, toUnit, factor, category, notes });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setFailed(msg);
      toast.error(msg);
    }
  };
  return (
    <ModalShell title={initial ? "Edit conversion" : "New conversion"} onClose={onClose}>
      <p className="text-xs text-ink-mute mb-3">
        One fundamental relationship: 1 <em>From</em> = <em>factor</em> × <em>To</em>.
        Reverse and multi-level equivalents derive automatically.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <SharedField label="From">
          <input list="uom-pick" value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className="input" placeholder="ream" />
        </SharedField>
        <SharedField label="To">
          <input list="uom-pick" value={toUnit} onChange={(e) => setToUnit(e.target.value)} className="input" placeholder="sheet" />
        </SharedField>
        <SharedField label="Factor">
          <input type="number" step="0.0001" min={0} value={factor} onChange={(e) => setFactor(Number(e.target.value))} className="input num text-right" />
        </SharedField>
        <SharedField label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            {UNIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </SharedField>
      </div>
      <SharedField label="Notes (optional)" className="mt-3">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Optional" />
      </SharedField>
      {preview && (
        <p className="text-[11px] text-ink-mute mt-2 num">
          Known path already derives: {preview}. A conflicting factor will be rejected.
        </p>
      )}
      {failed && <p className="text-xs text-danger mt-2">{failed}</p>}
      <datalist id="uom-pick">
        {known.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <ModalFooter saving={saving} submitLabel={initial ? "Save" : "Add conversion"} onClose={onClose} onSubmit={submit} />
    </ModalShell>
  );
}

/* ---------------------------- Categories ----------------------------- */

function CategoriesTable({
  rows,
  uoms,
  canManage,
  onEdit,
}: {
  rows: UomCategory[];
  uoms: Uom[];
  canManage: boolean;
  onEdit: (c: UomCategory) => void;
}) {
  return (
    <div className="paper-card overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute bg-paper/40">
              <th className="p-2 pl-4">Category</th>
              <th className="p-2">Reference UOM</th>
              <th className="p-2 text-right">Units</th>
              <th className="p-2">Status</th>
              {canManage && <th className="p-2 pr-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={canManage ? 5 : 4} className="p-10 text-center text-ink-mute text-sm">No categories yet — run migration 20251006000004 first.</td></tr>
            ) : (
              rows.map((c) => {
                const ref = uoms.find((u) => u.id === c.referenceUomId);
                const count = uoms.filter((u) => u.categoryId === c.id).length;
                return (
                  <tr key={c.id} className={cn("border-t hover:bg-paper/40", !c.isActive && "opacity-60")}>
                    <td className="p-2 pl-4">
                      <span className="font-semibold">{c.name}</span>
                      {c.description && <div className="text-xs text-ink-mute">{c.description}</div>}
                    </td>
                    <td className="p-2 num text-sm">{ref?.code || "—"}</td>
                    <td className="p-2 text-right num">{count}</td>
                    <td className="p-2">
                      <span className={cn("chip text-[10px] uppercase", c.isActive ? "text-success" : "text-ink-mute")}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="p-2 pr-4">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => onEdit(c)} className="btn btn-ghost h-8 w-8 p-0" title={`Edit ${c.name}`}>
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryModal({
  initial,
  uoms,
  saving,
  onClose,
  onSave,
}: {
  initial: UomCategory | null;
  uoms: Uom[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: { name: string; referenceUomId: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [referenceUomId, setReferenceUomId] = useState(initial?.referenceUomId || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [failed, setFailed] = useState<string | null>(null);
  const submit = async () => {
    setFailed(null);
    try {
      await onSave({ name, referenceUomId, description });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setFailed(msg);
      toast.error(msg);
    }
  };
  return (
    <ModalShell title={initial ? `Edit category ${initial.name}` : "New category"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <SharedField label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="paper" disabled={!!initial} />
        </SharedField>
        <SharedField label="Reference UOM">
          <select value={referenceUomId} onChange={(e) => setReferenceUomId(e.target.value)} className="input">
            <option value="">—</option>
            {uoms.map((u) => (
              <option key={u.id} value={u.id}>{u.code}</option>
            ))}
          </select>
        </SharedField>
      </div>
      <SharedField label="Description (optional)" className="mt-3">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="Optional" />
      </SharedField>
      {failed && <p className="text-xs text-danger mt-2">{failed}</p>}
      <ModalFooter saving={saving} submitLabel={initial ? "Save" : "Add category"} onClose={onClose} onSubmit={submit} />
    </ModalShell>
  );
}

/* ------------------------------ Chrome ------------------------------- */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-auto scroll-lined">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  saving,
  submitLabel,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button type="button" onClick={onClose} className="btn btn-outline h-9">Cancel</button>
      <button type="button" onClick={onSubmit} disabled={saving} className="btn btn-primary h-9">
        {saving ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}
