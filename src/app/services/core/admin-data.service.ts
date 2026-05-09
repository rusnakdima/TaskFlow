/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { AdminService } from "@services/data/admin.service";
import { ResponseStatus } from "@models/response.model";
import { AdminDataWithRelations, LoadDataOptions } from "@models/admin.model";

export { AdminDataWithRelations } from "@models/admin.model";

@Injectable({
  providedIn: "root",
})
export class AdminDataService {
  private adminService = inject(AdminService);

  loadAllData(_options: LoadDataOptions = {}): Observable<AdminDataWithRelations> {
    return of({} as AdminDataWithRelations);
  }

  loadAllAdminData(): Observable<AdminDataWithRelations> {
    return new Observable<AdminDataWithRelations>((subscriber) => {
      this.adminService.getAllDataForAdmin<AdminDataWithRelations>().subscribe({
        next: (response) => {
          if (response.status === ResponseStatus.SUCCESS && response.data) {
            subscriber.next(response.data as AdminDataWithRelations);
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
