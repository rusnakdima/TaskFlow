import { inject, Injectable, NgZone, signal } from "@angular/core";
import { Subject, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";

import { ConflictDetectionService } from "@services/core/conflict-detection.service";
import { DataService } from "@services/data/data.service";
import { NotifyService } from "@services/notifications/notify.service";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

type StorageUpdateHandler = (data: any) => void;

const MAX_ARRAY_SIZE = 1000;

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

  private localTodos = signal<any[]>([]);
  private localTasks = signal<any[]>([]);
  private localSubtasks = signal<any[]>([]);
  private localCategories = signal<any[]>([]);
  private localChats = signal<any[]>([]);

  private storageHandlers: Record<string, StorageUpdateHandler> = {
    "todo-created": (data) => {
      this.localTodos.update((todos) => {
        const newTodos = [...todos, data];
        if (newTodos.length > MAX_ARRAY_SIZE) {
          return newTodos.slice(-MAX_ARRAY_SIZE);
        }
        return newTodos;
      });
      this.dataService.todos$.next([...this.localTodos()]);
    },
    "todo-updated": (data) => {
      this.localTodos.update((todos) => {
        const index = todos.findIndex((t) => t.id === data.id);
        if (index !== -1) {
          const newTodos = [...todos];
          newTodos[index] = data;
          return newTodos;
        }
        return todos;
      });
      this.dataService.todos$.next([...this.localTodos()]);
    },
    "todo-deleted": (data) => {
      if (data.deleted_at !== null) {
        this.localTodos.update((todos) => {
          const index = todos.findIndex((t) => t.id === data.id);
          if (index !== -1) {
            const newTodos = [...todos];
            newTodos[index] = data;
            return newTodos;
          }
          return todos;
        });
        this.dataService.todos$.next([...this.localTodos()]);
      } else {
        this.localTodos.update((todos) => todos.filter((t) => t.id !== data.id));
        this.dataService.todos$.next([...this.localTodos()]);
      }
    },
    "task-created": (data) => {
      this.localTasks.update((tasks) => {
        const newTasks = [...tasks, data];
        if (newTasks.length > MAX_ARRAY_SIZE) {
          return newTasks.slice(-MAX_ARRAY_SIZE);
        }
        return newTasks;
      });
      this.dataService.tasks$.next([...this.localTasks()]);
    },
    "task-updated": (data) => {
      this.localTasks.update((tasks) => {
        const index = tasks.findIndex((t) => t.id === data.id);
        if (index !== -1) {
          const newTasks = [...tasks];
          newTasks[index] = data;
          return newTasks;
        }
        return tasks;
      });
      this.dataService.tasks$.next([...this.localTasks()]);
    },
    "task-deleted": (data) => {
      if (data.deleted_at !== null) {
        this.localTasks.update((tasks) => {
          const index = tasks.findIndex((t) => t.id === data.id);
          if (index !== -1) {
            const newTasks = [...tasks];
            newTasks[index] = { ...newTasks[index], deleted_at: data.deleted_at };
            return newTasks;
          }
          return tasks;
        });
        this.dataService.tasks$.next([...this.localTasks()]);
      } else {
        this.localTasks.update((tasks) => tasks.filter((t) => t.id !== data.id));
        this.dataService.tasks$.next([...this.localTasks()]);
      }
    },
    "subtask-created": (data) => {
      this.localSubtasks.update((subtasks) => {
        const newSubtasks = [...subtasks, data];
        if (newSubtasks.length > MAX_ARRAY_SIZE) {
          return newSubtasks.slice(-MAX_ARRAY_SIZE);
        }
        return newSubtasks;
      });
      this.dataService.subtasks$.next([...this.localSubtasks()]);
    },
    "subtask-updated": (data) => {
      this.localSubtasks.update((subtasks) => {
        const index = subtasks.findIndex((s) => s.id === data.id);
        if (index !== -1) {
          const newSubtasks = [...subtasks];
          newSubtasks[index] = data;
          return newSubtasks;
        }
        return subtasks;
      });
      this.dataService.subtasks$.next([...this.localSubtasks()]);
    },
    "subtask-deleted": (data) => {
      if (data.deleted_at !== null) {
        this.localSubtasks.update((subtasks) => {
          const index = subtasks.findIndex((s) => s.id === data.id);
          if (index !== -1) {
            const newSubtasks = [...subtasks];
            newSubtasks[index] = { ...newSubtasks[index], deleted_at: data.deleted_at };
            return newSubtasks;
          }
          return subtasks;
        });
        this.dataService.subtasks$.next([...this.localSubtasks()]);
      } else {
        this.localSubtasks.update((subtasks) => subtasks.filter((s) => s.id !== data.id));
        this.dataService.subtasks$.next([...this.localSubtasks()]);
      }
    },
    "category-created": (data) => {
      this.localCategories.update((categories) => {
        const newCategories = [...categories, data];
        if (newCategories.length > MAX_ARRAY_SIZE) {
          return newCategories.slice(-MAX_ARRAY_SIZE);
        }
        return newCategories;
      });
      this.dataService.categories$.next([...this.localCategories()]);
    },
    "category-updated": (data) => {
      this.localCategories.update((categories) => {
        const index = categories.findIndex((c) => c.id === data.id);
        if (index !== -1) {
          const newCategories = [...categories];
          newCategories[index] = data;
          return newCategories;
        }
        return categories;
      });
      this.dataService.categories$.next([...this.localCategories()]);
    },
    "category-deleted": (data) => {
      this.localCategories.update((categories) => categories.filter((c) => c.id !== data.id));
      this.dataService.categories$.next([...this.localCategories()]);
    },
    "comment-created": (data) => this.handleCommentCreate(data),
    "comment-updated": (data) => this.handleCommentCreate(data),
    "comment-deleted": (data) => this.handleCommentDelete(data),
    "chat-created": (data) => {
      this.localChats.update((chats) => {
        const newChats = [...chats, data];
        if (newChats.length > MAX_ARRAY_SIZE) {
          return newChats.slice(-MAX_ARRAY_SIZE);
        }
        return newChats;
      });
      this.dataService.chats$.next([...this.localChats()]);
    },
    "chat-updated": (data) => {
      this.localChats.update((chats) => {
        const index = chats.findIndex((c) => c.id === data.id);
        if (index !== -1) {
          const newChats = [...chats];
          newChats[index] = data;
          return newChats;
        }
        return chats;
      });
      this.dataService.chats$.next([...this.localChats()]);
    },
    "chat-deleted": (data) => {
      this.localChats.update((chats) => chats.filter((c) => c.id !== data.id));
      this.dataService.chats$.next([...this.localChats()]);
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
    this.localTodos.set([]);
    this.localTasks.set([]);
    this.localSubtasks.set([]);
    this.localCategories.set([]);
    this.localChats.set([]);
  }

  areListenersActive(): boolean {
    return this.listenersActive;
  }

  getStorageHandler(eventType: string): StorageUpdateHandler | undefined {
    return this.storageHandlers[eventType];
  }
}
