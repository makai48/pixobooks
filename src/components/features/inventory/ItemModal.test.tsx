// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import ItemModal from "./ItemModal";

const mocks = vi.hoisted(() => ({
  refetchSuppliers: vi.fn(),
  suppliers: [{ id: "sup1", name: "Acme Ltd", phone: null, email: null }],
}));

vi.mock("@/hooks/useItems", () => ({
  useItems: () => ({ data: [] }),
  useUpsertItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useShopSettings", () => ({
  useShopSettings: () => ({ data: { currency: "UGX", categories: ["General"] } }),
}));
vi.mock("@/hooks/useUnitConversions", () => ({
  useUnitConversions: () => ({ data: [] }),
}));
vi.mock("@/hooks/useUoms", () => ({ useUoms: () => ({ data: [] }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "u1", name: "Tester" } }),
}));
vi.mock("@/hooks/useSuppliers", () => ({
  useSuppliers: () => ({
    data: mocks.suppliers,
    refetch: mocks.refetchSuppliers,
  }),
  useUpsertSupplier: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe("ItemModal channels and supplier", () => {
  it("hides Sale Price as soon as Point of Sale is unchecked", () => {
    render(<ItemModal item={null} onClose={() => undefined} />);

    expect(screen.getByLabelText(/sale price/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/point of sale/i));
    expect(screen.queryByLabelText(/sale price/i)).toBeNull();
  });

  it("lists the full supplier register and opens the add-supplier sheet", () => {
    render(<ItemModal item={null} onClose={() => undefined} />);

    const supplierInput = screen.getByLabelText(/preferred supplier/i);
    fireEvent.focus(supplierInput);
    expect(screen.getByRole("option", { name: "Acme Ltd" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /new$/i }));
    expect(screen.getByText("Add a supplier")).toBeTruthy();
    expect(mocks.refetchSuppliers).toHaveBeenCalled();
  });
});
