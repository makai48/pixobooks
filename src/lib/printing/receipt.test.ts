import { describe, expect, it } from "vitest";
import {
  buildReceiptBytes,
  buildTestPrintBytes,
  formatAmount,
  formatPct,
  formatQty,
  formatStamp,
  hasCashPayment,
  lineTotal,
  padPair,
  paperWidthMm,
  receiptCodepage,
  receiptColumns,
  wrapText,
} from "@/lib/printing/receipt";
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

const decode = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes);

describe("receipt formatters", () => {
  it("formats money with grouping and two decimals", () => {
    expect(formatAmount(22)).toBe("22.00");
    expect(formatAmount(1234.5)).toBe("1,234.50");
    expect(formatAmount(-1234.567)).toBe("-1,234.57");
    expect(formatAmount(999.999)).toBe("1,000.00");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(Number.NaN)).toBe("0.00");
  });

  it("formats percentages and quantities", () => {
    expect(formatPct(12.5)).toBe("12.5%");
    expect(formatPct(Number.NaN)).toBe("0%");
    expect(formatQty(2)).toBe("2");
    expect(formatQty(1.5)).toBe("1.5");
    expect(formatQty(1.23456)).toBe("1.235");
  });

  it("formats timestamps in the requested zone and passes through invalid input", () => {
    expect(formatStamp("2026-10-21T14:05:00Z", "UTC")).toBe("21 Oct 2026 14:05");
    expect(formatStamp("not-a-date")).toBe("not-a-date");
  });
});

describe("layout helpers", () => {
  it("wraps text on word boundaries and splits long words", () => {
    expect(wrapText("alpha beta gamma", 11)).toEqual(["alpha beta", "gamma"]);
    expect(wrapText("abcdefghijklmnop", 10)).toEqual(["abcdefghij", "klmnop"]);
    expect(wrapText("", 10)).toEqual([""]);
  });

  it("pads a label and value pair to the column width", () => {
    const row = padPair("Total", "1,000.00", 20);
    expect(row).toHaveLength(20);
    expect(row.endsWith("1,000.00")).toBe(true);
  });

  it("computes line totals net of the line discount", () => {
    expect(lineTotal({ itemId: "i", name: "N", qty: 2, unitPrice: 10, discountPct: 10 })).toBeCloseTo(18, 10);
  });

  it("detects cash payments on the sale or its payment rows", () => {
    const cashSale = makeSale();
    const cardSale = makeSale({ paymentMethod: "card" });
    expect(hasCashPayment(cashSale)).toBe(true);
    expect(hasCashPayment(cardSale)).toBe(false);
    expect(
      hasCashPayment(cardSale, [
        { id: "p1", saleId: cardSale.id, amount: 22, paymentMethod: "cash", createdAt: cardSale.createdAt },
      ]),
    ).toBe(true);
  });
});

describe("printer settings resolution", () => {
  it("maps paper sizes and receipt widths to columns", () => {
    expect(receiptColumns(58)).toBe(32);
    expect(receiptColumns(80)).toBe(48);
    expect(receiptColumns(99)).toBe(64);
  });

  it("prefers the printer paper size over the receipt width", () => {
    const settings = makeSettings();
    expect(paperWidthMm(settings)).toBe(80);
    settings.printer.paperSize = "58mm";
    expect(paperWidthMm(settings)).toBe(58);
    settings.printer.paperSize = "A4";
    settings.receipt.paperWidthMm = 58;
    expect(paperWidthMm(settings)).toBe(58);
  });

  it("defaults the codepage to cp1252", () => {
    const settings = makeSettings();
    expect(receiptCodepage(settings)).toBe("cp1252");
    settings.printer.codepage = "cp858";
    expect(receiptCodepage(settings)).toBe("cp858");
  });
});

describe("buildReceiptBytes", () => {
  it("emits init, codepage, header, totals, and a cut", () => {
    const settings = makeSettings();
    const sale = makeSale();
    const out = buildReceiptBytes({ sale, settings });
    const text = decode(out);
    expect(Array.from(out.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x10]);
    expect(text).toContain("Pixo Books");
    expect(text).toContain("SALES RECEIPT");
    expect(text).toContain("TOTAL");
    expect(text).toContain("22.00");
    expect(Array.from(out.slice(-3))).toEqual([0x1d, 0x56, 0x01]);
  });

  it("labels invoices and honors an explicit narrow width", () => {
    const settings = makeSettings();
    const sale = makeSale({ documentType: "invoice" });
    const out = buildReceiptBytes({ sale, settings, widthMm: 58 });
    const text = decode(out);
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain("-".repeat(32));
  });

  it("kicks the drawer for cash sales when enabled", () => {
    const settings = makeSettings();
    settings.printer.openDrawer = true;
    const out = buildReceiptBytes({ sale: makeSale(), settings });
    expect(Array.from(out.slice(-8))).toEqual([0x1b, 0x70, 0, 25, 250, 0x1d, 0x56, 0x01]);
  });
});

describe("buildTestPrintBytes", () => {
  it("prints device details and a sample line", () => {
    const settings = makeSettings();
    const out = buildTestPrintBytes(settings);
    const text = decode(out);
    expect(Array.from(out.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x10]);
    expect(text).toContain("PRINTER TEST");
    expect(text).toContain("Codepage");
    expect(text).toContain("cp1252");
    expect(Array.from(out.slice(-6))).toEqual([0x1b, 0x64, 3, 0x1d, 0x56, 0x01]);
  });
});
