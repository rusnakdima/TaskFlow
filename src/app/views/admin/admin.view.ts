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
import { AdminStorageService } from "@services/core/admin-storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { AdminService } from "@services/data/admin.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* components */
import { AdminDataTableComponent } from "@components/admin-records/admin-data-table.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { BulkActionMode } from "@services/bulk-action.service";

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
    AdminDataTableComponent,
    BulkActionsComponent,
    CheckboxComponent,
  ],
  templateUrl: "./admin.view.html",
})
export class AdminView implements OnInit {
  private filterService: FilterHelper;
  private sortService: SortHelper;
  private bulkActionService: BulkActionHelper;

  constructor(
    private adminStorageService: AdminStorageService,
    private notifyService: NotifyService,
    private adminService: AdminService,
    private dataSyncService: DataSyncService,
    private shortcutService: ShortcutService
  ) {
    this.filterService = new FilterHelper();
    this.sortService = new SortHelper();
    this.bulkActionService = new BulkActionHelper();
  }

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

  commentFields: AdminFieldConfig[] = [
    { key: "content", label: "Comment", type: "text" },
    { key: "authorName", label: "Author", type: "text" },
    { key: "taskId", label: "Task ID", type: "text" },
    { key: "subtaskId", label: "Subtask ID", type: "text" },
    { key: "updatedAt", label: "Last Updated", type: "date" },
  ];

  chatFields: AdminFieldConfig[] = [
    { key: "content", label: "Message", type: "text" },
    { key: "authorName", label: "Author", type: "text" },
    { key: "todoId", label: "Todo ID", type: "text" },
    { key: "createdAt", label: "Created", type: "date" },
  ];

  getFieldConfig(): AdminFieldConfig[] {
    switch (this.selectedType()) {
      case "todos":
        return this.todoFields;
      case "tasks":
        return this.taskFields;
      case "subtasks":
        return this.subtaskFields;
      case "comments":
        return this.commentFields;
      case "chats":
        return this.chatFields;
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
      id: "comments",
      label: "Comments",
      icon: "forum",
      count: 0,
    },
    {
      id: "chats",
      label: "Chats",
      icon: "chat",
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

    // Subscribe to refresh shortcut (Ctrl+R)
    this.shortcutService.refresh$.subscribe(() => {
      this.loadAdminData(true);
      this.notifyService.showSuccess("Data refreshed");
    });
  }

  loadAdminData(force: boolean = false) {
    this.loading.set(true);
    // Always force reload from backend when explicitly called by user
    this.adminStorageService.loadAdminData(true).subscribe({
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
    const table = this.selectedType();

    // Use cascade delete for todos, tasks, and subtasks (they have children)
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

        // Update local storage immediately
        this.adminStorageService.removeRecordWithCascade(table, record.id);

        // Reload all data to ensure consistency
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

        // Force reload all data to get fresh data from MongoDB with updated cascade
        this.loadAdminData(true);
      } else {
        this.notifyService.showError(response.message || "Failed to update record status");
      }
    } catch (error) {
      this.notifyService.showError("Error updating record status: " + error);
    }
  }

  toggleSelect(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    this.selectedRecords.update((records) => {
      const newRecords = new Set(records);
      if (selected) {
        newRecords.add(id);
      } else {
        newRecords.delete(id);
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
          // Reload all data after deletion
          this.loadAdminData();
        }

        if (result.errorCount > 0) {
          this.notifyService.showError(
            `Failed to delete ${result.errorCount} ${result.errorCount === 1 ? "record" : "records"}`
          );
        }
      });
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
          // Update storage
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
          // Update storage
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
