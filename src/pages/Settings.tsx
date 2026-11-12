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
import { COUNTRIES, currencyByCode } from "@/lib/referenceData";
import { formatMoneyWithFormat } from "@/lib/numberFormat";
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
import { PRINTER_OPTIONS, SECTION_GROUPS, SECTIONS, hexId } from "./settings/constants";
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
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
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
  // Destructive and deliberately not implied by `settings.export`: a manager
  // who can download a backup should not be able to erase the ledger.
  const canWipe = can("settings.wipe") || can("settings.manage");
  const anyAccess =
    canShop || canReceipt || canInvoice || canPrinter || canLoyalty ||
    canTaxes || canTheme || canDiscount || canCategories || canExport || canWipe;

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
    export: canExport || canWipe,
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

  // Keep the active destination visible. The rail scrolls vertically on
  // desktop and horizontally as a chip strip below 1024px, so the axis is
  // chosen from the rendered overflow rather than from a breakpoint guess.
  useEffect(() => {
    const wrap = navRef.current;
    const btn = activeBtnRefs.current.get(activeSection);
    if (!wrap || !btn) return;
    if (wrap.scrollHeight > wrap.clientHeight + 4) {
      wrap.scrollTo({
        top: btn.offsetTop - wrap.clientHeight / 2 + btn.clientHeight / 2,
        behavior: "smooth",
      });
      return;
    }
    wrap.scrollTo({
      left: btn.offsetLeft - wrap.clientWidth / 2 + btn.clientWidth / 2,
      behavior: "smooth",
    });
  }, [activeSection]);

  // The bar and the rail are both sticky, so the rail needs the bar's real
  // height (it changes when the title wraps on narrow screens).
  useEffect(() => {
    const bar = barRef.current;
    const shell = shellRef.current;
    if (!bar || !shell) return;
    const apply = () => {
      shell.style.setProperty("--folio-bar-h", `${bar.offsetHeight}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [isLoading, anyAccess, visibleIds]);

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
      <div className="st" ref={shellRef}>
        <div className="settings-window">
          <header className="folio-bar" aria-hidden="true">
            <div className="folio-id">
              <span className="folio-mark skeleton-line is-square" />
              <div className="folio-id-copy">
                <div className="skeleton-line" style={{ width: 178, height: 22 }} />
                <div className="skeleton-line" style={{ width: 124, height: 9, marginTop: 9 }} />
              </div>
            </div>
            <div className="folio-bar-actions">
              <div className="skeleton-line" style={{ width: 112, height: 30 }} />
              <div className="skeleton-line" style={{ width: 84, height: 34 }} />
            </div>
          </header>
          <div className="folio-grid">
            <div className="folio-rail">
              <div className="folio-nav is-skeleton">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="skeleton-line" style={{ height: 34 }} />
                ))}
              </div>
            </div>
            <div className="folio-pane">
              {[0, 1, 2].map((i) => (
                <section key={i} className="config-section">
                  <div className="sec-head">
                    <span className="sec-glyph skeleton-line is-square" />
                    <div className="sec-head-copy">
                      <div className="skeleton-line" style={{ width: 196, height: 15 }} />
                      <div
                        className="skeleton-line"
                        style={{ width: "58%", height: 9, marginTop: 9 }}
                      />
                    </div>
                  </div>
                  <div className="sec-body grid-2">
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
      <div className="st" ref={shellRef}>
        <div className="settings-window">
          <div className="folio-empty">
            <span className="folio-empty-glyph" aria-hidden="true">
              <ShieldCheck strokeWidth={1.5} />
            </span>
            <h1 className="folio-empty-title">No settings access</h1>
            <p className="folio-empty-text">
              Your role has no settings permissions. Ask the shop admin to grant access.
            </p>
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
    // The invoice sequence is no longer editable from Settings, so it is not
    // validated here either — a stale stored value must never block a save
    // the shop can no longer correct.
    if (f.discount.maxPct < 0 || f.discount.maxPct > 100) e.maxPct = "Max % must be 0–100.";
    if (f.discount.maxAmount < 0) e.maxAmount = "Max amount can't be negative.";
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
    const p = THEME_PRESETS[preset];
    setForm({
      ...form,
      theme: { ...form.theme, preset, mode: p.mode },
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
  // The preview is produced by the very formatter the app uses, so what the
  // shop sees here is exactly what the ledger, the POS ticket and every
  // report will print once the settings are saved.
  const moneyExample = formatMoneyWithFormat(999999999.99, form.currency, "en-US", {
    thousand: form.thousandSeparator,
    decimal: form.decimalSeparator,
    places: form.decimalPlaces,
    grouping: form.digitGrouping,
    currency: form.currency,
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
    canWipe,
    countryIso2,
    currencySymbol,
    moneyExample,
    savedExpenseCategories: settings?.expenseCategories ?? [],
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

  const shopInitial = (form.shopName || "P").trim().charAt(0).toUpperCase();
  const activeLabel =
    visibleSections.find((section) => section.id === activeSection)?.label ?? "Profile";

  return (
    <SettingsContext.Provider value={settingsValue}>
    <div className="st" ref={shellRef}>
      <div className="settings-window">
        <header className="folio-bar" ref={barRef}>
          <div className="folio-id">
            <span className="folio-mark" aria-hidden="true">
              {shopInitial}
            </span>
            <div className="folio-id-copy">
              <h1 className="folio-main-title">Store &amp; ledger</h1>
              <p className="folio-meta">
                <span className="folio-shop">{form.shopName || "Untitled shop"}</span>
                <span className="folio-meta-dot" aria-hidden="true">·</span>
                <span className="folio-here">{activeLabel}</span>
              </p>
            </div>
          </div>

          <div className="folio-bar-actions">
            <span
              className={cn(
                "folio-state",
                update.isPending ? "is-busy" : dirty ? "is-dirty" : "is-clean",
              )}
              role="status"
              aria-live="polite"
            >
              <span className="folio-state-dot" aria-hidden="true" />
              <span className="folio-state-text">
                {update.isPending ? "Saving" : dirty ? "Unsaved" : "Saved"}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={reset}
              disabled={!dirty || update.isPending}
              title="Reset changes"
            >
              <RefreshCw className="icon" />
              <span className="folio-btn-label">Reset</span>
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
        </header>

        <div className="folio-grid">
          <div className="folio-rail">
            <nav className="folio-nav" ref={navRef} aria-label="Settings sections">
              {SECTION_GROUPS.map((group) => {
                const items = group.items.filter((s) => sectionPerm[s.id]);
                if (items.length === 0) return null;
                return (
                  <div className="folio-group" key={group.name}>
                    <div className="folio-group-label" aria-hidden="true">
                      {group.name}
                    </div>
                    {items.map((s) => {
                      const Glyph = s.icon;
                      const active = activeSection === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          ref={(el) => {
                            if (el) activeBtnRefs.current.set(s.id, el);
                            else activeBtnRefs.current.delete(s.id);
                          }}
                          onClick={() => scrollTo(s.id)}
                          aria-current={active ? "true" : undefined}
                          className={cn("folio-nav-item", active && "is-active")}
                          title={s.label}
                        >
                          <Glyph
                            className="folio-nav-icon"
                            strokeWidth={1.7}
                            aria-hidden="true"
                          />
                          <span className="folio-nav-label">{s.label}</span>
                          <span className="folio-nav-short">{s.short}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="folio-pane">
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
        </div>

        <footer className="folio-foot">
          <span className="folio-foot-state">
            <span
              className={cn("folio-foot-dot", dirty ? "is-dirty" : "is-clean")}
              aria-hidden="true"
            />
            {dirty
              ? "Unsaved changes — not yet synced"
              : "Synced with PixoBooks Cloud Ledger"}
          </span>
          <span className="folio-foot-brand" aria-hidden="true">PixoBooks</span>
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
