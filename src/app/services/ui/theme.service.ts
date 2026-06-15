import { Injectable, signal, effect } from "@angular/core";
import {
  AppearanceSettings,
  ThemePreset,
  THEME_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
  getAccentShades,
} from "@models/theme.model";
import { getLoggingService } from "@tauri-apps/logger";

const STORAGE_KEY = "appearance_settings";

@Injectable({
  providedIn: "root",
})
export class ThemeService {
  private loggingService = getLoggingService();
  private settings = signal<AppearanceSettings>(this.loadSettings());

  mode = signal<"light" | "dark" | "system">(this.settings().mode);
  preset = signal<ThemePreset>(this.settings().preset);

  private htmlEl = document.querySelector("html");

  constructor() {
    effect(() => {
      const mode = this.mode();
      const preset = this.preset();
      const effectiveMode =
        mode === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : mode;

      if (this.htmlEl) {
        this.htmlEl.setAttribute("data-theme", effectiveMode);
        this.htmlEl.classList.toggle("dark", effectiveMode === "dark");
        this.htmlEl.classList.toggle("light", effectiveMode === "light");
        this.applyAccentColor(preset.accentColor);
      }
    });
  }

  private applyAccentColor(hexColor: string): void {
    if (!this.htmlEl) return;
    const shades = getAccentShades(hexColor);
    this.htmlEl.style.setProperty("--accent-color", shades["500"]);
    this.htmlEl.style.setProperty("--accent-50", shades["50"]);
    this.htmlEl.style.setProperty("--accent-100", shades["100"]);
    this.htmlEl.style.setProperty("--accent-200", shades["200"]);
    this.htmlEl.style.setProperty("--accent-300", shades["300"]);
    this.htmlEl.style.setProperty("--accent-400", shades["400"]);
    this.htmlEl.style.setProperty("--accent-500", shades["500"]);
    this.htmlEl.style.setProperty("--accent-600", shades["600"]);
    this.htmlEl.style.setProperty("--accent-700", shades["700"]);
    this.htmlEl.style.setProperty("--accent-800", shades["800"]);
    this.htmlEl.style.setProperty("--accent-900", shades["900"]);
  }

  private loadSettings(): AppearanceSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppearanceSettings;
        const preset = THEME_PRESETS.find((p) => p.id === parsed.preset.id) || THEME_PRESETS[0];
        return { ...parsed, preset };
      }
    } catch (error) {
      this.loggingService.warn("Failed to load theme settings: " + error);
    }

    const legacyTheme = localStorage.getItem("theme");
    if (legacyTheme === "dark" || legacyTheme === "light") {
      return {
        mode: legacyTheme,
        preset: THEME_PRESETS[0],
      };
    }

    return DEFAULT_APPEARANCE_SETTINGS;
  }

  getSettings(): AppearanceSettings {
    return {
      mode: this.mode(),
      preset: this.preset(),
    };
  }

  updateMode(mode: "light" | "dark" | "system"): void {
    this.mode.set(mode);
    this.persistSettings();
  }

  updatePreset(preset: ThemePreset): void {
    this.preset.set(preset);
    this.applyAccentColor(preset.accentColor);
    this.persistSettings();
  }

  updateAccentColor(color: string): void {
    const currentPreset = this.preset();
    this.preset.set({ ...currentPreset, accentColor: color });
    this.persistSettings();
  }

  private persistSettings(): void {
    const settings = this.getSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  getAccentShades() {
    return getAccentShades(this.preset().accentColor);
  }

  toggleMode(): void {
    const current = this.mode();
    if (current === "light") {
      this.mode.set("dark");
    } else if (current === "dark") {
      this.mode.set("light");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      this.mode.set(prefersDark ? "light" : "dark");
    }
    this.persistSettings();
  }

  getEffectiveMode(): "light" | "dark" {
    const current = this.mode();
    if (current === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return current;
  }

  setMode(mode: "light" | "dark" | "system"): void {
    this.updateMode(mode);
  }

  setPreset(preset: ThemePreset): void {
    this.updatePreset(preset);
  }

  resetToDefaults(): void {
    this.mode.set(DEFAULT_APPEARANCE_SETTINGS.mode);
    this.preset.set(DEFAULT_APPEARANCE_SETTINGS.preset);
    this.persistSettings();
  }
}
