import {
  Bluetooth,
  Cable,
  CreditCard,
  DatabaseBackup,
  GitBranch,
  Monitor,
  Palette,
  Percent,
  Printer,
  ReceiptText,
  Store,
  Tags,
  Wallet,
  Wifi,
} from "lucide-react";
import { THEME_PRESETS } from "@/types";
import type { PaperSize, PrinterType, Settings } from "@/types";

/** Parse a number input without ever producing NaN (cleared field -> fallback). */
function safeNum(raw: string, fallback = 0): number {
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The settings rail. `group` only prints on the desktop rail; `short` is the
 * phone/tablet strip label so ten destinations stay on one scroll line.
 */
const SECTIONS = [
  { id: "business", label: "Profile", short: "Profile", group: "Shop", icon: Store },
  { id: "money", label: "Money & Format", short: "Money", group: "Shop", icon: Wallet },
  { id: "categories", label: "Categories", short: "Categories", group: "Shop", icon: Tags },
  { id: "docs", label: "Receipts & Invoices", short: "Documents", group: "Shop", icon: ReceiptText },
  { id: "hardware", label: "Printer & POS", short: "Printer", group: "Operations", icon: Printer },
  { id: "discounts", label: "Discounts", short: "Discounts", group: "Operations", icon: Percent },
  { id: "branches", label: "Branches", short: "Branches", group: "Operations", icon: GitBranch },
  { id: "theme", label: "Theme", short: "Theme", group: "Workspace", icon: Palette },
  { id: "billing", label: "Billing", short: "Billing", group: "Workspace", icon: CreditCard },
  { id: "export", label: "Import & Backup", short: "Backup", group: "Workspace", icon: DatabaseBackup },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];
type SectionMeta = (typeof SECTIONS)[number];

/** Section header glyph lookup, keyed by the anchor id used by the spy. */
const SECTION_META = Object.fromEntries(
  SECTIONS.map((section) => [section.id, section]),
) as Record<SectionId, SectionMeta>;

/** Rail groups in reading order, each holding only its own destinations. */
const SECTION_GROUPS = SECTIONS.reduce<{ name: string; items: SectionMeta[] }[]>(
  (groups, section) => {
    const last = groups[groups.length - 1];
    if (last && last.name === section.group) last.items.push(section);
    else groups.push({ name: section.group, items: [section] });
    return groups;
  },
  [],
);

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

export {
  SECTIONS,
  SECTION_META,
  SECTION_GROUPS,
  PRINTER_OPTIONS,
  PAPER_SIZES,
  CODEPAGES,
  BAUD_RATES,
  THEME_PRESET_KEYS,
  safeNum,
  hexId,
  parseHexId,
};
export type { SectionId, SectionMeta };
