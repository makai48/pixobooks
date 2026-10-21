import type { PrinterType, Settings } from "@/types";
import {
  bluetoothOptionalServices,
  PrintTransportError,
  deviceHost,
  type DeviceHost,
  type TransportDeps,
} from "./transport";

export type DiscoveredPrinter = {
  id: string;
  name: string;
  bus: PrinterType;
  detail: string;
  paired: boolean;
  host?: string;
  port?: number;
  vendorId?: number;
  productId?: number;
  deviceId?: string;
};

export type ScanNotice = { tone: "info" | "error"; text: string };

export const RAW_PRINT_PORT = 9100;

const SCAN_TIMEOUT_MS = 12000;
const HOST_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

function hexId(value: number): string {
  return `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function parseIpTarget(raw: string): { host: string; port: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  const withoutPath = withoutScheme.split("/")[0] ?? "";
  if (!withoutPath) return null;

  let host = withoutPath;
  let port = RAW_PRINT_PORT;

  if (withoutPath.startsWith("[")) {
    const end = withoutPath.indexOf("]");
    if (end < 0) return null;
    host = withoutPath.slice(1, end);
    const rest = withoutPath.slice(end + 1);
    if (rest) {
      if (!rest.startsWith(":")) return null;
      const parsed = Number(rest.slice(1));
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return null;
      port = parsed;
    }
  } else {
    const firstColon = withoutPath.indexOf(":");
    const lastColon = withoutPath.lastIndexOf(":");
    if (firstColon >= 0 && firstColon === lastColon) {
      host = withoutPath.slice(0, lastColon);
      const parsed = Number(withoutPath.slice(lastColon + 1));
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return null;
      port = parsed;
    }
  }

  if (!host || host.length > 253) return null;
  if (host.includes(":")) {
    if (!IPV6_PATTERN.test(host)) return null;
  } else if (!HOST_PATTERN.test(host)) {
    return null;
  }
  return { host, port };
}

export function composeIpTarget(host: string, port: number): string {
  const clean = host.trim();
  if (!clean) return "";
  const safePort = Number.isInteger(port) && port > 0 && port <= 65535 ? port : RAW_PRINT_PORT;
  return clean.includes(":") ? `[${clean}]:${safePort}` : `${clean}:${safePort}`;
}

export function bridgeScanUrl(bridgeUrl: string): string | null {
  const base = bridgeUrl.trim().replace(/\/+$/, "");
  if (!base) return null;
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return `${base}/devices`;
}

export function parseScanResponse(payload: unknown): DiscoveredPrinter[] {
  const root = asRecord(payload);
  const list = Array.isArray(payload) ? payload : root?.devices;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const devices: DiscoveredPrinter[] = [];

  for (const entry of list) {
    const record = asRecord(entry);
    if (!record) continue;
    const rawHost = pickString(record, ["host", "ip", "address", "ipAddress"]);
    if (!rawHost) continue;
    const parsedHost = parseIpTarget(rawHost);
    if (!parsedHost) continue;
    const rawPort = record.port;
    const port =
      typeof rawPort === "number" && Number.isFinite(rawPort) ? Math.round(rawPort) : parsedHost.port;
    if (port < 1 || port > 65535) continue;
    const id = composeIpTarget(parsedHost.host, port);
    if (seen.has(id)) continue;
    seen.add(id);
    const name = pickString(record, ["name", "deviceName", "model"]) ?? parsedHost.host;
    const model = pickString(record, ["model"]);
    const detail = model && model !== name ? `${model} · ${id}` : `${id} · ESC/POS raw TCP`;
    devices.push({
      id,
      name,
      bus: "network",
      detail,
      paired: false,
      host: parsedHost.host,
      port,
    });
  }

  return devices;
}

export async function listPairedBluetoothPrinters(
  host: DeviceHost | null = deviceHost(),
): Promise<DiscoveredPrinter[]> {
  const bluetooth = host?.bluetooth;
  if (!bluetooth?.getDevices) return [];
  try {
    const devices = await bluetooth.getDevices();
    return devices.map((device) => {
      const name = device.name || "Unnamed Bluetooth printer";
      return {
        id: device.id || name,
        name,
        bus: "bluetooth" as const,
        detail: device.id ? `Paired · ${device.id}` : "Paired in this browser",
        paired: true,
        deviceId: device.id,
      };
    });
  } catch {
    return [];
  }
}

export async function requestBluetoothPrinter(
  settings: Settings,
  host: DeviceHost | null = deviceHost(),
): Promise<DiscoveredPrinter> {
  const bluetooth = host?.bluetooth;
  if (!bluetooth) {
    throw new PrintTransportError("bluetooth", "Web Bluetooth is unavailable. Use Chrome or Edge over HTTPS.");
  }
  const serviceUuid = settings.printer.bluetoothService ?? "";
  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: bluetoothOptionalServices(serviceUuid),
  });
  const name = device.name || "Bluetooth printer";
  return {
    id: device.id || name,
    name,
    bus: "bluetooth",
    detail: device.id ? `Paired · ${device.id}` : "Paired in this browser",
    paired: true,
    deviceId: device.id,
  };
}

export async function listUsbPrinters(
  host: DeviceHost | null = deviceHost(),
): Promise<DiscoveredPrinter[]> {
  const usb = host?.usb;
  if (!usb?.getDevices) return [];
  try {
    const devices = await usb.getDevices();
    return devices.map((device, index) => {
      const vendorId = device.vendorId;
      const productId = device.productId;
      const name =
        device.productName || device.manufacturerName || `USB printer ${index + 1}`;
      const ids =
        typeof vendorId === "number"
          ? `${hexId(vendorId)}:${hexId(productId ?? 0)}`
          : "USB device";
      return {
        id: `usb-${vendorId ?? "x"}-${productId ?? index}`,
        name,
        bus: "usb" as const,
        detail: `Granted in this browser · ${ids}`,
        paired: true,
        vendorId,
        productId,
      };
    });
  } catch {
    return [];
  }
}

export async function listSerialPrinters(
  host: DeviceHost | null = deviceHost(),
): Promise<DiscoveredPrinter[]> {
  const serial = host?.serial;
  if (!serial?.getPorts) return [];
  try {
    const ports = await serial.getPorts();
    return ports.map((port, index) => {
      const info = port.getInfo?.() ?? {};
      const vendorId = info?.usbVendorId;
      const productId = info?.usbProductId;
      const ids =
        typeof vendorId === "number"
          ? `${hexId(vendorId)}:${hexId(productId ?? 0)}`
          : `Port ${index + 1}`;
      return {
        id: `serial-${vendorId ?? "x"}-${productId ?? index}`,
        name: `Serial printer · ${ids}`,
        bus: "usb" as const,
        detail: "Granted serial port in this browser",
        paired: true,
        vendorId,
        productId,
      };
    });
  } catch {
    return [];
  }
}

export async function pairUsbPrinter(
  host: DeviceHost | null = deviceHost(),
): Promise<DiscoveredPrinter> {
  const usb = host?.usb;
  if (usb) {
    const device = await usb.requestDevice({ acceptAllDevices: true });
    const name = device.productName || device.manufacturerName || "USB printer";
    const ids =
      typeof device.vendorId === "number"
        ? `${hexId(device.vendorId)}:${hexId(device.productId ?? 0)}`
        : "USB device";
    return {
      id: `usb-${device.vendorId ?? "x"}-${device.productId ?? "x"}`,
      name,
      bus: "usb",
      detail: `Granted in this browser · ${ids}`,
      paired: true,
      vendorId: device.vendorId,
      productId: device.productId,
    };
  }
  const serial = host?.serial;
  if (!serial) {
    throw new PrintTransportError("usb", "WebUSB and Web Serial are unavailable. Use Chrome or Edge over HTTPS.");
  }
  const port = await serial.requestPort();
  const info = port.getInfo?.() ?? {};
  const vendorId = info?.usbVendorId;
  const productId = info?.usbProductId;
  const ids =
    typeof vendorId === "number" ? `${hexId(vendorId)}:${hexId(productId ?? 0)}` : "Serial port";
  return {
    id: `serial-${vendorId ?? "x"}-${productId ?? "x"}`,
    name: `Serial printer · ${ids}`,
    bus: "usb",
    detail: "Granted serial port in this browser",
    paired: true,
    vendorId,
    productId,
  };
}

export async function scanNetworkPrinters(
  settings: Settings,
  deps: TransportDeps = {},
): Promise<DiscoveredPrinter[]> {
  const url = bridgeScanUrl(settings.printer.bridgeUrl ?? "");
  if (!url) {
    throw new PrintTransportError("network", "Set a valid print-bridge URL before scanning the network.");
  }
  const fetchImpl = deps.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!fetchImpl) {
    throw new PrintTransportError("network", "Network requests are unavailable here.");
  }
  const token = (settings.printer.bridgeToken ?? "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? SCAN_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new PrintTransportError("network", `Bridge scan failed with ${response.status}`);
    }
    const payload: unknown = await response.json();
    return parseScanResponse(payload);
  } catch (error) {
    if (error instanceof PrintTransportError) throw error;
    throw new PrintTransportError(
      "network",
      error instanceof Error ? error.message : "Bridge scan failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function listSavedPrinters(
  bus: PrinterType,
  settings: Settings,
  deps: TransportDeps = {},
): Promise<DiscoveredPrinter[]> {
  const host = deps.host ?? deviceHost();
  if (bus === "bluetooth") return listPairedBluetoothPrinters(host);
  if (bus === "usb") {
    return host?.usb ? listUsbPrinters(host) : listSerialPrinters(host);
  }
  if (bus === "network") {
    if (!bridgeScanUrl(settings.printer.bridgeUrl ?? "")) return [];
    return scanNetworkPrinters(settings, deps);
  }
  return [];
}

export function mergeDiscovered(
  current: DiscoveredPrinter[],
  incoming: DiscoveredPrinter[],
): DiscoveredPrinter[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

export function emptyDiscoveryNotice(bus: PrinterType, settings: Settings): ScanNotice {
  if (bus === "bluetooth") {
    return {
      tone: "info",
      text: "No paired printers yet. Choose Scan to pair a Bluetooth printer with this browser.",
    };
  }
  if (bus === "usb") {
    return {
      tone: "info",
      text: "No USB or serial printers granted yet. Choose Scan to pair one with this browser.",
    };
  }
  if (bus === "network") {
    return bridgeScanUrl(settings.printer.bridgeUrl ?? "")
      ? { tone: "info", text: "The bridge found no printers. Check the address or add one manually." }
      : {
          tone: "info",
          text: "Add a bridge URL below to enable automatic LAN discovery, or enter the printer IP manually.",
        };
  }
  return { tone: "info", text: "No devices to discover for this connection bus." };
}
