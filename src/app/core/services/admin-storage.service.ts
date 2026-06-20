/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError, map } from "rxjs/operators";
/* services */
import { AdminService } from "@services/data/admin.service";
import { ApiService } from "@services/api.service";
import { AdminDataWithRelations } from "@core/services/admin-data.service";
import { BaseAdminStorageService } from "./base-admin-storage.service";
import { ResponseStatus } from "@entities/response.model";
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
          if (response.status === ResponseStatus.SUCCESS && response.data) {
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
  loadMoreData(type: string, skip: number, limit = 10): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, skip, limit).subscribe({
        next: (response) => {
          if (response.status === ResponseStatus.SUCCESS && response.data) {
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
    const data = {
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
    return data as any;
  }
  /**
   * Load admin data for a specific type from backend
   * Uses per-type loading to avoid fetching all data at once
   */
  loadAdminDataForType(type: string, force: boolean = false): Observable<any[]> {
    if (!force && this.isTypeLoaded(type) && this.hasTypeData(type)) {
      return of(this.getTypeData(type));
    }
    if (this.loadingSignal()) {
      return of(this.getTypeData(type));
    }
    this.loadingSignal.set(true);
    return this.loadAdminDataFromRoute().pipe(
      tap((response: any) => {
        const data = response?.data || response;
        this.setTypeData(data);
        this.markTypeAsLoaded(type);
        this.loadingSignal.set(false);
        this.loadedSignal.set(true);
        this.lastLoadedSignal.set(new Date());
      }),
      catchError(() => {
        this.loadingSignal.set(false);
        return of(this.getTypeData(type));
      }),
      map((response: any) => {
        const data = response?.data || response;
        return data[type] || [];
      })
    );
  }
  private getTypeData(type: string): any[] {
    switch (type) {
      case "todos":
        return this.todosSignal();
      case "tasks":
        return this.tasksSignal();
      case "subtasks":
        return this.subtasksSignal();
      case "comments":
        return this.commentsSignal();
      case "chats":
        return this.chatsSignal();
      case "categories":
        return this.categoriesSignal();
      case "daily_activities":
        return this.dailyActivitiesSignal();
      default:
        return [];
    }
  }
  private setTypeData(data: any): void {
    this.todosSignal.set(data["todos"] || []);
    this.tasksSignal.set(data["tasks"] || []);
    this.subtasksSignal.set(data["subtasks"] || []);
    this.commentsSignal.set(data["comments"] || []);
    this.chatsSignal.set(data["chats"] || []);
    this.categoriesSignal.set(data["categories"] || []);
    this.dailyActivitiesSignal.set(data["daily_activities"] || []);
  }
  private hasTypeData(type: string): boolean {
    const data = this.getTypeData(type);
    return data.length > 0;
  }
  /**
   * Load admin data from the get_all_admin_data route (MongoDB)
   */
  private loadAdminDataFromRoute(): Observable<AdminDataWithRelations> {
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
