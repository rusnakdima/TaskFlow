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
  readonly profiles = signal<Profile | null>(null);
  readonly publicProfiles = signal<Profile[]>([]);
  readonly users = signal<User[]>([]);
  readonly currentUser = signal<User | null>(null);
  readonly rooms = signal<Room[]>([]);

  readonly privateTodos = signal<Todo[]>([]);
  readonly sharedTodos = signal<Todo[]>([]);
  readonly publicTodos = signal<Todo[]>([]);

  readonly privateCategories = signal<Category[]>([]);
  readonly sharedCategories = signal<Category[]>([]);
  readonly publicCategories = signal<Category[]>([]);

  addEntity(type: EntityType, data: any): void {
    console.log("[StorageEntityService] addEntity called:", {
      type,
      dataId: data?.id,
      visibility: data?.visibility,
    });
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
    } else if (type === "categories") {
      const visibility = data.visibility || "private";
      const target =
        visibility === "private"
          ? this.privateCategories
          : visibility === "public"
            ? this.publicCategories
            : this.sharedCategories;
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
      updateEntityInSignal(this.privateTodos, data.id, data);
      updateEntityInSignal(this.sharedTodos, data.id, data);
      updateEntityInSignal(this.publicTodos, data.id, data);
    } else if (type === "categories") {
      updateEntityInSignal(this.privateCategories, data.id, data);
      updateEntityInSignal(this.sharedCategories, data.id, data);
      updateEntityInSignal(this.publicCategories, data.id, data);
    } else {
      updateEntityInSignal(this.getSignal(type) as WritableSignal<any[]>, data.id, data);
    }
  }

  removeEntity(type: EntityType, id: string): void {
    console.log("[StorageEntityService] removeEntity called:", { type, id });
    if (type === "profiles") {
      const current = this.profiles();
      if (current?.id === id) this.profiles.set(null);
      return;
    }
    if (type === "todos") {
      removeEntityFromSignal(this.privateTodos, id);
      removeEntityFromSignal(this.sharedTodos, id);
      removeEntityFromSignal(this.publicTodos, id);
    } else if (type === "categories") {
      removeEntityFromSignal(this.privateCategories, id);
      removeEntityFromSignal(this.sharedCategories, id);
      removeEntityFromSignal(this.publicCategories, id);
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
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) {
      console.error("addCommentToSubtask: subtask_id is undefined", comment);
      return;
    }
    const commentWithSubtaskId = { ...comment, subtask_id };
    addEntityToSignal(this.comments, commentWithSubtaskId);
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

  bulkUpsertSubtasks(subtasks: Subtask[]): void {
    this.subtasks.update((existing) => {
      const map = new Map(existing.map((s) => [s.id, s]));
      subtasks.forEach((s) => map.set(s.id, { ...map.get(s.id), ...s }));
      return Array.from(map.values());
    });
  }

  clearEntitySignals(): void {
    console.log("[StorageEntityService] clearEntitySignals called - CLEARING ALL DATA!");
    this.privateTodos.set([]);
    this.sharedTodos.set([]);
    this.publicTodos.set([]);
    this.privateCategories.set([]);
    this.sharedCategories.set([]);
    this.publicCategories.set([]);
    this.tasks.set([]);
    this.subtasks.set([]);
    this.comments.set([]);
    this.chats.set([]);
    this.categories.set([]);
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
