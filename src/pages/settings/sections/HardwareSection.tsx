import {
  Bluetooth,
  CircleAlert,
  Loader2,
  Monitor,
  Printer,
  Radar,
  Search,
  Usb,
} from "lucide-react";
import PrinterDevicePicker from "@/components/features/settings/PrinterDevicePicker";
import GlassSelect from "@/components/ui/GlassSelect";
import { composeIpTarget } from "@/lib/printing";
import { cn } from "@/lib/utils";
import type { PaperSize, Settings } from "@/types";
import {
  BAUD_RATES,
  CODEPAGES,
  PAPER_SIZES,
  PRINTER_OPTIONS,
  hexId,
  parseHexId,
  safeNum,
} from "../constants";
import { CheckboxRow, Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function HardwareSection() {
  const { form, setForm, canPrinter, capabilities, testState, setTestState, pickerBus, setPickerBus, hostValue, portValue, applyNetworkTarget, pickPrinter, printerBus, printerReady, printerBusLabel, BusIcon, printerSummary, printerBusHint, bridgeConfigured, ipTarget, runTestPrint } = useSettings();

  return (
    <>
          {canPrinter && (
            <Section
              id="hardware"
              title="5. Hardware & Printer Dispatch"
              desc="Connection bus, device discovery, and print behaviour"
            >
              <div className="printer-block">
                <div className="printer-block-head">
                  <span className="field-label printer-block-label">Connection bus</span>
                  <div className="printer-caps">
                    {PRINTER_OPTIONS.map(({ k, label }) => {
                      const cap = capabilities[k];
                      return (
                        <span
                          key={k}
                          className={cn("printer-cap", cap.supported && "is-ready")}
                          title={cap.detail}
                        >
                          <span className="printer-cap-dot" />
                          {label}
                          <span className="printer-cap-state">
                            {cap.supported ? "Ready" : "Unavailable"}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="opt-cards-grid printer-bus-grid">
                  {PRINTER_OPTIONS.map(({ k, label, sub, icon: Icon }) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={form.printer.printerType === k}
                      className={cn("opt-card", form.printer.printerType === k && "selected")}
                      onClick={() => {
                        setTestState({ state: "idle" });
                        setForm({ ...form, printer: { ...form.printer, printerType: k } });
                      }}
                    >
                      <span className="opt-title"><Icon className="icon" /> {label}</span>
                      <span className="opt-sub">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="printer-summary">
                <div className="printer-summary-main">
                  <span className="printer-summary-icon">
                    <BusIcon className="icon" />
                  </span>
                  <div className="printer-summary-copy">
                    <div className="printer-summary-title">
                      {printerBusLabel}
                      <span
                        className={cn(
                          "printer-status",
                          printerReady ? "is-ready" : "is-attention",
                        )}
                      >
                        <span className="printer-status-dot" />
                        {printerReady ? "Ready" : "Setup needed"}
                      </span>
                    </div>
                    <p className="printer-summary-sub">{printerSummary}</p>
                  </div>
                </div>
                <div className="printer-summary-actions">
                  {printerBus !== "system" && (
                    <button
                      type="button"
                      className="btn btn-blue btn-sm"
                      onClick={() => setPickerBus(printerBus)}
                    >
                      <Search className="icon" />
                      {printerBus === "network" ? "Find printers" : "Search devices"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      void runTestPrint();
                    }}
                    disabled={testState.state === "busy"}
                  >
                    {testState.state === "busy" ? (
                      <Loader2 className="icon printer-spin" />
                    ) : (
                      <Printer className="icon" />
                    )}
                    {testState.state === "busy" ? "Sending" : "Test print"}
                  </button>
                </div>
              </div>
              {testState.message && (
                <div
                  className={cn(
                    "printer-test-note",
                    testState.state === "error" && "is-error",
                  )}
                >
                  <CircleAlert className="icon" />
                  {testState.message}
                </div>
              )}

              <div className="printer-subpanel">
                <div className="printer-subpanel-head">
                  <div>
                    <h3 className="printer-subpanel-title">Printer identity</h3>
                    <p className="printer-subpanel-sub">
                      How the device is labelled and how receipt columns are encoded.
                    </p>
                  </div>
                </div>
                <div className="grid-3">
                  <SField label="Device alias" htmlFor="set-printer-alias">
                    <input
                      id="set-printer-alias"
                      className="input"
                      value={form.printer.deviceName}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          printer: { ...form.printer, deviceName: e.target.value },
                        })
                      }
                      placeholder="e.g. Epson TM-T20III"
                    />
                  </SField>
                  <SField label="Paper size" htmlFor="set-paper-size">
                    <GlassSelect
                      id="set-paper-size"
                      value={form.printer.paperSize}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          printer: { ...form.printer, paperSize: v as PaperSize },
                        })
                      }
                      ariaLabel="Paper size"
                      options={PAPER_SIZES.map((s) => ({ value: s, label: s }))}
                      className="input select-glass"
                    />
                  </SField>
                  <SField
                    label="Character codepage"
                    htmlFor="set-printer-codepage"
                    hint="Must match the printer firmware for accented text."
                  >
                    <GlassSelect
                      id="set-printer-codepage"
                      value={form.printer.codepage ?? "cp1252"}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          printer: {
                            ...form.printer,
                            codepage:
                              v as NonNullable<Settings["printer"]["codepage"]>,
                          },
                        })
                      }
                      ariaLabel="Character codepage"
                      options={CODEPAGES.map((c) => ({ value: c, label: c.toUpperCase() }))}
                      className="input select-glass"
                    />
                  </SField>
                </div>
              </div>

              <div className="printer-subpanel">
                <div className="printer-subpanel-head">
                  <div className="printer-subpanel-title-wrap">
                    <span className="printer-subpanel-icon">
                      <BusIcon className="icon" />
                    </span>
                    <div>
                      <h3 className="printer-subpanel-title">{printerBusLabel} connection</h3>
                      <p className="printer-subpanel-sub">{printerBusHint}</p>
                    </div>
                  </div>
                </div>

                {printerBus === "network" && (
                  <div className="printer-panel-body">
                    <div className="printer-discovery">
                      <span className="printer-discovery-icon">
                        <Radar className="icon" />
                      </span>
                      <div className="printer-discovery-copy">
                        <span className="printer-discovery-title">Automatic LAN discovery</span>
                        <span className="printer-discovery-sub">
                          {bridgeConfigured
                            ? "Scans the network through the bridge and lists reachable ESC/POS printers."
                            : "Add a bridge URL below to enable scanning, or enter the printer address manually."}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setPickerBus("network")}
                        disabled={!bridgeConfigured}
                      >
                        <Search className="icon" />
                        Scan network
                      </button>
                    </div>

                    <div className="grid-2">
                      <SField
                        label="Printer IP / Host"
                        htmlFor="set-printer-host"
                        hint={
                          ipTarget
                            ? `Target ${composeIpTarget(ipTarget.host, ipTarget.port)}`
                            : "IPv4 address or hostname on the local network."
                        }
                      >
                        <input
                          id="set-printer-host"
                          className="input num"
                          value={hostValue}
                          onChange={(e) => applyNetworkTarget(e.target.value, portValue)}
                          placeholder="192.168.1.50"
                          inputMode="decimal"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </SField>
                      <SField
                        label="Raw TCP port"
                        htmlFor="set-printer-port"
                        hint="ESC/POS printers usually listen on 9100."
                      >
                        <input
                          id="set-printer-port"
                          className="input num"
                          type="number"
                          min={1}
                          max={65535}
                          value={portValue}
                          onChange={(e) => applyNetworkTarget(hostValue, e.target.value)}
                        />
                      </SField>
                    </div>

                    <div className="grid-2">
                      <SField
                        label="Bridge endpoint"
                        htmlFor="set-printer-bridge"
                        hint="Relays ESC/POS bytes and exposes GET /devices for discovery."
                      >
                        <input
                          id="set-printer-bridge"
                          className="input"
                          value={form.printer.bridgeUrl || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              printer: { ...form.printer, bridgeUrl: e.target.value },
                            })
                          }
                          placeholder="http://192.168.1.50:8080"
                        />
                      </SField>
                      <SField
                        label="Bridge token"
                        htmlFor="set-printer-bridge-token"
                        hint="Optional. Sent as Authorization: Bearer …"
                      >
                        <input
                          id="set-printer-bridge-token"
                          className="input"
                          type="password"
                          value={form.printer.bridgeToken || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              printer: { ...form.printer, bridgeToken: e.target.value },
                            })
                          }
                          placeholder="Optional shared secret"
                        />
                      </SField>
                    </div>

                    <div
                      className={cn(
                        "printer-inline-note",
                        bridgeConfigured ? "is-ok" : "is-warn",
                      )}
                    >
                      <CircleAlert className="icon" />
                      <span>
                        {bridgeConfigured
                          ? "Bridge configured. Browsers still cannot open raw TCP sockets, so every network print is relayed by it."
                          : "Without a bridge URL, the browser cannot send ESC/POS bytes to a network printer."}
                      </span>
                    </div>
                  </div>
                )}

                {printerBus === "bluetooth" && (
                  <div className="printer-panel-body">
                    <div className="printer-device">
                      <span className="printer-device-icon">
                        <Bluetooth className="icon" />
                      </span>
                      <div className="printer-device-copy">
                        <span className="printer-device-name">
                          {form.printer.bluetoothMac
                            ? form.printer.deviceName || "Bluetooth printer"
                            : "No printer paired"}
                        </span>
                        <span className="printer-device-meta">
                          {form.printer.bluetoothMac
                            ? `Device ID · ${form.printer.bluetoothMac}`
                            : "Pair once and the browser reuses the granted device."}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-blue btn-sm"
                        onClick={() => setPickerBus("bluetooth")}
                      >
                        <Search className="icon" />
                        {form.printer.bluetoothMac ? "Change" : "Pair device"}
                      </button>
                    </div>
                    <div className="grid-2">
                      <SField
                        label="Paired device ID"
                        htmlFor="set-printer-bt"
                        hint="Filled by device search. A MAC address also works."
                      >
                        <input
                          id="set-printer-bt"
                          className="input num"
                          value={form.printer.bluetoothMac || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              printer: { ...form.printer, bluetoothMac: e.target.value },
                            })
                          }
                          placeholder="AA:BB:CC:DD:EE:FF"
                        />
                      </SField>
                      <SField
                        label="Service UUID"
                        htmlFor="set-printer-bt-service"
                        hint="Blank uses 000018f0-0000-1000-8000-00805f9b34fb."
                      >
                        <input
                          id="set-printer-bt-service"
                          className="input num"
                          value={form.printer.bluetoothService || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              printer: { ...form.printer, bluetoothService: e.target.value },
                            })
                          }
                          placeholder="000018f0-0000-1000-8000-00805f9b34fb"
                        />
                      </SField>
                    </div>
                  </div>
                )}

                {printerBus === "usb" && (
                  <div className="printer-panel-body">
                    <div className="printer-device">
                      <span className="printer-device-icon">
                        <Usb className="icon" />
                      </span>
                      <div className="printer-device-copy">
                        <span className="printer-device-name">
                          {form.printer.usbVendorId != null
                            ? form.printer.deviceName || "USB printer"
                            : "No USB device paired"}
                        </span>
                        <span className="printer-device-meta">
                          {form.printer.usbVendorId != null
                            ? `Vendor ${hexId(form.printer.usbVendorId)}${form.printer.usbProductId != null ? ` · Product ${hexId(form.printer.usbProductId)}` : ""}`
                            : "Pair a printer granted to this browser."}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-blue btn-sm"
                        onClick={() => setPickerBus("usb")}
                      >
                        <Search className="icon" />
                        {form.printer.usbVendorId != null ? "Change" : "Pair device"}
                      </button>
                    </div>
                    <div className="grid-3">
                      <SField
                        label="USB Vendor ID"
                        htmlFor="set-printer-usb-vendor"
                        hint="Hex identifier reported by the browser."
                      >
                        <input
                          id="set-printer-usb-vendor"
                          className="input num"
                          value={hexId(form.printer.usbVendorId)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              printer: { ...form.printer, usbVendorId: parseHexId(e.target.value) },
                            })
                          }
                          placeholder="0x04B8"
                        />
                      </SField>
                      <SField
                        label="USB Product ID"
                        htmlFor="set-printer-usb-product"
                        hint="Blank accepts any device from the vendor."
                      >
                        <input
                          id="set-printer-usb-product"
                          className="input num"
                          value={hexId(form.printer.usbProductId)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              printer: {
                                ...form.printer,
                                usbProductId: parseHexId(e.target.value),
                              },
                            })
                          }
                          placeholder="0x0E15"
                        />
                      </SField>
                      <SField
                        label="Serial baud rate"
                        htmlFor="set-printer-baud"
                        hint="Used only when the printer connects through Web Serial."
                      >
                        <GlassSelect
                          id="set-printer-baud"
                          value={String(form.printer.serialBaudRate ?? 9600)}
                          onChange={(v) =>
                            setForm({
                              ...form,
                              printer: {
                                ...form.printer,
                                serialBaudRate: safeNum(v, 9600),
                              },
                            })
                          }
                          ariaLabel="Serial baud rate"
                          options={BAUD_RATES.map((b) => ({ value: String(b), label: String(b) }))}
                          className="input select-glass"
                        />
                      </SField>
                    </div>
                  </div>
                )}

                {printerBus === "system" && (
                  <div className="printer-panel-body">
                    <div className="teal-banner-box printer-system-note">
                      <div className="teal-header">
                        <span className="teal-badge-icon">
                          <Monitor className="icon" />
                        </span>
                        <div>
                          <div className="teal-title">Operating system dialog</div>
                          <div className="teal-sub">
                            Receipts open the browser print dialog, so any printer installed on
                            this device can be used. Auto-print still applies after payment.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>


              <div className="printer-subpanel">
                <div className="printer-subpanel-head">
                  <div>
                    <h3 className="printer-subpanel-title">Print behaviour</h3>
                    <p className="printer-subpanel-sub">
                      Automation applied when a payment is confirmed.
                    </p>
                  </div>
                </div>
                <div className="checkbox-group printer-checks">
                  <CheckboxRow
                    checked={form.printer.autoPrint}
                    onChange={(v) =>
                      setForm({ ...form, printer: { ...form.printer, autoPrint: v } })
                    }
                    label="Auto-print receipt immediately upon payment confirmation"
                  />
                  <CheckboxRow
                    checked={form.printer.openDrawer}
                    onChange={(v) =>
                      setForm({ ...form, printer: { ...form.printer, openDrawer: v } })
                    }
                    label="Fire electronic cash drawer kick pulse on cash sales"
                  />
                </div>

                <div className="grid-2" style={{ marginTop: 14 }}>
                  <SField
                    label="Sale confirmation popup"
                    htmlFor="set-success-popup"
                    hint="How long the animated tick stays in front of the receipt."
                  >
                    <GlassSelect
                      id="set-success-popup"
                      value={String(form.printer.successPopupMs ?? 1500)}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          printer: { ...form.printer, successPopupMs: Number(v) },
                        })
                      }
                      ariaLabel="Sale confirmation popup duration"
                      options={[
                        { value: "800", label: "0.8 seconds" },
                        { value: "1200", label: "1.2 seconds" },
                        { value: "1500", label: "1.5 seconds" },
                        { value: "2000", label: "2 seconds" },
                        { value: "3000", label: "3 seconds" },
                      ]}
                      className="input select-glass"
                    />
                  </SField>
                  <SField
                    label="Receipt preview"
                    htmlFor="set-receipt-preview"
                    hint="How long the receipt stays on screen after the popup, or turn the preview off."
                  >
                    <GlassSelect
                      id="set-receipt-preview"
                      value={String(form.printer.receiptPreviewMs ?? 2000)}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          printer: { ...form.printer, receiptPreviewMs: Number(v) },
                        })
                      }
                      ariaLabel="Receipt preview duration"
                      options={[
                        { value: "0", label: "No preview" },
                        { value: "1000", label: "1 second" },
                        { value: "2000", label: "2 seconds" },
                        { value: "3000", label: "3 seconds" },
                        { value: "5000", label: "5 seconds" },
                        { value: "-1", label: "Keep open" },
                      ]}
                      className="input select-glass"
                    />
                  </SField>
                </div>
              </div>

              <PrinterDevicePicker
                bus={pickerBus}
                settings={form}
                onClose={() => setPickerBus(null)}
                onSelect={pickPrinter}
              />

            </Section>
          )}
    </>
  );
}
