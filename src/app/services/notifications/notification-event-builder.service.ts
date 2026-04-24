import { Injectable, inject } from "@angular/core";
import { NotificationAction } from "./notify.service";
import { StorageService } from "@services/core/storage.service";
import { NotificationSoundService } from "./notification-sound.service";

@Injectable({
  providedIn: "root",
})
export class NotificationEventBuilderService {
  private storageService = inject(StorageService);
  private soundService = inject(NotificationSoundService);

  private recentCommentEvents = new Map<string, number>();

  handleCommentOrChatNotification(
    type: "comment" | "chat",
    action: string,
    data: any,
    shouldNotify: boolean
  ): NotificationAction | null {
    if (type === "comment" && action === "created" && data.task_id) {
      this.recentCommentEvents.set(data.task_id, Date.now());
    }

    let title = "";
    let message = "";
    const todoId = data.todo_id;
    const taskId = data.task_id;
    const commentId = data.id;
    const chatId = data.id;

    let todoTitle = "";
    if (todoId) {
      const todo = this.storageService.getById("todos", todoId);
      todoTitle = todo?.title || "";
    }

    let taskTitle = "";
    if (taskId) {
      const task = this.storageService.getById("tasks", taskId);
      taskTitle = task?.title || "";
    }

    if (type === "chat") {
      if (action === "created") {
        title = "New Chat Message";
        message = todoTitle
          ? `${data.author_name} in "${todoTitle}": ${data.content}`
          : `${data.author_name}: ${data.content}`;
      } else if (action === "cleared") {
        title = "Chat Cleared";
        message = todoTitle ? `Chat in "${todoTitle}" was cleared` : "Chat was cleared";
      } else {
        const notificationAction = action === "cleared" ? "updated" : (action as any);
        this.soundService.playSound(type, notificationAction);
        return null;
      }
    } else if (type === "comment") {
      if (action === "created") {
        title = "New Comment";
        const contextParts: string[] = [];
        if (todoTitle) contextParts.push(`"${todoTitle}"`);
        if (taskTitle) contextParts.push(`task "${taskTitle}"`);
        const context = contextParts.join(" > ");
        message = `${data.author_name} commented on ${context || "a task"}: "${data.content}"`;
      } else if (action === "deleted") {
        title = "Comment Deleted";
        const contextParts: string[] = [];
        if (todoTitle) contextParts.push(`"${todoTitle}"`);
        if (taskTitle) contextParts.push(`task "${taskTitle}"`);
        const context = contextParts.join(" > ");
        message = `Comment on ${context || "a task"} was deleted`;
      } else {
        this.soundService.playSound(type, action as any);
        return null;
      }
    }

    const notificationAction =
      action === "cleared" ? "updated" : (action as NotificationAction["action"]);

    this.soundService.playSound(type, notificationAction);

    if (shouldNotify && title && message) {
      return {
        id: Math.random().toString(36).substring(7),
        type,
        action: notificationAction,
        title,
        message,
        timestamp: new Date(),
        read: false,
        todo_id: todoId,
        task_id: taskId,
        comment_id: type === "comment" ? commentId : undefined,
        chat_id: type === "chat" ? chatId : undefined,
      };
    }

    return null;
  }

  handleOtherNotification(
    type: "todo" | "task" | "subtask",
    action: NotificationAction["action"],
    data: any,
    shouldNotify: boolean
  ): NotificationAction | null {
    let title = data.title || "";
    let todoId = data.todo_id;
    let taskId = data.task_id;
    const subtaskId = data.subtask_id;

    const entityName = type.charAt(0).toUpperCase() + type.slice(1);

    this.soundService.playSound("general", action);

    if (action === "created") {
      return this.buildNotification(
        type,
        title,
        entityName,
        todoId,
        taskId,
        subtaskId,
        data,
        action,
        shouldNotify
      );
    }

    if (action === "deleted") {
      if (type === "task" && !todoId) {
        todoId = data.todo_id;
      } else if (type === "subtask" && !taskId) {
        taskId = data.task_id;
        const task = this.storageService.getById("tasks", data.task_id);
        todoId = task?.todo_id;
      }

      if (shouldNotify) {
        const message = `${entityName} "${title || "unnamed"}" was deleted`;
        title = `Deleted ${type}`;

        return {
          id: Math.random().toString(36).substring(7),
          type,
          action,
          title,
          message,
          timestamp: new Date(),
          read: false,
          todo_id: todoId,
          task_id: taskId,
          subtask_id: subtaskId,
        };
      }
      return null;
    }

    return this.buildNotification(
      type,
      title,
      entityName,
      todoId,
      taskId,
      subtaskId,
      data,
      action,
      shouldNotify
    );
  }

  buildAndAddNotification(
    type: NotificationAction["type"],
    originalTitle: string,
    entityName: string,
    todoId: string | undefined,
    taskId: string | undefined,
    subtaskId: string | undefined,
    data: any,
    action: NotificationAction["action"],
    shouldNotify: boolean
  ): NotificationAction | null {
    let title = originalTitle;
    let message = "";

    if (action === "created") {
      const todoTitle = todoId ? this.storageService.getById("todos", todoId)?.title || "" : "";
      message = todoTitle
        ? `New ${type} "${originalTitle || "unnamed"}" in "${todoTitle}"`
        : `New ${type} "${originalTitle || "unnamed"}" was created`;
      title = originalTitle || `New ${entityName}`;
    } else {
      if (type === "task" && data.comments && Array.isArray(data.comments)) {
        const hasOtherChanges = data.title || data.description || data.status || data.priority;
        if (!hasOtherChanges) {
          return null;
        }
      }

      const todoTitle = todoId ? this.storageService.getById("todos", todoId)?.title || "" : "";
      const taskTitle = taskId ? this.storageService.getById("tasks", taskId)?.title || "" : "";

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

    if (shouldNotify) {
      return {
        id: Math.random().toString(36).substring(7),
        type,
        action,
        title,
        message,
        timestamp: new Date(),
        read: false,
        todo_id: todoId,
        task_id: taskId,
        subtask_id: subtaskId,
      };
    }

    return null;
  }

  private buildNotification(
    type: "todo" | "task" | "subtask",
    originalTitle: string,
    entityName: string,
    todoId: string | undefined,
    taskId: string | undefined,
    subtaskId: string | undefined,
    data: any,
    action: NotificationAction["action"],
    shouldNotify: boolean
  ): NotificationAction | null {
    let todoTitle = "";
    if (todoId) {
      const todo = this.storageService.getById("todos", todoId);
      todoTitle = todo?.title || "";
    }
    let taskTitle = "";
    if (taskId) {
      const task = this.storageService.getById("tasks", taskId);
      taskTitle = task?.title || "";
    }
    return this.buildAndAddNotification(
      type,
      originalTitle,
      entityName,
      todoId,
      taskId,
      subtaskId,
      data,
      action,
      shouldNotify
    );
  }

  shouldSkipTaskUpdate(taskId: string): boolean {
    if (this.recentCommentEvents.has(taskId)) {
      const timestamp = this.recentCommentEvents.get(taskId)!;
      if (Date.now() - timestamp < 2000) {
        return true;
      }
    }
    return false;
  }

  trackCommentEvent(taskId: string): void {
    this.recentCommentEvents.set(taskId, Date.now());
  }

  cleanupOldCommentEvents(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.recentCommentEvents.entries()) {
      if (now - timestamp > 2000) {
        this.recentCommentEvents.delete(key);
      }
    }
  }

  private formatStatus(status: string): string {
    switch (status) {
      case "completed":
        return "Completed";
      case "skipped":
        return "Skipped";
      case "failed":
        return "Failed";
      default:
        return "Pending";
    }
  }
}
