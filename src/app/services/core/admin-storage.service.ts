/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError, map } from "rxjs/operators";

/* services */
import { AdminService } from "@services/data/admin.service";
import { ApiService } from "@services/api.service";
import { AdminDataWithRelations } from "@services/core/admin-data.service";
import { BaseAdminStorageService } from "./base-admin-storage.service";

@Injectable({
  providedIn: "root",
})
export class AdminStorageService extends BaseAdminStorageService {
  private adminService = inject(AdminService);
  private apiService = inject(ApiService);

  /**
   * Load initial paginated data for a specific type
   */
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

  /**
   * Load more paginated data for a specific type
   */
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

  /**
   * Get all admin data with relations
   */
  getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this.todosSignal() || [],
      tasks: this.tasksSignal() || [],
      subtasks: this.subtasksSignal() || [],
      comments: this.commentsSignal() || [],
      chats: this.chatsSignal() || [],
      categories: this.categoriesSignal() || [],
      daily_activities: this.dailyActivitiesSignal() || [],
      users: this.usersSignal() || [],
      profiles: this.profilesSignal() || [],
    };
  }

  /**
   * Load all admin data from backend (MongoDB)
   * Only fetches if cache is expired or force is true
   */
  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    if (!force && this.isCacheValid() && this.hasAdminData()) {
      return of(this.getAdminDataWithRelations());
    }

    if (this.loadingSignal()) {
      return of(this.getAdminDataWithRelations());
    }

    this.loadingSignal.set(true);

    return this.loadAllAdminDataFromRoute().pipe(
      tap((response: any) => {
        const data = response?.data || response;
        this.todosSignal.set(data["todos"] || []);
        this.tasksSignal.set(data["tasks"] || []);
        this.subtasksSignal.set(data["subtasks"] || []);
        this.commentsSignal.set(data["comments"] || []);
        this.chatsSignal.set(data["chats"] || []);
        this.categoriesSignal.set(data["categories"] || []);
        this.dailyActivitiesSignal.set(data["daily_activities"] || []);

        this.loadingSignal.set(false);
        this.loadedSignal.set(true);
        this.lastLoadedSignal.set(new Date());
      }),
      catchError(() => {
        this.loadingSignal.set(false);
        return of(this.getAdminDataWithRelations());
      }),
      map((response: any) => {
        const data = response?.data || response;
        return {
          todos: data["todos"] || [],
          tasks: data["tasks"] || [],
          subtasks: data["subtasks"] || [],
          comments: data["comments"] || [],
          chats: data["chats"] || [],
          categories: data["categories"] || [],
          daily_activities: data["daily_activities"] || [],
          users: [],
          profiles: [],
        };
      })
    );
  }

  private hasAdminData(): boolean {
    return (
      this.todosSignal().length > 0 ||
      this.tasksSignal().length > 0 ||
      this.subtasksSignal().length > 0 ||
      this.commentsSignal().length > 0 ||
      this.chatsSignal().length > 0 ||
      this.categoriesSignal().length > 0 ||
      this.dailyActivitiesSignal().length > 0
    );
  }

  /**
   * Load admin data from the get_all_admin_data route (MongoDB)
   */
  private loadAllAdminDataFromRoute(): Observable<AdminDataWithRelations> {
    return new Observable<AdminDataWithRelations>((subscriber) => {
      (this.apiService.admin.getAllAdminData() as Observable<any>).subscribe({
        next: (response) => {
          subscriber.next(response);
          subscriber.complete();
        },
        error: (err) => {
          subscriber.error(err);
        },
      });
    });
  }
}
