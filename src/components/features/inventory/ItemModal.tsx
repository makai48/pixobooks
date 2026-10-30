import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useItems, useUpsertItem } from "@/hooks/useItems";
import type { BOMLine, Item, ItemType, ProductCategory, Uom } from "@/types";
import { ITEM_TYPE_META } from "@/types";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useUnitConversions } from "@/hooks/useUnitConversions";
import { useUoms } from "@/hooks/useUoms";
import { useSuppliers } from "@/hooks/useSuppliers";
import {
  convertPrice,
  convertQuantity,
  relatedUoms,
  validateProductUomConfig,
} from "@/lib/uom";
import { cn, formatCurrency, uid } from "@/lib/utils";
import { currencyByCode } from "@/lib/referenceData";
import { processImageFile } from "@/lib/imageUpload";
import SearchableSelect from "./SearchableSelect";
import "./item-modal.css";

type Props = {
  item: Item | null;
  /** When provided (and `item` is null), the modal opens as a NEW item
   *  pre-filled from this source (the Inventory page's Clone action). */
  cloneFrom?: Item | null;
  onClose: () => void;
};

type FormState = {
  productCategory: ProductCategory;
  posVisible: boolean;
  canSell: boolean;
  canPurchase: boolean;
  name: string;
  category: string;
  sku: string;
  barcode: string;
  stock: string;
  preferredSupplierId: string;
  preferredSupplierName: string;
  lowStockThreshold: string;
  purchaseUnit: string;
  purchasePrice: string;
  saleUnit: string;
  price: string;
  cost: string;
  imageUrl: string;
  baseUnit: string;
};

type BomRow = {
  key: string;
  materialId: string;
  qtyText: string;
  unit: string;
  vendorId: string;
  vendorName: string;
};

type ToastTone = "success" | "error" | "info";

type Conv = { fromUnit: string; toUnit: string; factor: number };

const FALLBACK_UNITS = [
  "pc", "sheet", "page", "pack", "ream", "box", "kg", "g", "l", "ml",
  "m", "cm", "impression", "roll", "cartridge",
];

const CATEGORY_COPY: Record<
  ProductCategory,
  { title: string; desc: string; badge: string; headerDesc: string; summary: string }
> = {
  goods: {
    title: "Goods",
    desc: "Stocked & costed physical inventory",
    badge: "Goods · Stocked",
    headerDesc: "Stocked & costed physical inventory",
    summary: "Goods",
  },
  service: {
    title: "Services",
    desc: "Labor, billable tasks; no physical stock",
    badge: "Service · Non-Stock",
    headerDesc: "Labor, billable tasks; no physical stock",
    summary: "Services",
  },
  kit: {
    title: "Kits",
    desc: "Assembled bundles priced from itemized BOM",
    badge: "Kit · Bundled BOM",
    headerDesc: "Assembled bundles priced from itemized BOM",
    summary: "Kits",
  },
};

const BOM_ALERT =
  "Please fill in all parameters for the current component before adding another line.";

const channelLabelStyle = {
  fontSize: 12,
  lineHeight: 1.25,
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "normal" as const,
};

const channelWrapStyle = {
  flex: "1 1 0px",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
} as const;

function trimNum(v: number): string {
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * 10000) / 10000);
}

function pulse(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("num-bounce");
  el.getBoundingClientRect();
  el.classList.add("num-bounce");
}

function makeForm(
  source: Item | null | undefined,
  fallbackCategory: string,
  conversions: Conv[],
  uoms: Uom[]
): FormState {
  if (!source) {
    return {
      productCategory: "goods",
      posVisible: true,
      canSell: true,
      canPurchase: true,
      name: "",
      category: fallbackCategory,
      sku: "",
      barcode: "",
      stock: "0",
      preferredSupplierId: "",
      preferredSupplierName: "",
      lowStockThreshold: "10",
      purchaseUnit: "pc",
      purchasePrice: "",
      saleUnit: "pc",
      price: "",
      cost: "",
      imageUrl: "",
      baseUnit: "pc",
    };
  }

  const category = source.productCategory || "goods";
  const baseUnit = source.baseUnit || "pc";
  const saleUnit = source.saleUnit || baseUnit;
  const purchaseUnit = source.purchaseUnit || baseUnit;
  const saleCost = convertPrice(source.cost, baseUnit, saleUnit, conversions, uoms);
  const purchaseCost = convertPrice(source.cost, baseUnit, purchaseUnit, conversions, uoms);

  return {
    productCategory: category,
    posVisible: source.posVisible !== false,
    canSell: source.canSell !== false,
    canPurchase: category === "goods" ? source.canPurchase !== false : false,
    name: source.name,
    category: source.category || fallbackCategory,
    sku: source.sku,
    barcode: source.barcode || "",
    stock: String(source.stock),
    preferredSupplierId: source.preferredSupplierId || "",
    preferredSupplierName: source.preferredSupplierName || "",
    lowStockThreshold: String(source.lowStockThreshold ?? 10),
    purchaseUnit,
    purchasePrice: purchaseCost.ok ? trimNum(purchaseCost.value) : "",
    saleUnit,
    price: trimNum(source.price),
    cost: saleCost.ok ? trimNum(saleCost.value) : trimNum(source.cost),
    imageUrl: source.imageUrl || "",
    baseUnit,
  };
}

export default function ItemModal({ item, cloneFrom, onClose }: Props) {
  const { data: settings } = useShopSettings();
  const { data: items = [] } = useItems();
  const { data: conversions = [] } = useUnitConversions();
  const { data: uoms = [] } = useUoms();
  const { data: suppliersRegister = [] } = useSuppliers();
  const upsert = useUpsertItem();

  const source = item || cloneFrom;

  const [form, setForm] = useState<FormState>(() =>
    makeForm(source, settings?.categories?.[0] || "General", conversions, uoms)
  );
  const [bomRows, setBomRows] = useState<BomRow[]>(() =>
    (source?.bom || []).map((line) => ({
      key: uid("bom"),
      materialId: line.materialId || "",
      qtyText: String(line.qty ?? 0),
      unit: line.unit || "",
      vendorId: line.vendorId || "",
      vendorName: line.vendorName || "",
    }))
  );
  const [invalidBom, setInvalidBom] = useState<Set<string>>(() => new Set());
  const [bomAlert, setBomAlert] = useState(false);
  const [enteringRows, setEnteringRows] = useState<Set<string>>(() => new Set());
  const [exitingRows, setExitingRows] = useState<Set<string>>(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const [dupPrompt, setDupPrompt] = useState<{ original: Item } | null>(null);
  /** Clone opens behind a mandatory "new identity" prompt: a duplicate must
   *  not start life with the source item's SKU or barcode. */
  const [cloneSetupOpen, setCloneSetupOpen] = useState(!!cloneFrom);
  const [toastState, setToastState] = useState<{ message: string; tone: string; show: boolean }>({
    message: "",
    tone: "#34c759",
    show: false,
  });

  const toastTimer = useRef<number | null>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const clueBoxRef = useRef<HTMLDivElement>(null);
  const bomSummaryRef = useRef<HTMLSpanElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const currency = settings?.currency || "USD";
  const currencySymbol = currencyByCode(currency)?.symbol || currency;
  const copy = CATEGORY_COPY[form.productCategory];
  const isGoods = form.productCategory === "goods";
  const isService = form.productCategory === "service";
  const isKit = form.productCategory === "kit";

  const showToast = (message: string, tone: ToastTone = "success") => {
    const color = tone === "error" ? "#d3222a" : tone === "info" ? "#0066cc" : "#34c759";
    setToastState({ message, tone: color, show: true });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToastState((s) => ({ ...s, show: false }));
    }, 2400);
  };

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    []
  );

  useEffect(() => {
    setImageBroken(false);
  }, [form.imageUrl]);

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const allUnits = useMemo(() => {
    const master = uoms.filter((u) => u.isActive).map((u) => u.code);
    const fromConversions = conversions.flatMap((c) => [c.fromUnit, c.toUnit]);
    const merged = Array.from(
      new Set(
        [
          ...master,
          ...FALLBACK_UNITS,
          ...fromConversions,
          form.baseUnit,
          form.purchaseUnit,
          form.saleUnit,
          ...bomRows.map((r) => r.unit),
        ]
          .map((u) => (u || "").trim())
          .filter(Boolean)
      )
    );
    return merged.sort((a, b) => a.localeCompare(b));
  }, [uoms, conversions, form.baseUnit, form.purchaseUnit, form.saleUnit, bomRows]);

  const unitOptions = useMemo(
    () => allUnits.map((u) => ({ value: u, label: u })),
    [allUnits]
  );

  const validSaleUnits = useMemo(() => {
    if (!isGoods) return allUnits;
    if (!form.purchaseUnit) return [];
    const related = relatedUoms(form.purchaseUnit, conversions, [], uoms);
    const byLower = new Map(allUnits.map((u) => [u.toLowerCase(), u]));
    return related
      .map((r) => byLower.get(r) || r)
      .sort((a, b) => a.localeCompare(b));
  }, [isGoods, form.purchaseUnit, conversions, uoms, allUnits]);

  const saleUnitOptions = useMemo(() => {
    const set = new Set<string>();
    if (isGoods && form.purchaseUnit) set.add(form.purchaseUnit);
    validSaleUnits.forEach((u) => set.add(u));
    if (form.saleUnit) set.add(form.saleUnit);
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((u) => ({ value: u, label: u }));
  }, [isGoods, form.purchaseUnit, form.saleUnit, validSaleUnits]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(
      [...(settings?.categories || []), form.category].filter(Boolean)
    );
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c }));
  }, [settings?.categories, form.category]);

  const supplierOptions = useMemo(
    () => suppliersRegister.map((s) => ({ value: s.id, label: s.name })),
    [suppliersRegister]
  );

  const materials = useMemo(
    () =>
      items.filter(
        (i) =>
          (i.itemType === "material" || i.itemType === "intermediate") &&
          i.id !== item?.id
      ),
    [items, item?.id]
  );

  const materialOptions = useMemo(
    () =>
      materials.map((m) => ({
        value: m.id,
        label: `${m.name} · ${ITEM_TYPE_META[m.itemType].short} · ${formatCurrency(
          m.cost,
          currency
        )}/${m.baseUnit}`,
      })),
    [materials, currency]
  );

  const bomCost = useMemo(
    () =>
      bomRows.reduce((sum, line) => {
        const mat = items.find((i) => i.id === line.materialId);
        if (!mat) return sum;
        const qty = Number(line.qtyText) || 0;
        const conv = line.unit
          ? convertQuantity(qty, line.unit, mat.baseUnit || line.unit, conversions, [], uoms)
          : null;
        const baseQty = conv && conv.value > 0 ? conv.value : qty;
        return sum + (mat.cost || 0) * baseQty;
      }, 0),
    [bomRows, items, conversions, uoms]
  );

  const purchasePriceNum = Number(form.purchasePrice) || 0;
  const clue = useMemo(() => {
    const ratio = convertQuantity(1, form.purchaseUnit, form.saleUnit, conversions, [], uoms);
    const derived = convertPrice(
      purchasePriceNum,
      form.purchaseUnit,
      form.saleUnit,
      conversions,
      uoms
    );
    return {
      ratio: ratio && ratio.value > 0 ? ratio.value : null,
      derived: derived.ok ? derived.value : null,
    };
  }, [purchasePriceNum, form.purchaseUnit, form.saleUnit, conversions, uoms]);

  useEffect(() => {
    if (!isKit) return;
    const total = Math.round(bomCost * 100) / 100;
    setForm((f) =>
      Math.abs((Number(f.cost) || 0) - total) < 0.005 ? f : { ...f, cost: String(total) }
    );
  }, [isKit, bomCost]);

  useEffect(() => {
    pulse(bomSummaryRef.current);
  }, [bomCost]);

  const inferItemType = (): ItemType => {
    if (form.productCategory === "kit") return "product";
    if (form.productCategory === "goods" && !form.canSell) return "material";
    return "ready";
  };

  const effectiveItemType: ItemType = source
    ? source.itemType || (source.isMaterial ? "material" : "product")
    : inferItemType();

  const selectCategory = (cat: ProductCategory) => {
    setForm((f) => ({
      ...f,
      productCategory: cat,
      canPurchase: cat === "goods" ? true : false,
    }));
    setBomAlert(false);
  };

  const isInvalid = (key: string, field: "material" | "qty" | "unit" | "vendor") =>
    invalidBom.has(`${key}:${field}`);

  const clearInvalid = (key: string, field: "material" | "qty" | "unit" | "vendor") =>
    setInvalidBom((prev) => {
      const next = new Set(prev);
      next.delete(`${key}:${field}`);
      return next;
    });

  const validateBomRows = (): boolean => {
    const next = new Set<string>();
    let firstId: string | null = null;
    for (const r of bomRows) {
      if (!r.materialId) {
        next.add(`${r.key}:material`);
        if (!firstId) firstId = `bom-${r.key}-material`;
      }
      if (!(Number(r.qtyText) > 0)) {
        next.add(`${r.key}:qty`);
        if (!firstId) firstId = `bom-${r.key}-qty`;
      }
      if (!r.unit) {
        next.add(`${r.key}:unit`);
        if (!firstId) firstId = `bom-${r.key}-unit`;
      }
      if (!r.vendorName.trim()) {
        next.add(`${r.key}:vendor`);
        if (!firstId) firstId = `bom-${r.key}-vendor`;
      }
    }
    setInvalidBom(next);
    if (next.size === 0) {
      setBomAlert(false);
      return true;
    }
    setBomAlert(true);
    showToast(BOM_ALERT, "error");
    if (firstId) {
      const id = firstId;
      window.setTimeout(() => document.getElementById(id)?.focus(), 0);
    }
    return false;
  };

  const addBomRow = () => {
    if (materials.length === 0) {
      showToast("Add raw materials first (mark them Material or Intermediate).", "error");
      return;
    }
    if (!validateBomRows()) return;
    const key = uid("bom");
    setBomRows((rows) => [
      ...rows,
      { key, materialId: "", qtyText: "", unit: "", vendorId: "", vendorName: "" },
    ]);
    setEnteringRows((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setEnteringRows((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 400);
    showToast("New component line added to Bill of Materials");
  };

  const removeBomRow = (key: string) => {
    setExitingRows((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setBomRows((rows) => rows.filter((r) => r.key !== key));
      setExitingRows((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setBomAlert(false);
      showToast("Component line removed");
    }, 220);
  };

  const applyDerivedCost = () => {
    if (clue.derived == null) return;
    const value = Math.round(clue.derived);
    update({ cost: String(value) });
    pulse(costRef.current);
    const box = clueBoxRef.current;
    if (box) {
      box.classList.remove("clicked-flash");
      box.getBoundingClientRect();
      box.classList.add("clicked-flash");
    }
    showToast(`Direct Cost set to ${formatCurrency(value, currency)}`);
  };

  const handleImageFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await processImageFile(file, "items");
      update({ imageUrl: url });
      showToast("Image uploaded successfully");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const baseUnitForSave = () => (source ? form.baseUnit : form.saleUnit);
  const purchaseUnitForSave = () => (isGoods ? form.purchaseUnit : form.saleUnit);

  const findIdenticalItem = (canon: { price: number; cost: number }): Item | null => {
    const currentId = item?.id;
    const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
    const eq = (a: number, b: number) => Math.abs(a - b) < 0.001;
    const baseUnit = baseUnitForSave();
    const purchaseUnit = purchaseUnitForSave();
    return (
      items.find(
        (i) =>
          i.id !== currentId &&
          norm(i.name) === norm(form.name) &&
          (i.sku || "").trim() === form.sku.trim() &&
          (i.barcode || "").trim() === form.barcode.trim() &&
          (i.category || "").trim() === form.category.trim() &&
          eq(i.price, canon.price) &&
          eq(i.cost, canon.cost) &&
          (i.baseUnit || "") === baseUnit &&
          (i.purchaseUnit || i.baseUnit || "") === purchaseUnit &&
          (i.saleUnit || i.baseUnit || "") === form.saleUnit &&
          i.itemType === effectiveItemType
      ) || null
    );
  };

  const performSave = async (override?: { name: string; sku: string }) => {
    const category = form.productCategory;
    const saleUnit = form.saleUnit;
    const purchaseUnit = purchaseUnitForSave();
    const baseUnit = baseUnitForSave();
    const rawCost = category === "service" ? 0 : Number(form.cost) || 0;
    const costConv = convertPrice(rawCost, saleUnit, baseUnit, conversions, uoms);
    if (!costConv.ok) {
      showToast(`Cost: ${costConv.reason}`, "error");
      return;
    }
    const allowDecimal = source
      ? !!source.allowDecimalQty
      : (() => {
          const u = uoms.find((x) => x.code.toLowerCase() === saleUnit.toLowerCase());
          return u ? !u.discrete : false;
        })();

    try {
      const { canAddItem, getPlanLimits } = await import("@/lib/billing");
      const { upgradeToast } = await import("@/components/billing/UpgradePrompt");
      if (!item?.id && !canAddItem(items.length, settings)) {
        upgradeToast(`More than ${getPlanLimits(settings).items} items`);
        return;
      }
      await upsert.mutateAsync({
        id: item?.id,
        sku: (override?.sku ?? form.sku).trim(),
        barcode: form.barcode.trim() || null,
        name: (override?.name ?? form.name).trim(),
        category: form.category.trim() || "General",
        price: Number(form.price) || 0,
        priceUom: saleUnit,
        cost: costConv.value,
        costUom: baseUnit,
        stock: category === "service" ? 0 : Number(form.stock) || 0,
        baseUnit,
        units: [{ code: baseUnit, label: baseUnit, ratio: 1 }],
        bom:
          category === "kit"
            ? bomRows.map<BOMLine>((r) => ({
                materialId: r.materialId,
                qty: Number(r.qtyText) || 0,
                unit: r.unit,
                vendorId: r.vendorId || null,
                vendorName: r.vendorName.trim() || null,
              }))
            : source?.bom || null,
        isMaterial:
          effectiveItemType === "material" || effectiveItemType === "intermediate",
        itemType: effectiveItemType,
        productCategory: category,
        canPurchase: isGoods ? form.canPurchase : false,
        canSell: form.canSell,
        posVisible: form.posVisible,
        imageUrl: form.imageUrl.trim() || null,
        suppliers: source?.suppliers || [],
        emoji: source?.emoji || null,
        lowStockThreshold: Number(form.lowStockThreshold) || 0,
        allowDecimalQty: allowDecimal,
        purchaseUnit,
        saleUnit,
        preferredSupplierId: form.preferredSupplierId || null,
        preferredSupplierName: form.preferredSupplierName.trim() || null,
      });
      toast.success(
        cloneFrom ? "Cloned as new item" : item ? "Item updated" : "Item added"
      );
      onClose();
    } catch (err) {
      const { isOfflineQueuedError } = await import("@/hooks/useOfflineQueue");
      if (isOfflineQueuedError(err)) {
        toast.success("Item queued — will sync when you're back online");
        onClose();
        return;
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (upsert.isPending || uploading) return;
    if (!form.name.trim() || !form.sku.trim()) {
      showToast("SKU and name are required", "error");
      return;
    }

    // Never write a duplicate identity. The DB has a per-business unique index
    // on SKU, but failing there produces a raw constraint error; catch it here
    // with the conflicting item's name. Barcode is not DB-unique, so this is
    // the only guard against two items scanning to the same product.
    const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
    const skuConflict = items.find(
      (i) => i.id !== item?.id && norm(i.sku) === norm(form.sku)
    );
    if (skuConflict) {
      showToast(
        `SKU "${form.sku.trim()}" is already used by ${skuConflict.name}. Choose a different SKU.`,
        "error"
      );
      document.getElementById("itemSku")?.focus();
      return;
    }
    const barcodeConflict = form.barcode.trim()
      ? items.find(
          (i) => i.id !== item?.id && norm(i.barcode) === norm(form.barcode)
        )
      : null;
    if (barcodeConflict) {
      showToast(
        `Barcode "${form.barcode.trim()}" is already used by ${barcodeConflict.name}. Scan a different code or leave it blank.`,
        "error"
      );
      document.getElementById("itemBarcode")?.focus();
      return;
    }
    if (!form.saleUnit) {
      showToast("Sale UOM is required", "error");
      return;
    }
    if (isGoods) {
      if (!form.preferredSupplierName.trim()) {
        showToast("Preferred supplier is required for goods", "error");
        return;
      }
      if (!form.purchaseUnit) {
        showToast("Purchase UOM is required", "error");
        return;
      }
      if (form.saleUnit !== form.purchaseUnit && !validSaleUnits.includes(form.saleUnit)) {
        showToast(
          `Sale UOM "${form.saleUnit}" is not related to the Purchase UOM "${form.purchaseUnit}". Add a conversion between them first.`,
          "error"
        );
        return;
      }
    }
    if (isKit) {
      if (bomRows.length === 0) {
        showToast("Kits need at least one BOM component", "error");
        return;
      }
      if (!validateBomRows()) return;
    }

    const cfg = validateProductUomConfig(
      {
        purchaseUom: purchaseUnitForSave(),
        saleUom: form.saleUnit,
        baseUom: baseUnitForSave(),
        cost: Number(form.cost) || 0,
      },
      uoms,
      conversions
    );
    if (!cfg.ok) {
      showToast(cfg.reason, "error");
      return;
    }

    const rawCost = isService ? 0 : Number(form.cost) || 0;
    const costConv = convertPrice(rawCost, form.saleUnit, baseUnitForSave(), conversions, uoms);
    if (!costConv.ok) {
      showToast(`Cost: ${costConv.reason}`, "error");
      return;
    }
    const canon = { price: Number(form.price) || 0, cost: costConv.value };

    const identical = findIdenticalItem(canon);
    if (identical) {
      setDupPrompt({ original: identical });
      return;
    }

    await performSave();
  };

  const resolveDuplicate = async ({
    newSuffix,
    origSuffix,
  }: {
    newSuffix: string;
    origSuffix?: string;
  }) => {
    const suffix = newSuffix.trim();
    if (!suffix) {
      showToast("Variant name is required for the new item", "error");
      return;
    }
    const skuOf = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "V2";

    if (origSuffix?.trim() && dupPrompt?.original) {
      const orig = dupPrompt.original;
      const os = origSuffix.trim();
      try {
        await upsert.mutateAsync({
          id: orig.id,
          sku: `${orig.sku}-${skuOf(os) || "V1"}`,
          barcode: orig.barcode || null,
          name: `${orig.name} ${os}`,
          category: orig.category,
          price: orig.price,
          priceUom: orig.priceUom || orig.saleUnit || orig.baseUnit,
          cost: orig.cost,
          costUom: orig.costUom || orig.baseUnit,
          stock: orig.stock,
          baseUnit: orig.baseUnit,
          units: orig.units,
          bom: orig.bom || null,
          isMaterial: orig.isMaterial,
          itemType: orig.itemType,
          productCategory: orig.productCategory || "goods",
          canPurchase: orig.canPurchase !== false,
          canSell: orig.canSell !== false,
          posVisible: orig.posVisible !== false,
          imageUrl: orig.imageUrl || null,
          suppliers: orig.suppliers || [],
          emoji: orig.emoji || null,
          lowStockThreshold: orig.lowStockThreshold ?? 10,
          allowDecimalQty: !!orig.allowDecimalQty,
          purchaseUnit: orig.purchaseUnit || orig.baseUnit,
          saleUnit: orig.saleUnit || orig.baseUnit,
          preferredSupplierId: orig.preferredSupplierId || null,
          preferredSupplierName: orig.preferredSupplierName || null,
        });
        toast.success(`Original renamed to "${orig.name} ${os}"`);
      } catch (err) {
        toast.error(
          "Failed to rename original: " +
            (err instanceof Error ? err.message : "unknown error")
        );
        return;
      }
    }

    setDupPrompt(null);
    await performSave({
      name: `${form.name.trim()} ${suffix}`,
      sku: `${form.sku.trim()}-${skuOf(suffix)}`,
    });
  };

  const ratioText =
    clue.ratio != null ? Number(clue.ratio.toFixed(4)).toLocaleString() : "—";

  return (
    <div className="im">
      <div className="im-backdrop">
        <div
          aria-labelledby="modalHeading"
          aria-modal="true"
          className="modal-window"
          role="dialog"
        >
          <span className="ios-sheet-handle" />

          <header className="modal-head">
            <div className="modal-head-left">
              <div className="eyebrow">Catalog &amp; Inventory Management</div>
              <div style={{ display: "flex", alignItems: "center", width: "100%", marginTop: 2 }}>
                <input
                  aria-label="Item title"
                  className="modal-title-input"
                  id="modalHeading"
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="Enter item name..."
                  style={{ maxWidth: "100%", width: "100%" }}
                  type="text"
                  value={form.name}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <span className="badge-category" id="activeCategoryBadge">
                  {copy.badge}
                </span>
                <div
                  className="header-cat-desc"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "var(--ios-secondary-label)",
                  }}
                >
                  <span style={{ color: "var(--ios-quaternary-label)" }}>•</span>
                  <span
                    id="headerCatDescText"
                    style={{
                      fontSize: 11,
                      color: "#475569",
                      letterSpacing: "0.01em",
                      fontWeight: 500,
                    }}
                  >
                    {copy.headerDesc}
                  </span>
                </div>
              </div>
            </div>
            <button
              aria-label="Close dialog"
              className="btn-close"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          </header>

          <form className="modal-body" id="itemConfigForm" noValidate onSubmit={submit}>
            {/* 1. Product Category */}
            <section className="section-block">
              <div className="section-header">
                <span className="section-title">
                  1. Product Category <span className="req">*</span>
                </span>
                <span className="section-subtext">
                  Determines costing, BOM &amp; stock tracking
                </span>
              </div>
              <div
                aria-label="Product category"
                className="category-selector"
                id="categoryGroup"
                role="radiogroup"
              >
                {(Object.keys(CATEGORY_COPY) as ProductCategory[]).map((cat) => {
                  const option = CATEGORY_COPY[cat];
                  return (
                    <button
                      key={cat}
                      aria-checked={form.productCategory === cat}
                      className={cn("btn-option", form.productCategory === cat && "selected")}
                      data-category={cat}
                      onClick={() => selectCategory(cat)}
                      role="radio"
                      type="button"
                    >
                      <span className="opt-title">{option.title}</span>
                      <span className="opt-desc">{option.desc}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Active Channels */}
            <section className="section-block">
              <div className="section-header">
                <span className="section-title">2. Active Channels</span>
                <span className="section-subtext">
                  Where this catalog item can be transacted
                </span>
              </div>
              <div className="checkbox-group">
                <label className="custom-check" id="channelPOSWrap" style={channelWrapStyle}>
                  <input
                    checked={form.posVisible}
                    id="chanPOS"
                    onChange={(e) => update({ posVisible: e.target.checked })}
                    style={{ margin: 0, flexShrink: 0 }}
                    type="checkbox"
                  />
                  <span style={channelLabelStyle}>Point of Sale</span>
                </label>
                <label className="custom-check" id="channelSaleWrap" style={channelWrapStyle}>
                  <input
                    checked={form.canSell}
                    id="chanSale"
                    onChange={(e) => update({ canSell: e.target.checked })}
                    style={{ margin: 0, flexShrink: 0 }}
                    type="checkbox"
                  />
                  <span style={channelLabelStyle}>Quotes &amp; Invoices</span>
                </label>
                <label
                  className={cn("custom-check", !isGoods && "channel-disabled")}
                  id="channelPurchaseWrap"
                  style={{ ...channelWrapStyle, justifyContent: "space-between" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <input
                      checked={form.canPurchase}
                      disabled={!isGoods}
                      id="chanPurchase"
                      onChange={(e) => update({ canPurchase: e.target.checked })}
                      style={{ margin: 0, flexShrink: 0 }}
                      type="checkbox"
                    />
                    <span style={channelLabelStyle}>Purchase Orders</span>
                  </div>
                  <span
                    className={cn("lock-indicator", isGoods && "hidden")}
                    id="purchaseChannelStatus"
                    style={{ marginLeft: "auto" }}
                  >
                    Inactive
                  </span>
                </label>
              </div>
            </section>

            {/* 3. Item Identification */}
            <section className="section-block">
              <div className="section-header">
                <span className="section-title">3. Item Identification</span>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="label" htmlFor="itemName">
                    Item Name <span className="req">*</span>
                  </label>
                  <input
                    className="input-control"
                    id="itemName"
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="e.g. 80gsm A4 Ream Paper"
                    required
                    type="text"
                    value={form.name}
                  />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="itemCategory">
                    Category Folder
                  </label>
                  <SearchableSelect
                    allowFreeText
                    id="itemCategory"
                    onChange={(v) => update({ category: v })}
                    options={categoryOptions}
                    placeholder="Search or choose..."
                    value={form.category}
                  />
                </div>
              </div>
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="label" htmlFor="itemSku">
                    SKU <span className="req">*</span>
                  </label>
                  <input
                    className="input-control num"
                    id="itemSku"
                    onChange={(e) => update({ sku: e.target.value })}
                    placeholder="PRD-00421"
                    required
                    type="text"
                    value={form.sku}
                  />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="itemBarcode">
                    Barcode / UPC
                  </label>
                  <input
                    className="input-control num"
                    id="itemBarcode"
                    onChange={(e) => update({ barcode: e.target.value })}
                    placeholder="Scan or enter code"
                    type="text"
                    value={form.barcode}
                  />
                </div>
                <div className={cn("form-group", isService && "hidden")} id="stockOnHandGroup">
                  <label className="label" htmlFor="stockOnHand">
                    Initial Stock on Hand
                  </label>
                  <input
                    className="input-control num"
                    id="stockOnHand"
                    min={0}
                    onChange={(e) => {
                      update({ stock: e.target.value });
                      pulse(stockRef.current);
                    }}
                    ref={stockRef}
                    step={1}
                    type="number"
                    value={form.stock}
                  />
                </div>
              </div>
            </section>

            {/* 4. Sourcing & Supplier */}
            {isGoods && (
              <section className="sourcing-panel" id="sourcingSection">
                <div className="sourcing-header">
                  <span className="sourcing-icon">❖</span>
                  <div>
                    <div className="sourcing-title">Sourcing &amp; Procurement</div>
                    <div
                      className="helper-text"
                      style={{ color: "rgb(17, 94, 89)", fontWeight: 600 }}
                    >
                      Preferred vendor &amp; inventory safety threshold.
                    </div>
                  </div>
                </div>
                <div className="form-grid-2" id="supplierAndAlertRow">
                  <div className="form-group" id="preferredSupplierField">
                    <label className="label" htmlFor="prefSupplier">
                      Preferred Supplier <span className="req">*</span>
                    </label>
                    <SearchableSelect
                      allowFreeText
                      emptyLabel="Select vendor..."
                      id="prefSupplier"
                      onChange={(v) => {
                        const record = suppliersRegister.find((s) => s.id === v);
                        update({
                          preferredSupplierId: record?.id || "",
                          preferredSupplierName: record?.name || v,
                        });
                      }}
                      options={supplierOptions}
                      placeholder="Search or choose..."
                      value={form.preferredSupplierId || form.preferredSupplierName}
                    />
                  </div>
                  <div className="form-group" id="lowStockField">
                    <label className="label" htmlFor="lowStockAlert">
                      Low-Stock Alert Threshold
                    </label>
                    <input
                      className="input-control num"
                      id="lowStockAlert"
                      min={0}
                      onChange={(e) => update({ lowStockThreshold: e.target.value })}
                      type="number"
                      value={form.lowStockThreshold}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* 5. UOM, Pricing & Cost of Sale */}
            <section className="section-block">
              <div className="section-header">
                <span className="section-title">4. UOM, Pricing &amp; Cost of Sale</span>
                <span className="section-subtext">
                  Clear paired lines for Purchase and Sale units
                </span>
              </div>
              <div className="pricing-panel">
                {isGoods && (
                  <div className="paired-row" id="purchasePairedRow">
                    <div>
                      <div className="row-meta-title">Purchase Terms</div>
                      <div className="row-meta-desc">Inbound buying metrics</div>
                    </div>
                    <div className="paired-inputs-grid" style={{ gridColumn: "span 2" }}>
                      <div className="form-group">
                        <label className="label" htmlFor="purchaseUom">
                          Purchase UOM <span className="req">*</span>
                        </label>
                        <SearchableSelect
                          id="purchaseUom"
                          onChange={(v) => update({ purchaseUnit: v, saleUnit: v })}
                          options={unitOptions}
                          placeholder="Search or choose..."
                          value={form.purchaseUnit}
                        />
                      </div>
                      <div className="form-group">
                        <label className="label" htmlFor="purchasePrice">
                          Purchase Price <span className="req">*</span>
                        </label>
                        <div className="input-currency-wrapper">
                          <span className="currency-prefix">{currencySymbol}</span>
                          <input
                            className="input-control num"
                            id="purchasePrice"
                            min={0}
                            onChange={(e) => update({ purchasePrice: e.target.value })}
                            placeholder="0.00"
                            required
                            step={100}
                            type="number"
                            value={form.purchasePrice}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="paired-row" id="salePairedRow">
                  <div>
                    <div className="row-meta-title">Sales &amp; Margins</div>
                    <div className="row-meta-desc">Outbound billing metrics</div>
                  </div>
                  <div className="paired-inputs-grid" style={{ gridColumn: "span 2" }}>
                    <div className="form-group">
                      <label className="label" htmlFor="saleUom">
                        Sale UOM <span className="req">*</span>
                      </label>
                      <SearchableSelect
                        id="saleUom"
                        onChange={(v) => update({ saleUnit: v })}
                        options={saleUnitOptions}
                        placeholder="Search or choose..."
                        value={form.saleUnit}
                      />
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="salePrice">
                        Sale Price <span className="req">*</span>
                      </label>
                      <div className="input-currency-wrapper">
                        <span className="currency-prefix">{currencySymbol}</span>
                        <input
                          className="input-control num"
                          id="salePrice"
                          min={0}
                          onChange={(e) => update({ price: e.target.value })}
                          placeholder="0.00"
                          step={50}
                          type="number"
                          value={form.price}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {!isService && (
                  <div className="paired-row" id="costOfSaleRow">
                    <div>
                      <div className="row-meta-title">Cost of Sale</div>
                      <div className="row-meta-desc">Direct unit cost recognition</div>
                    </div>
                    <div
                      className="form-group"
                      style={{
                        gridColumn: "span 2",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        width: "100%",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        <label className="label" htmlFor="costOfSale" style={{ marginBottom: 0 }}>
                          <span>
                            Direct Cost per Sale UOM{" "}
                            <span className="req" id="costReqIndicator">
                              *
                            </span>
                          </span>
                          <span
                            className={cn("kit-locked-badge", !isKit && "hidden")}
                            id="kitLockedBadge"
                          >
                            🔒 Auto-calculated from BOM
                          </span>
                        </label>
                        <span className="helper-text" id="costDerivationNote" style={{ fontSize: 11 }}>
                          Unit benchmark
                        </span>
                      </div>
                      <div className="paired-inputs-grid" id="costRowInputsWrapper">
                        <div
                          className="cost-derivation-card"
                          id="derivationClueBox"
                          ref={clueBoxRef}
                          style={{ marginTop: 0 }}
                        >
                          <div className="cost-derivation-text">
                            <span style={{ fontWeight: 700, color: "#007aff" }}>✦ Clue:</span>
                            <span id="clueFormula" style={{ color: "#0b4953", fontWeight: 600 }}>
                              {isKit ? (
                                <>Auto-calculated from the Bill of Materials</>
                              ) : clue.ratio != null && clue.derived != null ? (
                                <>
                                  {formatCurrency(purchasePriceNum, currency)} / {ratioText} units
                                  ={" "}
                                  <strong className="num" style={{ color: "var(--ios-label)" }}>
                                    {formatCurrency(clue.derived, currency)}
                                  </strong>{" "}
                                  / {form.saleUnit}
                                </>
                              ) : (
                                <>Choose a Purchase UOM related to {form.saleUnit} to derive a cost</>
                              )}
                            </span>
                          </div>
                          <button
                            className="btn-use-cost"
                            disabled={isKit || clue.derived == null}
                            id="btnUseDerivedCost"
                            onClick={applyDerivedCost}
                            type="button"
                          >
                            Use cost
                          </button>
                        </div>
                        <div className="input-currency-wrapper">
                          <span className="currency-prefix">{currencySymbol}</span>
                          <input
                            className="input-control num"
                            id="costOfSale"
                            min={0}
                            onChange={(e) => update({ cost: e.target.value })}
                            placeholder="0.00"
                            readOnly={isKit}
                            ref={costRef}
                            required
                            step={10}
                            type="number"
                            value={form.cost}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isService && (
                  <div className="info-note" id="serviceNotice">
                    <strong>Service Item Mode:</strong> Cost of Sale and Purchase UOM
                    requirements are deactivated. Services are billed on labor or
                    project units without physical stock depletion.
                  </div>
                )}
              </div>
            </section>

            {/* 6. Bill of Materials (Kits only) */}
            {isKit && (
              <section className="section-block" id="bomSectionWrapper">
                <div className="section-header">
                  <div>
                    <span className="section-title">5. Bill of Materials (BOM)</span>
                    <span className="section-subtext" style={{ marginLeft: 6 }}>
                      Components assembled into kit
                    </span>
                  </div>
                  <button
                    className="btn-add-line"
                    id="addBomRowBtn"
                    onClick={addBomRow}
                    type="button"
                  >
                    ＋ Add Component
                  </button>
                </div>

                {bomAlert && (
                  <div className="bom-alert-banner" id="bomValidationAlert">
                    <svg fill="currentColor" height="15" viewBox="0 0 20 20" width="15">
                      <path
                        clipRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        fillRule="evenodd"
                      />
                    </svg>
                    <span id="bomAlertText">{BOM_ALERT}</span>
                  </div>
                )}

                <div className="bom-container" id="bomBox">
                  <div className="bom-table-head">
                    <div>Component Item</div>
                    <div style={{ textAlign: "right" }}>Quantity</div>
                    <div>Unit</div>
                    <div>Line Supplier Option</div>
                    <div />
                  </div>
                  <div id="bomRowList" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {bomRows.map((row) => (
                      <div
                        className={cn(
                          "bom-item-row",
                          enteringRows.has(row.key) && "row-enter",
                          exitingRows.has(row.key) && "row-exit"
                        )}
                        key={row.key}
                      >
                        <SearchableSelect
                          id={`bom-${row.key}-material`}
                          invalid={isInvalid(row.key, "material")}
                          onChange={(v) => {
                            const mat = items.find((i) => i.id === v);
                            setBomRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? { ...r, materialId: v, unit: mat?.baseUnit || r.unit }
                                  : r
                              )
                            );
                            clearInvalid(row.key, "material");
                            setBomAlert(false);
                          }}
                          options={materialOptions}
                          placeholder="Add component"
                          value={row.materialId}
                        />
                        <input
                          className={cn(
                            "input-control num bom-qty",
                            isInvalid(row.key, "qty") && "field-error"
                          )}
                          id={`bom-${row.key}-qty`}
                          min={0}
                          onChange={(e) => {
                            const v = e.target.value;
                            setBomRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, qtyText: v } : r
                              )
                            );
                            clearInvalid(row.key, "qty");
                            setBomAlert(false);
                          }}
                          placeholder="Qty"
                          step="any"
                          style={{ textAlign: "right" }}
                          type="number"
                          value={row.qtyText}
                        />
                        <SearchableSelect
                          id={`bom-${row.key}-unit`}
                          invalid={isInvalid(row.key, "unit")}
                          onChange={(v) => {
                            setBomRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, unit: v } : r
                              )
                            );
                            clearInvalid(row.key, "unit");
                            setBomAlert(false);
                          }}
                          options={unitOptions}
                          placeholder="Unit"
                          value={row.unit}
                        />
                        <SearchableSelect
                          allowFreeText
                          id={`bom-${row.key}-vendor`}
                          invalid={isInvalid(row.key, "vendor")}
                          onChange={(v) => {
                            const record = suppliersRegister.find((s) => s.id === v);
                            setBomRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? {
                                      ...r,
                                      vendorId: record?.id || "",
                                      vendorName: record?.name || v,
                                    }
                                  : r
                              )
                            );
                            clearInvalid(row.key, "vendor");
                            setBomAlert(false);
                          }}
                          options={supplierOptions}
                          placeholder="Add supplier"
                          value={row.vendorId || row.vendorName}
                        />
                        <button
                          className="btn-remove-row"
                          onClick={() => removeBomRow(row.key)}
                          title="Delete component"
                          type="button"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bom-summary-bar">
                    <span style={{ fontSize: 12, color: "var(--ios-secondary-label)" }}>
                      Kit Assembly Cost Roll-up:
                    </span>
                    <div>
                      <span
                        className="num"
                        id="bomSummaryCost"
                        ref={bomSummaryRef}
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          color: "var(--ios-label)",
                          transition: "transform 0.2s ease",
                        }}
                      >
                        {formatCurrency(bomCost, currency)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--ios-secondary-label)",
                          marginLeft: 4,
                        }}
                      >
                        total component cost
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* 7. Media & Product Preview */}
            <section className="section-block">
              <div className="section-header">
                <span className="section-title">Product Image</span>
              </div>
              <div className="image-upload-row">
                <div
                  className="image-placeholder-box"
                  id="imageUploadBox"
                  onClick={() => fileRef.current?.click()}
                  title="Click or tap to choose and upload image file"
                >
                  {form.imageUrl && !imageBroken ? (
                    <img
                      alt="Preview"
                      onError={() => setImageBroken(true)}
                      src={form.imageUrl}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transition: "transform 0.3s ease",
                      }}
                    />
                  ) : (
                    <div
                      id="previewDisplay"
                      style={{
                        fontSize: 26,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                        transition: "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
                      }}
                    >
                      📦
                    </div>
                  )}
                  <div
                    id="imageOverlay"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "0";
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.65)",
                      color: "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0,
                      transition: "opacity 0.2s ease",
                      fontSize: 10,
                      fontWeight: 600,
                      textAlign: "center",
                      padding: 4,
                      gap: 2,
                    }}
                  >
                    <svg
                      fill="none"
                      height="16"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="16"
                    >
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>{uploading ? "Uploading..." : "Upload"}</span>
                  </div>
                  <input
                    accept="image/*"
                    id="productImageInput"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImageFile(f);
                      e.target.value = "";
                    }}
                    ref={fileRef}
                    style={{ display: "none" }}
                    type="file"
                  />
                </div>
                <div
                  style={{
                    flex: "1 1 0%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="input-control"
                      id="imageUrlInput"
                      onChange={(e) => update({ imageUrl: e.target.value })}
                      placeholder="Paste image asset URL or CDN path..."
                      style={{ flex: 1, minWidth: 0 }}
                      type="text"
                      value={form.imageUrl}
                    />
                  </div>
                  <span
                    className="helper-text"
                    style={{ fontSize: 11, color: "var(--ios-secondary-label)" }}
                  >
                    Tap thumbnail box above to browse and upload image, or paste an asset URL
                    directly
                  </span>
                </div>
              </div>
            </section>
          </form>

          <footer className="modal-footer">
            <div className="footer-status" id="validationSummary">
              All required fields populated for{" "}
              <strong id="summaryCat" style={{ color: "var(--ios-label)" }}>
                {copy.summary}
              </strong>
            </div>
            <div className="footer-actions">
              <button className="btn btn-secondary" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={upsert.isPending || uploading}
                form="itemConfigForm"
                id="btnSubmit"
                type="submit"
              >
                {upsert.isPending
                  ? "Saving..."
                  : cloneFrom
                  ? "Save as New Item"
                  : item
                  ? "Save Changes"
                  : "Create Item"}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {cloneSetupOpen && cloneFrom && (
        <CloneSetupModal
          source={cloneFrom}
          items={items}
          onCancel={onClose}
          onConfirm={({ sku, barcode }) => {
            update({ sku, barcode });
            setCloneSetupOpen(false);
          }}
        />
      )}

      {dupPrompt && (
        <DuplicatePromptModal
          onCancel={() => setDupPrompt(null)}
          onConfirm={resolveDuplicate}
          original={dupPrompt.original}
          pending={upsert.isPending}
        />
      )}

      <div className={cn("ios-toast", toastState.show && "toast-show")} id="toastMessage">
        <span style={{ color: toastState.tone, fontWeight: 700 }}>●</span>
        <span id="toastText">{toastState.message}</span>
      </div>
    </div>
  );
}

function DuplicatePromptModal({
  original,
  pending,
  onCancel,
  onConfirm,
}: {
  original: Item;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (v: { newSuffix: string; origSuffix?: string }) => void;
}) {
  const [newSuffix, setNewSuffix] = useState("");
  const [origSuffix, setOrigSuffix] = useState("");
  const [renameOriginal, setRenameOriginal] = useState(false);

  const confirm = () => {
    if (pending || !newSuffix.trim()) return;
    onConfirm({
      newSuffix,
      origSuffix: renameOriginal ? origSuffix : undefined,
    });
  };

  return (
    <div className="im">
      <div className="im-stack">
        <div
          aria-labelledby="dupHeading"
          aria-modal="true"
          className="modal-window im-dialog"
          role="dialog"
        >
        <span className="ios-sheet-handle" />
        <header className="modal-head">
          <div className="modal-head-left">
            <div className="eyebrow">Indistinguishable from existing item</div>
            <div
              className="modal-title-input"
              id="dupHeading"
              style={{ maxWidth: "100%", paddingLeft: 0 }}
            >
              Give this variant a name
            </div>
          </div>
          <button
            aria-label="Close dialog"
            className="btn-close"
            onClick={onCancel}
            type="button"
          >
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="helper-text" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            This item would be 100% identical to{" "}
            <strong style={{ color: "var(--ios-label)" }}>{original.name}</strong>{" "}
            <span className="num" style={{ color: "var(--ios-secondary-label)" }}>
              (SKU {original.sku})
            </span>
            . Add a variant suffix so the two can be told apart on shelves,
            receipts and reports.
          </p>
          <div className="form-group">
            <label className="label" htmlFor="item-dup-new">
              Variant suffix for the new item <span className="req">*</span>
            </label>
            <input
              autoFocus
              className="input-control"
              id="item-dup-new"
              onChange={(e) => setNewSuffix(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirm();
              }}
              placeholder="e.g. Large, V2, Blue"
              value={newSuffix}
            />
            <div className="helper-text" style={{ fontSize: 10.5 }}>
              Appended to both the item name and the SKU (letters/digits only in SKU).
            </div>
          </div>
          <label
            className="custom-check"
            style={{ cursor: "pointer", borderTop: "1px solid var(--ios-separator)", paddingTop: 12 }}
          >
            <input
              checked={renameOriginal}
              onChange={(e) => setRenameOriginal(e.target.checked)}
              type="checkbox"
            />
            <span style={{ fontSize: 13 }}>Also rename the original for clarity</span>
          </label>
          {renameOriginal && (
            <div className="form-group">
              <label className="label" htmlFor="item-dup-orig">
                Variant suffix for the original
              </label>
              <input
                className="input-control"
                id="item-dup-orig"
                onChange={(e) => setOrigSuffix(e.target.value)}
                placeholder="e.g. Small, V1, Red"
                value={origSuffix}
              />
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <div className="footer-actions" style={{ marginLeft: "auto" }}>
            <button className="btn btn-secondary" onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={pending || !newSuffix.trim()}
              onClick={confirm}
              type="button"
            >
              {pending ? "Saving..." : "Save variant"}
            </button>
          </div>
        </footer>
        </div>
      </div>
    </div>
  );
}

/** First free SKU based on the source: `ABC` -> `ABC-2`, `ABC-3`, … */
function nextFreeSku(base: string, items: Item[]): string {
  const norm = (s: string) => (s || "").trim().toLowerCase();
  const taken = new Set(items.map((i) => norm(i.sku)));
  const root = (base || "ITEM").trim() || "ITEM";
  if (!taken.has(norm(root))) return root;
  for (let n = 2; n < 10000; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken.has(norm(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Shown the moment "Clone" is pressed. A duplicate must never start with the
 * source item's SKU (the DB rejects it per business) or barcode (the DB allows
 * it, which is exactly how two products end up scanning as one).
 */
function CloneSetupModal({
  source,
  items,
  onCancel,
  onConfirm,
}: {
  source: Item;
  items: Item[];
  onCancel: () => void;
  onConfirm: (v: { sku: string; barcode: string }) => void;
}) {
  const [sku, setSku] = useState(() => nextFreeSku(source.sku, items));
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();

  const confirm = () => {
    const nextSku = sku.trim();
    const nextBarcode = barcode.trim();
    if (!nextSku) {
      setError("A new SKU is required.");
      return;
    }
    if (norm(nextSku) === norm(source.sku)) {
      setError("The SKU must be different from the item you are duplicating.");
      return;
    }
    const skuTaken = items.find((i) => norm(i.sku) === norm(nextSku));
    if (skuTaken) {
      setError(`SKU "${nextSku}" is already used by ${skuTaken.name}.`);
      return;
    }
    if (nextBarcode) {
      const barcodeTaken = items.find((i) => norm(i.barcode) === norm(nextBarcode));
      if (barcodeTaken) {
        setError(`Barcode "${nextBarcode}" is already used by ${barcodeTaken.name}.`);
        return;
      }
      if (source.barcode && norm(nextBarcode) === norm(source.barcode)) {
        setError(
          "The barcode must be different from the item you are duplicating, or left blank."
        );
        return;
      }
    }
    onConfirm({ sku: nextSku, barcode: nextBarcode });
  };

  return (
    <div className="im">
      <div className="im-stack">
        <div
          aria-labelledby="cloneHeading"
          aria-modal="true"
          className="modal-window im-dialog"
          role="dialog"
        >
          <span className="ios-sheet-handle" />
          <header className="modal-head">
            <div className="modal-head-left">
              <div className="eyebrow">Duplicating an item</div>
              <div
                className="modal-title-input"
                id="cloneHeading"
                style={{ maxWidth: "100%", paddingLeft: 0 }}
              >
                Give the copy its own SKU &amp; barcode
              </div>
            </div>
            <button
              aria-label="Close dialog"
              className="btn-close"
              onClick={onCancel}
              type="button"
            >
              ✕
            </button>
          </header>
          <div className="modal-body">
            <p className="helper-text" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <strong style={{ color: "var(--ios-label)" }}>{source.name}</strong>{" "}
              <span className="num" style={{ color: "var(--ios-secondary-label)" }}>
                (SKU {source.sku}
                {source.barcode ? ` · barcode ${source.barcode}` : ""})
              </span>{" "}
              will be copied. Every item needs a unique SKU so stock, sales and
              reports stay separate. Replace or clear the barcode too.
            </p>
            <div className="form-group">
              <label className="label" htmlFor="item-clone-sku">
                New SKU <span className="req">*</span>
              </label>
              <input
                autoFocus
                className="input-control num"
                id="item-clone-sku"
                onChange={(e) => {
                  setSku(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirm();
                  }
                }}
                value={sku}
              />
              <div className="helper-text" style={{ fontSize: 10.5 }}>
                Suggested from the original — edit it to match your own scheme.
              </div>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="item-clone-barcode">
                New barcode / UPC
              </label>
              <input
                className="input-control num"
                id="item-clone-barcode"
                onChange={(e) => {
                  setBarcode(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirm();
                  }
                }}
                placeholder="Scan or type a new code, or leave blank"
                value={barcode}
              />
              <div className="helper-text" style={{ fontSize: 10.5 }}>
                The copy cannot reuse the original barcode or any code already in
                the catalog.
              </div>
            </div>
            {error && (
              <div
                role="alert"
                style={{ color: "#d3222a", fontSize: 12, lineHeight: 1.4 }}
              >
                {error}
              </div>
            )}
          </div>
          <footer className="modal-footer">
            <div className="footer-actions" style={{ marginLeft: "auto" }}>
              <button className="btn btn-secondary" onClick={onCancel} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirm} type="button">
                Continue to duplicate
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
