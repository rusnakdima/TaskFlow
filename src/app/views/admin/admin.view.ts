/* sys lib */
import { Component, OnInit, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* services */
import { DataSyncService } from "@services/data/data-sync.service";

/* base */
import { BaseAdminView, AdminDataMap } from "@views/base-admin.view";

/* components */
import { AdminDataTableComponent } from "@components/admin-records/admin-data-table.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* models */
import { ResponseStatus } from "@models/response.model";

@Component({
  selector: "app-admin-view",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatMenuModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    FormsModule,
    AdminDataTableComponent,
    BulkActionsComponent,
    CheckboxComponent,
  ],
  templateUrl: "./admin.view.html",
})
export class AdminView extends BaseAdminView implements OnInit {
  private dataSyncService = inject(DataSyncService);

  adminData = signal<AdminDataMap>({});

  ngOnInit(): void {
    this.loadAdminData();

    this.shortcutService.refresh$.subscribe(() => {
      this.loadAdminData(true);
      this.notifyService.showSuccess("Data refreshed");
    });
  }

  loadAdminData(force: boolean = false) {
    this.loading.set(true);
    this.adminStorageService.loadAdminData(true).subscribe({
      next: (data) => {
        console.log(data);
        this.adminData.set(data);

        this.dataTypes.forEach((type) => {
          const tableData = data[type.id];
          type.count = tableData ? tableData.length : 0;
        });
        this.loading.set(false);
      },
      error: (error) => {
        this.notifyService.showError("Failed to load admin data: " + error);
        this.loading.set(false);
      },
    });
  }

  getCurrentData(): any[] {
    return this.buildFilteredData(this.adminData()[this.selectedType()] || []);
  }

  getDataProperties(item: any): { key: string; value: any }[] {
    return Object.keys(item).map((key) => ({
      key,
      value: item[key],
    }));
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  }

  async deleteRecord(record: any) {
    const typeSingular = this.selectedType().slice(0, -1);
    const table = this.selectedType();

    const useCascade = table === "todos" || table === "tasks" || table === "subtasks";
    const confirmMessage = useCascade
      ? `WARNING: This will permanently delete this ${typeSingular} and ALL related data (tasks, subtasks, comments, chats). This action cannot be undone. Are you sure?`
      : `Are you sure you want to delete this ${typeSingular} record?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await this.adminService.permanentlyDeleteRecord(table, record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record permanently deleted");
        this.adminStorageService.removeRecordWithCascade(table, record.id);
        this.loadAdminData();
      } else {
        this.notifyService.showError(response.message || "Failed to delete record");
      }
    } catch (error) {
      this.notifyService.showError("Error deleting record: " + error);
    }
  }

  async toggleDeleteStatus(record: any) {
    try {
      const response = await this.adminService.toggleDeleteStatus(this.selectedType(), record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record status updated");
        this.loadAdminData(true);
      } else {
        this.notifyService.showError(response.message || "Failed to update record status");
      }
    } catch (error) {
      this.notifyService.showError("Error updating record status: " + error);
    }
  }

  // ==================== FLOATING BULK ACTIONS ====================

  onBulkSelectAll(): void {
    const currentData = this.getCurrentData();
    if (this.isAllSelected()) {
      this.clearSelection();
    } else {
      this.selectedRecords.update((records) => {
        const newRecords = new Set(records);
        currentData.forEach((item) => newRecords.add(item.id));
        return newRecords;
      });
    }
  }

  async onBulkSoftDelete(): Promise<void> {
    const count = this.selectedRecords().size;
    if (count === 0) return;

    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";

    if (!confirm(`Move ${count} ${typeSingular} ${plural} to archive?`)) {
      return;
    }

    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.isSelected(item.id));
    let completed = 0;

    selectedItems.forEach((item) => {
      this.adminService.toggleDeleteStatus(this.selectedType(), item.id).then((response) => {
        completed++;
        if (response.status === ResponseStatus.SUCCESS) {
          const adminData = this.adminData();
          const tableData = adminData[this.selectedType()] || [];
          const record = tableData.find((r: any) => r.id === item.id);
          if (record) {
            this.adminStorageService.updateRecordDeleteStatus(this.selectedType(), item.id, true);
          }
        }
        if (completed === selectedItems.length) {
          this.notifyService.showSuccess(`${count} ${plural} moved to archive`);
          this.clearSelection();
          this.loadAdminData(true);
        }
      });
    });
  }

  async onBulkHardDelete(): Promise<void> {
    const count = this.selectedRecords().size;
    if (count === 0) return;

    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";

    if (
      !confirm(
        `WARNING: Permanently delete ${count} ${typeSingular} ${plural} and all related data? This cannot be undone!`
      )
    ) {
      return;
    }

    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.isSelected(item.id));
    let completed = 0;

    selectedItems.forEach((item) => {
      const deletePromise = this.adminService.permanentlyDeleteRecord(this.selectedType(), item.id);

      deletePromise.then((response) => {
        completed++;
        if (response.status === ResponseStatus.SUCCESS) {
          this.adminStorageService.removeRecordWithCascade(this.selectedType(), item.id);
        }
        if (completed === selectedItems.length) {
          this.notifyService.showSuccess(`${count} ${plural} permanently deleted`);
          this.clearSelection();
          this.loadAdminData(true);
        }
      });
    });
  }

  onBulkCancel(): void {
    this.clearSelection();
  }
}
