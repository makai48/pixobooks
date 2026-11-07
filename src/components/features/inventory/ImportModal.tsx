import { useMemo, useRef, useState } from "react";
import { Upload, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/imageUpload";
import { logAudit } from "@/lib/audit";
import { currentBusinessId } from "@/lib/tenant";
import type { Item } from "@/types";
import {
  parseInventoryFile,
  planImport,
  orderForImport,
  remapBom,
  toItemPayload,
  isHttpUrl,
  isDataUrl,
  dataUrlToFile,
  type ImportRow,
  type StockMode,
} from "@/lib/inventoryImport";

type Props = {
  open: boolean;
  onClose: () => void;
  existing: Item[];
  actor: { id: string; name: string; role: string };
};

type Phase = "pick" | "preview" | "columns" | "running" | "done";

async function rehostImage(row: ImportRow): Promise<{ url: string | null; warned: boolean }> {
  const remote = row.image_url;
  const inline = row.image_url_base64;
  try {
    if (isHttpUrl(remote)) {
      const res = await fetch(remote);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `import-${Date.now()}.png`, { type: blob.type || "image/png" });
      return { url: await uploadImage(file, "items"), warned: false };
    }
    const du = isDataUrl(remote) ? remote : typeof inline === "string" && isDataUrl(inline) ? inline : null;
    if (du) {
      const file = dataUrlToFile(du);
      if (!file) throw new Error("bad data URL");
      return { url: await uploadImage(file, "items"), warned: false };
    }
    return { url: typeof remote === "string" && remote ? remote : null, warned: false };
  } catch {
    const fallback = typeof remote === "string" && remote ? remote : null;
    return { url: fallback, warned: true };
  }
}

export default function ImportModal({ open, onClose, existing, actor }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [stockMode, setStockMode] = useState<StockMode>("set");
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<null | {
    inserted: number;
    updated: number;
    skipped: number;
    rehosted: number;
    imageWarnings: number;
    bomDropped: number;
  }>(null);

  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set([
    "sku", "name", "category", "price", "cost", "stock", "base_unit",
    "units", "bom", "is_material", "item_type", "image_url", "suppliers",
    "emoji", "low_stock_threshold", "allow_decimal_qty",
    "purchase_unit", "sale_unit", "preferred_supplier_name", "barcode"
  ]));

  // Avoid TS control flow analysis narrowing in conditional blocks
  const isRunning = phase === "running";

  const plan = useMemo(
    () =>
      planImport(
        rows,
        existing.map((e) => ({ id: e.id, sku: e.sku, stock: e.stock })),
        { updateExisting, stockMode }
      ),
    [rows, existing, updateExisting, stockMode]
  );
  const counts = useMemo(() => {
    let inserted = 0, updated = 0, skipped = 0;
    for (const p of plan) {
      if (p.kind === "insert") inserted++;
      else if (p.kind === "update") updated++;
      else skipped++;
    }
    return { inserted, updated, skipped };
  }, [plan]);

  if (!open) return null;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      toast.error("File too large — keep imports under 25MB");
      return;
    }
    try {
      const parsed = parseInventoryFile(JSON.parse(await f.text()));
      setRows(parsed.rows);
      setFileWarnings(parsed.warnings);
      setFileName(f.name);
      setResult(null);
      setPhase("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read file");
    }
  };

  const run = async () => {
    setPhase("running");
    setProgress({ done: 0, total: plan.length });
    let inserted = 0, updated = 0, skipped = 0, rehosted = 0, imageWarnings = 0, bomDropped = 0;
    try {
      const skuToId = new Map<string, string>();
      existing.forEach((e) => skuToId.set(e.sku.trim().toLowerCase(), e.id));
      const actionable = plan.filter((p) => p.kind !== "skip");
      skipped = plan.length - actionable.length;
      // Since actionable has no "skip" kinds, we don't need to check for it.
      const ordered = orderForImport(actionable.map((p) => (p.kind === "insert" ? p.row : (p as { row: ImportRow }).row)));
      const byId = new Map<string, ImportRow>();
      rows.forEach((r) => byId.set(String(r.id ?? ""), r));
      let done = 0;
      const tick = () => {
        done++;
        setProgress({ done, total: plan.length });
      };

      // Every imported quantity is recorded in the stock ledger without
      // re-applying it (the row already carries absolute stock): inserts post
      // an opening movement, updates post the signed delta.
      const batch = Date.now().toString(36);
      const recordStock = async (
        itemId: string,
        quantity: number,
        mode: "set" | "add" = "set"
      ) => {
        if (!Number.isFinite(quantity) || (mode === "add" && Math.abs(quantity) < 1e-9)) return;
        const { error } = await supabase.rpc("import_stock", {
          p_item_id: itemId,
          p_quantity: quantity,
          p_mode: mode,
          p_reason: `Inventory import — ${fileName || "file"}`,
          p_operation_id: `import:${batch}:${itemId}`,
          p_actor_id: actor.id,
          p_actor_name: actor.name,
        });
        if (error) throw error;
      };

      // Pass 1: everything without BOM (materials, ready items) — creates ids.
      for (const group of [ordered.materials]) {
        for (const row of group) {
          const planned = actionable.find(
            (p) => (p.kind === "insert" ? p.row : (p as { row: ImportRow }).row) === row
          );
          if (!planned) continue;
          const { url, warned } = await rehostImage(row);
          if (warned) imageWarnings++;
          if (url && (isHttpUrl(row.image_url) || isDataUrl(row.image_url) || isDataUrl(row.image_url_base64))) rehosted++;
          const stock = planned.kind === "update" && stockMode === "add"
            ? planned.existingStock + Number(row.stock || 0)
            : Number(row.stock || 0);
          const payload: Record<string, unknown> = {
            ...toItemPayload(row, { stock, imageUrl: url, selectedColumns }),
            bom: null,
            ...(currentBusinessId() ? { business_id: currentBusinessId() } : {}),
          };
          if (planned.kind === "insert") {
            const { stock: _initialStock, ...catalogPayload } = payload;
            const { data, error } = await supabase.from("items").insert({ ...catalogPayload, stock: 0 }).select("id, sku").single();
            if (error) throw new Error(`${row.sku}: ${error.message}`);
            skuToId.set(String(row.sku).trim().toLowerCase(), data.id);
            inserted++;
            await recordStock(data.id, stock);
          } else {
            const { stock: _ignoredStock, ...catalogPayload } = payload;
            const { error } = await supabase.from("items").update(catalogPayload).eq("id", planned.id);
            if (error) throw new Error(`${row.sku}: ${error.message}`);
            updated++;
            await recordStock(
              planned.id,
              stockMode === "add" ? Number(row.stock || 0) : stock,
              stockMode === "add" ? "add" : "set"
            );
          }
          tick();
        }
      }
      // Pass 2: BOM products — remap source materialIds to our ids.
      for (const row of ordered.products) {
        const planned = actionable.find(
          (p) => (p.kind === "insert" ? p.row : (p as { row: ImportRow }).row) === row
        );
        if (!planned) continue;
        const { url, warned } = await rehostImage(row);
        if (warned) imageWarnings++;
        if (url && (isHttpUrl(row.image_url) || isDataUrl(row.image_url) || isDataUrl(row.image_url_base64))) rehosted++;
        const stock = planned.kind === "update" && stockMode === "add"
          ? planned.existingStock + Number(row.stock || 0)
          : Number(row.stock || 0);
        const { bom, dropped } = remapBom(row, skuToId, byId);
        bomDropped += dropped;
          const payload: Record<string, unknown> = {
          ...toItemPayload(row, { stock, imageUrl: url, selectedColumns }),
          bom: bom.length ? bom : null,
          ...(currentBusinessId() ? { business_id: currentBusinessId() } : {}),
          };
          if (planned.kind === "insert") {
            const { stock: _initialStock, ...catalogPayload } = payload;
            const { data, error } = await supabase.from("items").insert({ ...catalogPayload, stock: 0 }).select("id, sku").single();
          if (error) throw new Error(`${row.sku}: ${error.message}`);
          skuToId.set(String(row.sku).trim().toLowerCase(), data.id);
          inserted++;
            await recordStock(data.id, stock);
          } else {
            const { stock: _ignoredStock, ...catalogPayload } = payload;
            const { error } = await supabase.from("items").update(catalogPayload).eq("id", planned.id);
            if (error) throw new Error(`${row.sku}: ${error.message}`);
            updated++;
            await recordStock(
              planned.id,
              stockMode === "add" ? Number(row.stock || 0) : stock,
              stockMode === "add" ? "add" : "set"
            );
        }
        tick();
      }

      await logAudit(actor, "inventory.import", "items", null, {
        file: fileName,
        inserted,
        updated,
        skipped,
        rehosted,
        imageWarnings,
        bomDropped,
        stockMode,
      }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      setResult({ inserted, updated, skipped, rehosted, imageWarnings, bomDropped });
      setPhase("done");
      toast.success(`Import complete — ${inserted} new, ${updated} updated`);
    } catch (err) {
      setPhase("preview");
      toast.error(err instanceof Error ? err.message : "Import failed midway — already-applied rows were kept");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50" onClick={onClose}>
      <div className="paper-card w-full max-w-2xl max-h-[90dvh] flex flex-col p-6 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between shrink-0">
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            <Upload className="w-5 h-5" /> Import inventory from another shop
          </h3>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === "pick" && (
          <div className="mt-4">
            <p className="text-sm text-ink-mute">
              Choose the shop's exported JSON (Settings → Export → inventory). Pictures,
              stock, cost, selling price and supplier records carry over; SKUs match
              existing items, BOM recipes are rewired automatically.
            </p>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} className="btn btn-primary w-full h-11 mt-4">
              <Upload className="w-4 h-4" /> Choose inventory JSON file
            </button>
          </div>
        )}

{phase === "preview" && (
          <div className="mt-4 min-h-0 flex flex-col gap-3 overflow-hidden">
            <div className="text-sm">
              <span className="font-semibold">{fileName}</span>
              <span className="text-ink-mute"> — {counts.inserted} new, {counts.updated} updates, {counts.skipped} skipped</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)} className="h-4 w-4" />
                Update existing (match by SKU)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-ink-mute text-xs">Stock:</span>
                {(["set", "add"] as StockMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setStockMode(m)}
                    className={`h-8 px-3 rounded-md text-xs font-semibold border ${stockMode === m ? "bg-ink text-paper" : "text-ink-mute"}`}>
                    {m === "set" ? "Replace" : "Add up"}
                  </button>
                ))}
              </div>
            </div>
            {fileWarnings.length > 0 && (
              <div className="rounded-md bg-yellow-reg/10 border border-yellow-reg/30 p-2 text-xs max-h-24 overflow-auto">
                {fileWarnings.slice(0, 20).map((w, i) => (
                  <div key={i} className="flex gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</div>
                ))}
              </div>
            )}
            <div className="overflow-auto border rounded-md max-h-56">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-paper">
                  <tr className="text-left text-ink-mute uppercase tracking-widest">
                    <th className="p-2">SKU</th><th className="p-2">Name</th>
                    <th className="p-2">Action</th><th className="p-2 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.slice(0, 100).map((p, i) => {
                    const row = p.kind === "skip" ? p.row : p.kind === "insert" ? p.row : p.row;
                    return (
                      <tr key={i} className="border-t border-line">
                        <td className="p-2 num">{String(row.sku)}</td>
                        <td className="p-2">{String(row.name)}</td>
                        <td className="p-2">{p.kind === "insert" ? "New" : p.kind === "update" ? "Update" : `Skip (${p.reason})`}</td>
                        <td className="p-2 text-right num">{String(row.stock ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { setPhase("pick"); setRows([]); }} className="btn btn-ghost flex-1" disabled={isRunning}>
                Different file
              </button>
              <button onClick={() => setPhase("columns")} disabled={isRunning || plan.length === 0} className="btn btn-primary flex-1 h-11">
                Choose columns to import
              </button>
            </div>
          </div>
        )}

        {phase === "columns" && (
          <div className="mt-4 min-h-0 flex flex-col gap-3 overflow-hidden">
            <div className="text-sm">
              <span className="font-semibold">Select columns to import</span>
              <span className="text-ink-mute"> — Choose which fields to include in the import</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)} className="h-4 w-4" />
                Update existing (match by SKU)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-ink-mute text-xs">Stock:</span>
                {(["set", "add"] as StockMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setStockMode(m)}
                    className={`h-8 px-3 rounded-md text-xs font-semibold border ${stockMode === m ? "bg-ink text-paper" : "text-ink-mute"}`}>
                    {m === "set" ? "Replace" : "Add up"}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-md bg-ink/5 border border-ink/10 p-3 max-h-64 overflow-auto">
              <p className="text-xs text-ink-mute mb-2">Select columns to import (uncheck to skip):</p>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                {[
                  { key: "sku", label: "SKU", required: true },
                  { key: "barcode", label: "Barcode", required: false },
                  { key: "name", label: "Name", required: true },
                  { key: "category", label: "Category", required: false },
                  { key: "price", label: "Selling Price", required: false },
                  { key: "cost", label: "Cost Price", required: false },
                  { key: "stock", label: "Stock Level", required: false },
                  { key: "base_unit", label: "Base Unit", required: false },
                  { key: "units", label: "Alternative Units", required: false },
                  { key: "bom", label: "Bill of Materials", required: false },
                  { key: "is_material", label: "Is Material", required: false },
                  { key: "item_type", label: "Item Type", required: false },
                  { key: "image_url", label: "Image URL", required: false },
                  { key: "suppliers", label: "Suppliers", required: false },
                  { key: "emoji", label: "Emoji", required: false },
                  { key: "low_stock_threshold", label: "Low Stock Threshold", required: false },
                  { key: "allow_decimal_qty", label: "Allow Decimal Qty", required: false },
                  { key: "purchase_unit", label: "Purchase Unit", required: false },
                  { key: "sale_unit", label: "Sale Unit", required: false },
                  { key: "preferred_supplier_name", label: "Preferred Supplier Name", required: false },
                ].map((col) => (
                  <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedColumns.has(col.key) || col.required}
                      onChange={(e) => {
                        if (col.required) return;
                        const next = new Set(selectedColumns);
                        if (e.target.checked) next.add(col.key);
                        else next.delete(col.key);
                        setSelectedColumns(next);
                      }}
                      disabled={col.required}
                      className="h-4 w-4"
                    />
                    <span className="flex items-center gap-1 text-sm">
                      {col.label}
                      {col.required && <span className="text-[10px] text-ink-mute">(required)</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setPhase("preview")} className="btn btn-ghost flex-1" disabled={isRunning}>
                Back
              </button>
              <button onClick={run} disabled={isRunning || plan.length === 0} className="btn btn-primary flex-1 h-11">
                Import {counts.inserted + counts.updated} items
              </button>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="mt-4 min-h-0 flex flex-col gap-3 overflow-hidden">
            <div className="h-2 rounded bg-ink/10 overflow-hidden">
              <div className="h-full bg-magenta-reg transition-all"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { setPhase("pick"); setRows([]); }} className="btn btn-ghost flex-1" disabled={isRunning}>
                Different file
              </button>
              <button onClick={run} disabled={isRunning || plan.length === 0} className="btn btn-primary flex-1 h-11">
                {isRunning ? `Importing ${progress.done}/${progress.total}…` : `Import ${counts.inserted + counts.updated} items`}
              </button>
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="mt-4 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
            <h4 className="font-display text-lg font-bold">Import finished</h4>
            <p className="text-sm text-ink-mute">
              {result.inserted} new · {result.updated} updated · {result.skipped} skipped ·
              {" "}{result.rehosted} pictures moved{result.imageWarnings > 0 && ` (${result.imageWarnings} kept original)`}
              {result.bomDropped > 0 && ` · ${result.bomDropped} BOM lines dropped (unknown materials)`}
            </p>
            <button onClick={onClose} className="btn btn-primary w-full h-11">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
