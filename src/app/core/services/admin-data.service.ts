/* angular */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
/* library */
import { ResponseStatus } from "@tauri-front/shared";
/* app */
import { AdminService } from "@services/data/admin.service";
import { AdminDataWithRelations, LoadDataOptions } from "@entities/admin.model";
export { AdminDataWithRelations } from "@entities/admin.model";
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
      this.adminService.getAllAdminData<AdminDataWithRelations>().subscribe({
        next: (response) => {
          if (response.status === ResponseStatus.Success && response.data) {
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
