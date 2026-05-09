import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";
import { StorageStateService } from "./storage-state.service";
import { AdminService } from "@services/data/admin.service";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";
import { User } from "@models/user.model";
import { Profile } from "@models/profile.model";
import { BaseStorageService } from "@services/core/base-storage.service";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: "root" })
export class StorageAdminService extends BaseStorageService {
  private state = inject(StorageStateService);
  private adminService = inject(AdminService);
  private adminDataService = inject(AdminDataService);

  get isLoading() {
    return this.loading;
  }

  loadInitialData(type: string, limit: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, 0, limit).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadMoreData(type: string, skip: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, skip, 10).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load more data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    const hasAnyData =
      this.state._privateTodos().length > 0 ||
      this.state._tasks().length > 0 ||
      this.state._subtasks().length > 0;

    if (!force && !hasAnyData) {
      force = true;
    }

    if (!force && this.isCacheValid(DEFAULT_TTL_MS)) {
      return of(this.getAdminDataWithRelations());
    }

    if (this.loading()) {
      return of(this.getAdminDataWithRelations());
    }

    this.setLoading(true);

    return this.adminDataService.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this.state._privateTodos.set(data["todos"] || []);
        this.state._tasks.set(data["tasks"] || []);
        this.state._subtasks.set(data["subtasks"] || []);
        this.state._comments.set(data["comments"] || []);
        this.state._chats.set(data["chats"] || []);
        this.state._categories.set(data["categories"] || []);
        this.state._dailyActivities.set(data["daily_activities"] || []);

        this.extractUsersAndProfiles(data);

        this.setLoading(false);
        this.setLoaded(true);
        this.setLastLoaded(new Date());
      }),
      catchError((err) => {
        this.setLoading(false);
        return of(this.getAdminDataWithRelations());
      }),
      map(() => this.getAdminDataWithRelations())
    );
  }

  private getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this.state._privateTodos(),
      tasks: this.state._tasks(),
      subtasks: this.state._subtasks(),
      comments: this.state._comments(),
      chats: this.state._chats(),
      categories: this.state._categories(),
      daily_activities: this.state._dailyActivities(),
      users: this.state._users(),
      profiles: this.state._profiles(),
    };
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

    this.state._users.set(Array.from(usersMap.values()));
    this.state._profiles.set(Array.from(profilesMap.values()));
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
}
