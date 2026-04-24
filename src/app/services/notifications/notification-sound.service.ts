import { Injectable, inject } from "@angular/core";
import { NotificationAction } from "./notify.service";

@Injectable({
  providedIn: "root",
})
export class NotificationSoundService {
  private audioContext: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  private async resumeAudioContext(): Promise<void> {
    const ctx = this.getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }

  playSound(
    type: "general" | "chat" | "comment",
    action?: NotificationAction["action"],
    volume?: number
  ): void {
    const finalVolume = volume ?? this.getVolumeForType(type);
    this.playSoundInternal(type, finalVolume, action);
  }

  private getVolumeForType(type: "chat" | "comment" | "general"): number {
    const settings = this.getSettings();
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

  private getSettings() {
    const saved = localStorage.getItem("notification_settings");
    const defaultSettings = {
      chatVolume: 50,
      commentVolume: 50,
      generalVolume: 50,
      enableSounds: true,
    };
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  }

  private playSoundInternal(
    type: "chat" | "comment" | "general",
    volume: number,
    action?: NotificationAction["action"]
  ): void {
    if (volume <= 0) {
      return;
    }

    const audioContext = this.getAudioContext();

    this.resumeAudioContext()
      .then(() => {
        this.playOscillatorSound(audioContext, type, volume, action);
      })
      .catch(() => {
        this.playOscillatorSound(audioContext, type, volume, action);
      });
  }

  private playOscillatorSound(
    audioContext: AudioContext,
    type: "chat" | "comment" | "general",
    volume: number,
    action?: NotificationAction["action"]
  ): void {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    switch (type) {
      case "chat":
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1174.66, audioContext.currentTime + 0.1);
        break;
      case "comment":
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(783.99, audioContext.currentTime + 0.1);
        break;
      default:
        if (action === "created") {
          oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.1);
        } else if (action === "deleted") {
          oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(349.23, audioContext.currentTime + 0.1);
        } else {
          oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(523.25, audioContext.currentTime + 0.1);
        }
        break;
    }

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }

  playTestSound(type: "chat" | "comment" | "general", volume: number): void {
    this.playSoundInternal(type, volume);
  }

  closeAudioContext(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
