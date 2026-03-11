/* sys lib */
import { Injectable, signal } from "@angular/core";

export interface NotificationSettings {
  chatVolume: number;
  commentVolume: number;
  generalVolume: number;
  enableSounds: boolean;
}

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
  settings = signal<NotificationSettings>(DEFAULT_SETTINGS);

  constructor() {
    this.loadSettings();
  }

  loadSettings(): void {
    try {
      const saved = localStorage.getItem(this.settingsKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings.set({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (e) {
      this.settings.set(DEFAULT_SETTINGS);
    }
  }

  getSettings(): NotificationSettings {
    return this.settings();
  }

  saveSettings(newSettings: NotificationSettings): void {
    this.settings.set(newSettings);
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(newSettings));
    } catch (e) {
      // Failed to save settings
    }
  }

  getVolumeForType(type: "chat" | "comment" | "general"): number {
    const settings = this.settings();
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

  playTestSound(type: "chat" | "comment" | "general", volume: number): void {
    this.playSound(type, volume);
  }

  playSound(type: "chat" | "comment" | "general", volume: number): void {
    if (volume <= 0) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Different tones for different notification types
    switch (type) {
      case "chat":
        // Higher pitched, friendly chime for chat messages
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(1174.66, audioContext.currentTime + 0.1); // D6
        break;
      case "comment":
        // Medium pitched, softer tone for comments
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
        oscillator.frequency.exponentialRampToValueAtTime(783.99, audioContext.currentTime + 0.1); // G5
        break;
      default:
        // General notification for todo/task/subtask create/update/delete
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        break;
    }

    // Volume is already normalized (0-1), use it directly for accurate volume control
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }
}
