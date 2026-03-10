/* sys lib */
import { Injectable, signal } from "@angular/core";

export interface NotificationAction {
  id: string;
  type: "todo" | "task" | "subtask" | "chat" | "comment";
  action: "created" | "updated" | "deleted";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  todoId?: string;
  taskId?: string;
  subtaskId?: string;
  commentId?: string;
  chatId?: string;
}

@Injectable({
  providedIn: "root",
})
export class NotificationStorageService {
  notifications = signal<NotificationAction[]>([]);
  unreadCount = signal(0);

  addNotification(notification: NotificationAction) {
    this.notifications.update((n) => [notification, ...n].slice(0, 50));
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

  clearAll() {
    this.notifications.set([]);
    this.unreadCount.set(0);
  }

  private updateUnreadCount() {
    this.unreadCount.set(this.notifications().filter((n) => !n.read).length);
  }
}
