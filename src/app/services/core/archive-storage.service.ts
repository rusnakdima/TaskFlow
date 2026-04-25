/* sys lib */
import { Injectable, signal, inject, WritableSignal } from "@angular/core";
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
import { AdminService } from "@services/data/admin.service";
import { BaseStorageService } from "./base-storage.service";
import { AdminDataWithRelations } from "@services/core/admin-data.service";

@Injectable({
  providedIn: "root",
})
export class ArchiveStorageService extends BaseStorageService {
  private adminService = inject(AdminService);

  // Archive data signals
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
   */
  protected override isCacheValid(): boolean {
    return super.isCacheValid(this.CACHE_EXPIRY_MS);
  }

  /**
   * Check if archive data is empty
   */
  private hasData(): boolean {
    return (
      this.todosSignal().length > 0 ||
      this.tasksSignal().length > 0 ||
      this.categoriesSignal().length > 0
    );
  }

  /**
   * Get all archive data with relations
   */
  getArchiveDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this.todosSignal(),
      tasks: this.tasksSignal(),
      subtasks: this.subtasksSignal(),
      comments: this.commentsSignal(),
      chats: this.chatsSignal(),
      categories: this.categoriesSignal(),
      daily_activities: this.dailyActivitiesSignal(),
      users: this.usersSignal(),
      profiles: this.profilesSignal(),
    };
  }

  /**
   * Load all archive data from backend
   * Only fetches if cache is expired or data is empty
   */
  loadArchiveData(force: boolean = false): Observable<AdminDataWithRelations> {
    // Force reload if no data exists
    if (!this.hasData()) {
      force = true;
    }

    // Return cached data if valid
    if (!force && this.isCacheValid()) {
      return of(this.getArchiveDataWithRelations());
    }

    // Prevent duplicate loading
    if (this.loadingSignal()) {
      return of(this.getArchiveDataWithRelations());
    }

    this.loadingSignal.set(true);

    return this.loadAllArchiveDataFromRoute().pipe(
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
        return of(this.getArchiveDataWithRelations());
      }),
      map(() => this.getArchiveDataWithRelations())
    );
  }

  /**
   * Load archive data from the get_all_data_for_archive route
   */
  private loadAllArchiveDataFromRoute(): Observable<AdminDataWithRelations> {
    return new Observable<AdminDataWithRelations>((subscriber) => {
      this.adminService.getAllDataForArchive<AdminDataWithRelations>().subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response.data);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load archive data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
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
   * Remove record with cascade from local cache
   */
  removeRecordWithCascade(table: string, id: string): void {
    const signal = this.signalMap[table];
    if (signal) {
      signal.update((items) => items.filter((item: any) => item.id !== id));
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
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
