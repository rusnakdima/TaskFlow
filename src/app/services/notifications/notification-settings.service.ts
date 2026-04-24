import { Injectable, inject, signal } from "@angular/core";
import { NotificationAction, NotificationSettings } from "./notify.service";

const DEFAULT_SETTINGS: NotificationSettings = {
  chatVolume: 50,
  commentVolume: 50,
  generalVolume: 50,
  enableSounds: true,
};

@Injectable({
  providedIn: "root",
})
export class NotificationSettingsService {
  private settingsKey = "notification_settings";
  private settingsSignal = signal<NotificationSettings>(DEFAULT_SETTINGS);

  get settings() {
    return this.settingsSignal.asReadonly();
  }

  loadSettings(): void {
    try {
      const saved = localStorage.getItem(this.settingsKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settingsSignal.set({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (e) {
      this.settingsSignal.set(DEFAULT_SETTINGS);
    }
  }

  getSettings(): NotificationSettings {
    return this.settingsSignal();
  }

  saveSettings(newSettings: NotificationSettings): void {
    this.settingsSignal.set(newSettings);
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(newSettings));
    } catch (e) {}
  }

  getVolumeForType(type: "chat" | "comment" | "general"): number {
    const settings = this.settingsSignal();
    if (!settings.enableSounds) return 0;

    switch (type) {
      case "chat":
        return settings.chatVolume / 100;
      case "comment":
        return settings.commentVolume / 100;
      default:
        return settings.generalVolume / 100;
    }
  }
}
