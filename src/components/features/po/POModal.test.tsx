// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import POModal from "./POModal";
import type { PurchaseOrder } from "@/types";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  mutateAsync: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
  items: [
    {
      id: "a",
      name: "Alpha",
      sku: "A",
      category: "General",
      price: 0,
      cost: 100,
      stock: 1,
      baseUnit: "pc",
      units: [],
      isMaterial: true,
      itemType: "material",
      productCategory: "goods",
      canPurchase: true,
      posVisible: false,
    },
    {
      id: "b",
      name: "Beta",
      sku: "B",
      category: "General",
      price: 0,
      cost: 200,
      stock: 1,
      baseUnit: "pc",
      units: [],
      isMaterial: false,
      itemType: "ready",
      productCategory: "goods",
      canPurchase: true,
      posVisible: true,
    },
    {
      id: "s",
      name: "Svc",
      sku: "S",
      category: "General",
      price: 0,
      cost: 0,
      stock: 0,
      baseUnit: "hr",
      units: [],
      isMaterial: false,
      itemType: "ready",
      productCategory: "service",
      canPurchase: false,
      posVisible: true,
    },
    {
      id: "k",
      name: "Kit",
      sku: "K",
      category: "General",
      price: 0,
      cost: 0,
      stock: 0,
      baseUnit: "pc",
      units: [],
      isMaterial: false,
      itemType: "product",
      productCategory: "kit",
      canPurchase: null,
      posVisible: true,
    },
  ],
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useItems", () => ({
  useItems: () => ({ data: mocks.items, refetch: mocks.refetch }),
}));
vi.mock("@/hooks/useShopSettings", () => ({
  useShopSettings: () => ({ data: { currency: "UGX", taxRate: 0 } }),
}));
vi.mock("@/hooks/usePurchaseOrders", () => ({
  useUpsertPO: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/useUnitConversions", () => ({
  useUnitConversions: () => ({ data: [] }),
}));
vi.mock("@/hooks/useUoms", () => ({ useUoms: () => ({ data: [] }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "u1", name: "Tester" } }),
}));
vi.mock("@/hooks/useSuppliers", () => ({
  useSuppliers: () => ({ data: [{ id: "sup1", name: "Acme Ltd" }] }),
}));

beforeEach(() => {
  mocks.refetch.mockClear();
  mocks.toast.error.mockClear();
  mocks.mutateAsync.mockReset();
  mocks.mutateAsync.mockResolvedValue(undefined);
});

afterEach(cleanup);

const addLine = () =>
  fireEvent.click(screen.getByRole("button", { name: /add line/i }));

/** One row renders a mobile and a desktop control, so each line has 2. */
const materialTriggers = () =>
  screen.getAllByRole("button", { name: "Material" });

const activeRows = () =>
  Array.from(document.querySelectorAll('[data-po-active="true"]'));

const chooseMaterial = (name: string) => {
  fireEvent.click(materialTriggers()[0]);
  fireEvent.click(screen.getByRole("option", { name }));
};

const chooseVendor = () => {
  fireEvent.click(screen.getByRole("button", { name: "Select supplier..." }));
  fireEvent.click(screen.getByRole("option", { name: "Acme Ltd" }));
};

const fillLine = (qty = "2", cost = "150") => {
  fireEvent.change(screen.getAllByLabelText(/quantity for Beta/i)[0], {
    target: { value: qty },
  });
  fireEvent.change(screen.getAllByLabelText(/unit cost for Beta/i)[0], {
    target: { value: cost },
  });
};

describe("POModal", () => {
  it("refetches the live catalog when it opens", () => {
    render(<POModal po={null} onClose={() => undefined} />);
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("offers every purchasable inventory item and excludes services and kits", () => {
    render(<POModal po={null} onClose={() => undefined} />);
    addLine();
    fireEvent.click(materialTriggers()[0]);

    expect(screen.getByRole("option", { name: "Beta" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Svc" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Kit" })).toBeNull();
  });

  it("starts a new line blank instead of borrowing the first item", () => {
    render(<POModal po={null} onClose={() => undefined} />);
    addLine();

    expect(materialTriggers()[0].textContent).toContain("Select material…");
    const qty = screen.getAllByLabelText(/quantity for new line/i)[0] as HTMLInputElement;
    const cost = screen.getAllByLabelText(/unit cost for new line/i)[0] as HTMLInputElement;
    expect(qty.value).toBe("");
    expect(cost.value).toBe("");
    // An incomplete row shows a dash, not a misleading 0.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("keeps the new line highlighted until another new line is created", () => {
    render(<POModal po={null} onClose={() => undefined} />);
    addLine();

    expect(activeRows()).toHaveLength(1);
    chooseMaterial("Beta");
    fillLine();
    // Editing the row must not remove its highlight.
    expect(activeRows()).toHaveLength(1);

    addLine();
    // Exactly one row is highlighted: the newer, prepended blank line.
    expect(activeRows()).toHaveLength(1);
    expect(materialTriggers()).toHaveLength(4);
    expect(materialTriggers()[0].textContent).toContain("Select material…");
    expect(materialTriggers()[2].textContent).toContain("Beta");
  });

  it("refuses to add another line while the highlighted line is incomplete", () => {
    render(<POModal po={null} onClose={() => undefined} />);
    addLine();

    // Second add is blocked: the blank row is still the only line.
    addLine();
    expect(materialTriggers()).toHaveLength(2);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Select a material")
    );

    // Completing every field unlocks the next line.
    chooseMaterial("Beta");
    fillLine();
    addLine();
    expect(materialTriggers()).toHaveLength(4);
  });

  it("shows the packing unit on an older saved line that has none", () => {
    const saved = {
      id: "po1",
      number: "PO-1",
      vendor: "Acme Ltd",
      status: "draft",
      expectedDate: null,
      notes: null,
      lines: [{ materialId: "a", name: "Alpha", qty: 1, unitCost: 100 }],
      subtotal: 100,
      tax: 0,
      total: 100,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as unknown as PurchaseOrder;

    render(<POModal po={saved} onClose={() => undefined} />);

    const units = screen.getAllByRole("button", { name: /order unit for alpha/i });
    expect(units[0].textContent).toContain("pc");
    // Only a freshly created line is highlighted.
    expect(activeRows()).toHaveLength(0);
  });

  it("refuses to save while any line still has an empty field", () => {
    render(<POModal po={null} onClose={() => undefined} />);
    chooseVendor();
    addLine();
    chooseMaterial("Beta");
    // Quantity and unit cost are still empty.

    fireEvent.submit(document.getElementById("po-form") as HTMLFormElement);

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Enter a quantity")
    );
  });
});
