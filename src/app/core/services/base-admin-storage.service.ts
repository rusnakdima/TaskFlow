/* sys lib */
import { signal } from "@angular/core";

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
} from "@entities/generated/api.types";

/* services */
import { BaseStorageService } from "./base-storage.service";
import { StorageSignalMap } from "@entities/storage-signal-map.model";
import { AdminDataWithRelations } from "@core/services/admin-data.service";

export abstract class BaseAdminStorageService extends BaseStorageService {
  // Common data signals
  todosSignal = signal<Todo[]>([]);
  tasksSignal = signal<Task[]>([]);
  subtasksSignal = signal<Subtask[]>([]);
  commentsSignal = signal<Comment[]>([]);
  chatsSignal = signal<Chat[]>([]);
  categoriesSignal = signal<Category[]>([]);
  dailyActivitiesSignal = signal<any[]>([]);

  // Users and profiles for relations
  protected usersSignal = signal<User[]>([]);
  protected profilesSignal = signal<Profile[]>([]);

  // Loading state signals
  protected loadingSignal = signal<boolean>(false);
  protected loadedSignal = signal<boolean>(false);
  protected lastLoadedSignal = signal<Date | null>(null);

  // Per-type loading status
  protected typeLoadedSignal = signal<Record<string, boolean>>({});

  // Cache expiry: 5 minutes
  protected readonly CACHE_EXPIRY_MS = 5 * 60 * 1000;

  isTypeLoaded(type: string): boolean {
    return this.typeLoadedSignal()[type] || false;
  }

  setTypeLoaded(type: string, loaded: boolean): void {
    this.typeLoadedSignal.update((s) => ({ ...s, [type]: loaded }));
  }

  protected markTypeAsLoaded(type: string): void {
    this.typeLoadedSignal.update((s) => ({ ...s, [type]: true }));
  }

  protected markTypeAsNotLoaded(type: string): void {
    this.typeLoadedSignal.update((s) => ({ ...s, [type]: false }));
  }

  /**
   * Add a single record to the appropriate signal
   */
  addRecord(table: string, record: any): void {
    const sig = this.signalMap[table];
    if (sig) {
      sig.update((items) => [record, ...items]);
    }
  }

  /**
   * Update a single record in the appropriate signal
   */
  updateRecord(table: string, id: string, updates: Partial<any>): void {
    const sig = this.signalMap[table];
    if (sig) {
      sig.update((items) =>
        items.map((item: any) => (item.id === id ? { ...item, ...updates } : item))
      );
    }
  }

  /**
   * Remove a record from the appropriate signal
   */
  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (sig) {
      sig.update((items) => items.filter((item: any) => item.id !== id));
    }
  }

  protected readonly signalMap: StorageSignalMap = {
    todos: this.todosSignal,
    tasks: this.tasksSignal,
    subtasks: this.subtasksSignal,
    comments: this.commentsSignal,
    chats: this.chatsSignal,
    categories: this.categoriesSignal,
    daily_activities: this.dailyActivitiesSignal,
  };

  // Public signals
  get todos() {
    return this.todosSignal.asReadonly();
  }
  get tasks() {
    return this.tasksSignal.asReadonly();
  }
  get subtasks() {
    return this.subtasksSignal.asReadonly();
  }
  get comments() {
    return this.commentsSignal.asReadonly();
  }
  get chats() {
    return this.chatsSignal.asReadonly();
  }
  get categories() {
    return this.categoriesSignal.asReadonly();
  }
  get dailyActivities() {
    return this.dailyActivitiesSignal.asReadonly();
  }
  get users() {
    return this.usersSignal.asReadonly();
  }
  get profiles() {
    return this.profilesSignal.asReadonly();
  }

  /**
   * Check if cache is valid (not expired)
   */
  public override isCacheValid(lastLoaded: Date | null = null): boolean {
    const last = lastLoaded ?? this.lastLoadedSignal();
    if (!last) return false;
    return Date.now() - last.getTime() < this.CACHE_EXPIRY_MS;
  }

  /**
   * Extract users and profiles from the loaded data relations
   */
  protected extractUsersAndProfiles(data: AdminDataWithRelations): void {
    const usersMap = new Map<string, User>();
    const profilesMap = new Map<string, Profile>();

    data["todos"]?.forEach((todo: any) => {
      this.extractUserAndProfile(todo, usersMap, profilesMap);
      todo.categories?.forEach((category: any) =>
        this.extractUserAndProfile(category, usersMap, profilesMap)
      );
    });

    data["tasks"]?.forEach((task: any) => {
      if (task.todo) this.extractUserAndProfile(task.todo, usersMap, profilesMap);
    });

    data["subtasks"]?.forEach((subtask: any) => {
      if (subtask.task?.todo) this.extractUserAndProfile(subtask.task.todo, usersMap, profilesMap);
      if (subtask.task) this.extractUserAndProfile(subtask.task, usersMap, profilesMap);
    });

    data["categories"]?.forEach((category: any) =>
      this.extractUserAndProfile(category, usersMap, profilesMap)
    );

    data["comments"]?.forEach((comment: any) =>
      this.extractUserAndProfile(comment, usersMap, profilesMap)
    );

    data["chats"]?.forEach((chat: any) => this.extractUserAndProfile(chat, usersMap, profilesMap));

    this.usersSignal.set(Array.from(usersMap.values()));
    this.profilesSignal.set(Array.from(profilesMap.values()));
  }

  protected extractUserAndProfile(
    entity: any,
    usersMap: Map<string, User>,
    profilesMap: Map<string, Profile>
  ): void {
    if (!entity?.user) return;
    usersMap.set(entity.user.id, entity.user);
    if (entity.user.profile) {
      profilesMap.set(entity.user.profile.id, entity.user.profile);
    }
  }

  /**
   * Remove record with cascade for admin storage
   */
  removeRecordWithCascade(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (sig) {
      sig.update((items) => items.filter((item: any) => item.id !== id));
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.todosSignal.set([]);
    this.tasksSignal.set([]);
    this.subtasksSignal.set([]);
    this.commentsSignal.set([]);
    this.chatsSignal.set([]);
    this.categoriesSignal.set([]);
    this.dailyActivitiesSignal.set([]);
    this.usersSignal.set([]);
    this.profilesSignal.set([]);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
  }
}
