/* sys lib */
import { Component, OnInit, signal } from "@angular/core";
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
import { AdminStorageService } from "@services/admin-storage.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { BulkActionService } from "@services/bulk-action.service";
import { AdminService } from "@services/admin.service";
import { DataSyncService } from "@services/data-sync.service";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { AdminDataTableComponent } from "@components/admin-records/admin-data-table.component";

/* models */
import { AdminFieldConfig, AdminFilterState } from "@models/admin-table.model";
import { ResponseStatus } from "@models/response.model";
import { from } from "rxjs";

interface AdminData {
  [key: string]: any[];
}

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
    CheckboxComponent,
    AdminDataTableComponent,
  ],
  templateUrl: "./admin.view.html",
})
export class AdminView implements OnInit {
  constructor(
    private adminStorageService: AdminStorageService,
    private notifyService: NotifyService,
    private filterService: FilterService,
    private sortService: SortService,
    private bulkActionService: BulkActionService,
    private adminService: AdminService,
    private dataSyncService: DataSyncService
  ) {}

  adminData = signal<AdminData>({});
  selectedType = signal<string>("todos");
  loading = signal<boolean>(false);
  selectedRecords = signal<Set<string>>(new Set());
  showFilters = signal<boolean>(false);

  // Field configurations
  todoFields: AdminFieldConfig[] = [
    { key: "description", label: "Description", type: "text" },
    { key: "priority", label: "Priority", type: "priority" },
    { key: "visibility", label: "Visibility", type: "text" },
    { key: "startDate", label: "Start Date", type: "date" },
    { key: "endDate", label: "End Date", type: "date" },
    { key: "tasks", label: "Tasks", type: "array-count" },
    { key: "assignees", label: "Assignees", type: "array-count" },
    { key: "user", label: "Owner", type: "user" },
    { key: "updatedAt", label: "Last Updated", type: "date" },
  ];

  taskFields: AdminFieldConfig[] = [
    { key: "description", label: "Description", type: "text" },
    { key: "priority", label: "Priority", type: "priority" },
    { key: "status", label: "Status", type: "text" },
    { key: "startDate", label: "Start Date", type: "date" },
    { key: "endDate", label: "End Date", type: "date" },
    { key: "todoId", label: "Todo ID", type: "text" },
    { key: "subtasks", label: "Subtasks", type: "array-count" },
    { key: "updatedAt", label: "Last Updated", type: "date" },
  ];

  subtaskFields: AdminFieldConfig[] = [
    { key: "description", label: "Description", type: "text" },
    { key: "priority", label: "Priority", type: "priority" },
    { key: "status", label: "Status", type: "text" },
    { key: "taskId", label: "Task ID", type: "text" },
    { key: "updatedAt", label: "Last Updated", type: "date" },
  ];

  categoryFields: AdminFieldConfig[] = [
    { key: "user", label: "Owner", type: "user" },
    { key: "updatedAt", label: "Last Updated", type: "date" },
  ];

  dailyActivityFields: AdminFieldConfig[] = [
    { key: "userId", label: "User ID", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "updatedAt", label: "Last Updated", type: "date" },
  ];

  getFieldConfig(): AdminFieldConfig[] {
    switch (this.selectedType()) {
      case "todos":
        return this.todoFields;
      case "tasks":
        return this.taskFields;
      case "subtasks":
        return this.subtaskFields;
      case "categories":
        return this.categoryFields;
      case "daily_activities":
        return this.dailyActivityFields;
      default:
        return [];
    }
  }

  // Filter state
  titleFilter = signal<string>("");
  descriptionFilter = signal<string>("");
  priorityFilter = signal<string>("");
  startDateFilter = signal<string>("");
  endDateFilter = signal<string>("");
  statusFilter = signal<string>("all");
  isCompletedFilter = signal<string>("all");
  userFilter = signal<string>("");
  categoriesFilter = signal<string>("");
  todoIdFilter = signal<string>("");
  taskIdFilter = signal<string>("");
  sortBy = signal<string>("createdAt");
  sortOrder = signal<"asc" | "desc">("desc");

  dataTypes = [
    {
      id: "todos",
      label: "Todos",
      icon: "list_alt",
      count: 0,
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: "checklist",
      count: 0,
    },
    {
      id: "subtasks",
      label: "Subtasks",
      icon: "assignment",
      count: 0,
    },
    {
      id: "categories",
      label: "Categories",
      icon: "category",
      count: 0,
    },
    {
      id: "daily_activities",
      label: "Daily Activities",
      icon: "schedule",
      count: 0,
    },
  ];

  ngOnInit(): void {
    this.loadAdminData();
  }

  loadAdminData() {
    this.loading.set(true);
    this.adminStorageService.loadAdminData().subscribe({
      next: (data) => {
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

  selectDataType(typeId: string) {
    this.selectedType.set(typeId);
    this.clearSelection();
    this.clearFilters();
    this.showFilters.set(false);
  }

  getCurrentData(): any[] {
    let data = this.adminData()[this.selectedType()] || [];

    // Apply status filter for tasks/subtasks
    if (this.selectedType() === "tasks" || this.selectedType() === "subtasks") {
      data = this.filterService.filterAdminByStatus(data, this.isCompletedFilter());
    }

    // Build filter state
    const filterState: AdminFilterState = {
      titleFilter: this.titleFilter(),
      descriptionFilter: this.descriptionFilter(),
      priorityFilter: this.priorityFilter(),
      startDateFilter: this.startDateFilter(),
      endDateFilter: this.endDateFilter(),
      statusFilter: this.statusFilter(),
      isCompletedFilter: this.isCompletedFilter(),
      userFilter: this.userFilter(),
      categoriesFilter: this.categoriesFilter(),
      todoIdFilter: this.todoIdFilter(),
      taskIdFilter: this.taskIdFilter(),
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
    };

    // Apply all filters using FilterService
    const filterConfigs = this.filterService.buildAdminFilterConfigs(
      filterState,
      this.selectedType()
    );
    data = this.filterService.applyFilters(data, filterConfigs);
    data = this.filterService.applyAdminCustomFilters(data, filterState, this.selectedType());

    // Sort using SortService
    data = this.sortService.sortByField(data, {
      field: this.sortBy(),
      order: this.sortOrder(),
    });

    return data;
  }

  getDataProperties(item: any): { key: string; value: any }[] {
    return Object.keys(item).map((key) => ({
      key,
      value: item[key],
    }));
  }

  getSelectedTypeLabel(): string {
    const type = this.dataTypes.find((t) => t.id === this.selectedType());
    return type ? type.label : this.selectedType();
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

  closeFilters() {
    this.showFilters.set(false);
  }

  async deleteRecord(record: any) {
    const typeSingular = this.selectedType().slice(0, -1);
    if (!confirm(`Are you sure you want to delete this ${typeSingular} record?`)) {
      return;
    }

    try {
      const response = await this.adminService.permanentlyDeleteRecord(
        this.selectedType(),
        record.id
      );

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record permanently deleted");
        // Update local storage instead of reloading all data
        this.adminStorageService.removeRecord(this.selectedType(), record.id);
        this.adminData.update((data) => {
          const updated = { ...data };
          updated[this.selectedType()] = (updated[this.selectedType()] || []).filter(
            (item) => item.id !== record.id
          );
          return updated;
        });
        // Update count
        const type = this.dataTypes.find((t) => t.id === this.selectedType());
        if (type) {
          type.count = Math.max(0, type.count - 1);
        }
        this.dataSyncService.loadAllData(true).subscribe();
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
        // Update local storage with new isDeleted status and updatedAt timestamp
        const updatedData = {
          isDeleted: !record.isDeleted,
          updatedAt: new Date().toISOString(),
        };
        this.adminStorageService.updateRecord(this.selectedType(), record.id, updatedData);
        this.adminData.update((data) => {
          const updated = { ...data };
          const index = (updated[this.selectedType()] || []).findIndex(
            (item) => item.id === record.id
          );
          if (index !== -1) {
            updated[this.selectedType()][index] = {
              ...updated[this.selectedType()][index],
              ...updatedData,
            };
          }
          return updated;
        });
      } else {
        this.notifyService.showError(response.message || "Failed to update record status");
      }
    } catch (error) {
      this.notifyService.showError("Error updating record status: " + error);
    }
  }

  toggleSelect(id: string): void {
    this.selectedRecords.update((records) => {
      const newRecords = new Set(records);
      if (newRecords.has(id)) {
        newRecords.delete(id);
      } else {
        newRecords.add(id);
      }
      return newRecords;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedRecords().has(id);
  }

  clearSelection(): void {
    this.selectedRecords.set(new Set());
  }

  clearFilters(): void {
    const cleared = this.filterService.getDefaultAdminFilterState();
    this.titleFilter.set(cleared.titleFilter);
    this.descriptionFilter.set(cleared.descriptionFilter);
    this.priorityFilter.set(cleared.priorityFilter);
    this.startDateFilter.set(cleared.startDateFilter);
    this.endDateFilter.set(cleared.endDateFilter);
    this.statusFilter.set(cleared.statusFilter);
    this.isCompletedFilter.set(cleared.isCompletedFilter);
    this.userFilter.set(cleared.userFilter);
    this.categoriesFilter.set(cleared.categoriesFilter);
    this.todoIdFilter.set(cleared.todoIdFilter);
    this.taskIdFilter.set(cleared.taskIdFilter);
    this.sortBy.set(cleared.sortBy);
    this.sortOrder.set(cleared.sortOrder);
  }

  isAllSelected(): boolean {
    const currentData = this.getCurrentData();
    return currentData.length > 0 && currentData.every((item) => this.isSelected(item.id));
  }

  toggleSelectAll(): void {
    const currentData = this.getCurrentData();
    const allSelected = this.isAllSelected();
    if (allSelected) {
      this.selectedRecords.update((records) => {
        const newRecords = new Set(records);
        currentData.forEach((item) => newRecords.delete(item.id));
        return newRecords;
      });
    } else {
      this.selectedRecords.update((records) => {
        const newRecords = new Set(records);
        currentData.forEach((item) => newRecords.add(item.id));
        return newRecords;
      });
    }
  }

  async deleteSelected(): Promise<void> {
    const count = this.selectedRecords().size;
    if (count === 0) return;

    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";

    if (
      !confirm(
        `Are you sure you want to permanently delete ${count} ${typeSingular} ${plural}? This cannot be undone.`
      )
    ) {
      return;
    }

    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.isSelected(item.id));

    this.bulkActionService
      .bulkDelete(selectedItems, (id: string) =>
        from(this.adminService.permanentlyDeleteRecord(this.selectedType(), id))
      )
      .subscribe((result) => {
        this.clearSelection();
        if (result.successCount > 0) {
          this.notifyService.showSuccess(
            `${result.successCount} ${result.successCount === 1 ? "record" : "records"} permanently deleted`
          );

          // Update local storage
          const deletedIds = selectedItems.filter((_, i) => i < result.successCount).map((item) => item.id);
          // Actually we should use result.errors to know which ones failed, but bulkDelete result doesn't explicitly map success per ID in a simple way for filtering here without more logic.
          // Let's assume most succeed or we reload if any succeed.
          
          this.dataSyncService.loadAllData(true).subscribe();
          this.loadAdminData(); // Reload all admin data to be safe and update counts
        }

        if (result.errorCount > 0) {
          this.notifyService.showError(
            `Failed to delete ${result.errorCount} ${result.errorCount === 1 ? "record" : "records"}`
          );
        }
      });
  }
}
