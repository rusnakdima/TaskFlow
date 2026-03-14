/* sys lib */
import { Injectable, signal, computed, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { User } from "@models/user.model";
import { Profile } from "@models/profile.model";
import { Response } from "@models/response.model";

/* services */
import { AdminService } from "@services/data/admin.service";

interface AdminDataWithRelations {
  [key: string]: any[];
}

@Injectable({
  providedIn: "root",
})
export class AdminStorageService {
  private adminService = inject(AdminService);

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

  // Loading state
  private loadingSignal = signal(false);
  private loadedSignal = signal(false);
  private lastLoadedSignal = signal<Date | null>(null);

  // Cache expiry: 5 minutes
  private readonly CACHE_EXPIRY_MS = 5 * 60 * 1000;

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
  get loading() {
    return this.loadingSignal.asReadonly();
  }
  get loaded() {
    return this.loadedSignal.asReadonly();
  }
  get lastLoaded() {
    return this.lastLoadedSignal.asReadonly();
  }

  /**
   * Check if cache is valid (not expired)
   */
  private isCacheValid(): boolean {
    if (!this.loadedSignal()) return false;
    const lastLoaded = this.lastLoadedSignal();
    if (!lastLoaded) return false;
    return new Date().getTime() - lastLoaded.getTime() < this.CACHE_EXPIRY_MS;
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

    return this.adminService.getAllDataForAdmin<AdminDataWithRelations>().pipe(
      tap((response: Response<any>) => {
        if (response.data) {
          this.todosSignal.set(response.data["todos"] || []);
          this.tasksSignal.set(response.data["tasks"] || []);
          this.subtasksSignal.set(response.data["subtasks"] || []);
          this.commentsSignal.set(response.data["comments"] || []);
          this.chatsSignal.set(response.data["chats"] || []);
          this.categoriesSignal.set(response.data["categories"] || []);
          this.dailyActivitiesSignal.set(response.data["daily_activities"] || []);

          // Extract users and profiles from relations
          this.extractUsersAndProfiles(response.data);
        }

        this.loadingSignal.set(false);
        this.loadedSignal.set(true);
        this.lastLoadedSignal.set(new Date());
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

    // Extract from todos
    data["todos"]?.forEach((todo: any) => {
      if (todo.user) {
        usersMap.set(todo.user.id, todo.user);
        if (todo.user.profile) {
          profilesMap.set(todo.user.profile.id, todo.user.profile);
        }
      }
      todo.categories?.forEach((category: any) => {
        if (category.user) {
          usersMap.set(category.user.id, category.user);
          if (category.user.profile) {
            profilesMap.set(category.user.profile.id, category.user.profile);
          }
        }
      });
    });

    // Extract from tasks (nested in todos)
    data["tasks"]?.forEach((task: any) => {
      if (task.todo?.user) {
        usersMap.set(task.todo.user.id, task.todo.user);
        if (task.todo.user.profile) {
          profilesMap.set(task.todo.user.profile.id, task.todo.user.profile);
        }
      }
    });

    // Extract from subtasks (nested in tasks)
    data["subtasks"]?.forEach((subtask: any) => {
      if (subtask.task?.todo?.user) {
        usersMap.set(subtask.task.todo.user.id, subtask.task.todo.user);
        if (subtask.task.todo.user.profile) {
          profilesMap.set(subtask.task.todo.user.profile.id, subtask.task.todo.user.profile);
        }
      }
      if (subtask.task?.user) {
        usersMap.set(subtask.task.user.id, subtask.task.user);
        if (subtask.task.user.profile) {
          profilesMap.set(subtask.task.user.profile.id, subtask.task.user.profile);
        }
      }
    });

    // Extract from categories
    data["categories"]?.forEach((category: any) => {
      if (category.user) {
        usersMap.set(category.user.id, category.user);
        if (category.user.profile) {
          profilesMap.set(category.user.profile.id, category.user.profile);
        }
      }
    });

    // Extract from comments
    data["comments"]?.forEach((comment: any) => {
      if (comment.user) {
        usersMap.set(comment.user.id, comment.user);
        if (comment.user.profile) {
          profilesMap.set(comment.user.profile.id, comment.user.profile);
        }
      }
    });

    // Extract from chats
    data["chats"]?.forEach((chat: any) => {
      if (chat.user) {
        usersMap.set(chat.user.id, chat.user);
        if (chat.user.profile) {
          profilesMap.set(chat.user.profile.id, chat.user.profile);
        }
      }
    });

    this.usersSignal.set(Array.from(usersMap.values()));
    this.profilesSignal.set(Array.from(profilesMap.values()));
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
    switch (table) {
      case "todos":
        this.todosSignal.update((items) =>
          items.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        break;
      case "tasks":
        this.tasksSignal.update((items) =>
          items.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        break;
      case "subtasks":
        this.subtasksSignal.update((items) =>
          items.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        break;
      case "comments":
        this.commentsSignal.update((items) =>
          items.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        break;
      case "chats":
        this.chatsSignal.update((items) =>
          items.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        break;
      case "categories":
        this.categoriesSignal.update((items) =>
          items.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        break;
      case "daily_activities":
        this.dailyActivitiesSignal.update((items) =>
          items.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        break;
    }
  }

  /**
   * Update all related records when parent is deleted/restored
   */
  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      // Update all tasks for this todo
      this.tasksSignal.update((tasks) =>
        tasks.map((task) =>
          task.todoId === parentId ? { ...task, ...updates } : task
        )
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
    switch (table) {
      case "todos":
        this.todosSignal.update((items) => items.filter((item) => item.id !== id));
        // Remove all related tasks
        this.tasksSignal.update((tasks) => tasks.filter((task) => task.todoId !== id));
        break;
      case "tasks":
        this.tasksSignal.update((items) => items.filter((item) => item.id !== id));
        // Remove all related subtasks
        this.subtasksSignal.update((subtasks) => subtasks.filter((subtask) => subtask.taskId !== id));
        break;
      case "subtasks":
        this.subtasksSignal.update((items) => items.filter((item) => item.id !== id));
        break;
      case "comments":
        this.commentsSignal.update((items) => items.filter((item) => item.id !== id));
        break;
      case "chats":
        this.chatsSignal.update((items) => items.filter((item) => item.id !== id));
        break;
      case "categories":
        this.categoriesSignal.update((items) => items.filter((item) => item.id !== id));
        break;
      case "daily_activities":
        this.dailyActivitiesSignal.update((items) => items.filter((item) => item.id !== id));
        break;
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
