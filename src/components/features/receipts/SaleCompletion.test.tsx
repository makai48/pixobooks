// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, screen, act, cleanup } from "@testing-library/react";
import SaleCompletion from "./SaleCompletion";
import type { Sale } from "@/types";

const sale = {
  id: "sale-1",
  number: "RPB-261108100000000",
  createdAt: "2026-11-08T10:00:00.000Z",
  cashierId: null,
  cashierName: "Mark Young",
  customerName: "Walk-in Customer",
  lines: [],
  subtotal: 0,
  lineDiscountTotal: 0,
  orderDiscountPct: 0,
  orderDiscountValue: 0,
  tax: 0,
  total: 0,
  cost: 0,
  profit: 0,
  paymentMethod: "cash",
  paymentStatus: "paid",
  documentType: "receipt",
  amountPaid: 0,
  amountDue: 0,
  loyaltyEarned: 0,
  loyaltyRedeemed: 0,
} as unknown as Sale;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SaleCompletion", () => {
  it("shows the completed circle and the receipt number", () => {
    render(
      <SaleCompletion sale={sale} delayMs={1500} onDone={() => undefined} />
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(sale.number)).toBeTruthy();
    expect(document.querySelector(".sc-check")).toBeTruthy();
  });

  it("clears itself after the configured popup delay", async () => {
    const onDone = vi.fn();
    render(<SaleCompletion sale={sale} delayMs={1500} onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("clears immediately when tapped", async () => {
    const onDone = vi.fn();
    render(<SaleCompletion sale={sale} delayMs={3000} onDone={onDone} />);
    fireEvent.pointerDown(screen.getByRole("status"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("never fires twice after the timer and a tap", async () => {
    const onDone = vi.fn();
    render(<SaleCompletion sale={sale} delayMs={1000} onDone={onDone} />);
    fireEvent.pointerDown(screen.getByRole("status"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
