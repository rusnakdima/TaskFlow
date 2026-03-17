/* sys lib */
import { Injectable, inject, signal, computed, OnDestroy } from "@angular/core";
import { Subject, filter } from "rxjs";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";

/* models */
import { INotify, ResponseStatus } from "@models/response.model";

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

export interface NotificationSettings {
  chatVolume: number;
  commentVolume: number;
  generalVolume: number;
  enableSounds: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  chatVolume: 50,
  commentVolume: 50,
  generalVolume: 50,
  enableSounds: true,
};

/**
 * NotifyService - Consolidated notification management
 * Merges: NotificationStorageService, NotificationSettingsService,
 *         NotificationSoundService, NotificationCenterService,
 *         NotificationEventListenerService
 */
@Injectable({
  providedIn: "root",
})
export class NotifyService implements OnDestroy {
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(StorageService);

  // NotifyService subject for toast notifications
  private notify = new Subject<INotify>();

  // Notification state (from NotificationStorageService)
  private notificationsSignal = signal<NotificationAction[]>([]);
  private unreadCountSignal = signal(0);

  // Settings state (from NotificationSettingsService)
  private settingsKey = "notification_settings";
  private settingsSignal = signal<NotificationSettings>(DEFAULT_SETTINGS);

  // Track recent comment events to suppress duplicate task updates
  private recentCommentEvents = new Map<string, number>(); // taskId -> timestamp

  // Audio context for playing notification sounds (reused across calls)
  private audioContext: AudioContext | null = null;

  // Public signals
  get notifications() {
    return this.notificationsSignal.asReadonly();
  }

  get unreadCount() {
    return this.unreadCountSignal.asReadonly();
  }

  get settings() {
    return this.settingsSignal.asReadonly();
  }

  constructor() {
    this.loadSettings();
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

  // ==================== NOTIFY SERVICE METHODS (Toast Notifications) ====================

  /**
   * Get the notify subject for toast notifications
   */
  getNotifySubject(): Subject<INotify> {
    return this.notify;
  }

  /**
   * Show a toast notification
   */
  showNotify(status: ResponseStatus, message: string) {
    try {
      this.notify.next({ status, message });
    } catch (error) {
      // Error silently ignored
    }
  }

  /**
   * Show a success toast notification
   */
  showSuccess(message: string) {
    this.showNotify(ResponseStatus.SUCCESS, message);
  }

  /**
   * Show an info toast notification
   */
  showInfo(message: string) {
    this.showNotify(ResponseStatus.INFO, message);
  }

  /**
   * Show a warning toast notification
   */
  showWarning(message: string) {
    this.showNotify(ResponseStatus.WARNING, message);
  }

  /**
   * Show an error toast notification
   */
  showError(message: string) {
    this.showNotify(ResponseStatus.ERROR, message);
  }

  // ==================== SETTINGS METHODS ====================

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(this.settingsKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settingsSignal.set({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (e) {
      this.settingsSignal.set(DEFAULT_SETTINGS);
    }
  }

  getSettings(): NotificationSettings {
    return this.settingsSignal();
  }

  saveSettings(newSettings: NotificationSettings): void {
    this.settingsSignal.set(newSettings);
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(newSettings));
    } catch (e) {
      // Error silently ignored
    }
  }

  getVolumeForType(type: "chat" | "comment" | "general"): number {
    const settings = this.settingsSignal();
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

  // ==================== SOUND METHODS ====================

  playSound(type: "general" | "chat" | "comment", action?: NotificationAction["action"]) {
    const settings = this.settingsSignal();
    const volume = this.getVolumeForType(type);
    this.playSoundInternal(type, volume, action);
  }

  playTestSound(type: "chat" | "comment" | "general", volume: number) {
    this.playSoundInternal(type, volume);
  }

  /**
   * Get or create the AudioContext instance
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  /**
   * Resume the AudioContext if it's suspended
   */
  private async resumeAudioContext(): Promise<void> {
    const ctx = this.getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
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

    // Resume the audio context if suspended (required for user interaction)
    this.resumeAudioContext()
      .then(() => {
        this.playOscillatorSound(audioContext, type, volume, action);
      })
      .catch(() => {
        // If resume fails, try playing anyway (might work in some cases)
        this.playOscillatorSound(audioContext, type, volume, action);
      });
  }

  /**
   * Play the actual oscillator sound after audio context is ready
   */
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

    // Different tones for different notification types
    switch (type) {
      case "chat":
        // Higher pitched, friendly chime for chat messages
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(1174.66, audioContext.currentTime + 0.1); // D6
        break;
      case "comment":
        // Medium pitched, softer tone for comments
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
        oscillator.frequency.exponentialRampToValueAtTime(783.99, audioContext.currentTime + 0.1); // G5
        break;
      default:
        // General notification for todo/task/subtask
        if (action === "created") {
          // Upward chime
          oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
          oscillator.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        } else if (action === "deleted") {
          // Downward tone
          oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
          oscillator.frequency.exponentialRampToValueAtTime(349.23, audioContext.currentTime + 0.1); // F4
        } else {
          // Neutral update tone
          oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
          oscillator.frequency.exponentialRampToValueAtTime(523.25, audioContext.currentTime + 0.1);
        }
        break;
    }

    // Volume is already normalized (0-1), use it directly for accurate volume control
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }

  private addNotification(notification: NotificationAction) {
    this.notificationsSignal.update((n) => [notification, ...n].slice(0, 50));
    this.updateUnreadCount();
  }

  markAsRead(id: string) {
    this.notificationsSignal.update((notifications) =>
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    this.updateUnreadCount();
  }

  markAllAsRead() {
    this.notificationsSignal.update((notifications) =>
      notifications.map((n) => ({ ...n, read: true }))
    );
    this.updateUnreadCount();
  }

  clearAll() {
    this.notificationsSignal.set([]);
    this.unreadCountSignal.set(0);
  }

  private updateUnreadCount() {
    this.unreadCountSignal.set(this.notificationsSignal().filter((n) => !n.read).length);
  }

  // ==================== NOTIFICATION EVENT HANDLING ====================

  /**
   * Handle notification events from WebSocketService
   */
  handleNotificationEvent(event: string, data: any): void {
    this.addNotificationEvent(event, data);
  }

  /**
   * Handle local user actions (from DataSyncProvider)
   */
  handleLocalAction(table: string, operation: string, data: any): void {
    const typeMapping: Record<string, NotificationAction["type"]> = {
      todos: "todo",
      tasks: "task",
      subtasks: "subtask",
      comments: "comment",
      chats: "chat",
    };

    const actionMapping: Record<string, NotificationAction["action"]> = {
      create: "created",
      update: "updated",
      delete: "deleted",
    };

    const type = typeMapping[table];
    const action = actionMapping[operation];

    if (type && action) {
      // For local actions, we always play sound and show notification in header
      // but we mark it as "own action" so buildAndAddNotification knows how to handle it
      this.addNotificationEvent(`${type}-${action}`, data, true);
    }
  }

  private addNotificationEvent(event: string, data: any, isLocalAction: boolean = false) {
    const token = this.jwtTokenService.getToken();
    const currentUserId = this.jwtTokenService.getUserId(token);

    // Check if this is own action
    const isOwnAction =
      isLocalAction || data.userId === currentUserId || data.authorId === currentUserId;

    const [type, action] = event.split("-") as [
      NotificationAction["type"],
      NotificationAction["action"],
    ];

    // Handle comments and chat messages immediately (with sound)
    if (type === "comment" || type === "chat") {
      this.handleCommentOrChatNotification(type, action, data, !isOwnAction || isLocalAction);
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

    // Play sound for all actions, show notification for others' actions OR local actions
    this.handleOtherNotification(type, action, data, !isOwnAction || isLocalAction);
  }

  private handleCommentOrChatNotification(
    type: "comment" | "chat",
    action: string,
    data: any,
    shouldNotify: boolean
  ): void {
    // Track comment events for task update suppression
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
      const todo = this.storageService.getById("todos", todoId);
      todoTitle = todo?.title || "";
    }

    let taskTitle = "";
    if (taskId) {
      const task = this.storageService.getById("tasks", taskId);
      taskTitle = task?.title || "";
    }

    // Build notification content based on type and action
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
        // For other chat actions (update, delete), still play sound but don't create notification
        this.playSound(type, action === "cleared" ? "updated" : (action as any));
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
        // For other comment actions (update), still play sound but don't create notification
        this.playSound(type, action as any);
        return;
      }
    }

    const notificationAction =
      action === "cleared" ? "updated" : (action as NotificationAction["action"]);

    // Always play sound for chat/comment actions
    this.playSound(type, notificationAction);

    // Only store notification if not own action and we have valid content
    if (shouldNotify && title && message) {
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

      this.addNotification(newNotification);
    }
  }

  private handleOtherNotification(
    type: "todo" | "task" | "subtask",
    action: NotificationAction["action"],
    data: any,
    shouldNotify: boolean
  ): void {
    let title = data.title || "";
    let todoId = data.todoId;
    let taskId = data.taskId;
    const subtaskId = data.subtaskId;

    const entityName = type.charAt(0).toUpperCase() + type.slice(1);

    // Always play sound for create/update/delete
    this.playSound("general", action);

    if (action === "created") {
      setTimeout(() => {
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
          action,
          shouldNotify
        );
      }, 0);
      return;
    }

    if (action === "deleted") {
      if (type === "task" && !todoId) {
        todoId = data.todoId;
      } else if (type === "subtask" && !taskId) {
        taskId = data.taskId;
        const task = this.storageService.getById("tasks", data.taskId);
        todoId = task?.todoId;
      }

      // Only store notification if not own action
      if (shouldNotify) {
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

        this.addNotification(newNotification);
      }
      return;
    }

    setTimeout(() => {
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
        action,
        shouldNotify
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
    action: NotificationAction["action"],
    shouldNotify: boolean
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

    // Only store notification if shouldNotify is true
    if (shouldNotify) {
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

      this.addNotification(newNotification);
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

  // ==================== CLEANUP ====================

  ngOnDestroy(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
