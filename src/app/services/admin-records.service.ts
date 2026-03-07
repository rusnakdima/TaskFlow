import { Injectable } from "@angular/core";
import { from, Observable } from "rxjs";
import { AdminService } from "@services/admin.service";
import { NotifyService } from "@services/notify.service";
import { BulkActionService } from "@services/bulk-action.service";
import { StorageService } from "@services/storage.service";
import { ResponseStatus } from "@models/response.model";
import { tap } from "rxjs/operators";

@Injectable({
  providedIn: "root",
})
export class AdminRecordsService {
  constructor(
    private adminService: AdminService,
    private notifyService: NotifyService,
    private bulkActionService: BulkActionService,
    private storageService: StorageService
  ) {}

  async deleteRecord(selectedType: string, record: any): Promise<boolean> {
    const typeSingular = selectedType.slice(0, -1);
    if (!confirm(`Are you sure you want to delete this ${typeSingular} record?`)) {
      return false;
    }

    try {
      const response = await this.adminService.permanentlyDeleteRecord(selectedType, record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record permanently deleted");
        this.storageService.loadAllData(true).subscribe();
        return true;
      } else {
        this.notifyService.showError(response.message || "Failed to delete record");
        return false;
      }
    } catch (error) {
      this.notifyService.showError("Error deleting record: " + error);
      return false;
    }
  }

  async toggleDeleteStatus(selectedType: string, recordId: string): Promise<boolean> {
    try {
      const response = await this.adminService.toggleDeleteStatus(selectedType, recordId);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record status updated");
        return true;
      } else {
        this.notifyService.showError(response.message || "Failed to update record status");
        return false;
      }
    } catch (error) {
      this.notifyService.showError("Error updating record status: " + error);
      return false;
    }
  }

  deleteSelected(
    selectedType: string,
    selectedRecords: Set<string>,
    currentData: any[]
  ): Observable<{ successCount: number; errorCount: number }> {
    const count = selectedRecords.size;
    if (count === 0) {
      // Return empty observable
      return new Observable((observer) => {
        observer.next({ successCount: 0, errorCount: 0 });
        observer.complete();
      });
    }

    const typeSingular = selectedType.slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";

    if (
      !confirm(
        `Are you sure you want to permanently delete ${count} ${typeSingular} ${plural}? This cannot be undone.`
      )
    ) {
      // Return empty observable
      return new Observable((observer) => {
        observer.next({ successCount: 0, errorCount: 0 });
        observer.complete();
      });
    }

    const selectedItems = currentData.filter((item) => selectedRecords.has(item.id));

    return this.bulkActionService
      .bulkDelete(selectedItems, (id: string) =>
        from(this.adminService.permanentlyDeleteRecord(selectedType, id))
      )
      .pipe(
        tap((result) => {
          if (result.successCount > 0) {
            this.storageService.loadAllData(true).subscribe();
          }
        })
      );
  }
}
