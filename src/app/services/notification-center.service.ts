/* sys lib */
import { Injectable, signal, inject } from "@angular/core";

/* services */
import { LocalWebSocketService } from "@services/local-websocket.service";
import { AuthService } from "@services/auth.service";
import { NotificationSettingsService } from "@services/notification-settings.service";
import { StorageService } from "@services/storage.service";

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
export class NotificationCenterService {
  private localWs = inject(LocalWebSocketService);
  private authService = inject(AuthService);
  private notificationSettingsService = inject(NotificationSettingsService);
  private storageService = inject(StorageService);

  notifications = signal<NotificationAction[]>([]);
  unreadCount = signal(0);

  // Track recent comment events to suppress duplicate task updates
  private recentCommentEvents = new Map<string, number>(); // taskId -> timestamp

  constructor() {
    this.listenToEvents();
    // Clean up old comment events every 5 seconds
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.recentCommentEvents.entries()) {
        if (now - timestamp > 2000) {
          this.recentCommentEvents.delete(key);
        }
      }
    }, 5000);
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
      "chat-created",
      "chat-cleared",
      "comment-created",
      "comment-deleted",
    ];

    events.forEach((event) => {
      this.localWs.onEvent(event).subscribe((data) => {
        console.log(`[NotificationCenter] Received event: ${event}`, data);
        this.addNotification(event, data);
      });
    });
  }

  private addNotification(event: string, data: any) {
    const currentUserId = this.authService.getValueByKey("id");

    // Don't notify for own actions - check both userId and authorId
    // Note: Some events (like task-updated) may not have userId, only todoId
    const isOwnAction = data.userId === currentUserId || data.authorId === currentUserId;
    if (isOwnAction) {
      console.log(`[NotificationCenter] Skipping own action: ${event}`);
      return;
    }

    const [type, action] = event.split("-") as [
      NotificationAction["type"],
      NotificationAction["action"],
    ];

    // Handle comments and chat messages immediately with their specific sounds
    if (type === "comment" || type === "chat") {
      this.handleCommentOrChatNotification(type, action, data);
      return;
    }

    // Skip task updates that arrive within 2 seconds of a comment
    // (these are caused by the comment being added to the task)
    if (action === "updated" && type === "task" && data.id) {
      if (this.recentCommentEvents.has(data.id)) {
        const timestamp = this.recentCommentEvents.get(data.id)!;
        if (Date.now() - timestamp < 2000) {
          console.log(`[NotificationCenter] Skipping task update after comment: ${data.id}`);
          return; // Skip this task update, it's from the comment
        }
      }
    }

    // Handle other notifications (todo, task, subtask)
    this.handleOtherNotification(type, action, data);
  }

  private handleCommentOrChatNotification(
    type: "comment" | "chat",
    action: string,
    data: any
  ): void {
    console.log(`[NotificationCenter] Handling ${type} notification: ${action}`, data);

    // Track comment events to suppress duplicate task updates
    if (type === "comment" && action === "created" && data.taskId) {
      this.recentCommentEvents.set(data.taskId, Date.now());
    }

    const entityName = type.charAt(0).toUpperCase() + type.slice(1);
    let title = "";
    let message = "";
    let todoId = data.todoId;
    let taskId = data.taskId;
    let commentId = data.id; // For comments, data.id is the commentId
    let chatId = data.id; // For chat, data.id is the chatId

    // Get context from storage
    let todoTitle = "";
    if (todoId) {
      const todo = this.storageService.getTodoById(todoId);
      todoTitle = todo?.title || "";
    }

    let taskTitle = "";
    if (taskId) {
      const task = this.storageService.getTaskById(taskId);
      taskTitle = task?.title || "";
    }

    if (type === "chat") {
      if (action === "created") {
        title = "New Chat Message";
        message = todoTitle
          ? `${data.authorName} in "${todoTitle}": ${data.content}`
          : `${data.authorName}: ${data.content}`;
      } else if (action === "cleared") {
        title = "Chat Cleared";
        message = todoTitle ? `Chat in "${todoTitle}" was cleared` : "Chat was cleared";
      } else {
        console.log(`[NotificationCenter] Skipping unknown chat action: ${action}`);
        return; // Skip other chat actions
      }
    } else if (type === "comment") {
      if (action === "created") {
        title = "New Comment";
        const contextParts: string[] = [];
        if (todoTitle) contextParts.push(`"${todoTitle}"`);
        if (taskTitle) contextParts.push(`task "${taskTitle}"`);
        const context = contextParts.join(" > ");

        message = `${data.authorName} commented on ${context || "a task"}: "${data.content}"`;
      } else if (action === "deleted") {
        title = "Comment Deleted";
        const contextParts: string[] = [];
        if (todoTitle) contextParts.push(`"${todoTitle}"`);
        if (taskTitle) contextParts.push(`task "${taskTitle}"`);
        const context = contextParts.join(" > ");

        message = `Comment on ${context || "a task"} was deleted`;
      } else {
        console.log(`[NotificationCenter] Skipping unknown comment action: ${action}`);
        return; // Skip other comment actions
      }
    }

    const notificationAction =
      action === "cleared" ? "updated" : (action as NotificationAction["action"]);

    const newNotification: NotificationAction = {
      id: Math.random().toString(36).substring(7),
      type,
      action: notificationAction,
      title,
      message,
      timestamp: new Date(),
      read: false,
      todoId,
      taskId,
      commentId: type === "comment" ? commentId : undefined,
      chatId: type === "chat" ? chatId : undefined,
    };

    console.log(`[NotificationCenter] Adding notification:`, newNotification);
    this.notifications.update((n) => [newNotification, ...n].slice(0, 50));
    this.updateUnreadCount();

    console.log(`[NotificationCenter] Playing sound for ${type}`);
    this.playNotificationSound(type);
  }

  private handleOtherNotification(
    type: "todo" | "task" | "subtask",
    action: NotificationAction["action"],
    data: any
  ): void {
    let title = data.title || "";
    let todoId = data.todoId;
    let taskId = data.taskId;
    let subtaskId = data.subtaskId;

    const entityName = type.charAt(0).toUpperCase() + type.slice(1);

    // For created items, we want to show notification immediately with sound
    if (action === "created") {
      // Defer storage access to avoid signal issues
      setTimeout(() => {
        let todoTitle = "";
        if (todoId) {
          const todo = this.storageService.getTodoById(todoId);
          todoTitle = todo?.title || "";
        }

        let taskTitle = "";
        if (taskId) {
          const task = this.storageService.getTaskById(taskId);
          taskTitle = task?.title || "";
        }

        this.buildAndAddNotification(
          type,
          title,
          entityName,
          todoTitle,
          taskTitle,
          todoId,
          taskId,
          subtaskId,
          data,
          action
        );
      }, 0);
      return;
    }

    // For deleted items, use the data from the event directly
    // The WebSocket now sends the full object with todoId, taskId, etc.
    if (action === "deleted") {
      // Extract IDs from the broadcast data
      if (type === "task" && !todoId) {
        todoId = data.todoId;
      } else if (type === "subtask" && !taskId) {
        taskId = data.taskId;
        todoId = this.getTodoIdForTask(data.taskId);
      }

      const message = `${entityName} "${title || "unnamed"}" was deleted`;
      title = `Deleted ${type}`;

      const newNotification: NotificationAction = {
        id: Math.random().toString(36).substring(7),
        type,
        action,
        title,
        message,
        timestamp: new Date(),
        read: false,
        todoId,
        taskId,
        subtaskId,
      };

      this.notifications.update((n) => [newNotification, ...n].slice(0, 50));
      this.updateUnreadCount();
      this.playNotificationSound(type);
      return;
    }

    // For updated items, defer storage access to avoid signal issues
    setTimeout(() => {
      let todoTitle = "";
      if (todoId) {
        const todo = this.storageService.getTodoById(todoId);
        todoTitle = todo?.title || "";
      }

      let taskTitle = "";
      if (taskId) {
        const task = this.storageService.getTaskById(taskId);
        taskTitle = task?.title || "";
      }

      this.buildAndAddNotification(
        type,
        title,
        entityName,
        todoTitle,
        taskTitle,
        todoId,
        taskId,
        subtaskId,
        data,
        action
      );
    }, 0);
  }

  // Helper to get todoId from taskId
  private getTodoIdForTask(taskId: string): string | undefined {
    const task = this.storageService.getTaskById(taskId);
    return task?.todoId;
  }

  private buildAndAddNotification(
    type: NotificationAction["type"],
    originalTitle: string,
    entityName: string,
    todoTitle: string,
    taskTitle: string,
    todoId: string | undefined,
    taskId: string | undefined,
    subtaskId: string | undefined,
    data: any,
    action: NotificationAction["action"]
  ): void {
    let title = originalTitle;
    let message = "";

    if (type === "chat") {
      title = "New Chat Message";
      message = todoTitle
        ? `${data.authorName} in "${todoTitle}": ${data.content}`
        : `${data.authorName}: ${data.content}`;
    } else if (type === "comment") {
      title = "New Comment";
      const contextParts: string[] = [];
      if (todoTitle) contextParts.push(`"${todoTitle}"`);
      if (taskTitle) contextParts.push(`task "${taskTitle}"`);
      const context = contextParts.join(" > ");

      message = `${data.authorName} commented on ${context || "a task"}: "${data.content}"`;
    } else if (action === "created") {
      message = todoTitle
        ? `New ${type} "${originalTitle || "unnamed"}" in "${todoTitle}"`
        : `New ${type} "${originalTitle || "unnamed"}" was created`;
      title = originalTitle || `New ${entityName}`;
    } else {
      // Updated
      // Skip task updates that are ONLY comment additions (not other field changes)
      // Check if ONLY comments changed (no title, description, status, priority changes)
      if (type === "task" && data.comments && Array.isArray(data.comments)) {
        const hasOtherChanges = data.title || data.description || data.status || data.priority;
        if (!hasOtherChanges) {
          // This is likely just a comment update, skip to avoid duplicate notification
          console.log(`[NotificationCenter] Skipping task update - only comments changed`);
          return;
        }
      }

      if (type === "task" && data.status) {
        const statusText =
          data.status === "completed"
            ? "Completed"
            : data.status === "skipped"
              ? "Skipped"
              : data.status === "failed"
                ? "Failed"
                : "Pending";
        message = todoTitle
          ? `Task "${originalTitle || "unnamed"}" in "${todoTitle}" moved to ${statusText}`
          : `Task "${originalTitle || "unnamed"}" moved to ${statusText}`;
      } else if (type === "subtask" && data.status) {
        const statusText =
          data.status === "completed"
            ? "Completed"
            : data.status === "skipped"
              ? "Skipped"
              : data.status === "failed"
                ? "Failed"
                : "Pending";
        message = taskTitle
          ? `Subtask "${originalTitle || "unnamed"}" in "${taskTitle}" moved to ${statusText}`
          : `Subtask "${originalTitle || "unnamed"}" moved to ${statusText}`;
      } else {
        // Generic update message (title rename, description change, etc.)
        message = todoTitle
          ? `${entityName} "${originalTitle || "unnamed"}" in "${todoTitle}" was updated`
          : `${entityName} "${originalTitle || "unnamed"}" was updated`;
      }
      title = originalTitle || `${entityName} Updated`;
    }

    const newNotification: NotificationAction = {
      id: Math.random().toString(36).substring(7),
      type,
      action,
      title,
      message,
      timestamp: new Date(),
      read: false,
      todoId,
      taskId,
      subtaskId,
    };

    this.notifications.update((n) => [newNotification, ...n].slice(0, 50));
    this.updateUnreadCount();
    this.playNotificationSound(type);
  }

  private playNotificationSound(type: NotificationAction["type"]): void {
    const volume = this.notificationSettingsService.getVolumeForType(type);
    this.notificationSettingsService.playSound(type, volume);
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
