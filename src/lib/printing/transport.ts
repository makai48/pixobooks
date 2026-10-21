import type { PrinterType, Settings } from "@/types";

export type PrintTransport = {
  id: PrinterType;
  label: string;
  connect: () => Promise<void>;
  write: (bytes: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
};

export class PrintTransportError extends Error {
  readonly bus: PrinterType;

  constructor(bus: PrinterType, message: string) {
    super(message);
    this.name = "PrintTransportError";
    this.bus = bus;
  }
}

type UsbEndpointLike = {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
};

type UsbAlternateLike = { endpoints: UsbEndpointLike[] };

type UsbInterfaceLike = { interfaceNumber: number; alternate: UsbAlternateLike };

type UsbConfigurationLike = { interfaces: UsbInterfaceLike[] };

type UsbDeviceLike = {
  vendorId?: number;
  productId?: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
  configuration: UsbConfigurationLike | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (value: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  releaseInterface: (interfaceNumber: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: Uint8Array) => Promise<unknown>;
};

type UsbLike = {
  requestDevice: (options: { filters?: Array<{ vendorId?: number; productId?: number }>; acceptAllDevices?: boolean }) => Promise<UsbDeviceLike>;
  getDevices?: () => Promise<UsbDeviceLike[]>;
};

type SerialPortInfoLike = { usbVendorId?: number; usbProductId?: number };

type SerialPortLike = {
  getInfo?: () => SerialPortInfoLike | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable: { getWriter: () => { write: (chunk: Uint8Array) => Promise<void>; releaseLock: () => void } } | null;
};

type SerialLike = {
  requestPort: (options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }) => Promise<SerialPortLike>;
  getPorts?: () => Promise<SerialPortLike[]>;
};

type BluetoothCharacteristicLike = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue: (value: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (value: Uint8Array) => Promise<void>;
};

type BluetoothServiceLike = { getCharacteristics: () => Promise<BluetoothCharacteristicLike[]> };

type BluetoothServerLike = {
  connect: () => Promise<BluetoothServerLike>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<BluetoothServiceLike>;
  getPrimaryServices: () => Promise<BluetoothServiceLike[]>;
};

type BluetoothDeviceLike = {
  id?: string;
  name?: string;
  gatt: BluetoothServerLike | null;
};

type BluetoothLike = {
  requestDevice: (options: { acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<BluetoothDeviceLike>;
  getDevices?: () => Promise<BluetoothDeviceLike[]>;
};

export type DeviceHost = {
  usb?: UsbLike;
  serial?: SerialLike;
  bluetooth?: BluetoothLike;
  isSecureContext?: boolean;
};

export type Capability = { supported: boolean; detail: string };

export type TransportCapabilities = Record<PrinterType, Capability>;

export type TransportDeps = {
  host?: DeviceHost | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const NETWORK_TIMEOUT_MS = 12000;
const BLUETOOTH_CHUNK = 20;
const USB_CHUNK = 4096;
const SERIAL_CHUNK = 256;
const DEFAULT_BLUETOOTH_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";

export const BLUETOOTH_PRINTER_SERVICES = [
  DEFAULT_BLUETOOTH_SERVICE,
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
] as const;

export function bluetoothOptionalServices(serviceUuid: string): string[] {
  const normalized = normalizeUuid(serviceUuid);
  return [...new Set([normalized || DEFAULT_BLUETOOTH_SERVICE, ...BLUETOOTH_PRINTER_SERVICES])];
}

export function deviceHost(): DeviceHost | null {
  if (typeof navigator === "undefined") return null;
  return navigator as unknown as DeviceHost;
}

export function detectCapabilities(host: DeviceHost | null = deviceHost()): TransportCapabilities {
  const secure = host ? host.isSecureContext !== false : false;
  const hasUsb = Boolean(host?.usb) && secure;
  const hasSerial = Boolean(host?.serial) && secure;
  const hasBluetooth = Boolean(host?.bluetooth) && secure;
  return {
    network: { supported: true, detail: "Sends ESC/POS bytes to a LAN bridge" },
    bluetooth: hasBluetooth
      ? { supported: true, detail: "Web Bluetooth available" }
      : { supported: false, detail: secure ? "Browser lacks Web Bluetooth" : "Requires HTTPS" },
    usb: hasUsb || hasSerial
      ? { supported: true, detail: hasUsb ? "WebUSB available" : "Web Serial available" }
      : { supported: false, detail: secure ? "Browser lacks WebUSB / Web Serial" : "Requires HTTPS" },
    system: { supported: true, detail: "Uses the browser print dialog" },
  };
}

export function normalizeUuid(value: string): string {
  const raw = value.trim().toLowerCase().replace(/^0x/, "");
  if (!raw) return "";
  if (/^[0-9a-f]{4}$/.test(raw)) return `0000${raw}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}$/.test(raw)) return `${raw}-0000-1000-8000-00805f9b34fb`;
  return raw;
}

export function createNetworkTransport(settings: Settings, deps: TransportDeps = {}): PrintTransport {
  const url = (settings.printer.bridgeUrl ?? "").trim();
  const token = (settings.printer.bridgeToken ?? "").trim();
  const endpoint = (settings.printer.ipAddress ?? "").trim();
  const fetchImpl = deps.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);

  const requireEndpoint = (): string => {
    if (!url) {
      throw new PrintTransportError(
        "network",
        endpoint
          ? `Set a print-bridge URL for ${endpoint}. Browsers cannot open a raw printer socket.`
          : "Set a print-bridge URL in Printer settings.",
      );
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
    } catch {
      throw new PrintTransportError("network", `Bridge URL must be an http(s) address: ${url}`);
    }
    if (!fetchImpl) throw new PrintTransportError("network", "Network requests are unavailable here.");
    return url;
  };

  return {
    id: "network",
    label: "Network bridge",
    async connect() {
      requireEndpoint();
    },
    async write(bytes) {
      const target = requireEndpoint();
      if (!fetchImpl) throw new PrintTransportError("network", "Network requests are unavailable here.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? NETWORK_TIMEOUT_MS);
      try {
        const response = await fetchImpl(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: bytes.slice(),
          signal: controller.signal,
        });
        if (!response.ok) throw new PrintTransportError("network", `Bridge responded with ${response.status}`);
      } catch (error) {
        if (error instanceof PrintTransportError) throw error;
        throw new PrintTransportError("network", error instanceof Error ? error.message : "Bridge request failed");
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      return undefined;
    },
  };
}

export function createBluetoothTransport(settings: Settings, deps: TransportDeps = {}): PrintTransport {
  const bluetooth = (deps.host ?? deviceHost())?.bluetooth;
  const serviceUuid = normalizeUuid(settings.printer.bluetoothService ?? "") || DEFAULT_BLUETOOTH_SERVICE;
  const optionalServices = bluetoothOptionalServices(serviceUuid);
  const savedId = (settings.printer.bluetoothMac ?? "").trim();
  let device: BluetoothDeviceLike | null = null;
  let characteristic: BluetoothCharacteristicLike | null = null;

  return {
    id: "bluetooth",
    label: "Bluetooth printer",
    async connect() {
      if (!bluetooth) throw new PrintTransportError("bluetooth", "Web Bluetooth is unavailable. Use Chrome or Edge over HTTPS.");
      let selected: BluetoothDeviceLike | null = null;
      if (savedId && bluetooth.getDevices) {
        const granted = await bluetooth.getDevices().catch((): BluetoothDeviceLike[] => []);
        selected = granted.find((item) => item.id === savedId) ?? null;
      }
      if (!selected) {
        selected = await bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices,
        });
      }
      const gatt = selected.gatt;
      if (!gatt) throw new PrintTransportError("bluetooth", "Selected device exposes no GATT server.");
      const server = await gatt.connect();
      const services: BluetoothServiceLike[] = [];
      for (const uuid of optionalServices) {
        const service = await server.getPrimaryService(uuid).catch(() => null);
        if (service) services.push(service);
      }
      if (!services.length) services.push(...(await server.getPrimaryServices()));
      let target: BluetoothCharacteristicLike | null = null;
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        target = characteristics.find((item) => item.properties.write || item.properties.writeWithoutResponse) ?? null;
        if (target) break;
      }
      if (!target) {
        server.disconnect();
        throw new PrintTransportError("bluetooth", "No writable characteristic found. Set the printer service UUID.");
      }
      device = selected;
      characteristic = target;
    },
    async write(bytes) {
      if (!characteristic) throw new PrintTransportError("bluetooth", "Bluetooth printer is not connected.");
      const sink = characteristic;
      for (let offset = 0; offset < bytes.length; offset += BLUETOOTH_CHUNK) {
        const chunk = bytes.subarray(offset, offset + BLUETOOTH_CHUNK);
        if (sink.properties.writeWithoutResponse && sink.writeValueWithoutResponse) await sink.writeValueWithoutResponse(chunk);
        else await sink.writeValue(chunk);
      }
    },
    async close() {
      device?.gatt?.disconnect();
      device = null;
      characteristic = null;
    },
  };
}

export function createUsbTransport(settings: Settings, deps: TransportDeps = {}): PrintTransport {
  const usb = (deps.host ?? deviceHost())?.usb;
  const vendorId = settings.printer.usbVendorId ?? null;
  const productId = settings.printer.usbProductId ?? null;
  let device: UsbDeviceLike | null = null;
  let interfaceNumber = 0;
  let endpointNumber = 0;

  return {
    id: "usb",
    label: "USB printer",
    async connect() {
      if (!usb) throw new PrintTransportError("usb", "WebUSB is unavailable. Use Chrome or Edge over HTTPS.");
      const filters = vendorId ? [{ vendorId, ...(productId ? { productId } : {}) }] : [];
      let selected: UsbDeviceLike | null = null;
      if (vendorId && usb.getDevices) {
        const granted = await usb.getDevices().catch((): UsbDeviceLike[] => []);
        selected =
          granted.find(
            (item) => item.vendorId === vendorId && (!productId || item.productId === productId),
          ) ?? null;
      }
      if (!selected) {
        selected = await usb.requestDevice(filters.length ? { filters } : { acceptAllDevices: true });
      }
      await selected.open();
      if (selected.configuration === null) await selected.selectConfiguration(1);
      const configuration = selected.configuration;
      const candidate =
        configuration?.interfaces.find((item) =>
          item.alternate.endpoints.some((endpoint) => endpoint.direction === "out" && endpoint.type === "bulk"),
        ) ?? configuration?.interfaces[0];
      if (!candidate) {
        await selected.close().catch(() => undefined);
        throw new PrintTransportError("usb", "Device exposes no usable interface.");
      }
      const endpoint = candidate.alternate.endpoints.find(
        (item) => item.direction === "out" && item.type === "bulk",
      );
      if (!endpoint) {
        await selected.close().catch(() => undefined);
        throw new PrintTransportError("usb", "No bulk OUT endpoint found on this device.");
      }
      await selected.claimInterface(candidate.interfaceNumber);
      interfaceNumber = candidate.interfaceNumber;
      endpointNumber = endpoint.endpointNumber;
      device = selected;
    },
    async write(bytes) {
      if (!device) throw new PrintTransportError("usb", "USB printer is not connected.");
      for (let offset = 0; offset < bytes.length; offset += USB_CHUNK) {
        await device.transferOut(endpointNumber, bytes.subarray(offset, offset + USB_CHUNK));
      }
    },
    async close() {
      if (!device) return;
      await device.releaseInterface(interfaceNumber).catch(() => undefined);
      await device.close().catch(() => undefined);
      device = null;
    },
  };
}

export function createSerialTransport(settings: Settings, deps: TransportDeps = {}): PrintTransport {
  const serial = (deps.host ?? deviceHost())?.serial;
  const baudRate = settings.printer.serialBaudRate ?? 9600;
  const vendorId = settings.printer.usbVendorId ?? null;
  const productId = settings.printer.usbProductId ?? null;
  let port: SerialPortLike | null = null;

  return {
    id: "usb",
    label: "Serial printer",
    async connect() {
      if (!serial) throw new PrintTransportError("usb", "Web Serial is unavailable. Use Chrome or Edge over HTTPS.");
      const filters = vendorId ? [{ usbVendorId: vendorId, ...(productId ? { usbProductId: productId } : {}) }] : [];
      let selected: SerialPortLike | null = null;
      if (vendorId && serial.getPorts) {
        const granted = await serial.getPorts().catch((): SerialPortLike[] => []);
        selected =
          granted.find((item) => {
            const info = item.getInfo?.();
            return (
              info?.usbVendorId === vendorId && (!productId || info?.usbProductId === productId)
            );
          }) ?? null;
      }
      if (!selected) {
        selected = await serial.requestPort(filters.length ? { filters } : undefined);
      }
      await selected.open({ baudRate });
      port = selected;
    },
    async write(bytes) {
      if (!port) throw new PrintTransportError("usb", "Serial printer is not connected.");
      const writable = port.writable;
      if (!writable) throw new PrintTransportError("usb", "Serial port is not writable.");
      const writer = writable.getWriter();
      try {
        for (let offset = 0; offset < bytes.length; offset += SERIAL_CHUNK) {
          await writer.write(bytes.subarray(offset, offset + SERIAL_CHUNK));
        }
      } finally {
        writer.releaseLock();
      }
    },
    async close() {
      if (!port) return;
      await port.close().catch(() => undefined);
      port = null;
    },
  };
}

export function createTransport(settings: Settings, deps: TransportDeps = {}): PrintTransport {
  const bus = settings.printer.printerType;
  if (bus === "network") return createNetworkTransport(settings, deps);
  if (bus === "bluetooth") return createBluetoothTransport(settings, deps);
  if (bus === "usb") {
    const host = deps.host ?? deviceHost();
    if (host?.usb) return createUsbTransport(settings, deps);
    if (host?.serial) return createSerialTransport(settings, deps);
    return createUsbTransport(settings, deps);
  }
  throw new PrintTransportError("system", "System printing uses the browser print dialog.");
}

export { DEFAULT_BLUETOOTH_SERVICE };
