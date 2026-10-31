import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Boxes,
  Check,
  CircleAlert,
  Loader2,
  Pencil,
  Plus,
  Power,
  Ruler,
  Scale,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import GlassSelect from "@/components/ui/GlassSelect";
import { useAuth } from "@/hooks/useAuth";
import { useUoms, useUpsertUom, useDeleteUom } from "@/hooks/useUoms";
import { useUomCategories } from "@/hooks/useUomCategories";
import {
  useUnitConversions,
  useUpsertUnitConversion,
  useDeleteUnitConversion,
} from "@/hooks/useUnitConversions";
import {
  describeRelationship,
  validateCompatibility,
  validateConversionProposal,
} from "@/lib/uom";
import { findUomDependencies, type UomDependencyCounts } from "@/lib/uomDependencies";
import { UNIT_CATEGORIES, type UnitConversion, type Uom, type UomCategory } from "@/types";
import { cn } from "@/lib/utils";
import "./uom-manager.css";

type UnitFilter = "all" | "active" | "inactive";

type UnitDraft = {
  code: string;
  name: string;
  symbol: string;
  discrete: boolean;
  categoryId: string;
  rounding: string;
  isActive: boolean;
};

type ConversionDraft = {
  fromUnit: string;
  toUnit: string;
  factor: number;
  category: string;
  notes: string;
};

export default function UomManagerModal({ onClose }: { onClose: () => void }) {
  const { profile, can, isAppOwner } = useAuth();
  const { data: uoms = [], isLoading: uomsLoading } = useUoms();
  const { data: conversions = [], isLoading: conversionsLoading } = useUnitConversions();
  const { data: categories = [] } = useUomCategories();
  const upsertUom = useUpsertUom();
  const upsertConversion = useUpsertUnitConversion();

  const canManage = can("settings.units") || can("settings.manage") || isAppOwner;

  const [unitQuery, setUnitQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");
  const [conversionQuery, setConversionQuery] = useState("");
  const [conversionCategory, setConversionCategory] = useState("all");

  const [unitEditor, setUnitEditor] = useState<{ uom: Uom | null } | null>(null);
  const [conversionEditor, setConversionEditor] = useState<{ conversion: UnitConversion | null } | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<Uom | null>(null);
  const [conversionToDelete, setConversionToDelete] = useState<UnitConversion | null>(null);

  const hasChildDialog = Boolean(unitEditor || conversionEditor || unitToDelete || conversionToDelete);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (hasChildDialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasChildDialog, onClose]);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const categoryName = (categoryId?: string | null) =>
    (categoryId ? categoryMap.get(categoryId)?.name : null) || "Uncategorised";

  const refCodeFor = (categoryId?: string | null) => {
    if (!categoryId) return null;
    const referenceId = categoryMap.get(categoryId)?.referenceUomId;
    if (!referenceId) return null;
    return uoms.find((uom) => uom.id === referenceId)?.code ?? null;
  };

  const ratioLabel = (uom: Uom): string | null => {
    if (uom.ratio == null || !Number.isFinite(uom.ratio) || uom.ratio <= 0) return null;
    const reference = refCodeFor(uom.categoryId);
    if (!reference) return null;
    if (reference === uom.code) return "Reference unit";
    return `1 ${uom.code} = ${formatFactor(uom.ratio)} ${reference}`;
  };

  const filteredUnits = useMemo(() => {
    const query = unitQuery.trim().toLowerCase();
    return uoms
      .filter((uom) => {
        if (unitFilter === "active" && !uom.isActive) return false;
        if (unitFilter === "inactive" && uom.isActive) return false;
        if (!query) return true;
        const categoryLabel = uom.categoryId
          ? (categoryMap.get(uom.categoryId)?.name || "uncategorised").toLowerCase()
          : "uncategorised";
        return (
          uom.code.toLowerCase().includes(query) ||
          uom.name.toLowerCase().includes(query) ||
          (uom.symbol || "").toLowerCase().includes(query) ||
          categoryLabel.includes(query)
        );
      })
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code));
  }, [uoms, unitQuery, unitFilter, categoryMap]);

  const conversionCategories = useMemo(
    () =>
      Array.from(new Set(conversions.map((conversion) => conversion.category || "general"))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [conversions]
  );

  const filteredConversions = useMemo(() => {
    const query = conversionQuery.trim().toLowerCase();
    return conversions.filter((conversion) => {
      if (conversionCategory !== "all" && (conversion.category || "general") !== conversionCategory) return false;
      if (!query) return true;
      return (
        conversion.fromUnit.toLowerCase().includes(query) ||
        conversion.toUnit.toLowerCase().includes(query) ||
        (conversion.notes || "").toLowerCase().includes(query) ||
        (conversion.category || "").toLowerCase().includes(query)
      );
    });
  }, [conversions, conversionQuery, conversionCategory]);

  const groupedConversions = useMemo(() => {
    const groups = new Map<string, UnitConversion[]>();
    for (const conversion of filteredConversions) {
      const key = conversion.category || "general";
      const list = groups.get(key) ?? [];
      list.push(conversion);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredConversions]);

  const saveUnit = async (id: string | undefined, input: UnitDraft) => {
    const rounding = input.discrete
      ? 1
      : input.rounding.trim() === ""
        ? null
        : Number(input.rounding);
    await upsertUom.mutateAsync({
      id,
      code: input.code,
      name: input.name,
      symbol: input.symbol || null,
      discrete: input.discrete,
      isActive: input.isActive,
      categoryId: input.categoryId || null,
      rounding,
    });
    toast.success(id ? "Unit updated" : "Unit added");
  };

  const saveConversion = async (id: string | undefined, input: ConversionDraft) => {
    await upsertConversion.mutateAsync({
      id,
      fromUnit: input.fromUnit,
      toUnit: input.toUnit,
      factor: input.factor,
      category: input.category || "general",
      notes: input.notes || null,
      createdBy: profile?.id,
    });
    toast.success(id ? "Conversion updated" : "Conversion added");
  };

  const toggleUnit = (uom: Uom) => {
    upsertUom.mutate(
      {
        id: uom.id,
        code: uom.code,
        name: uom.name,
        symbol: uom.symbol,
        discrete: uom.discrete,
        isActive: !uom.isActive,
        categoryId: uom.categoryId,
        rounding: uom.rounding,
      },
      {
        onSuccess: () => toast.success(uom.isActive ? "Unit deactivated" : "Unit reactivated"),
        onError: (error) => toast.error(toMessage(error, "Could not change unit status")),
      }
    );
  };

  return createPortal(
    <div className="uom">
      <div
        className="uom-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="uom-window" role="dialog" aria-modal="true" aria-labelledby="uom-manager-title">
          <span className="uom-sheet-handle" />

          <header className="uom-head">
            <div className="uom-head-copy">
              <div className="uom-eyebrow">
                <span className="uom-eyebrow-icon">
                  <Ruler className="uom-icon" />
                </span>
                Inventory master data
              </div>
              <h2 className="uom-title" id="uom-manager-title">
                Units &amp; conversions
              </h2>
              <div className="uom-head-meta">
                <span className="uom-live-badge">
                  <span className="uom-live-dot" />
                  Live master
                </span>
                <span className="uom-meta-sep" />
                <span>{uoms.length} units</span>
                <span className="uom-meta-sep" />
                <span>{conversions.length} relationships</span>
              </div>
            </div>
            <button type="button" className="uom-close" onClick={onClose} aria-label="Close unit manager">
              <X className="uom-icon" />
            </button>
          </header>

          {!canManage && (
            <div className="uom-readonly">
              <CircleAlert className="uom-icon" />
              You can browse the unit master, but Admin or Owner access is required to change it.
            </div>
          )}

          <div className="uom-split">
            <section className="uom-panel uom-units-panel" aria-label="Units">
              <div className="uom-panel-head">
                <div className="uom-panel-title-wrap">
                  <span className="uom-panel-icon">
                    <Ruler className="uom-icon" />
                  </span>
                  <div>
                    <h3 className="uom-panel-title">
                      Units <span className="uom-count">{uoms.length}</span>
                    </h3>
                    <p className="uom-panel-sub">The master list behind inventory, BOM and POS quantities.</p>
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="uom-btn uom-btn-primary uom-btn-sm"
                    onClick={() => setUnitEditor({ uom: null })}
                  >
                    <Plus className="uom-icon" />
                    Add unit
                  </button>
                )}
              </div>

              <div className="uom-toolbar">
                <label className="uom-search">
                  <Search className="uom-icon" />
                  <input
                    value={unitQuery}
                    onChange={(event) => setUnitQuery(event.target.value)}
                    placeholder="Search units"
                    aria-label="Search units"
                  />
                </label>
                <div className="uom-seg" role="group" aria-label="Filter units by status">
                  {(["all", "active", "inactive"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={cn(unitFilter === filter && "active")}
                      onClick={() => setUnitFilter(filter)}
                    >
                      {filter === "all" ? "All" : filter === "active" ? "Active" : "Off"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="uom-panel-body">
                {uomsLoading ? (
                  <ListSkeleton rows={4} />
                ) : filteredUnits.length === 0 ? (
                  <PanelEmpty
                    icon={<Boxes className="uom-empty-icon" />}
                    title={uoms.length === 0 ? "No units yet" : "No units match"}
                    text={
                      uoms.length === 0
                        ? "Add the first unit to start building a conversion family."
                        : "Try a different search or status filter."
                    }
                    action={
                      canManage && uoms.length === 0 ? (
                        <button
                          type="button"
                          className="uom-btn uom-btn-primary uom-btn-sm"
                          onClick={() => setUnitEditor({ uom: null })}
                        >
                          <Plus className="uom-icon" />
                          Add first unit
                        </button>
                      ) : null
                    }
                  />
                ) : (
                  filteredUnits.map((uom) => (
                    <div key={uom.id} className={cn("uom-unit-row", !uom.isActive && "is-off")}>
                      <div className="uom-unit-mark">{uom.symbol || uom.code.slice(0, 3)}</div>
                      <div className="uom-unit-main">
                        <div className="uom-unit-line">
                          <span className="uom-code">{uom.code}</span>
                          <span className="uom-unit-name">{uom.name}</span>
                          {uom.symbol && <span className="uom-symbol">({uom.symbol})</span>}
                        </div>
                        <div className="uom-unit-meta">
                          <span className="uom-meta-chip">{categoryName(uom.categoryId)}</span>
                          <span className="uom-meta-chip">
                            {uom.discrete ? "Whole units" : `Fractions · ${formatFactor(uom.rounding ?? 0.001)}`}
                          </span>
                          {ratioLabel(uom) && <span className="uom-ratio">{ratioLabel(uom)}</span>}
                        </div>
                      </div>
                      <div className="uom-unit-side">
                        <StatusPill active={uom.isActive} />
                        {canManage && (
                          <div className="uom-actions">
                            <IconButton label={`Edit ${uom.code}`} onClick={() => setUnitEditor({ uom })}>
                              <Pencil className="uom-icon" />
                            </IconButton>
                            <IconButton
                              label={uom.isActive ? `Deactivate ${uom.code}` : `Reactivate ${uom.code}`}
                              onClick={() => toggleUnit(uom)}
                              tone={uom.isActive ? "default" : "blue"}
                            >
                              <Power className="uom-icon" />
                            </IconButton>
                            <IconButton
                              label={`Delete ${uom.code}`}
                              onClick={() => setUnitToDelete(uom)}
                              tone="danger"
                            >
                              <Trash2 className="uom-icon" />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="uom-panel uom-conversions-panel" aria-label="Conversions">
              <div className="uom-panel-head">
                <div className="uom-panel-title-wrap">
                  <span className="uom-panel-icon uom-panel-icon-teal">
                    <ArrowLeftRight className="uom-icon" />
                  </span>
                  <div>
                    <h3 className="uom-panel-title">
                      Conversions <span className="uom-count">{conversions.length}</span>
                    </h3>
                    <p className="uom-panel-sub">Direct relationships only. Reverse and multi-step paths derive automatically.</p>
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="uom-btn uom-btn-primary uom-btn-sm"
                    onClick={() => setConversionEditor({ conversion: null })}
                  >
                    <Plus className="uom-icon" />
                    Add conversion
                  </button>
                )}
              </div>

              <div className="uom-toolbar">
                <label className="uom-search">
                  <Search className="uom-icon" />
                  <input
                    value={conversionQuery}
                    onChange={(event) => setConversionQuery(event.target.value)}
                    placeholder="Search relationships"
                    aria-label="Search conversions"
                  />
                </label>
                <GlassSelect
                  value={conversionCategory}
                  onChange={setConversionCategory}
                  ariaLabel="Filter conversions by category"
                  options={[
                    { value: "all", label: "All families" },
                    ...conversionCategories.map((category) => ({
                      value: category,
                      label: titleCase(category),
                    })),
                  ]}
                  className="input select-glass h-8 text-xs"
                />
              </div>

              <div className="uom-panel-body">
                {conversionsLoading ? (
                  <ListSkeleton rows={4} />
                ) : groupedConversions.length === 0 ? (
                  <PanelEmpty
                    icon={<ArrowLeftRight className="uom-empty-icon" />}
                    title={conversions.length === 0 ? "No conversions yet" : "No relationships match"}
                    text={
                      conversions.length === 0
                        ? uoms.length < 2
                          ? "Add at least two units, then connect them with a direct factor."
                          : "Connect two units with a direct factor to make quantities resolvable."
                        : "Try a different search or family filter."
                    }
                    action={
                      canManage && conversions.length === 0 && uoms.length >= 2 ? (
                        <button
                          type="button"
                          className="uom-btn uom-btn-primary uom-btn-sm"
                          onClick={() => setConversionEditor({ conversion: null })}
                        >
                          <Plus className="uom-icon" />
                          Add first conversion
                        </button>
                      ) : null
                    }
                  />
                ) : (
                  groupedConversions.map(([category, list]) => (
                    <div className="uom-group" key={category}>
                      <div className="uom-group-label">{titleCase(category)}</div>
                      {list.map((conversion) => (
                        <div key={conversion.id} className="uom-conversion-row">
                          <div className="uom-conversion-main">
                            <div className="uom-equation">
                              <span className="uom-eq-term">
                                <span className="uom-eq-number">1</span> <strong>{conversion.fromUnit}</strong>
                              </span>
                              <span className="uom-eq-op">=</span>
                              <span className="uom-eq-term">
                                <span className="uom-eq-number">{formatFactor(conversion.factor)}</span>{" "}
                                <strong>{conversion.toUnit}</strong>
                              </span>
                            </div>
                            {conversion.notes && <div className="uom-conversion-notes">{conversion.notes}</div>}
                          </div>
                          {canManage && (
                            <div className="uom-actions">
                              <IconButton
                                label={`Edit ${conversion.fromUnit} to ${conversion.toUnit}`}
                                onClick={() => setConversionEditor({ conversion })}
                              >
                                <Pencil className="uom-icon" />
                              </IconButton>
                              <IconButton
                                label={`Delete ${conversion.fromUnit} to ${conversion.toUnit}`}
                                onClick={() => setConversionToDelete(conversion)}
                                tone="danger"
                              >
                                <Trash2 className="uom-icon" />
                              </IconButton>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <footer className="uom-foot">
            <div className="uom-foot-note">
              <span className="uom-foot-dot" />
              Changes save immediately and flow through inventory, BOM and POS.
            </div>
            <button type="button" className="uom-btn uom-btn-outline" onClick={onClose}>
              Done
            </button>
          </footer>
        </div>
      </div>

      {unitEditor && (
        <UnitEditor
          key={unitEditor.uom?.id ?? "new-unit"}
          initial={unitEditor.uom}
          uoms={uoms}
          categories={categories}
          onClose={() => setUnitEditor(null)}
          onSave={(input) => saveUnit(unitEditor.uom?.id, input)}
        />
      )}

      {conversionEditor && (
        <ConversionEditor
          key={conversionEditor.conversion?.id ?? "new-conversion"}
          initial={conversionEditor.conversion}
          uoms={uoms}
          categories={categories}
          conversions={conversions}
          onClose={() => setConversionEditor(null)}
          onSave={(input) => saveConversion(conversionEditor.conversion?.id, input)}
        />
      )}

      {unitToDelete && (
        <DeleteUnitDialog
          uom={unitToDelete}
          uoms={uoms}
          onClose={() => setUnitToDelete(null)}
          onDeleted={() => setUnitToDelete(null)}
        />
      )}

      {conversionToDelete && (
        <DeleteConversionDialog
          conversion={conversionToDelete}
          onClose={() => setConversionToDelete(null)}
          onDeleted={() => setConversionToDelete(null)}
        />
      )}
    </div>,
    document.body
  );
}

function UnitEditor({
  initial,
  uoms,
  categories,
  onClose,
  onSave,
}: {
  initial: Uom | null;
  uoms: Uom[];
  categories: UomCategory[];
  onClose: () => void;
  onSave: (input: UnitDraft) => Promise<void>;
}) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [symbol, setSymbol] = useState(initial?.symbol || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [discrete, setDiscrete] = useState(initial ? initial.discrete : true);
  const [rounding, setRounding] = useState(initial?.rounding != null ? String(initial.rounding) : "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalizedCode = code.trim().toLowerCase();
  const duplicate = uoms.some((uom) => uom.code === normalizedCode && uom.id !== initial?.id);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailed(null);
    if (!normalizedCode) {
      setFailed("Unit code is required.");
      return;
    }
    if (!name.trim()) {
      setFailed("Unit name is required.");
      return;
    }
    if (duplicate) {
      setFailed("A unit with this code already exists.");
      return;
    }
    if (!discrete && rounding.trim() !== "") {
      const value = Number(rounding);
      if (!Number.isFinite(value) || value <= 0) {
        setFailed("Rounding step must be greater than 0.");
        return;
      }
    }
    setBusy(true);
    try {
      await onSave({
        code: normalizedCode,
        name: name.trim(),
        symbol: symbol.trim(),
        discrete,
        categoryId,
        rounding: discrete ? "" : rounding.trim(),
        isActive,
      });
      onClose();
    } catch (error) {
      setFailed(toMessage(error, "Could not save this unit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <UomDialog
      eyebrow={initial ? "Edit master unit" : "New master unit"}
      title={initial ? `Edit ${initial.code}` : "Add a unit"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="uom-btn uom-btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="uom-unit-form" className="uom-btn uom-btn-primary" disabled={busy}>
            {busy ? <Loader2 className="uom-icon uom-spin" /> : <Check className="uom-icon" />}
            {initial ? "Save unit" : "Add unit"}
          </button>
        </>
      }
    >
      <form className="uom-dialog-body" id="uom-unit-form" onSubmit={submit}>
        <div className="uom-form-grid">
          <UField label="Code" hint={initial ? "Codes are permanent after creation." : "Lowercase, short and unique."}>
            <input
              className="uom-input uom-mono"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="ream"
              disabled={Boolean(initial)}
              autoFocus={!initial}
              maxLength={24}
            />
          </UField>
          <UField label="Name">
            <input
              className="uom-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ream"
              autoFocus={Boolean(initial)}
              maxLength={60}
            />
          </UField>
          <UField label="Symbol" hint="Optional short label used in tables.">
            <input
              className="uom-input uom-mono"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="rm"
              maxLength={12}
            />
          </UField>
          <UField label="Category" hint="Units only convert within their own family.">
            <GlassSelect
              value={categoryId}
              onChange={setCategoryId}
              ariaLabel="Category"
              options={[
                { value: "", label: "Uncategorised" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
              className="input select-glass"
            />
          </UField>
          <div className="uom-field uom-field-full">
            <span className="uom-label">Transaction behavior</span>
            <div className="uom-choice-grid">
              <button
                type="button"
                className={cn("uom-choice", discrete && "selected")}
                onClick={() => setDiscrete(true)}
                aria-pressed={discrete}
              >
                <span className="uom-choice-title">
                  <Boxes className="uom-icon" />
                  Whole units
                </span>
                <span className="uom-choice-sub">Sheets, pieces, reams and boxes. Fractions are rejected.</span>
              </button>
              <button
                type="button"
                className={cn("uom-choice", !discrete && "selected")}
                onClick={() => setDiscrete(false)}
                aria-pressed={!discrete}
              >
                <span className="uom-choice-title">
                  <Scale className="uom-icon" />
                  Divisible
                </span>
                <span className="uom-choice-sub">Weight, length and volume. Fractions follow the step below.</span>
              </button>
            </div>
          </div>
          <UField
            label="Rounding step"
            hint={discrete ? "Whole units always transact in steps of 1." : "Smallest allowed increment, for example 0.001."}
          >
            <input
              className="uom-input uom-mono"
              value={discrete ? "1" : rounding}
              onChange={(event) => setRounding(event.target.value)}
              placeholder="0.001"
              inputMode="decimal"
              disabled={discrete}
            />
          </UField>
          <div className="uom-field uom-field-full">
            <label className="uom-check-row">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              <span className="uom-check-box">
                <Check className="uom-icon" />
              </span>
              <span>Active for new transactions</span>
            </label>
          </div>
        </div>
        <div className="uom-note uom-note-blue">
          <Sparkles className="uom-icon" />
          <span>
            Quantity math always resolves through this master list. Inactive units stay valid for history but are
            blocked for new transactions.
          </span>
        </div>
        {failed && <div className="uom-error">{failed}</div>}
      </form>
    </UomDialog>
  );
}

function ConversionEditor({
  initial,
  uoms,
  categories,
  conversions,
  onClose,
  onSave,
}: {
  initial: UnitConversion | null;
  uoms: Uom[];
  categories: UomCategory[];
  conversions: UnitConversion[];
  onClose: () => void;
  onSave: (input: ConversionDraft) => Promise<void>;
}) {
  const [fromUnit, setFromUnit] = useState(initial?.fromUnit || "");
  const [toUnit, setToUnit] = useState(initial?.toUnit || "");
  const [factorText, setFactorText] = useState(String(initial?.factor ?? 1));
  const [category, setCategory] = useState(initial?.category || "general");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const codeOptions = useMemo(() => {
    const rows = new Map<string, string>();
    for (const uom of uoms) rows.set(uom.code, uom.name);
    if (initial) {
      rows.set(initial.fromUnit, rows.get(initial.fromUnit) || initial.fromUnit);
      rows.set(initial.toUnit, rows.get(initial.toUnit) || initial.toUnit);
    }
    return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [uoms, initial]);

  const families = useMemo(() => {
    const names = new Set<string>(UNIT_CATEGORIES);
    for (const item of categories) names.add(item.name);
    if (category) names.add(category);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories, category]);

  const factor = Number(factorText);
  const validFactor = Number.isFinite(factor) && factor > 0;
  const compatibility = fromUnit && toUnit ? validateCompatibility(fromUnit, toUnit, uoms) : null;
  const others = useMemo(
    () => conversions.filter((conversion) => conversion.id !== initial?.id),
    [conversions, initial?.id]
  );
  const proposalCheck =
    fromUnit && toUnit && validFactor
      ? validateConversionProposal(
          { fromUnit, toUnit, factor, excludeId: initial?.id },
          others.map((conversion) => ({
            id: conversion.id,
            fromUnit: conversion.fromUnit,
            toUnit: conversion.toUnit,
            factor: conversion.factor,
          }))
        )
      : null;
  const knownPath =
    fromUnit && toUnit ? describeRelationship(fromUnit, toUnit, others, [], uoms) : null;

  const onFromChange = (value: string) => {
    setFromUnit(value);
    if (!initial) {
      const unit = uoms.find((uom) => uom.code === value);
      const family = unit?.categoryId
        ? categories.find((item) => item.id === unit.categoryId)?.name
        : null;
      if (family) setCategory(family);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailed(null);
    if (!fromUnit || !toUnit) {
      setFailed("Choose both units.");
      return;
    }
    if (fromUnit === toUnit) {
      setFailed("From and To must be different units.");
      return;
    }
    if (!validFactor) {
      setFailed("Factor must be greater than 0.");
      return;
    }
    if (compatibility && !compatibility.compatible) {
      setFailed(compatibility.reason || "These units belong to different families.");
      return;
    }
    if (proposalCheck && !proposalCheck.ok) {
      setFailed(proposalCheck.reason);
      return;
    }
    setBusy(true);
    try {
      await onSave({
        fromUnit: fromUnit.trim().toLowerCase(),
        toUnit: toUnit.trim().toLowerCase(),
        factor,
        category,
        notes: notes.trim(),
      });
      onClose();
    } catch (error) {
      setFailed(toMessage(error, "Could not save this conversion."));
    } finally {
      setBusy(false);
    }
  };

  const blocked = !fromUnit || !toUnit || fromUnit === toUnit || !validFactor || Boolean(compatibility && !compatibility.compatible) || Boolean(proposalCheck && !proposalCheck.ok);

  return (
    <UomDialog
      eyebrow={initial ? "Edit relationship" : "New relationship"}
      title={initial ? "Edit conversion" : "Add a conversion"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="uom-btn uom-btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="uom-conversion-form" className="uom-btn uom-btn-primary" disabled={busy || blocked}>
            {busy ? <Loader2 className="uom-icon uom-spin" /> : <Check className="uom-icon" />}
            {initial ? "Save conversion" : "Add conversion"}
          </button>
        </>
      }
    >
      <form className="uom-dialog-body" id="uom-conversion-form" onSubmit={submit}>
        <div className="uom-form-grid">
          <UField label="From unit">
            <SelectWrap>
              <GlassSelect
                value={fromUnit}
                onChange={onFromChange}
                ariaLabel="From unit"
                options={[
                  { value: "", label: "Choose a unit" },
                  ...codeOptions.map(([code, name]) => ({
                    value: code,
                    label: `${code} — ${name}`,
                  })),
                ]}
                className="input select-glass"
                autoFocus
              />
            </SelectWrap>
          </UField>
          <UField label="To unit">
            <SelectWrap>
              <GlassSelect
                value={toUnit}
                onChange={setToUnit}
                ariaLabel="To unit"
                options={[
                  { value: "", label: "Choose a unit" },
                  ...codeOptions.map(([code, name]) => ({
                    value: code,
                    label: `${code} — ${name}`,
                  })),
                ]}
                className="input select-glass"
              />
            </SelectWrap>
          </UField>
          <UField label="Factor" hint="1 From unit equals this many To units.">
            <input
              className="uom-input uom-mono"
              value={factorText}
              onChange={(event) => setFactorText(event.target.value)}
              placeholder="500"
              inputMode="decimal"
            />
          </UField>
          <UField label="Family" hint="Used for grouping the table.">
            <SelectWrap>
              <GlassSelect
                value={category}
                onChange={setCategory}
                ariaLabel="Family"
                options={families.map((family) => ({
                  value: family,
                  label: titleCase(family),
                }))}
                className="input select-glass"
              />
            </SelectWrap>
          </UField>
          <UField label="Notes" hint="Optional context for this relationship.">
            <input
              className="uom-input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Supplier pack size"
              maxLength={120}
            />
          </UField>
        </div>

        {fromUnit && toUnit ? (
          <div
            className={cn(
              "uom-preview",
              (compatibility && !compatibility.compatible) || (proposalCheck && !proposalCheck.ok)
                ? "is-warning"
                : "is-ok"
            )}
          >
            {compatibility && !compatibility.compatible ? (
              <>
                <div className="uom-preview-title">These units cannot convert</div>
                <div className="uom-preview-sub">{compatibility.reason}</div>
              </>
            ) : proposalCheck && !proposalCheck.ok ? (
              <>
                <div className="uom-preview-title">This factor conflicts</div>
                <div className="uom-preview-sub">{proposalCheck.reason}</div>
              </>
            ) : (
              <>
                <div className="uom-preview-equation">
                  1 {fromUnit} = {validFactor ? formatFactor(factor) : "?"} {toUnit}
                </div>
                <div className="uom-preview-sub">
                  {knownPath
                    ? `Existing path: ${knownPath}. This direct row must stay consistent.`
                    : "New direct relationship. Reverse and multi-step paths will derive from it."}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="uom-note uom-note-blue">
            <ArrowLeftRight className="uom-icon" />
            <span>Pick two units in the same family. The factor is the only direct relationship stored.</span>
          </div>
        )}

        {failed && <div className="uom-error">{failed}</div>}
      </form>
    </UomDialog>
  );
}

function DeleteUnitDialog({
  uom,
  uoms,
  onClose,
  onDeleted,
}: {
  uom: Uom;
  uoms: Uom[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const deleteUom = useDeleteUom();
  const upsertUom = useUpsertUom();
  const [deps, setDeps] = useState<UomDependencyCounts | null>(null);
  const [depError, setDepError] = useState<string | null>(null);
  const [depReload, setDepReload] = useState(0);
  const [replacement, setReplacement] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [creatingReplacement, setCreatingReplacement] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [createdReplacement, setCreatedReplacement] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => {
    let live = true;
    setDeps(null);
    setDepError(null);
    findUomDependencies(uom.id)
      .then((counts) => {
        if (live) setDeps(counts);
      })
      .catch((error) => {
        if (live) setDepError(toMessage(error, "Could not verify where this unit is used."));
      });
    return () => {
      live = false;
    };
  }, [uom.id, depReload]);

  const total = deps
    ? deps.items + deps.conversions + deps.purchaseLines + deps.salesLines + deps.adjustments
    : 0;
  const hasHistory = Boolean(deps && (deps.purchaseLines > 0 || deps.salesLines > 0));
  const replacementOptions = uoms.filter(
    (candidate) =>
      candidate.id !== uom.id &&
      candidate.isActive &&
      (candidate.categoryId ?? null) === (uom.categoryId ?? null)
  );

  const createReplacement = async () => {
    const code = newCode.trim().toLowerCase();
    const name = newName.trim();
    setFailed(null);
    if (!code || !name) {
      setFailed("Replacement code and name are required.");
      return;
    }
    if (uoms.some((candidate) => candidate.code === code)) {
      setFailed("A unit with this code already exists.");
      return;
    }
    try {
      await upsertUom.mutateAsync({
        code,
        name,
        symbol: null,
        discrete: uom.discrete,
        isActive: true,
        categoryId: uom.categoryId || null,
        rounding: uom.rounding,
      });
      setCreatedReplacement({ code, name });
      setReplacement(code);
      setNewCode("");
      setNewName("");
      setCreatingReplacement(false);
      toast.success("Replacement unit added");
    } catch (error) {
      setFailed(toMessage(error, "Could not add the replacement unit."));
    }
  };

  const remove = async () => {
    setFailed(null);
    if (total > 0 && !replacement) {
      setFailed("Choose a replacement unit first.");
      return;
    }
    try {
      await deleteUom.mutateAsync({ id: uom.id, replacementCode: total > 0 ? replacement : undefined });
      toast.success(replacement ? `Unit deleted — references moved to ${replacement}` : "Unit deleted");
      onDeleted();
    } catch (error) {
      setFailed(toMessage(error, "Could not delete this unit."));
    }
  };

  const deactivate = async () => {
    setFailed(null);
    try {
      await upsertUom.mutateAsync({
        id: uom.id,
        code: uom.code,
        name: uom.name,
        symbol: uom.symbol,
        discrete: uom.discrete,
        isActive: false,
        categoryId: uom.categoryId,
        rounding: uom.rounding,
      });
      toast.success("Unit deactivated");
      onDeleted();
    } catch (error) {
      setFailed(toMessage(error, "Could not deactivate this unit."));
    }
  };

  const pending = deleteUom.isPending || upsertUom.isPending;

  return (
    <UomDialog
      eyebrow="Unit safety check"
      title={`Delete ${uom.code}?`}
      onClose={onClose}
      compact
      footer={
        <>
          <button type="button" className="uom-btn uom-btn-outline" onClick={onClose}>
            Cancel
          </button>
          {hasHistory ? (
            uom.isActive ? (
              <button type="button" className="uom-btn uom-btn-primary" onClick={deactivate} disabled={pending}>
                {pending ? <Loader2 className="uom-icon uom-spin" /> : <Power className="uom-icon" />}
                Deactivate unit
              </button>
            ) : (
              <button type="button" className="uom-btn uom-btn-primary" onClick={onClose}>
                Keep inactive
              </button>
            )
          ) : (
            <button
              type="button"
              className="uom-btn uom-btn-danger"
              onClick={remove}
              disabled={pending || deps == null || (total > 0 && !replacement)}
            >
              {pending ? <Loader2 className="uom-icon uom-spin" /> : <Trash2 className="uom-icon" />}
              {total > 0 ? "Replace & delete" : "Delete unit"}
            </button>
          )}
        </>
      }
    >
      <div className="uom-dialog-body">
        {depError ? (
          <div className="uom-note uom-note-danger">
            <CircleAlert className="uom-icon" />
            <span>{depError}</span>
            <button
              type="button"
              className="uom-btn uom-btn-outline uom-btn-sm"
              onClick={() => setDepReload((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : deps == null ? (
          <div className="uom-loading-state">
            <Loader2 className="uom-icon uom-spin" />
            Checking where this unit is used…
          </div>
        ) : (
          <>
            <p className="uom-dialog-copy">
              <strong>{uom.code}</strong> is part of the master list. We check every reference before removing it.
            </p>

            <div className="uom-dep-grid">
              <DependencyCard label="Inventory items" value={deps.items} />
              <DependencyCard label="Conversions" value={deps.conversions} />
              <DependencyCard label="PO lines" value={deps.purchaseLines} />
              <DependencyCard label="Sale lines" value={deps.salesLines} />
            </div>

            {hasHistory ? (
              <div className="uom-note uom-note-danger">
                <CircleAlert className="uom-icon" />
                <span>
                  {uom.isActive
                    ? "Historical transactions reference this unit. History is immutable, so the unit can only be deactivated — never hard-deleted."
                    : "Historical transactions reference this unit. It is already inactive and will remain in history."}
                </span>
              </div>
            ) : total === 0 ? (
              <div className="uom-note uom-note-ok">
                <Check className="uom-icon" />
                <span>Nothing references this unit. It is safe to delete.</span>
              </div>
            ) : (
              <>
                <div className="uom-note uom-note-blue">
                  <ArrowLeftRight className="uom-icon" />
                  <span>
                    {deps.items > 0
                      ? `${deps.items} inventory item${deps.items > 1 ? "s" : ""} currently use this unit. `
                      : ""}
                    Choose a replacement unit, or add a new one, before deleting. All master-data references will
                    move to the replacement first.
                  </span>
                </div>

                <UField label="Replacement unit">
                  <SelectWrap>
                    <GlassSelect
                      value={replacement}
                      onChange={setReplacement}
                      ariaLabel="Replacement unit"
                      options={[
                        { value: "", label: "Choose a replacement" },
                        ...replacementOptions.map((candidate) => ({
                          value: candidate.code,
                          label: `${candidate.code} — ${candidate.name}`,
                        })),
                        ...(createdReplacement &&
                        !replacementOptions.some(
                          (candidate) => candidate.code === createdReplacement.code
                        )
                          ? [
                              {
                                value: createdReplacement.code,
                                label: `${createdReplacement.code} — ${createdReplacement.name}`,
                              },
                            ]
                          : []),
                      ]}
                      className="input select-glass"
                    />
                  </SelectWrap>
                </UField>

                {creatingReplacement ? (
                  <div className="uom-inline-create">
                    <div className="uom-inline-head">
                      <span>Create a replacement unit</span>
                      <button
                        type="button"
                        className="uom-icon-btn"
                        onClick={() => setCreatingReplacement(false)}
                        aria-label="Cancel replacement unit"
                      >
                        <X className="uom-icon" />
                      </button>
                    </div>
                    <div className="uom-inline-grid">
                      <input
                        className="uom-input uom-mono"
                        value={newCode}
                        onChange={(event) => setNewCode(event.target.value)}
                        placeholder="code"
                        aria-label="Replacement unit code"
                      />
                      <input
                        className="uom-input"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        placeholder="Name"
                        aria-label="Replacement unit name"
                      />
                    </div>
                    <button
                      type="button"
                      className="uom-btn uom-btn-primary uom-btn-sm uom-inline-add"
                      onClick={createReplacement}
                      disabled={upsertUom.isPending || !newCode.trim() || !newName.trim()}
                    >
                      {upsertUom.isPending ? <Loader2 className="uom-icon uom-spin" /> : <Plus className="uom-icon" />}
                      Add replacement
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="uom-btn uom-btn-outline uom-btn-sm uom-inline-trigger"
                    onClick={() => setCreatingReplacement(true)}
                  >
                    <Plus className="uom-icon" />
                    Create replacement unit
                  </button>
                )}
              </>
            )}
          </>
        )}
        {failed && <div className="uom-error">{failed}</div>}
      </div>
    </UomDialog>
  );
}

function DeleteConversionDialog({
  conversion,
  onClose,
  onDeleted,
}: {
  conversion: UnitConversion;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const deleteConversion = useDeleteUnitConversion();
  const [failed, setFailed] = useState<string | null>(null);

  const remove = async () => {
    setFailed(null);
    try {
      await deleteConversion.mutateAsync(conversion.id);
      toast.success("Conversion deleted");
      onDeleted();
    } catch (error) {
      setFailed(toMessage(error, "Could not delete this conversion."));
    }
  };

  return (
    <UomDialog
      eyebrow="Remove relationship"
      title="Delete conversion?"
      onClose={onClose}
      compact
      footer={
        <>
          <button type="button" className="uom-btn uom-btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="uom-btn uom-btn-danger" onClick={remove} disabled={deleteConversion.isPending}>
            {deleteConversion.isPending ? <Loader2 className="uom-icon uom-spin" /> : <Trash2 className="uom-icon" />}
            Delete conversion
          </button>
        </>
      }
    >
      <div className="uom-dialog-body">
        <div className="uom-delete-equation">
          1 {conversion.fromUnit} = {formatFactor(conversion.factor)} {conversion.toUnit}
        </div>
        <p className="uom-dialog-copy">
          This direct relationship will be removed. Quantities will no longer resolve through this factor.
        </p>
        <div className="uom-note uom-note-danger">
          <CircleAlert className="uom-icon" />
          <span>
            If either unit is configured on inventory items, the relationship cannot be removed until those items
            use another unit.
          </span>
        </div>
        {failed && <div className="uom-error">{failed}</div>}
      </div>
    </UomDialog>
  );
}

function UomDialog({
  eyebrow,
  title,
  onClose,
  footer,
  children,
  compact,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="uom-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn("uom-dialog", compact && "uom-dialog-compact")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="uom-dialog-head">
          <div>
            <div className="uom-eyebrow">{eyebrow}</div>
            <h3 className="uom-dialog-title">{title}</h3>
          </div>
          <button type="button" className="uom-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X className="uom-icon" />
          </button>
        </header>
        {children}
        <footer className="uom-dialog-foot">{footer}</footer>
      </div>
    </div>
  );
}

function UField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="uom-field">
      <span className="uom-label">{label}</span>
      {children}
      {hint && <span className="uom-hint">{hint}</span>}
    </label>
  );
}

function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <span className="uom-select-wrap uom-select-field">
      {children}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={cn("uom-status", active ? "on" : "off")}>
      <span className="uom-status-dot" />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger" | "blue";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn("uom-icon-btn", tone === "danger" && "danger", tone === "blue" && "blue")}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function DependencyCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn("uom-dep-card", value > 0 && "has-value")}>
      <span className="uom-dep-value">{value}</span>
      <span className="uom-dep-label">{label}</span>
    </div>
  );
}

function PanelEmpty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <div className="uom-empty">
      <span className="uom-empty-badge">{icon}</span>
      <div className="uom-empty-title">{title}</div>
      <div className="uom-empty-text">{text}</div>
      {action}
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div className="uom-skeleton" key={index} />
      ))}
    </div>
  );
}

function formatFactor(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return String(Number(value.toFixed(6)));
}

function titleCase(value: string): string {
  if (!value) return "General";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
