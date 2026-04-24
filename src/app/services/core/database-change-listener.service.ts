import { inject, Injectable, NgZone } from "@angular/core";
import { Subject } from "rxjs";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

import { ConflictDetectionService } from "@services/core/conflict-detection.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageService } from "@services/core/storage.service";
import { Comment } from "@models/comment.model";

type StorageUpdateHandler = (data: any) => void;

@Injectable({
  providedIn: "root",
})
export class DatabaseChangeListenerService {
  private ngZone = inject(NgZone);
  private storageService = inject(StorageService);
  private conflictDetectionService = inject(ConflictDetectionService);
  private notifyService = inject(NotifyService);

  private unlistenFns: UnlistenFn[] = [];
  readonly eventSubject = new Subject<{ event: string; data: any }>();
  private listenersActive = false;

  private storageHandlers: Record<string, StorageUpdateHandler> = {
    "todo-created": (data) => this.storageService.addItem("todos", data),
    "todo-updated": (data) => this.storageService.updateItem("todos", data.id, data),
    "todo-deleted": (data) => {
      if (data.deleted_at !== null) {
        this.storageService.updateItem("todos", data.id, data);
      } else {
        this.storageService.removeItem("todos", data.id);
      }
    },
    "task-created": (data) => this.storageService.addItem("tasks", data),
    "task-updated": (data) => this.storageService.updateItem("tasks", data.id, data),
    "task-deleted": (data) => {
      if (data.deleted_at !== null) {
        this.storageService.updateItem("tasks", data.id, data);
      } else {
        this.storageService.removeRecordWithCascade("tasks", data.id);
      }
    },
    "subtask-created": (data) => this.storageService.addItem("subtasks", data),
    "subtask-updated": (data) => this.storageService.updateItem("subtasks", data.id, data),
    "subtask-deleted": (data) => {
      if (data.deleted_at !== null) {
        this.storageService.updateItem("subtasks", data.id, data);
      } else {
        this.storageService.removeRecordWithCascade("subtasks", data.id);
      }
    },
    "category-created": (data) => this.storageService.addItem("categories", data),
    "category-updated": (data) => this.storageService.updateItem("categories", data.id, data),
    "category-deleted": (data) => this.storageService.removeItem("categories", data.id),
    "comment-created": (data) => this.handleCommentCreate(data),
    "comment-updated": (data) => this.handleCommentCreate(data),
    "comment-deleted": (data) => this.handleCommentDelete(data),
    "chat-created": () => {},
    "chat-updated": () => {},
    "chat-deleted": () => {},
  };

  async initTauriListeners(): Promise<void> {
    const collections = ["tasks", "todos", "subtasks", "comments", "categories", "chats"];

    for (const collection of collections) {
      const unlisten = await listen(`db-change-${collection}`, (event: any) => {
        this.ngZone.run(() => {
          this.handleDbChange(collection, event.payload);
        });
      });
      this.unlistenFns.push(unlisten);
    }

    this.listenersActive = true;
  }

  handleDbChange(collection: string, change: any): void {
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

      let hasConflict = false;
      if (eventType.includes("-updated") && data.id) {
        hasConflict = this.conflictDetectionService.checkConflict(entityName as any, data);
      }

      if (!hasConflict) {
        const handler = this.storageHandlers[eventType];
        if (handler) {
          handler(data);
        }
        this.notifyService.handleNotificationEvent(eventType, data);
      }

      const customEventName = `ws-${eventType}`;
      window.dispatchEvent(new CustomEvent(customEventName, { detail: data }));
      this.eventSubject.next({ event: eventType, data });
    }
  }

  private getEntityName(collection: string): string {
    return collection;
  }

  private handleCommentCreate(data: Comment): void {
    if (data.task_id) {
      const task = this.storageService.getById("tasks", data.task_id);
      if (task) {
        this.storageService.addCommentToTask(data, data.task_id);
      }
    } else if (data.subtask_id) {
      const subtask = this.storageService.getById("subtasks", data.subtask_id);
      if (subtask) {
        this.storageService.addCommentToSubtask(data, data.subtask_id);
      }
    }
  }

  private handleCommentDelete(data: { id: string }): void {
    this.storageService.removeCommentFromAll(data.id);
  }

  cleanup(): void {
    this.unlistenFns.forEach((fn) => fn());
    this.unlistenFns = [];
    this.listenersActive = false;
  }

  areListenersActive(): boolean {
    return this.listenersActive;
  }

  getStorageHandler(eventType: string): StorageUpdateHandler | undefined {
    return this.storageHandlers[eventType];
  }
}
