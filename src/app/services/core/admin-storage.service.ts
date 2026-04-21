/* sys lib */
import { Injectable, signal, computed, inject, WritableSignal } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { User } from "@models/user.model";
import { Profile } from "@models/profile.model";

/* services */
import { ApiProvider } from "@providers/api.provider";
import { BaseStorageService } from "./base-storage.service";

interface AdminDataWithRelations {
  [key: string]: any[];
}

@Injectable({
  providedIn: "root",
})
export class AdminStorageService extends BaseStorageService {
  private apiProvider = inject(ApiProvider);

  // Admin data signals
  private todosSignal = signal<Todo[]>([]);
  private tasksSignal = signal<Task[]>([]);
  private subtasksSignal = signal<Subtask[]>([]);
  private commentsSignal = signal<Comment[]>([]);
  private chatsSignal = signal<Chat[]>([]);
  private categoriesSignal = signal<Category[]>([]);
  private dailyActivitiesSignal = signal<any[]>([]);

  // Users and profiles for relations
  private usersSignal = signal<User[]>([]);
  private profilesSignal = signal<Profile[]>([]);

  // Cache expiry: 5 minutes
  private readonly CACHE_EXPIRY_MS = 5 * 60 * 1000;

  private readonly signalMap: Record<string, WritableSignal<any[]>> = {
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
   * @override to use admin-specific cache expiry
   */
  protected override isCacheValid(): boolean {
    return super.isCacheValid(this.CACHE_EXPIRY_MS);
  }

  /**
   * Check if admin data is empty
   */
  private hasData(): boolean {
    return (
      this.todosSignal().length > 0 ||
      this.tasksSignal().length > 0 ||
      this.categoriesSignal().length > 0
    );
  }

  /**
   * Load all admin data from backend
   * Only fetches if cache is expired or data is empty
   */
  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    // Force reload if no data exists
    if (!this.hasData()) {
      force = true;
    }

    // Return cached data if valid
    if (!force && this.isCacheValid()) {
      return of(this.getAdminDataWithRelations());
    }

    // Prevent duplicate loading
    if (this.loadingSignal()) {
      return of(this.getAdminDataWithRelations());
    }

    this.loadingSignal.set(true);

    return this.apiProvider.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this.todosSignal.set(data["todos"] || []);
        this.tasksSignal.set(data["tasks"] || []);
        this.subtasksSignal.set(data["subtasks"] || []);
        this.commentsSignal.set(data["comments"] || []);
        this.chatsSignal.set(data["chats"] || []);
        this.categoriesSignal.set(data["categories"] || []);
        this.dailyActivitiesSignal.set(data["daily_activities"] || []);

        // Extract users and profiles from relations
        this.extractUsersAndProfiles(data);

        this.loadingSignal.set(false);
        this.loadedSignal.set(true);
        this.lastLoadedSignal.set(new Date());
      }),
      catchError((err) => {
        this.loadingSignal.set(false);
        return of(this.getAdminDataWithRelations());
      }),
      map(() => this.getAdminDataWithRelations())
    );
  }

  /**
   * Extract users and profiles from the loaded data relations
   */
  private extractUsersAndProfiles(data: AdminDataWithRelations): void {
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

  private extractUserAndProfile(
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
   * Remove todo with all related data (tasks, subtasks, comments, chats)
   */
  removeTodoWithCascade(todoId: string): void {
    const todo = this.todosSignal().find((t) => t.id === todoId);
    if (!todo) return;

    // Get all related IDs for deep cleanup
    const taskIds = todo.tasks?.map((t) => t.id) || [];
    const subtaskIds = todo.tasks?.flatMap((t) => t.subtasks?.map((s) => s.id) || []) || [];

    // 1. Remove subtasks first
    this.subtasksSignal.update((items) => items.filter((s) => !subtaskIds.includes(s.id)));

    // 2. Remove tasks
    this.tasksSignal.update((items) => items.filter((t) => t.todoId !== todoId));

    // 3. Remove all comments related to this todo
    this.commentsSignal.update((items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todoId === todoId;
        const isTaskComment = c.taskId && taskIds.includes(c.taskId);
        const isSubtaskComment = c.subtaskId && subtaskIds.includes(c.subtaskId);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );

    // 4. Remove chats
    this.chatsSignal.update((items) => items.filter((c) => c.todoId !== todoId));

    // 5. Finally remove todo
    this.todosSignal.update((items) => items.filter((t) => t.id !== todoId));
  }

  /**
   * Restore todo with all related data
   */
  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats: Chat[];
  }): void {
    // Restore todo
    this.todosSignal.set([data.todo, ...this.todosSignal()]);

    // Restore related data
    if (data.tasks?.length) {
      this.tasksSignal.set([...this.tasksSignal(), ...data.tasks]);
    }
    if (data.subtasks?.length) {
      this.subtasksSignal.set([...this.subtasksSignal(), ...data.subtasks]);
    }
    if (data.comments?.length) {
      this.commentsSignal.set([...this.commentsSignal(), ...data.comments]);
    }
    if (data.chats?.length) {
      this.chatsSignal.set([...this.chatsSignal(), ...data.chats]);
    }
  }

  /**
   * Get admin data with computed relations
   */
  private getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this.todos(),
      tasks: this.tasks(),
      subtasks: this.subtasks(),
      comments: this.comments(),
      chats: this.chats(),
      categories: this.categories(),
      daily_activities: this.dailyActivities(),
      users: this.users(),
      profiles: this.profiles(),
    };
  }

  /**
   * Update a record in the store
   */
  updateRecord(table: string, id: string, updates: any): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items) => items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  /**
   * Update all related records when parent is deleted/restored
   */
  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      // Update all tasks for this todo
      this.tasksSignal.update((tasks) =>
        tasks.map((task) => (task.todoId === parentId ? { ...task, ...updates } : task))
      );
    } else if (parentTable === "tasks") {
      // Update all subtasks for this task
      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.taskId === parentId ? { ...subtask, ...updates } : subtask
        )
      );
    }
  }

  /**
   * Remove a record from the store
   */
  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items) => items.filter((item) => item.id !== id));
    // Cascade: remove children when parent is deleted
    if (table === "todos") {
      this.tasksSignal.update((tasks) => tasks.filter((task) => task.todoId !== id));
    } else if (table === "tasks") {
      this.subtasksSignal.update((subtasks) => subtasks.filter((subtask) => subtask.taskId !== id));
    }
  }

  /**
   * Update record delete status (for soft delete/restore)
   */
  updateRecordDeleteStatus(table: string, id: string, deletedAt: boolean): void {
    const timestamp = new Date().toISOString();
    this.updateRecord(table, id, {
      deletedAt: deletedAt ? timestamp : null,
      updatedAt: timestamp,
    });
  }

  /**
   * Update record delete status with cascade (for soft delete/restore)
   */
  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    const timestamp = new Date().toISOString();

    if (table === "todos") {
      // Update todo
      this.updateRecordDeleteStatus(table, id, deletedAt);

      // Update all tasks for this todo
      const todo = this.todosSignal().find((t) => t.id === id);
      if (todo) {
        const taskIds = todo.tasks?.map((t) => t.id) || [];

        // Update tasks
        this.tasksSignal.update((tasks) =>
          tasks.map((task) =>
            task.todoId === id
              ? { ...task, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : task
          )
        );

        // Update subtasks
        const subtaskIds = todo.tasks?.flatMap((t) => t.subtasks?.map((s) => s.id) || []) || [];
        this.subtasksSignal.update((subtasks) =>
          subtasks.map((subtask) =>
            subtaskIds.includes(subtask.id)
              ? { ...subtask, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : subtask
          )
        );

        // Update comments (task-level and subtask-level)
        this.commentsSignal.update((comments) =>
          comments.map((comment) => {
            const isRelated =
              (comment.taskId && taskIds.includes(comment.taskId)) ||
              (comment.subtaskId && subtaskIds.includes(comment.subtaskId));
            return isRelated
              ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : comment;
          })
        );

        // Update chats
        this.chatsSignal.update((chats) =>
          chats.map((chat) =>
            chat.todoId === id
              ? { ...chat, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : chat
          )
        );
      }
    } else if (table === "tasks") {
      // Update task
      this.updateRecordDeleteStatus(table, id, deletedAt);

      // Update subtasks and comments for this task
      const task = this.tasksSignal().find((t) => t.id === id);
      if (task) {
        const subtaskIds = task.subtasks?.map((s) => s.id) || [];

        // Update subtasks
        this.subtasksSignal.update((subtasks) =>
          subtasks.map((subtask) =>
            subtaskIds.includes(subtask.id)
              ? { ...subtask, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : subtask
          )
        );

        // Update comments (task-level and subtask-level)
        this.commentsSignal.update((comments) =>
          comments.map((comment) => {
            const isRelated =
              comment.taskId === id ||
              (comment.subtaskId && subtaskIds.includes(comment.subtaskId));
            return isRelated
              ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : comment;
          })
        );
      }
    } else if (table === "subtasks") {
      // Update subtask
      this.updateRecordDeleteStatus(table, id, deletedAt);

      // Update subtask comments
      this.commentsSignal.update((comments) =>
        comments.map((comment) =>
          comment.subtaskId === id
            ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
            : comment
        )
      );
    } else {
      // Update single record
      this.updateRecordDeleteStatus(table, id, deletedAt);
    }
  }

  /**
   * Remove record with cascade for admin storage
   */
  removeRecordWithCascade(table: string, id: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      // Remove task and its subtasks
      const task = this.tasksSignal().find((t) => t.id === id);
      if (task) {
        const subtaskIds = task.subtasks?.map((s) => s.id) || [];
        this.subtasksSignal.set(this.subtasksSignal().filter((s) => !subtaskIds.includes(s.id)));
        // Remove task comments
        this.commentsSignal.set(this.commentsSignal().filter((c) => c.taskId !== id));
        this.tasksSignal.set(this.tasksSignal().filter((t) => t.id !== id));
      }
    } else if (table === "subtasks") {
      // Remove subtask and its comments
      this.commentsSignal.set(this.commentsSignal().filter((c) => c.subtaskId !== id));
      this.subtasksSignal.set(this.subtasksSignal().filter((s) => s.id !== id));
    } else {
      this.removeRecord(table, id);
    }
  }

  /**
   * Clear all admin data (e.g., on logout)
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
