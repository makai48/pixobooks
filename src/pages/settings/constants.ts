import { Bluetooth, Cable, Monitor, Wifi } from "lucide-react";
import { THEME_PRESETS } from "@/types";
import type { PaperSize, PrinterType, Settings } from "@/types";

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
  { id: "export", label: "Import & Backup" },
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

export {
  SECTIONS,
  PRINTER_OPTIONS,
  PAPER_SIZES,
  CODEPAGES,
  BAUD_RATES,
  THEME_PRESET_KEYS,
  safeNum,
  hexId,
  parseHexId,
};
