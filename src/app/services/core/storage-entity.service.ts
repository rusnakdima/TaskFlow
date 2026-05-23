/* sys lib */
import { Injectable, signal, WritableSignal } from "@angular/core";

/* models */
import {
  Todo,
  Task,
  Subtask,
  Comment,
  Chat,
  User,
  Category,
  Profile,
  Room,
} from "@models/generated/api.types";
import { EntityType } from "@models/storage.model";

/* utils */
import {
  updateEntityInSignal,
  removeEntityFromSignal,
  addEntityToSignal,
} from "@stores/utils/store-helpers";

@Injectable({ providedIn: "root" })
export class StorageEntityService {
  readonly todos = signal<Todo[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly subtasks = signal<Subtask[]>([]);
  readonly comments = signal<Comment[]>([]);
  readonly chats = signal<Chat[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly localCategories = signal<Category[]>([]);
  readonly cloudCategories = signal<Category[]>([]);
  readonly profiles = signal<Profile | null>(null);
  readonly publicProfiles = signal<Profile[]>([]);
  readonly users = signal<User[]>([]);
  readonly currentUser = signal<User | null>(null);
  readonly rooms = signal<Room[]>([]);

  readonly privateTodos = signal<Todo[]>([]);
  readonly sharedTodos = signal<Todo[]>([]);
  readonly publicTodos = signal<Todo[]>([]);

  addEntity(type: EntityType, data: any): void {
    if (!data?.id) return;
    if (type === "profiles") {
      this.profiles.set(data);
      return;
    }
    if (type === "todos") {
      const visibility = data.visibility || "shared";
      const target =
        visibility === "private"
          ? this.privateTodos
          : visibility === "public"
            ? this.publicTodos
            : this.sharedTodos;
      addEntityToSignal(target, data);
    } else {
      addEntityToSignal(this.getSignal(type), data);
    }
  }

  updateEntity(type: EntityType, data: any): void {
    if (!data?.id) return;
    if (type === "profiles") {
      const current = this.profiles();
      if (current?.id === data.id) this.profiles.set({ ...current, ...data });
      return;
    }
    if (type === "todos") {
      if (this.privateTodos().some((t) => t.id === data.id)) {
        updateEntityInSignal(this.privateTodos, data.id, data);
      } else if (this.sharedTodos().some((t) => t.id === data.id)) {
        updateEntityInSignal(this.sharedTodos, data.id, data);
      } else if (this.publicTodos().some((t) => t.id === data.id)) {
        updateEntityInSignal(this.publicTodos, data.id, data);
      }
    } else {
      updateEntityInSignal(this.getSignal(type) as WritableSignal<any[]>, data.id, data);
    }
  }

  removeEntity(type: EntityType, id: string): void {
    if (type === "profiles") {
      const current = this.profiles();
      if (current?.id === id) this.profiles.set(null);
      return;
    }
    if (type === "todos") {
      removeEntityFromSignal(this.privateTodos, id);
      removeEntityFromSignal(this.sharedTodos, id);
      removeEntityFromSignal(this.publicTodos, id);
    } else {
      removeEntityFromSignal(this.getSignal(type) as WritableSignal<any[]>, id);
    }
  }

  getSignal(type: EntityType): WritableSignal<any[]> {
    switch (type) {
      case "todos":
        return this.todos;
      case "tasks":
        return this.tasks;
      case "subtasks":
        return this.subtasks;
      case "comments":
        return this.comments;
      case "chats":
        return this.chats;
      case "categories":
        return this.categories;
      case "users":
        return this.users;
      default:
        return this.tasks;
    }
  }

  addCommentToTask(comment: Comment, task_id?: string): void {
    if (!task_id) return;
    addEntityToSignal(this.comments, { ...comment, task_id });
    updateEntityInSignal(this.tasks, task_id, {
      comments_count: (this.tasks().find((t) => t.id === task_id)?.comments_count || 0) + 1,
    });
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) return;
    const commentWithSubtaskId = { ...comment, subtask_id };
    addEntityToSignal(this.comments, commentWithSubtaskId);
    updateEntityInSignal(this.subtasks, subtask_id, {
      comments_count: (this.subtasks().find((s) => s.id === subtask_id)?.comments_count || 0) + 1,
    });
  }

  removeCommentFromAll(commentId: string): void {
    removeEntityFromSignal(this.comments, commentId);
  }

  updateChat(
    _todoId: string,
    op: "set" | "add" | "update" | "delete" | "clear",
    data?: Chat
  ): void {
    switch (op) {
      case "set":
        if (data)
          this.chats.update((chats) =>
            chats.some((c) => c.id === data.id) ? chats : [...chats, data]
          );
        break;
      case "add":
        if (data)
          this.chats.update((chats) =>
            chats.some((c) => c.id === data.id) ? chats : [...chats, data]
          );
        break;
      case "update":
        if (data)
          this.chats.update((chats) =>
            chats.map((c) => (c.id === data.id ? { ...c, ...data } : c))
          );
        break;
      case "delete":
        if (data) this.chats.update((chats) => chats.filter((c) => c.id !== data.id));
        break;
      case "clear":
        this.chats.set([]);
        break;
    }
  }

  updateChatByTempId(
    tempId: string,
    cloudId: string,
    syncStatus: "pending" | "synced" | "failed"
  ): void {
    this.chats.update((chats) =>
      chats.map((c) =>
        c.temp_id === tempId
          ? { ...c, id: cloudId, sync_status: syncStatus, temp_id: undefined }
          : c
      )
    );
  }

  updateChatSyncStatus(tempId: string, syncStatus: "pending" | "synced" | "failed"): void {
    this.chats.update((chats) =>
      chats.map((c) =>
        c.temp_id === tempId || c.id === tempId ? { ...c, sync_status: syncStatus } : c
      )
    );
  }

  bulkUpsertSubtasks(subtasks: Subtask[]): void {
    this.subtasks.update((existing) => {
      const map = new Map(existing.map((s) => [s.id, s]));
      subtasks.forEach((s) => map.set(s.id, { ...map.get(s.id), ...s }));
      return Array.from(map.values());
    });
  }

  clearEntitySignals(): void {
    this.privateTodos.set([]);
    this.sharedTodos.set([]);
    this.publicTodos.set([]);
    this.tasks.set([]);
    this.subtasks.set([]);
    this.comments.set([]);
    this.chats.set([]);
    this.categories.set([]);
    this.localCategories.set([]);
    this.cloudCategories.set([]);
    this.profiles.set(null);
    this.publicProfiles.set([]);
    this.users.set([]);
    this.currentUser.set(null);
  }

  setCurrentUser(user: User | null): void {
    this.currentUser.set(user);
  }

  getCurrentUser(): User | null {
    return this.currentUser();
  }
}
