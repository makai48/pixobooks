import { Moon, Palette, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemePreset } from "@/types";
import { THEME_PRESETS } from "@/types";
import { THEME_PRESET_KEYS } from "../constants";
import { Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function ThemeSection() {
  const { form, setForm, errors, canTheme, logoError, setLogoError, applyPreset } = useSettings();

  return (
    <>
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
    </>
  );
}
