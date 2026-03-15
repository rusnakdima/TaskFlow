/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* services */
import { NotifyService } from "@services/notifications/notify.service";

@Component({
  selector: "app-settings",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, CheckboxComponent],
  templateUrl: "./settings.view.html",
})
export class SettingsView implements OnInit {
  private notifyService = inject(NotifyService);

  // Notification sound settings
  chatNotificationVolume = signal(50);
  commentNotificationVolume = signal(50);
  generalNotificationVolume = signal(50);
  enableNotificationSounds = signal(true);

  ngOnInit(): void {
    // Load saved settings
    const settings = this.notifyService.getSettings();
    this.chatNotificationVolume.set(settings.chatVolume);
    this.commentNotificationVolume.set(settings.commentVolume);
    this.generalNotificationVolume.set(settings.generalVolume);
    this.enableNotificationSounds.set(settings.enableSounds);
  }

  saveSettings(): void {
    this.notifyService.saveSettings({
      chatVolume: this.chatNotificationVolume(),
      commentVolume: this.commentNotificationVolume(),
      generalVolume: this.generalNotificationVolume(),
      enableSounds: this.enableNotificationSounds(),
    });
    this.notifyService.showSuccess("Settings saved successfully!");
  }

  resetToDefaults(): void {
    this.chatNotificationVolume.set(50);
    this.commentNotificationVolume.set(50);
    this.generalNotificationVolume.set(50);
    this.enableNotificationSounds.set(true);
    this.saveSettings();
  }

  testSound(type: "chat" | "comment" | "general"): void {
    const volume =
      type === "chat"
        ? this.chatNotificationVolume()
        : type === "comment"
          ? this.commentNotificationVolume()
          : this.generalNotificationVolume();
    this.notifyService.playTestSound(type, volume / 100);
  }
}
