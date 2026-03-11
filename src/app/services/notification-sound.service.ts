/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import { NotificationSettingsService } from "@services/notification-settings.service";

@Injectable({
  providedIn: "root",
})
export class NotificationSoundService {
  private notificationSettingsService = inject(NotificationSettingsService);

  playSound(type: "general" | "chat" | "comment") {
    const volume = this.notificationSettingsService.getVolumeForType(type);
    this.notificationSettingsService.playSound(type, volume);
  }

  playTestSound(type: "chat" | "comment" | "general", volume: number) {
    this.notificationSettingsService.playSound(type, volume);
  }
}
