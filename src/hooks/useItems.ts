import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapItem } from "@/lib/mappers";
import type { Item } from "@/types";
import { seedItems, seedCustomers } from "@/lib/seedData";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness, withBusinessAll } from "@/lib/tenant";

export function useItems() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["items", businessId],
    queryFn: async () => {
      let q = supabase.from("items").select("*").order("name");
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapItem);
    }
  });
}

export type UpsertPayload = Partial<Item> & { id?: string };

export function buildItemRow(item: UpsertPayload): Record<string, unknown> {
  const itemType = item.itemType || (item.isMaterial ? "material" : "product");
  const isMaterial = itemType === "material" || itemType === "intermediate";
  const baseUnit = item.baseUnit || "pc";
  return {
    sku: item.sku,
    barcode: item.barcode || null,
    name: item.name,
    category: item.category || "General",
    price: item.price ?? 0,
    cost: item.cost ?? 0,
    stock: item.stock ?? 0,
    base_unit: baseUnit,
    units: item.units || [],
    bom: item.bom || null,
    is_material: isMaterial,
    item_type: itemType,
    image_url: item.imageUrl || null,
    suppliers: item.suppliers || [],
    emoji: item.emoji || null,
    low_stock_threshold: item.lowStockThreshold ?? 10,
    allow_decimal_qty: !!item.allowDecimalQty,
    purchase_unit: item.purchaseUnit || baseUnit,
    sale_unit: item.saleUnit || baseUnit,
    preferred_supplier_id: item.preferredSupplierId || null,
    preferred_supplier_name: item.preferredSupplierName || null,
    price_uom: item.priceUom || null,
    cost_uom: item.costUom || null,
    product_category: item.productCategory || "goods",
    can_purchase: item.canPurchase ?? null,
    can_sell: item.canSell ?? null,
    pos_visible: item.posVisible ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function useUpsertItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: UpsertPayload) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const { OfflineQueue } = await import("@/lib/offlineQueue");
        const row = withBusiness(buildItemRow(item));
        const id = await OfflineQueue.enqueue(item.id ? "item.update" : "item.create", { id: item.id, row }, {
          sku: String(item.sku || ""),
        });
        throw new Error(`OFFLINE_QUEUED:${id}`);
      }
      const payload = withBusiness(buildItemRow(item));
      if (item.id) {
        // Stock edits made in the item form are inventory movements, not a
        // silent field write: strip the value here and post the delta through
        // the ledger below so history and on-hand stay reconcilable.
        const { data: before } = await supabase
          .from("items")
          .select("stock, name")
          .eq("id", item.id)
          .maybeSingle();
        const desiredStock = Number(item.stock ?? before?.stock ?? 0);
        const currentStock = Number(before?.stock ?? 0);
        const { stock: _stock, ...rest } = payload;
        const { data, error } = await supabase
          .from("items")
          .update(rest)
          .eq("id", item.id)
          .select()
          .single();
        if (error) throw error;
        if (Number.isFinite(desiredStock) && Math.abs(desiredStock - currentStock) > 1e-9) {
          const { executeStockWrite } = await import("@/lib/stockWrite");
          await executeStockWrite({
            itemId: item.id,
            itemName: String(item.name || before?.name || "Item"),
            oldStock: currentStock,
            newStock: desiredStock,
            reason: "Item form stock correction",
            adjustmentType: "correction",
          });
        }
        return mapItem(data);
      }
      const initial = Number(payload.stock ?? 0);
      const { stock: _initialStock, ...catalogPayload } = payload;
      const { data, error } = await supabase
        .from("items")
        .insert({ ...catalogPayload, stock: 0 })
        .select()
        .single();
      if (error) throw error;
      // Record the initial quantity as an opening movement so the ledger
      // starts from the same balance the item was created with.
      if (initial !== 0) {
        const { error: openingError } = await supabase.rpc("adjust_stock", {
          p_item_id: data.id,
          p_new_stock: initial,
          p_reason: "Opening stock at item creation",
          p_adjustment_type: "opening",
          p_operation_id: `item:${data.id}`,
        });
        if (openingError) throw openingError;
      }
      return mapItem(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
  });
}

export function usePurgeDemoData() {
  const qc = useQueryClient();
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useMutation({
    mutationFn: async () => {
      // Delete in dependency-safe order. Requires user confirmation in UI.
      // Only removes rows matching bundled seed SKUs/names to avoid wiping real data.
      const seedSkus = seedItems.map((i) => i.sku);
      const seedNames = seedCustomers.map((c) => c.name);
      if (seedSkus.length > 0) {
        let q = supabase.from("items").delete().in("sku", seedSkus);
        if (businessId) q = q.eq("business_id", businessId);
        const { error } = await q;
        if (error) throw error;
      }
      if (seedNames.length > 0) {
        let q = supabase.from("customers").delete().in("name", seedNames);
        if (businessId) q = q.eq("business_id", businessId);
        const { error } = await q;
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useSeedSampleData() {
  const qc = useQueryClient();
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useMutation({
    mutationFn: async () => {
      let existingQ = supabase.from("items").select("id").limit(1);
      if (businessId) existingQ = existingQ.eq("business_id", businessId);
      const { data: existing } = await existingQ;
      if (existing && existing.length > 0) {
        throw new Error("Catalog already has items — clear inventory before re-seeding.");
      }
      const materials = seedItems.filter(
        (i) => i.itemType === "material" || i.itemType === "intermediate"
      );
      const sellables = seedItems.filter(
        (i) => i.itemType === "product" || i.itemType === "ready"
      );

      const matInserts = materials.map((m) => ({
        sku: m.sku,
        barcode: m.barcode || null,
        name: m.name,
        category: m.category,
        price: m.price,
        cost: m.cost,
         stock: 0,
        base_unit: m.baseUnit,
        units: m.units,
        bom: null,
        is_material: true,
        item_type: m.itemType,
        emoji: m.emoji || null,
        suppliers: [],
        low_stock_threshold: 10,
      }));

      const { data: matRows, error: matErr } = await supabase
        .from("items")
        .insert(withBusinessAll(matInserts))
        .select("id, sku");
      if (matErr) throw matErr;

      const skuToId = new Map<string, string>();
      (matRows || []).forEach((r) => skuToId.set(r.sku, r.id));
      const matKeyToId = new Map<string, string>();
      materials.forEach((m) => {
        const id = skuToId.get(m.sku);
        if (id) matKeyToId.set(m.key, id);
      });

      const prodInserts = sellables.map((p) => ({
        sku: p.sku,
        barcode: p.barcode || null,
        name: p.name,
        category: p.category,
        price: p.price,
        cost: p.cost,
         stock: 0,
        base_unit: p.baseUnit,
        units: p.units,
        bom: p.bomKeys
          ? p.bomKeys
              .map((b) => ({ materialId: matKeyToId.get(b.materialKey) || "", qty: b.qty }))
              .filter((b) => b.materialId)
          : null,
        is_material: false,
        item_type: p.itemType,
        emoji: p.emoji || null,
        suppliers: [],
        low_stock_threshold: 10,
      }));

      const { data: prodRows, error: prodErr } = await supabase
        .from("items")
        .insert(withBusinessAll(prodInserts))
        .select("id, sku");
      if (prodErr) throw prodErr;

      const custInserts = seedCustomers.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        total_spent: 0,
        loyalty_points: 0,
      }));
      const { error: custErr } = await supabase
        .from("customers")
        .insert(withBusinessAll(custInserts));
      if (custErr) throw custErr;

       // Sample stock is real inventory: seed an opening ledger movement per
       // item. The ledger is the only writer of the cached balance.
      const { buildAdjustmentMovement } = await import("@/lib/stockLedger");
        const openingMovements = [] as ReturnType<typeof buildAdjustmentMovement>;
        const addOpenings = (
          rows: { id: string; sku: string }[] | null,
          source: { sku: string; stock: number }[]
        ) => {
          for (const r of rows || []) {
            const seed = source.find((s) => s.sku === r.sku);
            const qty = Number(seed?.stock ?? 0);
            if (qty === 0) continue;
            openingMovements.push(
              ...buildAdjustmentMovement({
                itemId: r.id,
                delta: qty,
                sourceType: "opening",
                sourceId: `item:${r.id}`,
                reason: "Opening stock — sample data",
              })
            );
          }
        };
        addOpenings(matRows, materials);
        addOpenings(prodRows, sellables);
      for (const movement of openingMovements) {
        const { error: openingError } = await supabase.rpc("adjust_stock", {
          p_item_id: movement.itemId,
          p_new_stock: movement.qtyBase,
          p_reason: movement.reason,
          p_adjustment_type: "opening",
          p_operation_id: movement.sourceId,
        });
        if (openingError) throw openingError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}
