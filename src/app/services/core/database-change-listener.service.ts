import { inject, Injectable, NgZone } from "@angular/core";
import { Subject, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";

import { ConflictDetectionService } from "@services/core/conflict-detection.service";
import { DataService } from "@services/data/data.service";
import { NotifyService } from "@services/notifications/notify.service";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

type StorageUpdateHandler = (data: any) => void;

@Injectable({
  providedIn: "root",
})
export class DatabaseChangeListenerService {
  private ngZone = inject(NgZone);
  private dataService = inject(DataService);
  private conflictDetectionService = inject(ConflictDetectionService);
  private notifyService = inject(NotifyService);

  private unlistenFns: UnlistenFn[] = [];
  readonly eventSubject = new Subject<{ event: string; data: any }>();
  private listenersActive = false;

  private localTodos: any[] = [];
  private localTasks: any[] = [];
  private localSubtasks: any[] = [];
  private localCategories: any[] = [];
  private localChats: any[] = [];

  private storageHandlers: Record<string, StorageUpdateHandler> = {
    "todo-created": (data) => {
      this.localTodos.push(data);
      this.dataService.todos$.next([...this.localTodos]);
    },
    "todo-updated": (data) => {
      const index = this.localTodos.findIndex((t) => t.id === data.id);
      if (index !== -1) {
        this.localTodos[index] = data;
        this.dataService.todos$.next([...this.localTodos]);
      }
    },
    "todo-deleted": (data) => {
      if (data.deleted_at !== null) {
        const index = this.localTodos.findIndex((t) => t.id === data.id);
        if (index !== -1) {
          this.localTodos[index] = data;
          this.dataService.todos$.next([...this.localTodos]);
        }
      } else {
        this.localTodos = this.localTodos.filter((t) => t.id !== data.id);
        this.dataService.todos$.next([...this.localTodos]);
      }
    },
    "task-created": (data) => {
      this.localTasks.push(data);
      this.dataService.tasks$.next([...this.localTasks]);
    },
    "task-updated": (data) => {
      const index = this.localTasks.findIndex((t) => t.id === data.id);
      if (index !== -1) {
        this.localTasks[index] = data;
        this.dataService.tasks$.next([...this.localTasks]);
      }
    },
    "task-deleted": (data) => {
      if (data.deleted_at !== null) {
        const index = this.localTasks.findIndex((t) => t.id === data.id);
        if (index !== -1) {
          this.localTasks[index] = { ...this.localTasks[index], deleted_at: data.deleted_at };
          this.dataService.tasks$.next([...this.localTasks]);
        }
      } else {
        this.localTasks = this.localTasks.filter((t) => t.id !== data.id);
        this.dataService.tasks$.next([...this.localTasks]);
      }
    },
    "subtask-created": (data) => {
      this.localSubtasks.push(data);
      this.dataService.subtasks$.next([...this.localSubtasks]);
    },
    "subtask-updated": (data) => {
      const index = this.localSubtasks.findIndex((s) => s.id === data.id);
      if (index !== -1) {
        this.localSubtasks[index] = data;
        this.dataService.subtasks$.next([...this.localSubtasks]);
      }
    },
    "subtask-deleted": (data) => {
      if (data.deleted_at !== null) {
        const index = this.localSubtasks.findIndex((s) => s.id === data.id);
        if (index !== -1) {
          this.localSubtasks[index] = { ...this.localSubtasks[index], deleted_at: data.deleted_at };
          this.dataService.subtasks$.next([...this.localSubtasks]);
        }
      } else {
        this.localSubtasks = this.localSubtasks.filter((s) => s.id !== data.id);
        this.dataService.subtasks$.next([...this.localSubtasks]);
      }
    },
    "category-created": (data) => {
      this.localCategories.push(data);
      this.dataService.categories$.next([...this.localCategories]);
    },
    "category-updated": (data) => {
      const index = this.localCategories.findIndex((c) => c.id === data.id);
      if (index !== -1) {
        this.localCategories[index] = data;
        this.dataService.categories$.next([...this.localCategories]);
      }
    },
    "category-deleted": (data) => {
      this.localCategories = this.localCategories.filter((c) => c.id !== data.id);
      this.dataService.categories$.next([...this.localCategories]);
    },
    "comment-created": (data) => this.handleCommentCreate(data),
    "comment-updated": (data) => this.handleCommentCreate(data),
    "comment-deleted": (data) => this.handleCommentDelete(data),
    "chat-created": (data) => {
      this.localChats.push(data);
      this.dataService.chats$.next([...this.localChats]);
    },
    "chat-updated": (data) => {
      const index = this.localChats.findIndex((c) => c.id === data.id);
      if (index !== -1) {
        this.localChats[index] = data;
        this.dataService.chats$.next([...this.localChats]);
      }
    },
    "chat-deleted": (data) => {
      this.localChats = this.localChats.filter((c) => c.id !== data.id);
      this.dataService.chats$.next([...this.localChats]);
    },
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
    const currentComments = this.dataService["comments"]?.getValue?.() || [];
    const existingIndex = currentComments.findIndex((c: Comment) => c.id === data.id);
    if (existingIndex !== -1) {
      currentComments[existingIndex] = data;
    } else {
      currentComments.push(data);
    }
    this.dataService.comments$.next([...currentComments]);
  }

  private handleCommentDelete(data: { id: string }): void {
    const currentComments = this.dataService["comments"]?.getValue?.() || [];
    const filtered = currentComments.filter((c: Comment) => c.id !== data.id);
    this.dataService.comments$.next(filtered);
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
