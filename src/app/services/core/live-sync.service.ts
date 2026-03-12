import { inject, Injectable, NgZone, OnDestroy } from "@angular/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Subject } from "rxjs";

/* services */
import { StorageService } from "@services/core/storage.service";
import { ConflictDetectionService } from "@services/core/conflict-detection.service";

/* models */
import { Comment } from "@models/comment.model";

@Injectable({
  providedIn: "root",
})
export class LiveSyncService implements OnDestroy {
  private ngZone = inject(NgZone);
  private storageService = inject(StorageService);
  private conflictDetectionService = inject(ConflictDetectionService);
  private unlistenFns: UnlistenFn[] = [];

  // Event handlers map for automatic storage updates
  private eventHandlers: Record<string, (data: any) => void> = {
    // Todo events
    "todo-created": (data) => this.storageService.addItem("todos", data),
    "todo-updated": (data) => this.storageService.updateItem("todos", data.id, data),
    "todo-deleted": (data) => this.storageService.removeItem("todos", data.id),

    // Task events
    "task-created": (data) => this.storageService.addItem("tasks", data),
    "task-updated": (data) => this.storageService.updateItem("tasks", data.id, data),
    "task-deleted": (data) => this.storageService.removeItem("tasks", data.id),

    // Subtask events
    "subtask-created": (data) => this.storageService.addItem("subtasks", data),
    "subtask-updated": (data) => this.storageService.updateItem("subtasks", data.id, data),
    "subtask-deleted": (data) => this.storageService.removeItem("subtasks", data.id),

    // Category events
    "category-created": (data) => this.storageService.addItem("categories", data),
    "category-updated": (data) => this.storageService.updateItem("categories", data.id, data),
    "category-deleted": (data) => this.storageService.removeItem("categories", data.id),

    // Comment events (special handling)
    "comment-created": (data) => this.handleCommentCreate(data),
    "comment-updated": (data) => this.handleCommentUpdate(data),
    "comment-deleted": (data) => this.handleCommentDelete(data),

    // Chat events
    "chat-created": (data) => this.handleChatUpdate(data),
    "chat-updated": (data) => this.handleChatUpdate(data),
    "chat-deleted": (data) => this.handleChatUpdate(data),
  };

  constructor() {
    this.initListeners();
  }

  private async initListeners() {
    const collections = ["tasks", "todos", "subtasks", "comments", "categories", "chats"];

    for (const collection of collections) {
      const unlisten = await listen(`db-change-${collection}`, (event: any) => {
        this.ngZone.run(() => {
          this.handleDbChange(collection, event.payload);
        });
      });
      this.unlistenFns.push(unlisten);
    }
  }

  private handleDbChange(collection: string, change: any) {
    const operationType = change.operationType;
    let eventType = "";

    const entityName = this.getEntityName(collection);

    switch (operationType) {
      case "insert":
        eventType = `${entityName}-created`;
        break;
      case "update":
      case "replace":
        eventType = `${entityName}-updated`;
        break;
      case "delete":
        eventType = `${entityName}-deleted`;
        break;
    }

    if (eventType) {
      const data = change.fullDocument || { id: change.documentKey?._id || change.documentKey?.id };

      // ✅ Check for conflicts before updating (only for updates)
      let hasConflict = false;
      if (eventType.includes("-updated") && data.id) {
        hasConflict = this.conflictDetectionService.checkConflict(entityName as any, data);
      }

      // Update storage automatically via event handlers (skip if conflict)
      const handler = this.eventHandlers[eventType];
      if (handler && !hasConflict) {
        handler(data);
      }

      // Dispatch custom event to maintain compatibility with existing websocket event listeners
      const customEventName = `ws-${eventType}`;
      window.dispatchEvent(new CustomEvent(customEventName, { detail: data }));
    }
  }

  private handleCommentCreate(data: Comment): void {
    if (data.taskId) {
      const task = this.storageService.getTaskById(data.taskId);
      if (task) {
        this.storageService.addCommentToTask(data.taskId, data);
      }
    } else if (data.subtaskId) {
      const subtask = this.storageService.getSubtaskById(data.subtaskId);
      if (subtask) {
        this.storageService.addCommentToSubtask(data.subtaskId, data);
      }
    }
  }

  private handleCommentUpdate(data: Comment): void {
    // For updates, treat as replacement
    this.handleCommentCreate(data);
  }

  private handleCommentDelete(data: { id: string }): void {
    // Remove comment from all tasks/subtasks
    this.storageService.removeCommentFromAll(data.id);
  }

  private handleChatUpdate(data: any): void {
    // Chat updates are handled via todo updates since chats are nested
    // The todo containing the chat will be updated separately
  }

  private getEntityName(collection: string): string {
    // Return plural form to match StorageEntity type
    return collection;
  }

  ngOnDestroy() {
    this.unlistenFns.forEach((fn) => fn());
  }
}
