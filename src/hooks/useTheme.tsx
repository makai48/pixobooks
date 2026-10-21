import { useEffect, type ReactNode } from "react";
import { useShopSettings } from "./useShopSettings";
import { hexToHslString } from "@/lib/utils";
import type { ThemeConfig } from "@/types";

/**
 * Applies theme CSS custom properties on <html> whenever shop_settings.theme changes.
 * - `data-theme` attribute switches light/dark base variables (see index.css).
 * - `--reg-magenta`, `--accent` are dynamically overridden from primary/accent hex values.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useShopSettings();

  useEffect(() => {
    const root = document.documentElement;
    const theme: ThemeConfig | undefined = settings?.theme;
    if (!theme) {
      root.setAttribute("data-theme", "light");
      return;
    }
    root.setAttribute("data-theme", theme.mode);
    if (theme.primary) {
      const hsl = hexToHslString(theme.primary);
      if (hsl) root.style.setProperty("--reg-magenta", hsl);
    }
    if (theme.accent && theme.preset !== "default") {
      const hsl = hexToHslString(theme.accent);
      if (hsl && theme.mode === "light") {
        root.style.setProperty("--accent", hsl);
      }
    }
    // Custom theme's third pallete: background color
    if (theme.background && (theme.preset === "custom" || theme.preset === "logo")) {
      const hsl = hexToHslString(theme.background);
      if (hsl) {
        root.style.setProperty("--paper", hsl);
        root.style.setProperty("--background", hsl);
      }
    } else {
      root.style.removeProperty("--paper");
      root.style.removeProperty("--background");
    }
  }, [settings?.theme]);

  return <>{children}</>;
}
