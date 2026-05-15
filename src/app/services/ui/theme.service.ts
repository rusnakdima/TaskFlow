import { Injectable, signal, effect } from "@angular/core";
import {
  AppearanceSettings,
  GradientSettings,
  GradientIntensity,
  ThemePreset,
  THEME_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
  getAccentShades,
} from "@models/theme.model";

const STORAGE_KEY = "appearance_settings";

@Injectable({
  providedIn: "root",
})
export class ThemeService {
  private settings = signal<AppearanceSettings>(this.loadSettings());

  mode = signal<"light" | "dark" | "system">(this.settings().mode);
  preset = signal<ThemePreset>(this.settings().preset);
  gradients = signal<GradientSettings>(this.settings().gradients);

  private htmlEl = document.querySelector("html");

  constructor() {
    effect(() => {
      this.applyTheme();
    });
  }

  private loadSettings(): AppearanceSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppearanceSettings;
        const preset = THEME_PRESETS.find((p) => p.id === parsed.preset.id) || THEME_PRESETS[0];
        return { ...parsed, preset };
      }
    } catch {}

    const legacyTheme = localStorage.getItem("theme");
    if (legacyTheme === "dark" || legacyTheme === "light") {
      return {
        mode: legacyTheme,
        preset: THEME_PRESETS[0],
        gradients: DEFAULT_APPEARANCE_SETTINGS.gradients,
      };
    }

    return DEFAULT_APPEARANCE_SETTINGS;
  }

  private saveSettings(): void {
    const settings: AppearanceSettings = {
      mode: this.mode(),
      preset: this.preset(),
      gradients: this.gradients(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  private applyTheme(): void {
    if (!this.htmlEl) return;

    const currentMode = this.getEffectiveMode();
    const shades = getAccentShades(this.preset().accentColor);

    this.htmlEl.style.setProperty("--accent-color", this.preset().accentColor);
    Object.entries(shades).forEach(([key, value]) => {
      this.htmlEl!.style.setProperty(`--accent-${key}`, value);
    });

    this.htmlEl.setAttribute("data-theme", this.preset().id);
    this.htmlEl.setAttribute("data-gradient-intensity", this.gradients().sidebar);

    this.htmlEl.classList.remove("light", "dark");
    this.htmlEl.classList.add(currentMode);

    this.applyGradientStyles();
    this.saveSettings();
  }

  private applyGradientStyles(): void {
    const intensity = this.gradients().sidebar;
    const accent = this.preset().accentColor;

    if (intensity === "none") {
      this.htmlEl!.style.removeProperty("--gradient-overlay");
      this.htmlEl!.style.removeProperty("--gradient-bg-start");
      this.htmlEl!.style.removeProperty("--gradient-bg-end");
      this.htmlEl!.style.removeProperty("--gradient-card-start");
      this.htmlEl!.style.removeProperty("--gradient-card-end");
      this.htmlEl!.style.removeProperty("--gradient-button-start");
      this.htmlEl!.style.removeProperty("--gradient-button-end");
      return;
    }

    const factor = intensity === "bold" ? 0.25 : 0.1;

    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);

    this.htmlEl!.style.setProperty("--gradient-overlay", `rgba(${r}, ${g}, ${b}, ${factor})`);
    this.htmlEl!.style.setProperty(
      "--gradient-bg-start",
      `rgba(${r}, ${g}, ${b}, ${factor * 0.5})`
    );
    this.htmlEl!.style.setProperty("--gradient-bg-end", `rgba(${r}, ${g}, ${b}, ${factor})`);
    this.htmlEl!.style.setProperty(
      "--gradient-card-start",
      `rgba(${r}, ${g}, ${b}, ${factor * 0.3})`
    );
    this.htmlEl!.style.setProperty(
      "--gradient-card-end",
      `rgba(${r}, ${g}, ${b}, ${factor * 0.6})`
    );
    this.htmlEl!.style.setProperty("--gradient-button-start", accent);
    this.htmlEl!.style.setProperty("--gradient-button-end", `rgba(${r}, ${g}, ${b}, 0.8)`);
  }

  getEffectiveMode(): "light" | "dark" {
    const mode = this.mode();
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode;
  }

  setMode(mode: "light" | "dark" | "system"): void {
    this.mode.set(mode);
  }

  toggleMode(): void {
    const current = this.getEffectiveMode();
    this.setMode(current === "dark" ? "light" : "dark");
  }

  setPreset(preset: ThemePreset): void {
    this.preset.set(preset);
  }

  setGradientIntensity(intensity: GradientIntensity): void {
    this.gradients.set({
      sidebar: intensity,
      header: intensity,
      card: intensity,
      button: intensity,
    });
  }

  resetToDefaults(): void {
    const defaults = DEFAULT_APPEARANCE_SETTINGS;
    this.mode.set(defaults.mode);
    this.preset.set(defaults.preset);
    this.gradients.set(defaults.gradients);
  }
}
