/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";

/* services */
import { AdminService } from "@services/data/admin.service";
import { AdminDataWithRelations } from "@services/core/admin-data.service";
import { BaseAdminStorageService } from "./base-admin-storage.service";

@Injectable({
  providedIn: "root",
})
export class ArchiveStorageService extends BaseAdminStorageService {
  private adminService = inject(AdminService);

  /**
   * Load initial paginated data for a specific type
   */
  loadInitialData(type: string, limit: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getArchiveDataPaginated(type, 0, limit).subscribe({
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

  /**
   * Load more paginated data for a specific type
   */
  loadMoreData(type: string, skip: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getArchiveDataPaginated(type, skip, 10).subscribe({
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
    if (!this.hasData()) {
      force = true;
    }

    if (!force && this.isCacheValid()) {
      return of(this.getArchiveDataWithRelations());
    }

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
}
