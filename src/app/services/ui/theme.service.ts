import { Injectable, signal, effect } from "@angular/core";
import {
  AppearanceSettings,
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
      };
    }

    return DEFAULT_APPEARANCE_SETTINGS;
  }

  private saveSettings(): void {
    const settings: AppearanceSettings = {
      mode: this.mode(),
      preset: this.preset(),
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

    this.htmlEl.classList.remove("light", "dark");
    this.htmlEl.classList.add(currentMode);

    this.saveSettings();
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

  resetToDefaults(): void {
    const defaults = DEFAULT_APPEARANCE_SETTINGS;
    this.mode.set(defaults.mode);
    this.preset.set(defaults.preset);
  }
}
