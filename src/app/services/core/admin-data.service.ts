/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { AdminService } from "@services/data/admin.service";
import { StorageService } from "@services/core/storage.service";
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
  private adminService = inject(AdminService);
  private storageService = inject(StorageService);

  loadAllData(options: LoadDataOptions = {}): Observable<AdminDataWithRelations> {
    const { showDeleted = false } = options;

    const dataMap: AdminDataWithRelations = {
      todos: this.storageService.privateTodos(),
      categories: this.storageService.categories(),
    };

    if (showDeleted) {
      dataMap["todos"] = dataMap["todos"].filter((t: any) => t.deleted_at != null);
    }

    return of(dataMap);
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
