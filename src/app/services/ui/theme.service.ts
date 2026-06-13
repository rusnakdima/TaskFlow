import { Injectable, inject, signal, effect } from "@angular/core";
import {
  AppearanceSettings,
  ThemePreset,
  THEME_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
  getAccentShades,
} from "@models/theme.model";
import { LoggingService } from "@app/shared/services/logging.service";

const STORAGE_KEY = "appearance_settings";

@Injectable({
  providedIn: "root",
})
export class ThemeService {
  private loggingService = inject(LoggingService);
  private settings = signal<AppearanceSettings>(this.loadSettings());

  mode = signal<"light" | "dark" | "system">(this.settings().mode);
  preset = signal<ThemePreset>(this.settings().preset);

  private htmlEl = document.querySelector("html");

  constructor() {
    effect(() => {
      const mode = this.mode();
      if (this.htmlEl) {
        this.htmlEl.setAttribute("data-theme", mode === "system" ? "light" : mode);
      }
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
    } catch (error) {
      this.loggingService.warn("ThemeService", "Failed to load theme settings:", error);
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
    this.persistSettings();
  }

  updateAccentColor(color: string): void {
    const current = this.settings();
    this.settings.set({ ...current, accentColor: color });
    this.persistSettings();
  }

  private persistSettings(): void {
    const settings = this.getSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  getAccentShades() {
    return getAccentShades(this.preset().accentColor);
  }
}
