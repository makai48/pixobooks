import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bluetooth,
  ChevronRight,
  Loader2,
  Monitor,
  Printer,
  Radar,
  Search,
  Usb,
  Wifi,
  X,
} from "lucide-react";
import type { PrinterType, Settings } from "@/types";
import {
  composeIpTarget,
  describePrintError,
  emptyDiscoveryNotice,
  listSavedPrinters,
  mergeDiscovered,
  pairUsbPrinter,
  parseIpTarget,
  RAW_PRINT_PORT,
  requestBluetoothPrinter,
  scanNetworkPrinters,
  type DiscoveredPrinter,
  type ScanNotice,
} from "@/lib/printing";
import { cn } from "@/lib/utils";

type Bus = Exclude<PrinterType, "system">;

const BUS_ICON: Record<PrinterType, typeof Wifi> = {
  network: Wifi,
  bluetooth: Bluetooth,
  usb: Usb,
  system: Monitor,
};

const BUS_COPY: Record<
  Bus,
  { title: string; sub: string; scan: string; empty: string; footer: string }
> = {
  network: {
    title: "Select a network printer",
    sub: "Printers the local bridge can reach on this LAN.",
    scan: "Scan network",
    empty: "No printers found yet",
    footer: "Discovery uses the bridge /devices endpoint. You can also type an address manually.",
  },
  bluetooth: {
    title: "Pair a Bluetooth printer",
    sub: "Browsers require a direct pairing prompt for every new printer.",
    scan: "Scan Bluetooth",
    empty: "No paired printers",
    footer: "Pairing happens over HTTPS in Chrome or Edge. The chosen device is reused on future prints.",
  },
  usb: {
    title: "Pair a USB or serial printer",
    sub: "Devices already granted to this browser appear below.",
    scan: "Scan USB",
    empty: "No USB printers paired",
    footer: "Pairing happens over HTTPS in Chrome or Edge. Vendor and product IDs are saved for silent reconnects.",
  },
};

type Props = {
  bus: PrinterType | null;
  settings: Settings;
  onClose: () => void;
  onSelect: (patch: Partial<Settings["printer"]>, label: string) => void;
};

export default function PrinterDevicePicker({ bus, settings, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DiscoveredPrinter[]>([]);
  const [phase, setPhase] = useState<"loading" | "idle" | "scanning">("idle");
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const active = bus === "network" || bus === "bluetooth" || bus === "usb";

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setQuery("");
    setItems([]);
    setNotice(null);
    setPhase("loading");
    void (async () => {
      try {
        const found = await listSavedPrinters(bus, settingsRef.current);
        if (cancelled) return;
        setItems(found);
        if (!found.length) setNotice(emptyDiscoveryNotice(bus, settingsRef.current));
      } catch (error) {
        if (!cancelled) setNotice({ tone: "error", text: describePrintError(error) });
      } finally {
        if (!cancelled) setPhase("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, bus]);

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose]);

  const apply = (item: DiscoveredPrinter) => {
    if (item.bus === "network" && item.host) {
      onSelect(
        {
          ipAddress: composeIpTarget(item.host, item.port ?? RAW_PRINT_PORT),
          deviceName: item.name,
        },
        item.name,
      );
      return;
    }
    if (item.bus === "bluetooth") {
      onSelect(
        { bluetoothMac: item.deviceId ?? item.id, deviceName: item.name },
        item.name,
      );
      return;
    }
    onSelect(
      {
        usbVendorId: item.vendorId ?? null,
        usbProductId: item.productId ?? null,
        deviceName: item.name,
      },
      item.name,
    );
  };

  const runScan = async () => {
    if (bus !== "network" && bus !== "bluetooth" && bus !== "usb") return;
    setPhase("scanning");
    setNotice(null);
    try {
      if (bus === "network") {
        const found = await scanNetworkPrinters(settingsRef.current);
        setItems((current) => mergeDiscovered(current, found));
        if (!found.length) {
          setNotice({ tone: "info", text: "No printers answered the bridge scan." });
        }
        return;
      }
      const found =
        bus === "bluetooth"
          ? await requestBluetoothPrinter(settingsRef.current)
          : await pairUsbPrinter();
      setItems((current) => mergeDiscovered(current, [found]));
      apply(found);
    } catch (error) {
      setNotice({ tone: "error", text: describePrintError(error) });
    } finally {
      setPhase("idle");
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.name} ${item.detail}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  if (bus === null || bus === "system") return null;

  const copy = BUS_COPY[bus];
  const BusIcon = BUS_ICON[bus];
  const scanning = phase === "scanning";

  return createPortal(
    <div className="st picker-root">
      <div
        className="picker-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="picker-window"
          role="dialog"
          aria-modal="true"
          aria-labelledby="printer-picker-title"
        >
          <span className="picker-handle" />

          <header className="picker-head">
            <span className="picker-head-icon">
              <BusIcon className="icon" />
            </span>
            <div className="picker-head-copy">
              <span className="picker-eyebrow">Device discovery</span>
              <h2 className="picker-title" id="printer-picker-title">
                {copy.title}
              </h2>
              <p className="picker-sub">{copy.sub}</p>
            </div>
            <button
              type="button"
              className="picker-close"
              onClick={onClose}
              aria-label="Close device picker"
            >
              <X className="icon" />
            </button>
          </header>

          <div className="picker-toolbar">
            <div className="picker-search">
              <Search className="icon" />
              <input
                className="picker-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name or address"
                aria-label="Filter printers"
              />
            </div>
            <button
              type="button"
              className="btn btn-blue btn-sm picker-scan-btn"
              onClick={() => {
                void runScan();
              }}
              disabled={phase !== "idle"}
            >
              {scanning ? (
                <Loader2 className="icon picker-spin" />
              ) : (
                <Radar className="icon" />
              )}
              {scanning ? "Searching" : copy.scan}
            </button>
          </div>

          {notice && (
            <div
              className={cn("picker-notice", notice.tone === "error" && "is-error")}
              role="status"
            >
              <span className="picker-notice-dot" />
              {notice.text}
            </div>
          )}

          <div className="picker-list">
            {phase === "loading" &&
              [0, 1, 2].map((row) => (
                <div className="picker-skeleton" key={row}>
                  <span className="picker-skeleton-icon" />
                  <span className="picker-skeleton-copy">
                    <span className="picker-skeleton-line" />
                    <span className="picker-skeleton-line short" />
                  </span>
                </div>
              ))}

            {phase !== "loading" &&
              visible.map((item) => {
                const Icon = BUS_ICON[item.bus];
                const current =
                  item.bus === "network"
                    ? (parseIpTarget(settings.printer.ipAddress ?? "")?.host ?? "") === item.host
                    : item.bus === "bluetooth"
                      ? (settings.printer.bluetoothMac ?? "") === (item.deviceId ?? item.id)
                      : item.vendorId != null &&
                        settings.printer.usbVendorId === item.vendorId &&
                        (item.productId == null ||
                          settings.printer.usbProductId === item.productId);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={cn("picker-row", current && "is-current")}
                    onClick={() => apply(item)}
                  >
                    <span className="picker-row-icon">
                      <Icon className="icon" />
                    </span>
                    <span className="picker-row-copy">
                      <span className="picker-row-name">{item.name}</span>
                      <span className="picker-row-meta">{item.detail}</span>
                    </span>
                    {item.paired && <span className="picker-badge">Paired</span>}
                    {current && <span className="picker-badge is-current">Current</span>}
                    <ChevronRight className="icon picker-row-chevron" />
                  </button>
                );
              })}

            {phase !== "loading" && !visible.length && (
              <div className="picker-empty">
                <span className="picker-empty-icon">
                  <Printer className="icon" />
                </span>
                <span className="picker-empty-title">
                  {query.trim() ? "No matching printers" : copy.empty}
                </span>
                <span className="picker-empty-sub">
                  {query.trim()
                    ? "Clear the filter or scan again to refresh the list."
                    : "Use the scan button to search for a printer on this connection bus."}
                </span>
              </div>
            )}
          </div>

          <footer className="picker-foot">
            <span className="picker-foot-hint">{copy.footer}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
