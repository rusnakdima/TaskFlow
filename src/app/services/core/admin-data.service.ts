/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, from, of, firstValueFrom } from "rxjs";
import { map, catchError } from "rxjs/operators";
import { ApiProvider } from "@providers/api.provider";
import { AdminService } from "@services/data/admin.service";
import { ResponseStatus } from "@models/response.model";

export interface AdminDataWithRelations {
  [key: string]: any[];
}

export interface LoadDataOptions {
  showDeleted?: boolean;
  isOwner?: boolean;
  isPrivate?: boolean;
}

@Injectable({
  providedIn: "root",
})
export class AdminDataService {
  private apiProvider = inject(ApiProvider);
  private adminService = inject(AdminService);

  loadAllData(options: LoadDataOptions = {}): Observable<AdminDataWithRelations> {
    const { showDeleted = false, isOwner = false, isPrivate = false } = options;

    const tables = [
      { key: "todos", load: ["user"] },
      { key: "tasks", load: [] },
      { key: "subtasks", load: [] },
      { key: "comments", load: [] },
      { key: "chats", load: [] },
      { key: "categories", load: [] },
    ];

    const filter = showDeleted ? { deleted_at: { $ne: null } } : { deleted_at: null };

    const loadPromises = tables.map(async ({ key, load }) => {
      const data = await firstValueFrom(
        this.apiProvider
          .crud<any[]>("getAll", key, { filter, load, isOwner, isPrivate }, true)
          .pipe(catchError(() => of([])))
      );
      return { key, data: data || [] };
    });

    return from(Promise.all(loadPromises)).pipe(
      map((results) => {
        const dataMap: AdminDataWithRelations = {};
        results.forEach(({ key, data }) => {
          dataMap[key] = data;
        });
        return dataMap;
      })
    );
  }

  loadAllAdminData(): Observable<AdminDataWithRelations> {
    return new Observable<AdminDataWithRelations>((subscriber) => {
      this.adminService.getAllDataForAdmin<AdminDataWithRelations>().subscribe({
        next: (response) => {
          if (response.status === ResponseStatus.SUCCESS && response.data) {
            subscriber.next(response.data);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load admin data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadAllArchiveData(): Observable<AdminDataWithRelations> {
    return this.loadAllData({ showDeleted: true });
  }
}
