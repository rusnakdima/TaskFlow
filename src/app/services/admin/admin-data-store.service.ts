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
import { BaseStorageService } from "@services/core/base-storage.service";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";

@Injectable({
  providedIn: "root",
})
export class AdminDataStoreService extends BaseStorageService {
  private adminDataService = inject(AdminDataService);

  private todosSignal = signal<Todo[]>([]);
  private tasksSignal = signal<Task[]>([]);
  private subtasksSignal = signal<Subtask[]>([]);
  private commentsSignal = signal<Comment[]>([]);
  private chatsSignal = signal<Chat[]>([]);
  private categoriesSignal = signal<Category[]>([]);
  private dailyActivitiesSignal = signal<any[]>([]);
  private usersSignal = signal<User[]>([]);
  private profilesSignal = signal<Profile[]>([]);

  private readonly CACHE_EXPIRY_MS = 5 * 60 * 1000;

  readonly signalMap: Record<string, WritableSignal<any[]>> = {
    todos: this.todosSignal,
    tasks: this.tasksSignal,
    subtasks: this.subtasksSignal,
    comments: this.commentsSignal,
    chats: this.chatsSignal,
    categories: this.categoriesSignal,
    daily_activities: this.dailyActivitiesSignal,
  };

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

  protected override isCacheValid(): boolean {
    return super.isCacheValid(this.CACHE_EXPIRY_MS);
  }

  private hasData(): boolean {
    return (
      this.todosSignal().length > 0 ||
      this.tasksSignal().length > 0 ||
      this.categoriesSignal().length > 0
    );
  }

  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    if (!this.hasData()) {
      force = true;
    }

    if (!force && this.isCacheValid()) {
      return of(this.getAdminDataWithRelations());
    }

    if (this.loadingSignal()) {
      return of(this.getAdminDataWithRelations());
    }

    this.loadingSignal.set(true);

    return this.adminDataService.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this.todosSignal.set(data["todos"] || []);
        this.tasksSignal.set(data["tasks"] || []);
        this.subtasksSignal.set(data["subtasks"] || []);
        this.commentsSignal.set(data["comments"] || []);
        this.chatsSignal.set(data["chats"] || []);
        this.categoriesSignal.set(data["categories"] || []);
        this.dailyActivitiesSignal.set(data["daily_activities"] || []);

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

  getAdminDataWithRelations(): AdminDataWithRelations {
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

  updateRecord(table: string, id: string, updates: any): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items) => items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      this.tasksSignal.update((tasks) =>
        tasks.map((task) => (task.todo_id === parentId ? { ...task, ...updates } : task))
      );
    } else if (parentTable === "tasks") {
      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.task_id === parentId ? { ...subtask, ...updates } : subtask
        )
      );
    }
  }

  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items) => items.filter((item) => item.id !== id));
    if (table === "todos") {
      this.tasksSignal.update((tasks) => tasks.filter((task) => task.todo_id !== id));
    } else if (table === "tasks") {
      this.subtasksSignal.update((subtasks) =>
        subtasks.filter((subtask) => subtask.task_id !== id)
      );
    }
  }

  updateRecordDeleteStatus(table: string, id: string, deletedAt: boolean): void {
    const timestamp = new Date().toISOString();
    this.updateRecord(table, id, {
      deletedAt: deletedAt ? timestamp : null,
      updatedAt: timestamp,
    });
  }

  updateSignal(table: string, updater: (items: any[]) => any[]): void {
    const sig = this.signalMap[table];
    if (sig) sig.update(updater);
  }

  setSignal(table: string, items: any[]): void {
    const sig = this.signalMap[table];
    if (sig) sig.set(items);
  }

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
