import { Injectable, inject } from "@angular/core";
import { StorageStateService } from "./storage-state.service";
import { StorageEntity } from "./storage.types";
import {
  addEntityToSignal,
  updateEntityInSignal,
  removeEntityFromSignal,
} from "@stores/utils/store-helpers";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Profile } from "@models/profile.model";

@Injectable({ providedIn: "root" })
export class StorageCrudService {
  private state = inject(StorageStateService);

  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    if (type === "users" || !data?.id) return;
    this.addToSignal(type, data, options?.isPrivate);
  }

  addToSignal(type: StorageEntity, data: any, isPrivate?: boolean): void {
    switch (type) {
      case "todos": {
        const visibility = data.visibility || (isPrivate ? "private" : "shared");
        const targetArray =
          visibility === "private"
            ? this.state._privateTodos
            : visibility === "public"
              ? this.state._publicTodos
              : this.state._sharedTodos;
        addEntityToSignal(targetArray, data);
        break;
      }
      case "tasks":
        addEntityToSignal(this.state._tasks, data);
        break;
      case "subtasks":
        addEntityToSignal(this.state._subtasks, data);
        break;
      case "comments":
        addEntityToSignal(this.state._comments, data);
        break;
      case "chats":
        addEntityToSignal(this.state._chats, data);
        break;
      case "categories":
        addEntityToSignal(this.state._categories, data);
        break;
      case "profiles":
        this.state._profile.set(data);
        break;
    }
  }

  updateItem(
    type: StorageEntity,
    id: string,
    updates: Partial<any>,
    options?: { isPrivate?: boolean }
  ): void {
    this.batchUpdate(type, [{ id, updates }], options);
  }

  batchUpdate(
    type: StorageEntity,
    items: { id: string; updates: Partial<any> }[],
    options?: { isPrivate?: boolean }
  ): void {
    for (const { id, updates } of items) {
      if (updates["deleted_at"]) {
        const existing: any = this.getById(type, id);
        if (existing?.["deleted_at"]) continue;
      }
      this.updateInSignal(type, id, updates);
    }
  }

  updateInSignal(type: StorageEntity, id: string, updates: any): void {
    switch (type) {
      case "todos":
        updateEntityInSignal(this.state._privateTodos, id, updates);
        updateEntityInSignal(this.state._sharedTodos, id, updates);
        updateEntityInSignal(this.state._publicTodos, id, updates);
        break;
      case "tasks":
        updateEntityInSignal(this.state._tasks, id, updates);
        break;
      case "subtasks":
        updateEntityInSignal(this.state._subtasks, id, updates);
        break;
      case "comments":
        updateEntityInSignal(this.state._comments, id, updates);
        break;
      case "chats":
        updateEntityInSignal(this.state._chats, id, updates);
        break;
      case "categories":
        updateEntityInSignal(this.state._categories, id, updates);
        break;
      case "profiles":
        const current = this.state._profile();
        if (current?.id === id) {
          this.state._profile.set({ ...current, ...updates });
        }
        break;
    }
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isShared: boolean = false): void {
    if (type === "users") return;
    this.removeFromSignal(type, id);
  }

  removeFromSignal(type: StorageEntity, id: string): void {
    switch (type) {
      case "todos":
        removeEntityFromSignal(this.state._privateTodos, id);
        removeEntityFromSignal(this.state._sharedTodos, id);
        removeEntityFromSignal(this.state._publicTodos, id);
        break;
      case "tasks":
        removeEntityFromSignal(this.state._tasks, id);
        break;
      case "subtasks":
        removeEntityFromSignal(this.state._subtasks, id);
        break;
      case "comments":
        removeEntityFromSignal(this.state._comments, id);
        break;
      case "chats":
        removeEntityFromSignal(this.state._chats, id);
        break;
      case "categories":
        removeEntityFromSignal(this.state._categories, id);
        break;
      case "profiles":
        const current = this.state._profile();
        if (current?.id === id) {
          this.state._profile.set(null);
        }
        break;
    }
  }

  getById<T extends StorageEntity>(type: T, id: string): any {
    if (type === "users") return undefined;
    return this.findInSignal(type, id);
  }

  private findInSignal(type: StorageEntity, id: string): any {
    switch (type) {
      case "todos":
        return (
          this.state._privateTodos().find((t) => t.id === id) ||
          this.state._sharedTodos().find((t) => t.id === id) ||
          this.state._publicTodos().find((t) => t.id === id)
        );
      case "tasks":
        return this.state._tasks().find((t) => t.id === id);
      case "subtasks":
        return this.state._subtasks().find((s) => s.id === id);
      case "comments":
        return this.state._comments().find((c) => c.id === id);
      case "chats":
        return this.state._chats().find((c) => c.id === id);
      case "categories":
        return this.state._categories().find((c) => c.id === id);
      case "profiles":
        return this.state._profile();
      default:
        return undefined;
    }
  }
}
