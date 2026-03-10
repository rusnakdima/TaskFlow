/* sys lib */
import { Injectable, signal, computed, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { User } from "@models/user.model";
import { Profile } from "@models/profile.model";
import { Response } from "@models/response.model";

/* services */
import { AdminService } from "@services/admin.service";

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

  // Computed signals with relations
  getTodoWithRelations(todoId: string) {
    return computed(() => {
      const todo = this.todos().find((t) => t.id === todoId);
      if (!todo) return null;

      const user = this.users().find((u) => u.id === todo.userId);
      const profile = user?.profileId ? this.profiles().find((p) => p.id === user.profileId) : null;
      const categories = this.categories().filter((c) =>
        todo.categories?.some((cat) => (typeof cat === "string" ? cat === c.id : cat.id === c.id))
      );

      return {
        ...todo,
        user,
        profile,
        categories,
      };
    });
  }

  getTaskWithRelations(taskId: string) {
    return computed(() => {
      const task = this.tasks().find((t) => t.id === taskId);
      if (!task) return null;

      const todo = this.todos().find((t) => t.id === task.todoId);
      const user = todo ? this.users().find((u) => u.id === todo.userId) : null;
      const profile = user?.profileId ? this.profiles().find((p) => p.id === user.profileId) : null;
      const subtasks = this.subtasks().filter((s) => s.taskId === task.id);

      return {
        ...task,
        todo,
        user,
        profile,
        subtasks,
      };
    });
  }

  getSubtaskWithRelations(subtaskId: string) {
    return computed(() => {
      const subtask = this.subtasks().find((s) => s.id === subtaskId);
      if (!subtask) return null;

      const task = this.tasks().find((t) => t.id === subtask.taskId);
      const todo = task ? this.todos().find((t) => t.id === task.todoId) : null;
      const user = todo ? this.users().find((u) => u.id === todo.userId) : null;
      const profile = user?.profileId ? this.profiles().find((p) => p.id === user.profileId) : null;

      return {
        ...subtask,
        task,
        todo,
        user,
        profile,
      };
    });
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
   * Remove a record from the store
   */
  removeRecord(table: string, id: string): void {
    switch (table) {
      case "todos":
        this.todosSignal.update((items) => items.filter((item) => item.id !== id));
        break;
      case "tasks":
        this.tasksSignal.update((items) => items.filter((item) => item.id !== id));
        break;
      case "subtasks":
        this.subtasksSignal.update((items) => items.filter((item) => item.id !== id));
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
    this.categoriesSignal.set([]);
    this.dailyActivitiesSignal.set([]);
    this.usersSignal.set([]);
    this.profilesSignal.set([]);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
  }
}
