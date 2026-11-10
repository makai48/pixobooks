import { describe, expect, it, vi } from "vitest";
import { describePrintError, printSaleReceipt, sendBytes, testPrinter } from "@/lib/printing/dispatch";
import { PrintTransportError, type PrintTransport } from "@/lib/printing/transport";
import type { Sale, Settings } from "@/types";

function makeSettings(): Settings {
  const base: Settings = {
    shopName: "Pixo Books",
    currency: "USD",
    taxRate: 10,
    logoUrl: null,
    address: "12 Market Street",
    phone: "555-0100",
    email: "shop@pixo.test",
    categories: ["General"],
    dateFormat: "DD/MM/YYYY",
    expenseCategories: [],
    country: "US",
    timezone: "UTC",
    businessType: "retail",
    digitGrouping: "western",
    decimalPlaces: 2,
    thousandSeparator: ",",
    decimalSeparator: ".",
    mobile: "555-0199",
    officePhone: "555-0100",
    whatsapp: "555-0199",
    termsVersion: "1",
    privacyVersion: "1",
    receipt: { header: "Welcome", footer: "Thank you", showLogo: false, paperWidthMm: 80 },
    invoice: { prefix: "INV", nextNumber: 1, terms: "Net 30" },
    printer: {
      deviceName: "Test Printer",
      printerType: "network",
      paperSize: "80mm",
      ipAddress: "192.168.1.50",
      autoPrint: false,
      openDrawer: false,
    },
    loyalty: { enabled: false, pointsPerDollar: 1, dollarPerPoint: 100 },
    discount: { type: "percentage", allowLine: true, allowOrder: true, maxPct: 100, maxAmount: 1000 },
    theme: { mode: "light", preset: "default", primary: "#000000", accent: "#ffffff" },
  };
  return base;
}

function makeSale(overrides: Partial<Sale> = {}): Sale {
  const base: Sale = {
    id: "sale-1",
    number: "S-1001",
    createdAt: "2026-10-21T14:05:00Z",
    cashierId: "user-1",
    cashierName: "Ama",
    customerId: null,
    customerName: null,
    lines: [{ itemId: "item-1", name: "Notebook", qty: 2, unitPrice: 10, discountPct: 0 }],
    subtotal: 20,
    lineDiscountTotal: 0,
    orderDiscountPct: 0,
    orderDiscountValue: 0,
    tax: 2,
    total: 22,
    cost: 10,
    profit: 12,
    paymentMethod: "cash",
    paymentStatus: "paid",
    documentType: "receipt",
    amountPaid: 22,
    amountDue: 0,
    dueDate: null,
    loyaltyEarned: 0,
    loyaltyRedeemed: 0,
    branchId: null,
  };
  return Object.assign(base, overrides);
}

function makeTransport(writeImpl: (bytes: Uint8Array) => Promise<void> = async () => undefined) {
  const connect = vi.fn(async () => undefined);
  const write = vi.fn(writeImpl);
  const close = vi.fn(async () => undefined);
  const transport: PrintTransport = { id: "network", label: "Fake", connect, write, close };
  return { transport, connect, write, close };
}

describe("sendBytes", () => {
  it("returns a system dialog outcome without touching a transport", async () => {
    const settings = makeSettings();
    settings.printer.printerType = "system";
    const fake = makeTransport();

    const outcome = await sendBytes(Uint8Array.of(0x1b, 0x40), settings, { transport: fake.transport });

    expect(outcome).toEqual({ bus: "system", label: "System", bytes: 0, systemDialog: true });
    expect(fake.connect).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.close).not.toHaveBeenCalled();
  });

  it("connects, writes the payload, and closes the transport", async () => {
    const settings = makeSettings();
    const fake = makeTransport();
    const payload = Uint8Array.of(0x1b, 0x40);

    const outcome = await sendBytes(payload, settings, { transport: fake.transport });

    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(fake.write).toHaveBeenCalledTimes(1);
    expect(fake.write.mock.calls[0][0]).toBe(payload);
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ bus: "network", label: "Fake", bytes: 2, systemDialog: false });
  });

  it("wraps write failures and still closes the transport", async () => {
    const settings = makeSettings();
    const fake = makeTransport(async () => {
      throw new Error("paper jam");
    });

    const error = await sendBytes(Uint8Array.of(0x1b, 0x40), settings, { transport: fake.transport }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PrintTransportError);
    expect(error).toMatchObject({ bus: "network", message: "paper jam" });
    expect(fake.close).toHaveBeenCalledTimes(1);
  });
});

describe("printSaleReceipt", () => {
  it("encodes the receipt and reports the byte count", async () => {
    const settings = makeSettings();
    const fake = makeTransport();

    const outcome = await printSaleReceipt(makeSale(), settings, [], { transport: fake.transport });

    expect(fake.write).toHaveBeenCalledTimes(1);
    const sent = fake.write.mock.calls[0][0];
    expect(sent.length).toBeGreaterThan(0);
    expect(Array.from(sent.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(outcome.bytes).toBe(sent.length);
    expect(outcome.bus).toBe("network");
    expect(outcome.systemDialog).toBe(false);
  });
});

describe("testPrinter", () => {
  it("sends a test page through the transport", async () => {
    const settings = makeSettings();
    const fake = makeTransport();

    const outcome = await testPrinter(settings, { transport: fake.transport });

    expect(fake.write).toHaveBeenCalledTimes(1);
    expect(outcome.bytes).toBeGreaterThan(0);
    expect(outcome.label).toBe("Fake");
  });
});

describe("describePrintError", () => {
  it("labels transport errors with their bus", () => {
    expect(describePrintError(new PrintTransportError("bluetooth", "no device"))).toBe("Bluetooth: no device");
  });

  it("passes through plain error messages", () => {
    expect(describePrintError(new Error("boom"))).toBe("boom");
  });

  it("falls back for unknown values", () => {
    expect(describePrintError("nope")).toBe("Printing failed");
  });
});
