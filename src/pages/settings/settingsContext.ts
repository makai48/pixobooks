import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import type { Employee, PrinterType, Settings, ThemePreset } from "@/types";
import type { TransportCapabilities } from "@/lib/printing";

export type PrinterTestState = {
  state: "idle" | "busy" | "ok" | "error";
  message?: string;
};

export type SettingsContextValue = {
  form: Settings;
  setForm: Dispatch<SetStateAction<Settings | null>>;
  errors: Record<string, string>;
  notify: (msg: string) => void;
  profile: Employee | null;
  canShop: boolean;
  canReceipt: boolean;
  canInvoice: boolean;
  canPrinter: boolean;
  canLoyalty: boolean;
  canTaxes: boolean;
  canTheme: boolean;
  canDiscount: boolean;
  canCategories: boolean;
  canExport: boolean;
  countryIso2: string;
  currencySymbol: string;
  moneyExample: string;
  uploading: boolean;
  handleLogoFile: (file: File) => Promise<void>;
  logoError: boolean;
  setLogoError: Dispatch<SetStateAction<boolean>>;
  newCategory: string;
  setNewCategory: Dispatch<SetStateAction<string>>;
  addCategory: () => void;
  applyPreset: (preset: ThemePreset) => void;
  capabilities: TransportCapabilities;
  testState: PrinterTestState;
  setTestState: Dispatch<SetStateAction<PrinterTestState>>;
  pickerBus: PrinterType | null;
  setPickerBus: Dispatch<SetStateAction<PrinterType | null>>;
  hostValue: string;
  portValue: string;
  applyNetworkTarget: (host: string, port: string) => void;
  pickPrinter: (patch: Partial<Settings["printer"]>, label: string) => void;
  printerBus: PrinterType;
  printerReady: boolean;
  printerBusLabel: string;
  BusIcon: LucideIcon;
  printerSummary: string;
  printerBusHint: string;
  bridgeConfigured: boolean;
  ipTarget: { host: string; port: number } | null;
  runTestPrint: () => Promise<void>;
};

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsContext.Provider");
  return value;
}
