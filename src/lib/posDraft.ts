import type { Item, SaleLine } from "@/types";

export type PosDraft = {
  lines: SaleLine[];
  customerId: string;
  orderDiscountPct: number;
  orderDiscountAmount: number;
  loyaltyRedeem: number;
};

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const POS_DRAFT_STORAGE_KEY = "pixobooks:pos_draft";
export const POS_DRAFT_VERSION = 1;

export function emptyPosDraft(): PosDraft {
  return {
    lines: [],
    customerId: "",
    orderDiscountPct: 0,
    orderDiscountAmount: 0,
    loyaltyRedeem: 0,
  };
}

export function isDraftEmpty(draft: PosDraft): boolean {
  return (
    draft.lines.length === 0 &&
    !draft.customerId &&
    draft.orderDiscountPct === 0 &&
    draft.orderDiscountAmount === 0 &&
    draft.loyaltyRedeem === 0
  );
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toPercent(value: unknown): number {
  return Math.min(100, Math.max(0, toNumber(value)));
}

function toLine(value: unknown): SaleLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const itemId = toText(row.itemId).trim();
  if (!itemId) return null;
  const unit = toText(row.unit).trim();
  const factor = row.unitFactor;
  const line: SaleLine = {
    itemId,
    name: toText(row.name, itemId),
    qty: Math.max(0, toNumber(row.qty)),
    unitPrice: Math.max(0, toNumber(row.unitPrice)),
    discountPct: toPercent(row.discountPct),
  };
  if (unit) line.unit = unit;
  if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) {
    line.unitFactor = factor;
  }
  return line;
}

export function parsePosDraft(raw: string | null): PosDraft {
  if (!raw) return emptyPosDraft();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyPosDraft();
  }
  if (!data || typeof data !== "object") return emptyPosDraft();
  const record = data as Record<string, unknown>;
  if (Math.round(toNumber(record.version)) !== POS_DRAFT_VERSION) return emptyPosDraft();
  const rows = Array.isArray(record.lines) ? record.lines : [];
  const lines = rows
    .map(toLine)
    .filter((line): line is SaleLine => line !== null);
  return {
    lines,
    customerId: toText(record.customerId),
    orderDiscountPct: toPercent(record.orderDiscountPct),
    orderDiscountAmount: Math.max(0, toNumber(record.orderDiscountAmount)),
    loyaltyRedeem: Math.max(0, Math.round(toNumber(record.loyaltyRedeem))),
  };
}

export function serializePosDraft(draft: PosDraft): string {
  return JSON.stringify({
    version: POS_DRAFT_VERSION,
    lines: draft.lines.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      qty: line.qty,
      unit: line.unit ?? null,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      unitFactor: line.unitFactor ?? null,
    })),
    customerId: draft.customerId,
    orderDiscountPct: draft.orderDiscountPct,
    orderDiscountAmount: draft.orderDiscountAmount,
    loyaltyRedeem: draft.loyaltyRedeem,
    savedAt: new Date().toISOString(),
  });
}

export function loadPosDraft(storage: DraftStorage | null | undefined): PosDraft {
  if (!storage) return emptyPosDraft();
  try {
    return parsePosDraft(storage.getItem(POS_DRAFT_STORAGE_KEY));
  } catch {
    return emptyPosDraft();
  }
}

export function savePosDraft(
  storage: DraftStorage | null | undefined,
  draft: PosDraft
): boolean {
  if (!storage) return false;
  try {
    if (isDraftEmpty(draft)) {
      storage.removeItem(POS_DRAFT_STORAGE_KEY);
    } else {
      storage.setItem(POS_DRAFT_STORAGE_KEY, serializePosDraft(draft));
    }
    return true;
  } catch {
    return false;
  }
}

export function clearPosDraft(storage: DraftStorage | null | undefined): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(POS_DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function reconcilePosDraftLines(
  lines: SaleLine[],
  items: Item[]
): { lines: SaleLine[]; dropped: number } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next: SaleLine[] = [];
  let dropped = 0;
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) {
      dropped += 1;
      continue;
    }
    const unit = (item.saleUnit || item.baseUnit || "").trim();
    next.push({
      ...line,
      name: item.name,
      unitPrice: item.price,
      ...(unit ? { unit } : {}),
    });
  }
  return { lines: next, dropped };
}
