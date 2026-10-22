import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useShopSettings,
  useUpdateShopSettings,
} from "@/hooks/useShopSettings";
import {
  useBranches,
  useCreateBranch,
  useDeleteBranch,
} from "@/hooks/useBranches";
import { useAuth } from "@/hooks/useAuth";
import {
  Save,
  RefreshCw,
  Plus,
  X,
  Image as ImageIcon,
  Bluetooth,
  Wifi,
  Cable,
  Monitor,
  Sun,
  Moon,
  Palette,
  Percent,
  Coins,

  Download,
  GitBranch,
  ShieldCheck,
  Search,
  Radar,
  Loader2,
  Usb,
  Printer,
  CircleAlert,
} from "lucide-react";
import type {
  PaperSize,
  PrinterType,
  ReceiptWidthMm,
  Settings,
  ThemePreset,
} from "@/types";
import { THEME_PRESETS } from "@/types";
import {
  COUNTRIES,
  CURRENCIES,
  BUSINESS_TYPES,
  GROUPING_SYSTEMS,
  SEPARATOR_PRESETS,
  TIMEZONES,
  currencyByCode,
  formatMoney,
} from "@/lib/referenceData";
import { processImageFile } from "@/lib/imageUpload";
import { cn, toErrorMessage } from "@/lib/utils";
import { EXPORT_CATEGORIES, downloadExport, type ExportCategory } from "@/lib/export";
import { canAddBranch, getPlanLimits } from "@/lib/billing";
import { upgradeToast } from "@/components/billing/UpgradePrompt";
import BillingSection from "@/components/billing/BillingSection";
import PrinterDevicePicker from "@/components/features/settings/PrinterDevicePicker";
import CountrySelect from "@/components/common/CountrySelect";
import PhoneInput from "@/components/common/PhoneInput";
import {
  bridgeScanUrl,
  composeIpTarget,
  describePrintError,
  detectCapabilities,
  parseIpTarget,
  RAW_PRINT_PORT,
  testPrinter,
} from "@/lib/printing";
import "./settings.css";

/** Parse a number input without ever producing NaN (cleared field -> fallback). */
function safeNum(raw: string, fallback = 0): number {
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const SECTIONS = [
  { id: "business", label: "Profile" },
  { id: "money", label: "Money & Format" },
  { id: "categories", label: "Categories" },
  { id: "docs", label: "Receipts & Invoices" },
  { id: "hardware", label: "Printer & POS" },
  { id: "discounts", label: "Discounts" },
  { id: "branches", label: "Branches" },
  { id: "theme", label: "Theme" },

  { id: "billing", label: "Billing" },
  { id: "export", label: "Backup & Export" },
] as const;

const PRINTER_OPTIONS: {
  k: PrinterType;
  label: string;
  sub: string;
  icon: import("lucide-react").LucideIcon;
}[] = [
  { k: "network", label: "Network IP", sub: "Ethernet / Wi-Fi raw socket", icon: Wifi },
  { k: "bluetooth", label: "Bluetooth", sub: "Direct wireless mobile pairing", icon: Bluetooth },
  { k: "usb", label: "USB Port", sub: "Direct desktop serial/USB cable", icon: Cable },
  { k: "system", label: "OS System", sub: "Standard browser print dialog", icon: Monitor },
];

const PAPER_SIZES: PaperSize[] = ["58mm", "80mm", "99x210mm", "A4", "A5", "Letter"];

const CODEPAGES: NonNullable<Settings["printer"]["codepage"]>[] = [
  "cp437",
  "cp850",
  "cp858",
  "cp1252",
];

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

function hexId(value: number | null | undefined): string {
  return value == null ? "" : `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;
}

function parseHexId(raw: string): number | null {
  const t = raw.trim().replace(/^0x/i, "");
  if (t === "") return null;
  const n = Number.parseInt(t, 16);
  return Number.isFinite(n) && n >= 0 && n <= 0xffff ? n : null;
}

const THEME_PRESET_KEYS = Object.keys(THEME_PRESETS) as (keyof typeof THEME_PRESETS)[];

export default function SettingsPage() {
  const { can } = useAuth();
  const { data: settings, isLoading } = useShopSettings();
  const update = useUpdateShopSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const baseline = useRef<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const [exporting, setExporting] = useState<ExportCategory | null>(null);
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
  const canExport = can("settings.export") || can("settings.manage");
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

  const doExport = async (cat: ExportCategory) => {
    setExporting(cat);
    const label = EXPORT_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
    notify(`Exporting ${label}…`);
    try {
      await downloadExport(cat);
      const { markBackupDone } = await import("@/lib/onboarding");
      markBackupDone();
      notify(`${label} export downloaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
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

  return (
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
          {canShop && (
            <Section
              id="business"
              title="1. Business Profile"
              desc="Commercial identity, legal name, and contacts displayed on receipts and invoices"
              required
            >
              <div className="grid-2">
                <SField label="Shop Legal Name" htmlFor="set-shop-name" req error={errors.shopName}>
                  <input
                    id="set-shop-name"
                    className="input"
                    value={form.shopName}
                    onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                    placeholder="e.g. Acme Printing Services"
                  />
                </SField>
                <SField label="Commercial Category" htmlFor="set-business-type" req>
                  <select
                    id="set-business-type"
                    className="input"
                    value={form.businessType}
                    onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                  >
                    <option value="">— Select —</option>
                    {form.businessType && !BUSINESS_TYPES.includes(form.businessType) && (
                      <option value={form.businessType}>{form.businessType}</option>
                    )}
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </SField>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <SField label="Primary Country" htmlFor="set-country">
                  <CountrySelect
                    id="set-country"
                    ariaLabel="Primary Country"
                    valueIso2={countryIso2}
                    fallbackLabel={form.country && !countryIso2 ? form.country : undefined}
                    onChange={(iso2) =>
                      setForm({
                        ...form,
                        country: COUNTRIES.find((c) => c.iso2 === iso2)?.name || "",
                      })
                    }
                  />
                </SField>
                <SField label="Operating Time Zone" htmlFor="set-timezone">
                  <select
                    id="set-timezone"
                    className="input"
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  >
                    {!TIMEZONES.includes(form.timezone) && (
                      <option value={form.timezone}>{form.timezone}</option>
                    )}
                    {TIMEZONES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </SField>
                <SField label="Support Email" htmlFor="set-email" req>
                  <input
                    id="set-email"
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="billing@shop.com"
                  />
                </SField>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <SField label="Primary Mobile" htmlFor="set-mobile">
                  <PhoneInput
                    id="set-mobile"
                    ariaLabel="Primary Mobile"
                    inputClassName="num"
                    value={form.mobile}
                    onChange={(mobile) => setForm({ ...form, mobile })}
                    placeholder="712 345 678"
                  />
                </SField>
                <SField label="Office Telephone" htmlFor="set-office">
                  <PhoneInput
                    id="set-office"
                    ariaLabel="Office Telephone"
                    inputClassName="num"
                    value={form.officePhone}
                    onChange={(officePhone) => setForm({ ...form, officePhone })}
                    placeholder="414 555 012"
                  />
                </SField>
                <SField label="Official WhatsApp" htmlFor="set-whatsapp">
                  <PhoneInput
                    id="set-whatsapp"
                    ariaLabel="Official WhatsApp"
                    inputClassName="num"
                    value={form.whatsapp}
                    onChange={(whatsapp) => setForm({ ...form, whatsapp })}
                    placeholder="712 345 678"
                  />
                </SField>
              </div>

              <div style={{ marginTop: 14 }}>
                <SField label="Physical Shop Address" htmlFor="set-address">
                  <input
                    id="set-address"
                    className="input"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Plot 42 Printing House Arcade, 1st Floor, Kampala"
                  />
                </SField>
              </div>

              <div className="teal-banner-box">
                <div className="teal-header">
                  <div className="teal-badge-icon">◈</div>
                  <div>
                    <div className="teal-title">Brand Identity &amp; POS Emblems</div>
                    <div className="teal-sub">
                      Logos appear on 80mm thermal receipts, customer invoices, and the top navigation switcher.
                    </div>
                  </div>
                </div>
                <div className="logo-upload-cluster">
                  <label className="logo-avatar-thumb" title="Click to browse image">
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoFile(f);
                        e.target.value = "";
                      }}
                    />
                    {form.logoUrl && !logoError ? (
                      <img
                        src={form.logoUrl}
                        alt="Shop logo"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <span style={{ textAlign: "center", fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>
                        <ImageIcon className="icon" style={{ width: 20, height: 20, marginBottom: 2 }} />
                        <br />
                        {uploading ? "Uploading…" : "Browse"}
                      </span>
                    )}
                  </label>
                  <div className="logo-meta">
                    <SField label="Image URL / Asset Identifier" htmlFor="set-logo-url">
                      <input
                        id="set-logo-url"
                        className="input"
                        value={form.logoUrl || ""}
                        onChange={(e) => {
                          setForm({ ...form, logoUrl: e.target.value });
                          setLogoError(false);
                        }}
                        placeholder="https://cdn.pixobooks.com/logo.png or data:image/..."
                      />
                    </SField>
                    <div className="logo-remove-row">
                      <div className="field-hint" style={{ marginTop: 0 }}>
                        Tap the circular frame to upload a file directly. Recommends 512×512px square PNG.
                      </div>
                      {form.logoUrl && (
                        <button
                          type="button"
                          className="btn btn-ghost-danger btn-sm"
                          onClick={() => setForm({ ...form, logoUrl: "" })}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(form.termsVersion || form.privacyVersion) && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {form.termsVersion && (
                    <span className="badge-hq">Terms v{form.termsVersion} accepted</span>
                  )}
                  {form.privacyVersion && (
                    <span className="badge-hq">Privacy v{form.privacyVersion} accepted</span>
                  )}
                </div>
              )}
            </Section>
          )}

          {(canShop || canTaxes) && (
            <Section
              id="money"
              title="2. Money & Number Format"
              desc="Currency, decimal precision, tax computation and currency formatting"
              required
            >
              <div className="grid-3">
                <SField label="Base Operating Currency" htmlFor="set-currency" req>
                  <select
                    id="set-currency"
                    className="input"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} — {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </SField>
                <SField label="Default VAT / Tax Rate (%)" htmlFor="set-tax" error={errors.taxRate}>
                  <input
                    id="set-tax"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    className="input num"
                    style={{ textAlign: "right" }}
                    value={form.taxRate}
                    onChange={(e) => setForm({ ...form, taxRate: safeNum(e.target.value, 0) })}
                    disabled={!canTaxes}
                  />
                </SField>
                <SField label="Decimal Precision" htmlFor="set-decimals">
                  <select
                    id="set-decimals"
                    className="input"
                    value={form.decimalPlaces}
                    onChange={(e) => setForm({ ...form, decimalPlaces: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}{n === 0 ? " (Integer round)" : n === 2 ? " (Standard)" : ""}
                      </option>
                    ))}
                  </select>
                </SField>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <SField label="Digit Grouping Standard" htmlFor="set-grouping">
                  <select
                    id="set-grouping"
                    className="input"
                    value={form.digitGrouping}
                    onChange={(e) =>
                      setForm({ ...form, digitGrouping: e.target.value as "western" | "indian" })
                    }
                  >
                    {GROUPING_SYSTEMS.map((g) => (
                      <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                  </select>
                </SField>
                <SField label="Thousand Separator" htmlFor="set-thousand" error={errors.separators}>
                  <input
                    id="set-thousand"
                    className="input num"
                    style={{ textAlign: "center" }}
                    maxLength={1}
                    value={form.thousandSeparator}
                    onChange={(e) =>
                      setForm({ ...form, thousandSeparator: e.target.value.slice(0, 1) })
                    }
                  />
                </SField>
                <SField label="Decimal Point Mark" htmlFor="set-decimal">
                  <input
                    id="set-decimal"
                    className="input num"
                    style={{ textAlign: "center" }}
                    maxLength={1}
                    value={form.decimalSeparator}
                    onChange={(e) =>
                      setForm({ ...form, decimalSeparator: e.target.value.slice(0, 1) })
                    }
                  />
                </SField>
              </div>

              <div className="grid-2" style={{ marginTop: 14 }}>
                <SField label="Separator Preset" htmlFor="set-separator-preset">
                  <select
                    id="set-separator-preset"
                    className="input"
                    value=""
                    onChange={(e) => {
                      const p = SEPARATOR_PRESETS.find((s) => s.id === e.target.value);
                      if (p) {
                        setForm({
                          ...form,
                          thousandSeparator: p.thousand,
                          decimalSeparator: p.decimal,
                        });
                      }
                    }}
                  >
                    <option value="" disabled>Apply a preset…</option>
                    {SEPARATOR_PRESETS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </SField>
                <SField label="Legacy Till Line (printed on receipts)" htmlFor="set-phone">
                  <PhoneInput
                    id="set-phone"
                    ariaLabel="Legacy Till Line"
                    inputClassName="num"
                    value={form.phone}
                    onChange={(phone) => setForm({ ...form, phone })}
                    placeholder="414 555 012"
                  />
                </SField>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--ink-muted)",
                    }}
                  >
                    Format Preview
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
                    Real-time ledger and POS price ticket demonstration
                  </div>
                </div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700, color: "var(--apple-blue)" }}>
                  {moneyExample}
                </div>
              </div>
            </Section>
          )}

          {canCategories && (
            <Section
              id="categories"
              title="3. POS Catalog Categories"
              desc="Dynamic category tags used in Point of Sale and quick inventory filtering"
            >
              <SField label="Active Categories">
                <div className="chip-cloud" style={{ marginTop: 0 }}>
                  {form.categories.map((c) => (
                    <span key={c} className="item-chip">
                      {c}
                      <button
                        type="button"
                        className="chip-remove-btn"
                        onClick={() => {
                          setForm({ ...form, categories: form.categories.filter((x) => x !== c) });
                          notify("Category removed");
                        }}
                        aria-label={`Remove ${c}`}
                      >
                        <X className="icon" />
                      </button>
                    </span>
                  ))}
                  {form.categories.length === 0 && (
                    <span className="field-hint" style={{ marginTop: 0 }}>
                      No categories yet — add the first below.
                    </span>
                  )}
                </div>
              </SField>
              <div className="add-row">
                <input
                  className="input"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  placeholder="Enter new category name..."
                />
                <button type="button" className="btn btn-outline" onClick={addCategory}>
                  <Plus className="icon" />
                  Add Category
                </button>
              </div>
            </Section>
          )}

          {(canReceipt || canInvoice) && (
            <Section
              id="docs"
              title="4. Receipt & Invoice Documents"
              desc="Thermal POS receipts, serial invoice prefixing, and standard payment terms"
              required
            >
              {canReceipt && (
                <div className="grid-2">
                  <SField label="Receipt Header Greeting" htmlFor="set-receipt-header">
                    <input
                      id="set-receipt-header"
                      className="input"
                      value={form.receipt.header}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt: { ...form.receipt, header: e.target.value },
                        })
                      }
                    />
                  </SField>
                  <SField label="Receipt Footer Message" htmlFor="set-receipt-footer">
                    <input
                      id="set-receipt-footer"
                      className="input"
                      value={form.receipt.footer}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt: { ...form.receipt, footer: e.target.value },
                        })
                      }
                    />
                  </SField>
                </div>
              )}

              <div
                className={canReceipt && canInvoice ? "grid-3" : "grid-2"}
                style={{ marginTop: 14 }}
              >
                {canReceipt && (
                  <SField label="Thermal Width" htmlFor="set-receipt-width">
                    <select
                      id="set-receipt-width"
                      className="input"
                      value={form.receipt.paperWidthMm}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt: {
                            ...form.receipt,
                            paperWidthMm: Number(e.target.value) as ReceiptWidthMm,
                          },
                        })
                      }
                    >
                      <option value={58}>58 mm (Compact Mobile)</option>
                      <option value={80}>80 mm (Standard POS Desk)</option>
                      <option value={99}>99 mm (Full Slip)</option>
                    </select>
                  </SField>
                )}
                {canInvoice && (
                  <>
                    <SField label="Invoice Prefix" htmlFor="set-invoice-prefix" req>
                      <input
                        id="set-invoice-prefix"
                        className="input num"
                        value={form.invoice.prefix}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            invoice: { ...form.invoice, prefix: e.target.value },
                          })
                        }
                      />
                    </SField>
                    <SField label="Next Serial Sequence" htmlFor="set-invoice-next" error={errors.nextNumber}>
                      <input
                        id="set-invoice-next"
                        type="number"
                        min={1}
                        step={1}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.invoice.nextNumber}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            invoice: {
                              ...form.invoice,
                              nextNumber: Math.max(1, Math.round(safeNum(e.target.value, 1))),
                            },
                          })
                        }
                      />
                    </SField>
                  </>
                )}
              </div>

              {canInvoice && (
                <div style={{ marginTop: 14 }}>
                  <SField label="Commercial Payment Terms & Conditions" htmlFor="set-invoice-terms">
                    <textarea
                      id="set-invoice-terms"
                      className="input"
                      style={{ minHeight: 96 }}
                      value={form.invoice.terms}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          invoice: { ...form.invoice, terms: e.target.value },
                        })
                      }
                    />
                  </SField>
                </div>
              )}

              {canReceipt && (
                <div className="checkbox-group">
                  <CheckboxRow
                    checked={form.receipt.showLogo}
                    onChange={(v) =>
                      setForm({ ...form, receipt: { ...form.receipt, showLogo: v } })
                    }
                    label="Print Shop Logo on Top of Receipt"
                  />
                </div>
              )}
            </Section>
          )}

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
                    <select
                      id="set-paper-size"
                      className="input"
                      value={form.printer.paperSize}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          printer: { ...form.printer, paperSize: e.target.value as PaperSize },
                        })
                      }
                    >
                      {PAPER_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </SField>
                  <SField
                    label="Character codepage"
                    htmlFor="set-printer-codepage"
                    hint="Must match the printer firmware for accented text."
                  >
                    <select
                      id="set-printer-codepage"
                      className="input"
                      value={form.printer.codepage ?? "cp1252"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          printer: {
                            ...form.printer,
                            codepage:
                              e.target.value as NonNullable<Settings["printer"]["codepage"]>,
                          },
                        })
                      }
                    >
                      {CODEPAGES.map((c) => (
                        <option key={c} value={c}>{c.toUpperCase()}</option>
                      ))}
                    </select>
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
                        <select
                          id="set-printer-baud"
                          className="input"
                          value={form.printer.serialBaudRate ?? 9600}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              printer: {
                                ...form.printer,
                                serialBaudRate: safeNum(e.target.value, 9600),
                              },
                            })
                          }
                        >
                          {BAUD_RATES.map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
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
              </div>

              <PrinterDevicePicker
                bus={pickerBus}
                settings={form}
                onClose={() => setPickerBus(null)}
                onSelect={pickPrinter}
              />

            </Section>
          )}

          {(canDiscount || canLoyalty) && (
            <Section
              id="discounts"
              title="6. Discounts & Customer Loyalty"
              desc="Cashier discount caps, percentage ceilings, and customer reward point ratios"
            >
              {canDiscount && (
                <>
                  <div>
                    <label className="field-label" style={{ marginBottom: 8 }}>
                      Discount Input Style
                    </label>
                    <div className="opt-cards-grid" style={{ maxWidth: 420 }}>
                      {(
                        [
                          { k: "percentage", label: "Percentage (%)", icon: Percent },
                          { k: "amount", label: `Amount (${currencySymbol})`, icon: Coins },
                        ] as const
                      ).map(({ k, label, icon: Icon }) => (
                        <button
                          key={k}
                          type="button"
                          className={cn("opt-card", form.discount.type === k && "selected")}
                          onClick={() =>
                            setForm({
                              ...form,
                              discount: { ...form.discount, type: k },
                            })
                          }
                        >
                          <span className="opt-title"><Icon className="icon" /> {label}</span>
                          <span className="opt-sub">
                            {k === "percentage" ? "Percent off the line or order" : "Fixed money value off"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid-2" style={{ marginTop: 14 }}>
                    <SField label="Maximum Cashier Discount (%)" htmlFor="set-max-pct" error={errors.maxPct}>
                      <input
                        id="set-max-pct"
                        type="number"
                        min={0}
                        max={100}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.discount.maxPct}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount: { ...form.discount, maxPct: safeNum(e.target.value, 0) },
                          })
                        }
                      />
                    </SField>
                    <SField
                      label={`Absolute Order Amount Cap (${currencySymbol})`}
                      htmlFor="set-max-amount"
                      error={errors.maxAmount}
                    >
                      <input
                        id="set-max-amount"
                        type="number"
                        min={0}
                        step="0.01"
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.discount.maxAmount}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount: { ...form.discount, maxAmount: safeNum(e.target.value, 0) },
                          })
                        }
                      />
                    </SField>
                  </div>

                  <div className="checkbox-group">
                    <CheckboxRow
                      checked={form.discount.allowLine}
                      onChange={(v) =>
                        setForm({ ...form, discount: { ...form.discount, allowLine: v } })
                      }
                      label="Allow per-line discounts"
                    />
                    <CheckboxRow
                      checked={form.discount.allowOrder}
                      onChange={(v) =>
                        setForm({ ...form, discount: { ...form.discount, allowOrder: v } })
                      }
                      label="Allow whole-order discounts"
                    />
                  </div>
                </>
              )}

              {canLoyalty && (
                <div className="teal-banner-box" style={{ marginTop: canDiscount ? 16 : 14 }}>
                  <div className="teal-header">
                    <div className="teal-badge-icon">★</div>
                    <div>
                      <div className="teal-title">Loyalty Points Program</div>
                      <div className="teal-sub">
                        Customers accumulate points for repeat purchases redeemable at checkout.
                      </div>
                    </div>
                  </div>
                  <CheckboxRow
                    checked={form.loyalty.enabled}
                    onChange={(v) =>
                      setForm({ ...form, loyalty: { ...form.loyalty, enabled: v } })
                    }
                    label="Enable loyalty points"
                  />
                  <div className="grid-2">
                    <SField
                      label={`Points Earned per ${currencySymbol}1 Spent`}
                      htmlFor="set-points-earned"
                    >
                      <input
                        id="set-points-earned"
                        type="number"
                        step="0.1"
                        min={0}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.loyalty.pointsPerDollar}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            loyalty: { ...form.loyalty, pointsPerDollar: safeNum(e.target.value, 0) },
                          })
                        }
                        disabled={!form.loyalty.enabled}
                      />
                    </SField>
                    <SField
                      label={`Redemption Cash Value per Point (${currencySymbol})`}
                      htmlFor="set-points-value"
                    >
                      <input
                        id="set-points-value"
                        type="number"
                        step="0.0001"
                        min={0}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.loyalty.dollarPerPoint}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            loyalty: { ...form.loyalty, dollarPerPoint: safeNum(e.target.value, 0) },
                          })
                        }
                        disabled={!form.loyalty.enabled}
                      />
                    </SField>
                  </div>
                </div>
              )}
            </Section>
          )}

          {canShop && (
            <Section
              id="branches"
              title="7. Branches & Store Locations"
              desc="Operating store branches assigned to POS tills, inventory, and staff members"
            >
              <BranchManager onNotice={notify} />
            </Section>
          )}

          {canTheme && (
            <Section
              id="theme"
              title="8. Application Theme"
              desc="Application appearance, color themes, and display mode"
            >
              <div>
                <label className="field-label" style={{ marginBottom: 8 }}>
                  Base Mode
                </label>
                <div className="opt-cards-grid" style={{ maxWidth: 420 }}>
                  {(
                    [
                      { k: "light", label: "Light", icon: Sun },
                      { k: "dark", label: "Dark", icon: Moon },
                    ] as const
                  ).map(({ k, label, icon: Icon }) => (
                    <button
                      key={k}
                      type="button"
                      className={cn("opt-card", form.theme.mode === k && "selected")}
                      onClick={() =>
                        setForm({ ...form, theme: { ...form.theme, mode: k } })
                      }
                    >
                      <span className="opt-title"><Icon className="icon" /> {label}</span>
                      <span className="opt-sub">{k === "light" ? "Bright paper canvas" : "Dimmed ledger surface"}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="field-label" style={{ marginBottom: 8 }}>
                  Palette Preset
                </label>
                <div className="opt-cards-grid">
                  {THEME_PRESET_KEYS.map((k) => {
                    const p = THEME_PRESETS[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        className={cn("opt-card", form.theme.preset === k && "selected")}
                        onClick={() => applyPreset(k as ThemePreset)}
                      >
                        <span className="theme-swatches">
                          <span style={{ background: p.primary }} />
                          <span style={{ background: p.accent }} />
                        </span>
                        <span className="opt-title">{p.label}</span>
                        <span className="opt-sub">{p.mode}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={cn("opt-card", form.theme.preset === "logo" && "selected")}
                    onClick={() => applyPreset("logo")}
                  >
                    <span className="theme-logo-preview">
                      {form.logoUrl && !logoError ? (
                        <img src={form.logoUrl} alt="" onError={() => setLogoError(true)} />
                      ) : (
                        <Palette className="icon" />
                      )}
                    </span>
                    <span className="opt-title">Match logo</span>
                    <span className="opt-sub">Pick colors below</span>
                  </button>
                  <button
                    type="button"
                    className={cn("opt-card", form.theme.preset === "custom" && "selected")}
                    onClick={() => applyPreset("custom")}
                  >
                    <span className="theme-swatches">
                      <span style={{ background: form.theme.primary }} />
                      <span style={{ background: form.theme.accent }} />
                    </span>
                    <span className="opt-title">Fully custom</span>
                    <span className="opt-sub">Any two hex colors</span>
                  </button>
                </div>
              </div>

              {(form.theme.preset === "custom" || form.theme.preset === "logo") && (
                <div className="grid-3" style={{ marginTop: 14 }}>
                  <SField label="Primary (hex)" htmlFor="set-theme-primary" error={errors.primary}>
                    <div className="color-row">
                      <input
                        type="color"
                        className="color-input"
                        value={/^#[0-9a-fA-F]{6}$/.test(form.theme.primary) ? form.theme.primary : "#000000"}
                        onChange={(e) =>
                          setForm({ ...form, theme: { ...form.theme, primary: e.target.value } })
                        }
                      />
                      <input
                        id="set-theme-primary"
                        className="input num"
                        value={form.theme.primary}
                        onChange={(e) =>
                          setForm({ ...form, theme: { ...form.theme, primary: e.target.value } })
                        }
                      />
                    </div>
                  </SField>
                  <SField label="Accent (hex)" htmlFor="set-theme-accent" error={errors.accent}>
                    <div className="color-row">
                      <input
                        type="color"
                        className="color-input"
                        value={/^#[0-9a-fA-F]{6}$/.test(form.theme.accent) ? form.theme.accent : "#000000"}
                        onChange={(e) =>
                          setForm({ ...form, theme: { ...form.theme, accent: e.target.value } })
                        }
                      />
                      <input
                        id="set-theme-accent"
                        className="input num"
                        value={form.theme.accent}
                        onChange={(e) =>
                          setForm({ ...form, theme: { ...form.theme, accent: e.target.value } })
                        }
                      />
                    </div>
                  </SField>
                  <SField label="Background (hex)" htmlFor="set-theme-background">
                    <div className="color-row">
                      <input
                        type="color"
                        className="color-input"
                        value={form.theme.background || "#f7f2e8"}
                        onChange={(e) =>
                          setForm({ ...form, theme: { ...form.theme, background: e.target.value } })
                        }
                      />
                      <input
                        id="set-theme-background"
                        className="input num"
                        value={form.theme.background || "#f7f2e8"}
                        onChange={(e) =>
                          setForm({ ...form, theme: { ...form.theme, background: e.target.value } })
                        }
                      />
                    </div>
                  </SField>
                </div>
              )}

              <div className="theme-preview">
                <span style={{ background: form.theme.primary }}>Live preview — Primary</span>
                <span style={{ background: form.theme.accent }}>Accent</span>
              </div>
            </Section>
          )}

          {canShop && (
            <Section
              id="billing"
              title="9. Billing & Plan"
              desc="Plan limits, subscription status, and cloud backup"
            >
              <BillingSection />
            </Section>
          )}

          {canExport && (
            <Section
              id="export"
              title="10. Data Exports & System Backup"
              desc="Export structured JSON tables or generate real-time offline encrypted backups"
            >
              <div className="grid-3">
                {EXPORT_CATEGORIES.map((c) => (
                  <div key={c.key} className="export-card">
                    <div>
                      <div className="export-card-title">{c.label}</div>
                      <div className="export-card-sub">{c.description}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => doExport(c.key)}
                      disabled={exporting === c.key}
                    >
                      <Download className="icon" style={{ width: 14, height: 14 }} />
                      {exporting === c.key ? "Exporting…" : "Export JSON"}
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}
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
  );
}

function SField({
  label,
  htmlFor,
  req,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  req?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field-box">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {req && <span className="req">*</span>}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function Section({
  id,
  title,
  desc,
  required,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={`settings-${id}`} className="config-section">
      <div className="section-title-row">
        <div className="section-number-title">
          <h2 className="sec-title-text">{title}</h2>
          {required && <span className="sec-req-mark">*</span>}
        </div>
        <span className="sec-desc-text">{desc}</span>
      </div>
      {children}
    </section>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="checkbox-row">
      <input
        type="checkbox"
        className="apple-checkbox-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="apple-checkbox-box">
        <svg viewBox="0 0 24 24" fill="none">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span className="checkbox-label">{label}</span>
    </label>
  );
}

function BranchManager({ onNotice }: { onNotice?: (msg: string) => void }) {
  const { data: branches = [], isLoading } = useBranches();
  const { data: settings } = useShopSettings();
  const create = useCreateBranch();
  const del = useDeleteBranch();
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return toast.error("Enter a branch name first");
    if (!canAddBranch(branches.length, settings)) {
      upgradeToast(`More than ${getPlanLimits(settings).branches} branches`);
      return;
    }
    try {
      await create.mutateAsync(name.trim());
      setName("");
      onNotice?.("Branch created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create branch");
    }
  };

  const remove = async (id: string, branchName: string, isHead: boolean, total: number) => {
    if (isHead) return toast.error("Head Office cannot be deleted");
    if (total <= 1) return toast.error("Keep at least one branch");
    if (!confirm(`Delete branch "${branchName}"? Existing records keep working.`)) return;
    try {
      await del.mutateAsync(id);
      onNotice?.("Branch deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete branch");
    }
  };

  if (isLoading) return <div className="field-hint">Loading branches…</div>;

  return (
    <div>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Branches appear in the TopBar switcher; new sales, held tickets, expenses and purchase
        orders are tagged with the active branch. Assign staff to a branch from the owner dashboard.
      </p>
      <SField label="Registered Locations">
        <div className="data-table-card">
          {branches.length === 0 && (
            <div className="data-row">
              <span className="field-hint" style={{ marginTop: 0 }}>No branches yet.</span>
            </div>
          )}
          {branches.map((b) => (
            <div key={b.id} className="data-row">
              <div className="branch-row-main">
                <GitBranch className="icon" />
                <span className="branch-name">{b.name}</span>
              </div>
              {b.isHeadOffice ? (
                <span className="badge-hq">Headquarters (HQ)</span>
              ) : branches.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-ghost-danger btn-sm"
                  onClick={() => remove(b.id, b.name, b.isHeadOffice, branches.length)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </SField>
      <div className="add-row">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add new branch location..."
        />
        <button type="button" className="btn btn-outline" onClick={add}>
          <Plus className="icon" />
          Add Branch
        </button>
      </div>
    </div>
  );
}
