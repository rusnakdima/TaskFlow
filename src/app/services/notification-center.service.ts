/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import {
  NotificationStorageService,
  NotificationAction,
} from "@services/notification-storage.service";
import { NotificationEventListenerService } from "@services/notification-event-listener.service";

export { NotificationAction };

@Injectable({
  providedIn: "root",
})
export class NotificationCenterService {
  private storage = inject(NotificationStorageService);
  // Injecting the listener service ensures it starts listening to events
  private listener = inject(NotificationEventListenerService);

  notifications = this.storage.notifications;
  unreadCount = this.storage.unreadCount;

  markAsRead(id: string) {
    this.storage.markAsRead(id);
  }

  markAllAsRead() {
    this.storage.markAllAsRead();
  }

  clearAll() {
    this.storage.clearAll();
  }
}
