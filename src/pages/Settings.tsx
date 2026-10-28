import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Monitor, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  useShopSettings,
  useUpdateShopSettings,
} from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import type { PrinterType, Settings, ThemePreset } from "@/types";
import { THEME_PRESETS } from "@/types";
import { COUNTRIES, currencyByCode, formatMoney } from "@/lib/referenceData";
import { processImageFile } from "@/lib/imageUpload";
import { cn, toErrorMessage } from "@/lib/utils";
import { fitControlWidths, startFitControlWidths } from "@/lib/fitControlWidths";
import {
  bridgeScanUrl,
  composeIpTarget,
  describePrintError,
  detectCapabilities,
  parseIpTarget,
  RAW_PRINT_PORT,
  testPrinter,
} from "@/lib/printing";
import { PRINTER_OPTIONS, SECTIONS, hexId } from "./settings/constants";
import {
  SettingsContext,
  type SettingsContextValue,
} from "./settings/settingsContext";
import BusinessSection from "./settings/sections/BusinessSection";
import MoneySection from "./settings/sections/MoneySection";
import CategoriesSection from "./settings/sections/CategoriesSection";
import DocsSection from "./settings/sections/DocsSection";
import HardwareSection from "./settings/sections/HardwareSection";
import DiscountsSection from "./settings/sections/DiscountsSection";
import BranchesSection from "./settings/sections/BranchesSection";
import ThemeSection from "./settings/sections/ThemeSection";
import BillingPlanSection from "./settings/sections/BillingPlanSection";
import ExportSection from "./settings/sections/ExportSection";
import "./settings.css";

export default function SettingsPage() {
  const { can, profile } = useAuth();
  const { data: settings, isLoading } = useShopSettings();
  const update = useUpdateShopSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const baseline = useRef<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const [newCategory, setNewCategory] = useState("");
  const [activeSection, setActiveSection] = useState<string>("business");
  const [justSaved, setJustSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [testState, setTestState] = useState<{
    state: "idle" | "busy" | "ok" | "error";
    message?: string;
  }>({ state: "idle" });
  const [pickerBus, setPickerBus] = useState<PrinterType | null>(null);
  const [netHost, setNetHost] = useState<string | null>(null);
  const [netPort, setNetPort] = useState<string | null>(null);
  const activeBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const navRef = useRef<HTMLDivElement>(null);
  const flightTo = useRef<string | null>(null);
  const flightTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const notify = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200);
  };

  // Baseline sync: init once, then reconcile with server truth.
  useEffect(() => {
    if (!settings) return;
    const snap = JSON.stringify(settings);
    if (baseline.current === null) {
      baseline.current = snap;
      setForm(settings);
      return;
    }
    if (form && JSON.stringify(form) === baseline.current && snap !== baseline.current) {
      baseline.current = snap;
      setForm(settings);
    }
  }, [settings, form]);

  /**
   * Global rule: dropdowns and text fields must never be wider than the text
   * they carry. Start the measurer once, then re-measure whenever the form
   * re-renders (so controls added/changed by editing keep their fit).
   */
  useEffect(() => {
    startFitControlWidths();
  }, []);

  useEffect(() => {
    if (form) fitControlWidths();
  }, [form]);

  const dirty = useMemo(
    () => !!form && baseline.current !== null && JSON.stringify(form) !== baseline.current,
    [form]
  );

  const countryIso2 = useMemo(
    () => COUNTRIES.find((c) => c.name === form?.country)?.iso2 || "",
    [form?.country]
  );

  const capabilities = useMemo(() => detectCapabilities(), []);

  const canShop = can("settings.shop") || can("settings.manage");
  const canReceipt = can("settings.receipt") || can("settings.manage");
  const canInvoice = can("settings.invoice") || can("settings.manage");
  const canPrinter = can("settings.printer") || can("settings.manage");
  const canLoyalty = can("settings.loyalty") || can("settings.manage");

  const canTaxes = can("settings.taxes") || can("settings.manage");
  const canTheme = can("settings.theme") || can("settings.manage");
  const canDiscount = can("settings.discount") || can("settings.manage");
  const canCategories = can("settings.categories") || can("settings.manage");
  const canExport = can("settings.export") || can("reports.export") || can("settings.manage");
  const anyAccess =
    canShop || canReceipt || canInvoice || canPrinter || canLoyalty ||
    canTaxes || canTheme || canDiscount || canCategories || canExport;

  const sectionPerm: Record<string, boolean> = {
    business: canShop,
    money: canShop || canTaxes,
    categories: canCategories,
    docs: canReceipt || canInvoice,
    hardware: canPrinter,
    discounts: canDiscount || canLoyalty,
    branches: canShop,
    theme: canTheme,
    billing: canShop,
    export: canExport,
  };
  const visibleSections = SECTIONS.filter((s) => sectionPerm[s.id]);
  const visibleIds = visibleSections.map((s) => s.id).join("|");

  // Scroll-spy: highlight the nearest section that has crossed the anchor.
  useEffect(() => {
    const ids = visibleIds.split("|").filter(Boolean);
    if (ids.length === 0) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (flightTo.current) {
        const el = document.getElementById(`settings-${flightTo.current}`);
        const top = el?.getBoundingClientRect().top ?? 0;
        if (top > 126) return;
        flightTo.current = null;
      }
      const anchor = Math.max(126, window.innerHeight * 0.3);
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(`settings-${id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= anchor) current = id;
        else break;
      }
      setActiveSection((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true } as AddEventListenerOptions);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [visibleIds]);

  // Keep the active pill visible in the horizontal nav without scrolling the page.
  useEffect(() => {
    const wrap = navRef.current;
    const btn = activeBtnRefs.current.get(activeSection);
    if (!wrap || !btn) return;
    wrap.scrollTo({
      left: btn.offsetLeft - wrap.clientWidth / 2 + btn.clientWidth / 2,
      behavior: "smooth",
    });
  }, [activeSection]);

  useEffect(() => {
    if (!justSaved) return;
    const t = window.setTimeout(() => setJustSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [justSaved]);

  useEffect(() => {
    setLogoError(false);
  }, [form?.logoUrl]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      if (flightTimer.current !== null) window.clearTimeout(flightTimer.current);
    };
  }, []);

  if (isLoading || !form) {
    return (
      <div className="st">
        <div className="settings-window">
          <div className="window-handle" />
          <header className="settings-header">
            <div className="header-top">
              <div className="header-title-block" style={{ width: "45%" }}>
                <div className="skeleton-line" style={{ width: "35%", height: 9 }} />
                <div className="skeleton-line" style={{ width: "75%", height: 20, marginTop: 6 }} />
              </div>
              <div className="skeleton-line" style={{ width: 110, height: 34 }} />
            </div>
            <div className="section-nav-wrapper">
              <div className="section-nav">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton-line" style={{ width: 74, height: 30 }} />
                ))}
              </div>
            </div>
          </header>
          <div className="settings-body">
            {[0, 1, 2].map((i) => (
              <section key={i} className="config-section">
                <div className="skeleton-line" style={{ width: 190, marginBottom: 18 }} />
                <div className="grid-2">
                  <div className="skeleton-line tall" />
                  <div className="skeleton-line tall" />
                  <div className="skeleton-line tall" />
                  <div className="skeleton-line tall" />
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const scrollTo = (id: string) => {
    const el = document.getElementById(`settings-${id}`);
    if (!el) return;
    setActiveSection(id);
    flightTo.current = id;
    if (flightTimer.current !== null) window.clearTimeout(flightTimer.current);
    flightTimer.current = window.setTimeout(() => {
      flightTo.current = null;
      flightTimer.current = null;
    }, 1100);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!anyAccess) {
    return (
      <div className="st">
        <div className="settings-window">
          <div className="window-handle" />
          <div className="settings-body" style={{ justifyContent: "center" }}>
            <div className="config-section no-access-card">
              <ShieldCheck className="icon" />
              <h2 className="no-access-title">No settings access</h2>
              <p className="no-access-text">
                Your role has no settings permissions. Ask the shop owner to grant access.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const validate = (f: Settings): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.shopName.trim()) e.shopName = "Shop name is required.";
    if (f.taxRate < 0 || f.taxRate > 100) e.taxRate = "Tax must be between 0 and 100%.";
    if (f.thousandSeparator === f.decimalSeparator) e.separators = "Thousand and decimal separators must differ.";
    if (f.thousandSeparator.length > 1 || f.decimalSeparator.length > 1)
      e.separators = "Separators must be a single character (space allowed).";
    if (f.invoice.nextNumber < 1 || !Number.isInteger(f.invoice.nextNumber))
      e.nextNumber = "Next number must be a whole number of 1 or more.";
    if (f.discount.maxPct < 0 || f.discount.maxPct > 100) e.maxPct = "Max % must be 0–100.";
    if (f.discount.maxAmount < 0) e.maxAmount = "Max amount can't be negative.";
    if (!/^#[0-9a-fA-F]{6}$/.test(f.theme.primary)) e.primary = "Primary must be a #rrggbb hex.";
    if (!/^#[0-9a-fA-F]{6}$/.test(f.theme.accent)) e.accent = "Accent must be a #rrggbb hex.";
    return e;
  };

  const save = () => {
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      toast.error("Fix the highlighted fields before saving.");
      notify("Fix the highlighted fields before saving");
      return;
    }
    update.mutate({ ...form, expenseCategories: undefined }, {
      onSuccess: () => {
        baseline.current = JSON.stringify(form);
        setErrors({});
        setJustSaved(true);
        notify("Settings saved to PixoBooks ledger");
      },
      onError: (e) => toast.error(toErrorMessage(e, "Save failed")),
    });
  };

  const reset = () => {
    if (dirty && !confirm("Discard all unsaved changes?")) return;
    if (settings) {
      baseline.current = JSON.stringify(settings);
      setForm(settings);
      setErrors({});
      setNetHost(null);
      setNetPort(null);
      setTestState({ state: "idle" });
      notify("Form reset to saved settings");
    }
  };

  const runTestPrint = async () => {
    if (!form) return;
    setTestState({ state: "busy" });
    try {
      const outcome = await testPrinter(form);
      if (outcome.systemDialog) {
        const message =
          "System bus prints through the browser dialog — open a receipt preview to test it";
        setTestState({ state: "ok", message });
        notify(message);
        return;
      }
      const message = `Test page sent to ${outcome.label} (${outcome.bytes} bytes)`;
      setTestState({ state: "ok", message });
      notify(message);
    } catch (error) {
      const message = describePrintError(error);
      setTestState({ state: "error", message });
      toast.error(message);
    }
  };

  const handleLogoFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await processImageFile(file, "logos");
      setForm({ ...form, logoUrl: url });
      setLogoError(false);
      notify("Shop logo ready — save to persist");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const applyPreset = (preset: ThemePreset) => {
    if (preset === "custom" || preset === "logo") {
      setForm({ ...form, theme: { ...form.theme, preset } });
      return;
    }
    const p = THEME_PRESETS[preset];
    setForm({
      ...form,
      theme: { ...form.theme, preset, mode: p.mode, primary: p.primary, accent: p.accent },
    });
  };

  const addCategory = () => {
    const v = newCategory.trim();
    if (!v) return;
    if (!form.categories.includes(v)) {
      setForm({ ...form, categories: [...form.categories, v] });
      notify(`Added category "${v}"`);
    }
    setNewCategory("");
  };

  const currencySymbol = currencyByCode(form.currency)?.symbol || form.currency;
  const moneyExample = formatMoney(999999999.99, {
    thousand: form.thousandSeparator,
    decimal: form.decimalSeparator,
    places: form.decimalPlaces,
    grouping: form.digitGrouping,
    symbol: currencySymbol,
  });
  const saveLabel = update.isPending
    ? "Saving..."
    : justSaved
      ? "Saved!"
      : dirty
        ? "Save"
        : "Saved";

  const printerBus = form.printer.printerType;
  const ipTarget = parseIpTarget(form.printer.ipAddress ?? "");
  const hostValue = netHost ?? ipTarget?.host ?? "";
  const portValue = netPort ?? String(ipTarget?.port ?? RAW_PRINT_PORT);
  const bridgeConfigured = bridgeScanUrl(form.printer.bridgeUrl ?? "") !== null;
  const printerReady =
    printerBus === "network"
      ? bridgeConfigured && ipTarget !== null
      : printerBus === "bluetooth"
        ? Boolean((form.printer.bluetoothMac ?? "").trim())
        : printerBus === "usb"
          ? form.printer.usbVendorId != null
          : true;
  const printerBusLabel =
    PRINTER_OPTIONS.find((option) => option.k === printerBus)?.label ?? "Printer";
  const BusIcon = PRINTER_OPTIONS.find((option) => option.k === printerBus)?.icon ?? Monitor;
  const printerBusHint =
    printerBus === "network"
      ? "Raw ESC/POS bytes are relayed by a local print bridge."
      : printerBus === "bluetooth"
        ? "Direct GATT writes over Web Bluetooth."
        : printerBus === "usb"
          ? "WebUSB or Web Serial writes to a cabled printer."
          : "Handled entirely by the operating system print dialog.";
  const printerSummary =
    printerBus === "network"
      ? (form.printer.bridgeUrl ?? "").trim()
        ? `${form.printer.deviceName || "Network printer"} · ${form.printer.ipAddress || "address not set"}`
        : "Add a bridge URL so the browser can reach the printer's raw TCP port."
      : printerBus === "bluetooth"
        ? (form.printer.bluetoothMac ?? "").trim()
          ? `${form.printer.deviceName || "Bluetooth printer"} · paired`
          : "Pair a Bluetooth ESC/POS printer for direct wireless printing."
        : printerBus === "usb"
          ? form.printer.usbVendorId != null
            ? `${form.printer.deviceName || "USB printer"} · ${hexId(form.printer.usbVendorId)}${form.printer.usbProductId != null ? `:${hexId(form.printer.usbProductId)}` : ""}`
            : "Pair a USB or serial printer granted to this browser."
          : "Receipts open the operating system print dialog on this device.";

  const applyNetworkTarget = (host: string, port: string) => {
    setNetHost(host);
    setNetPort(port);
    const parsedPort = Number(port);
    setForm({
      ...form,
      printer: {
        ...form.printer,
        ipAddress: composeIpTarget(
          host,
          Number.isFinite(parsedPort) && parsedPort > 0
            ? Math.round(parsedPort)
            : RAW_PRINT_PORT,
        ),
      },
    });
  };

  const pickPrinter = (patch: Partial<Settings["printer"]>, label: string) => {
    setForm({ ...form, printer: { ...form.printer, ...patch } });
    setNetHost(null);
    setNetPort(null);
    setTestState({ state: "idle" });
    setPickerBus(null);
    toast.success(`Selected ${label}`);
  };


  const settingsValue: SettingsContextValue = {
    form,
    setForm,
    errors,
    notify,
    profile,
    canShop,
    canReceipt,
    canInvoice,
    canPrinter,
    canLoyalty,
    canTaxes,
    canTheme,
    canDiscount,
    canCategories,
    canExport,
    countryIso2,
    currencySymbol,
    moneyExample,
    uploading,
    handleLogoFile,
    logoError,
    setLogoError,
    newCategory,
    setNewCategory,
    addCategory,
    applyPreset,
    capabilities,
    testState,
    setTestState,
    pickerBus,
    setPickerBus,
    hostValue,
    portValue,
    applyNetworkTarget,
    pickPrinter,
    printerBus,
    printerReady,
    printerBusLabel,
    BusIcon,
    printerSummary,
    printerBusHint,
    bridgeConfigured,
    ipTarget,
    runTestPrint,
  };

  return (
    <SettingsContext.Provider value={settingsValue}>
    <div className="st">
      <div className="settings-window">
        <div className="window-handle" />

        <header className="settings-header">
          <div className="header-top">
            <div className="header-title-block">
              <div className="eyebrow-category">
                <span>PIXOBOOKS</span>
                <span>•</span>
                <span>SETTINGS</span>
              </div>
              <h1 className="header-main-title">Store &amp; Ledger</h1>
              <div className="header-badge-row">
                <span className="badge-tag">
                  <span className="badge-tag-dot" />
                  {dirty ? "UNSAVED" : "ACTIVE"}
                </span>
              </div>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={reset}
                disabled={!dirty || update.isPending}
                title="Reset changes"
              >
                <RefreshCw className="icon" />
                Reset
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={save}
                disabled={!dirty || update.isPending || uploading}
                title={!dirty ? "No unsaved changes" : "Save all settings"}
              >
                <Save className="icon" />
                <span>{saveLabel}</span>
              </button>
            </div>
          </div>

          <div className="section-nav-wrapper" ref={navRef}>
            <nav className="section-nav" aria-label="Settings sections">
              {visibleSections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  ref={(el) => {
                    if (el) activeBtnRefs.current.set(s.id, el);
                    else activeBtnRefs.current.delete(s.id);
                  }}
                  onClick={() => scrollTo(s.id)}
                  aria-current={activeSection === s.id ? "true" : undefined}
                  className={cn("nav-pill", activeSection === s.id && "active")}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="settings-body">

          <BusinessSection />
          <MoneySection />
          <CategoriesSection />
          <DocsSection />
          <HardwareSection />
          <DiscountsSection />
          <BranchesSection />
          <ThemeSection />
          <BillingPlanSection />
          <ExportSection />
        </div>

        <footer className="settings-footer">
          <div className="footer-buttons">
            <button
              type="button"
              className="btn btn-outline"
              onClick={reset}
              disabled={!dirty || update.isPending}
            >
              Reset Defaults
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={!dirty || update.isPending || uploading}
            >
              {update.isPending ? "Saving…" : "Save Settings"}
            </button>
          </div>
          <div className="footer-status-clue">
            <span
              className="status-indicator-dot"
              style={{ background: dirty ? "var(--warning)" : "var(--success)" }}
            />
            <span>{dirty ? "Unsaved changes — not yet synced" : "Synced with PixoBooks Cloud Ledger"}</span>
          </div>
        </footer>
      </div>

      <div className={cn("toast-notice", notice && "show")} aria-live="polite">
        <svg className="icon" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{notice || "Settings saved successfully"}</span>
      </div>

    </div>
    </SettingsContext.Provider>
  );
}
