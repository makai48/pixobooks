import { Moon, ShoppingBag, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemePreset } from "@/types";
import { THEME_PRESETS } from "@/types";
import { THEME_PRESET_KEYS } from "../constants";
import { Section } from "../fields";
import { useSettings } from "../settingsContext";

/**
 * Five complete skins, each with a light and dark expression.
 * The previews use the same Lucide stroke language as the app navigation so
 * what is shown here matches what the workspace actually becomes.
 */
export default function ThemeSection() {
  const { form, setForm, canTheme, applyPreset } = useSettings();
  const selected = THEME_PRESETS[form.theme.preset] || THEME_PRESETS.papier;

  return (
    <>
      {canTheme && (
        <Section
          id="theme"
          title="8. Application Theme"
          desc="Five complete skins for the whole workspace: surfaces, ink, borders, status colors and navigation signal"
        >
          <div>
            <label className="field-label" style={{ marginBottom: 8 }}>
              Base mode
            </label>
            <div className="opt-cards-grid" style={{ maxWidth: 420 }}>
              {(
                [
                  { k: "light", label: "Light", icon: Sun, sub: "Paper and daylight surfaces" },
                  { k: "dark", label: "Dark", icon: Moon, sub: "Low-glare evening workspace" },
                ] as const
              ).map(({ k, label, sub, icon: Icon }) => (
                <button
                  key={k}
                  type="button"
                  className={cn("opt-card", form.theme.mode === k && "selected")}
                  onClick={() =>
                    setForm({ ...form, theme: { ...form.theme, mode: k } })
                  }
                >
                  <span className="opt-title">
                    <Icon className="icon" strokeWidth={form.theme.mode === k ? 2.25 : 1.75} />
                    {label}
                  </span>
                  <span className="opt-sub">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label className="field-label" style={{ marginBottom: 8 }}>
              Skin
            </label>
            <div className="opt-cards-grid theme-skin-grid">
              {THEME_PRESET_KEYS.map((key) => {
                const skin = THEME_PRESETS[key as ThemePreset];
                const active = form.theme.preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn("opt-card theme-skin-card", active && "selected")}
                    onClick={() => applyPreset(key as ThemePreset)}
                  >
                    <span
                      className="theme-skin-stage"
                      style={{ background: skin.preview.paper }}
                      aria-hidden="true"
                    >
                      <span
                        className="theme-skin-surface"
                        style={{
                          background: skin.preview.card,
                          borderColor: `${skin.preview.muted}2e`,
                        }}
                      >
                        <span
                          className="theme-skin-pill"
                          style={{
                            background: skin.preview.brand,
                            color: skin.preview.brandInk,
                          }}
                        >
                          <ShoppingBag size={11} strokeWidth={2.25} />
                          Sales
                        </span>
                        <span
                          className="theme-skin-line"
                          style={{ background: skin.preview.ink }}
                        />
                        <span
                          className="theme-skin-line short"
                          style={{ background: skin.preview.muted }}
                        />
                      </span>
                    </span>

                    <span className="theme-swatches" aria-hidden="true">
                      <span style={{ background: skin.preview.paper }} />
                      <span style={{ background: skin.preview.brand }} />
                      <span style={{ background: skin.preview.ink }} />
                      <span style={{ background: skin.preview.card }} />
                    </span>

                    <span className="opt-title">
                      {skin.label}
                      <span className="theme-mode-tag">
                        {skin.mode === "dark" ? "Dark base" : "Light base"}
                      </span>
                    </span>
                    <span className="opt-sub">{skin.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="theme-preview theme-preview-v3"
            style={{
              background: selected.preview.paper,
              borderColor: `${selected.preview.muted}33`,
            }}
            aria-label={`${selected.label} live preview`}
          >
            <span
              style={{ background: selected.preview.card, color: selected.preview.ink }}
            >
              Surface
            </span>
            <span
              style={{
                background: selected.preview.brand,
                color: selected.preview.brandInk,
              }}
            >
              Brand
            </span>
            <span
              style={{ background: selected.preview.ink, color: selected.preview.paper }}
            >
              Ink
            </span>
          </div>
        </Section>
      )}
    </>
  );
}
