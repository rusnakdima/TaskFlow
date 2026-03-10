/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import { NotificationSettingsService } from "@services/notification-settings.service";

@Injectable({
  providedIn: "root",
})
export class NotificationSoundService {
  private notificationSettingsService = inject(NotificationSettingsService);

  playSound(type: "todo" | "task" | "subtask" | "chat" | "comment") {
    const volume = this.notificationSettingsService.getVolumeForType(type);
    this.notificationSettingsService.playSound(type, volume);
  }

  playTestSound(type: "todo" | "task" | "subtask" | "chat" | "comment", volume: number) {
    this.notificationSettingsService.playSound(type, volume);
  }
}
