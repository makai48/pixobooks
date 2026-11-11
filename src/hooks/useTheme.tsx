import { useEffect, type ReactNode } from "react";
import { useShopSettings } from "./useShopSettings";
import { THEME_PRESETS, type ThemeConfig } from "@/types";

/**
 * Applies the selected V3 skin to <html>.
 *
 * Skins are complete token sets defined in index.css:
 *   data-skin + data-theme -> paper, card, ink, line, brand, semantic colours.
 * No inline colour overrides are used, so switching skins is instant and
 * every surface (sidebar, cards, tables, dialogs, bottom nav) follows together.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useShopSettings();

  useEffect(() => {
    const root = document.documentElement;
    const theme: ThemeConfig | undefined = settings?.theme;
    root.setAttribute("data-theme", theme?.mode === "dark" ? "dark" : "light");
    root.setAttribute("data-skin", theme?.preset || "papier");

    // Keep the installed-PWA status bar in step with the active skin.
    const skin = THEME_PRESETS[theme?.preset || "papier"];
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta && skin) meta.content = skin.preview.paper;

    // Cache the last applied skin so the next launch paints correctly before
    // Supabase settings finish loading.
    try {
      localStorage.setItem(
        "pixobooks.theme",
        JSON.stringify({ mode: theme?.mode || "light", preset: theme?.preset || "papier" })
      );
    } catch {
      // Private mode / blocked storage — the effect still applied above.
    }

    // Remove inline colours left by the previous theme engine so a saved
    // skin fully controls the workspace after an upgrade.
    for (const property of [
      "--reg-magenta",
      "--accent",
      "--paper",
      "--background",
    ]) {
      root.style.removeProperty(property);
    }
  }, [settings?.theme]);

  return <>{children}</>;
}
