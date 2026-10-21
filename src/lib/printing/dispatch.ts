import type { PrinterType, Sale, SalePayment, Settings } from "@/types";
import { buildReceiptBytes, buildTestPrintBytes, hasCashPayment, paperWidthMm, receiptCodepage } from "./receipt";
import {
  createTransport,
  PrintTransportError,
  type PrintTransport,
  type TransportDeps,
} from "./transport";

export type PrintOutcome = {
  bus: PrinterType;
  label: string;
  bytes: number;
  systemDialog: boolean;
};

export type DispatchDeps = TransportDeps & { transport?: PrintTransport };

const BUS_LABEL: Record<PrinterType, string> = {
  network: "Network",
  bluetooth: "Bluetooth",
  usb: "USB/Serial",
  system: "System",
};

function toTransportError(bus: PrinterType, error: unknown): PrintTransportError {
  if (error instanceof PrintTransportError) return error;
  const message = error instanceof Error ? error.message : "Printing failed";
  return new PrintTransportError(bus, message);
}

export async function sendBytes(
  bytes: Uint8Array,
  settings: Settings,
  deps: DispatchDeps = {},
): Promise<PrintOutcome> {
  const bus = settings.printer.printerType;
  if (bus === "system") {
    return { bus, label: BUS_LABEL[bus], bytes: 0, systemDialog: true };
  }
  const transport = deps.transport ?? createTransport(settings, deps);
  try {
    await transport.connect();
    await transport.write(bytes);
    return { bus, label: transport.label, bytes: bytes.length, systemDialog: false };
  } catch (error) {
    throw toTransportError(bus, error);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function printSaleReceipt(
  sale: Sale,
  settings: Settings,
  payments: readonly SalePayment[] = [],
  deps: DispatchDeps = {},
): Promise<PrintOutcome> {
  const bytes = buildReceiptBytes({
    sale,
    settings,
    payments,
    widthMm: paperWidthMm(settings),
    codepage: receiptCodepage(settings),
    openDrawer: settings.printer.openDrawer && hasCashPayment(sale, payments),
  });
  return sendBytes(bytes, settings, deps);
}

export async function testPrinter(settings: Settings, deps: DispatchDeps = {}): Promise<PrintOutcome> {
  const bytes = buildTestPrintBytes(settings, {
    widthMm: paperWidthMm(settings),
    codepage: receiptCodepage(settings),
  });
  return sendBytes(bytes, settings, deps);
}

export function describePrintError(error: unknown): string {
  if (error instanceof PrintTransportError) return `${BUS_LABEL[error.bus]}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Printing failed";
}
