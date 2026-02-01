/* sys lib */
import { Injectable, signal, inject } from "@angular/core";

/* services */
import { LocalWebSocketService } from "./local-websocket.service";

export interface NotificationAction {
  id: string;
  type: "todo" | "task" | "subtask";
  action: "created" | "updated" | "deleted";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

@Injectable({
  providedIn: "root",
})
export class NotificationCenterService {
  private localWs = inject(LocalWebSocketService);

  notifications = signal<NotificationAction[]>([]);
  unreadCount = signal(0);

  constructor() {
    this.listenToEvents();
  }

  private listenToEvents() {
    const events = [
      "todo-created",
      "todo-updated",
      "todo-deleted",
      "task-created",
      "task-updated",
      "task-deleted",
      "subtask-created",
      "subtask-updated",
      "subtask-deleted",
    ];

    events.forEach((event) => {
      this.localWs.onEvent(event).subscribe((data) => {
        this.addNotification(event, data);
      });
    });
  }

  private addNotification(event: string, data: any) {
    const [type, action] = event.split("-") as [
      NotificationAction["type"],
      NotificationAction["action"],
    ];

    let title = data.title || "";
    let message = "";

    const entityName = type.charAt(0).toUpperCase() + type.slice(1);

    if (action === "deleted") {
      message = `${entityName} was deleted`;
      title = `Deleted ${type}`;
    } else if (action === "created") {
      message = `New ${type} "${title || "unnamed"}" was created`;
      title = title || `New ${entityName}`;
    } else {
      // Updated
      if (type === "task" && data.status) {
        message = `Task "${title || "unnamed"}" moved to ${data.status}`;
      } else {
        message = `${entityName} "${title || "unnamed"}" was updated`;
      }
      title = title || `${entityName} Updated`;
    }

    const newNotification: NotificationAction = {
      id: Math.random().toString(36).substring(7),
      type,
      action,
      title,
      message,
      timestamp: new Date(),
      read: false,
    };

    this.notifications.update((n) => [newNotification, ...n].slice(0, 50));
    this.updateUnreadCount();
  }

  markAsRead(id: string) {
    this.notifications.update((notifications) =>
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    this.updateUnreadCount();
  }

  markAllAsRead() {
    this.notifications.update((notifications) => notifications.map((n) => ({ ...n, read: true })));
    this.updateUnreadCount();
  }

  private updateUnreadCount() {
    this.unreadCount.set(this.notifications().filter((n) => !n.read).length);
  }

  clearAll() {
    this.notifications.set([]);
    this.unreadCount.set(0);
  }
}
