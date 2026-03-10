/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import { LocalWebSocketService } from "@services/local-websocket.service";
import { AuthService } from "@services/auth.service";
import { StorageService } from "@services/storage.service";
import { NotificationStorageService, NotificationAction } from "@services/notification-storage.service";
import { NotificationSoundService } from "@services/notification-sound.service";

@Injectable({
  providedIn: "root",
})
export class NotificationEventListenerService {
  private localWs = inject(LocalWebSocketService);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private notificationStorage = inject(NotificationStorageService);
  private soundService = inject(NotificationSoundService);

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
        this.addNotification(event, data);
      });
    });
  }

  private addNotification(event: string, data: any) {
    const currentUserId = this.authService.getValueByKey("id");

    // Don't notify for own actions
    const isOwnAction = data.userId === currentUserId || data.authorId === currentUserId;
    if (isOwnAction) {
      return;
    }

    const [type, action] = event.split("-") as [
      NotificationAction["type"],
      NotificationAction["action"],
    ];

    // Handle comments and chat messages immediately
    if (type === "comment" || type === "chat") {
      this.handleCommentOrChatNotification(type, action, data);
      return;
    }

    // Skip task updates caused by comments
    if (action === "updated" && type === "task" && data.id) {
      if (this.recentCommentEvents.has(data.id)) {
        const timestamp = this.recentCommentEvents.get(data.id)!;
        if (Date.now() - timestamp < 2000) {
          return;
        }
      }
    }

    this.handleOtherNotification(type, action, data);
  }

  private handleCommentOrChatNotification(
    type: "comment" | "chat",
    action: string,
    data: any
  ): void {
    if (type === "comment" && action === "created" && data.taskId) {
      this.recentCommentEvents.set(data.taskId, Date.now());
    }

    let title = "";
    let message = "";
    const todoId = data.todoId;
    const taskId = data.taskId;
    const commentId = data.id;
    const chatId = data.id;

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
        return;
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
        return;
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

    this.notificationStorage.addNotification(newNotification);
    this.soundService.playSound(type);
  }

  private handleOtherNotification(
    type: "todo" | "task" | "subtask",
    action: NotificationAction["action"],
    data: any
  ): void {
    let title = data.title || "";
    let todoId = data.todoId;
    let taskId = data.taskId;
    const subtaskId = data.subtaskId;

    const entityName = type.charAt(0).toUpperCase() + type.slice(1);

    if (action === "created") {
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

    if (action === "deleted") {
      if (type === "task" && !todoId) {
        todoId = data.todoId;
      } else if (type === "subtask" && !taskId) {
        taskId = data.taskId;
        const task = this.storageService.getTaskById(data.taskId);
        todoId = task?.todoId;
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

      this.notificationStorage.addNotification(newNotification);
      this.soundService.playSound(type);
      return;
    }

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

    if (action === "created") {
      message = todoTitle
        ? `New ${type} "${originalTitle || "unnamed"}" in "${todoTitle}"`
        : `New ${type} "${originalTitle || "unnamed"}" was created`;
      title = originalTitle || `New ${entityName}`;
    } else {
      // Updated
      if (type === "task" && data.comments && Array.isArray(data.comments)) {
        const hasOtherChanges = data.title || data.description || data.status || data.priority;
        if (!hasOtherChanges) {
          return;
        }
      }

      if (type === "task" && data.status) {
        const statusText = this.formatStatus(data.status);
        message = todoTitle
          ? `Task "${originalTitle || "unnamed"}" in "${todoTitle}" moved to ${statusText}`
          : `Task "${originalTitle || "unnamed"}" moved to ${statusText}`;
      } else if (type === "subtask" && data.status) {
        const statusText = this.formatStatus(data.status);
        message = taskTitle
          ? `Subtask "${originalTitle || "unnamed"}" in "${taskTitle}" moved to ${statusText}`
          : `Subtask "${originalTitle || "unnamed"}" moved to ${statusText}`;
      } else {
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

    this.notificationStorage.addNotification(newNotification);
    this.soundService.playSound(type);
  }

  private formatStatus(status: string): string {
    switch (status) {
      case "completed": return "Completed";
      case "skipped": return "Skipped";
      case "failed": return "Failed";
      default: return "Pending";
    }
  }
}
