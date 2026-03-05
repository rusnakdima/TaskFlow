/* sys lib */
import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { from } from "rxjs";

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

/* models */
import { ResponseStatus } from "@models/response.model";
import { TaskStatus } from "@models/task.model";

/* services */
import { AdminService } from "@services/admin.service";
import { NotifyService } from "@services/notify.service";
import { FilterService, FilterConfig } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { BulkActionService } from "@services/bulk-action.service";

/* components */
import { TodoRecordsComponent } from "@components/admin-records/todo-records/todo-records.component";
import { TaskRecordsComponent } from "@components/admin-records/task-records/task-records.component";
import { SubtaskRecordsComponent } from "@components/admin-records/subtask-records/subtask-records.component";
import { CategoryRecordsComponent } from "@components/admin-records/category-records/category-records.component";
import { DailyActivityRecordsComponent } from "@components/admin-records/daily-activity-records/daily-activity-records.component";

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
    TodoRecordsComponent,
    TaskRecordsComponent,
    SubtaskRecordsComponent,
    CategoryRecordsComponent,
    DailyActivityRecordsComponent,
  ],
  templateUrl: "./admin.view.html",
})
export class AdminView implements OnInit {
  constructor(
    private adminService: AdminService,
    private notifyService: NotifyService,
    private filterService: FilterService,
    private sortService: SortService,
    private bulkActionService: BulkActionService
  ) {}

  adminData = signal<AdminData>({});
  selectedType = signal<string>("todos");
  loading = signal<boolean>(false);
  showMobileSidebar = signal<boolean>(false);
  selectedRecords = signal<Set<string>>(new Set());
  titleFilter = signal<string>("");
  descriptionFilter = signal<string>("");
  priorityFilter = signal<string>("");
  startDateFilter = signal<string>("");
  endDateFilter = signal<string>("");
  showFilters = signal<boolean>(false);
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

  async loadAdminData() {
    this.loading.set(true);
    try {
      const response = await this.adminService.getAllDataForAdmin<AdminData>();
      if (response.status === ResponseStatus.SUCCESS) {
        this.adminData.set(response.data);

        this.dataTypes.forEach((type) => {
          const data = this.adminData()[type.id];
          type.count = data ? data.length : 0;
        });
      } else {
        this.notifyService.showError(response.message || "Failed to load admin data");
      }
    } catch (error) {
      this.notifyService.showError("Failed to load admin data: " + error);
    } finally {
      this.loading.set(false);
    }
  }

  selectDataType(typeId: string) {
    this.selectedType.set(typeId);
    this.clearSelection();
    this.clearFilters();
    this.showMobileSidebar.set(false);
  }

  getCurrentData(): any[] {
    let data = this.adminData()[this.selectedType()] || [];

    // Build filter configs
    const filterConfigs: FilterConfig[] = [];

    if (this.titleFilter()) {
      filterConfigs.push({ field: "title", value: this.titleFilter(), operator: "contains" });
    }

    if (this.descriptionFilter()) {
      filterConfigs.push({
        field: "description",
        value: this.descriptionFilter(),
        operator: "contains",
      });
    }

    if (this.priorityFilter() && this.priorityFilter() !== "") {
      filterConfigs.push({ field: "priority", value: this.priorityFilter(), operator: "equals" });
    }

    // Status filter (active/deleted)
    if (this.statusFilter() === "active") {
      filterConfigs.push({ field: "isDeleted", value: false, operator: "equals" });
    } else if (this.statusFilter() === "deleted") {
      filterConfigs.push({ field: "isDeleted", value: true, operator: "equals" });
    }

    // Task status filters
    if (this.selectedType() === "tasks") {
      if (this.isCompletedFilter() === "completed") {
        filterConfigs.push({ field: "status", value: TaskStatus.COMPLETED, operator: "equals" });
      } else if (this.isCompletedFilter() === "pending") {
        filterConfigs.push({ field: "status", value: TaskStatus.PENDING, operator: "equals" });
      } else if (this.isCompletedFilter() === "skipped") {
        filterConfigs.push({ field: "status", value: TaskStatus.SKIPPED, operator: "equals" });
      } else if (this.isCompletedFilter() === "failed") {
        filterConfigs.push({ field: "status", value: TaskStatus.FAILED, operator: "equals" });
      } else if (this.isCompletedFilter() === "done") {
        data = data.filter(
          (item) => item.status === TaskStatus.COMPLETED || item.status === TaskStatus.SKIPPED
        );
      }
    }

    // Subtask status filters
    if (this.selectedType() === "subtasks") {
      if (this.isCompletedFilter() === "completed") {
        filterConfigs.push({ field: "status", value: TaskStatus.COMPLETED, operator: "equals" });
      } else if (this.isCompletedFilter() === "pending") {
        filterConfigs.push({ field: "status", value: TaskStatus.PENDING, operator: "equals" });
      } else if (this.isCompletedFilter() === "skipped") {
        filterConfigs.push({ field: "status", value: TaskStatus.SKIPPED, operator: "equals" });
      } else if (this.isCompletedFilter() === "failed") {
        filterConfigs.push({ field: "status", value: TaskStatus.FAILED, operator: "equals" });
      } else if (this.isCompletedFilter() === "done") {
        data = data.filter(
          (item) => item.status === TaskStatus.COMPLETED || item.status === TaskStatus.SKIPPED
        );
      }
    }

    // Apply filters
    data = this.filterService.applyFilters(data, filterConfigs);

    // Custom filters (user, categories, dates, IDs)
    if (this.userFilter()) {
      const filter = this.userFilter().toLowerCase();
      data = data.filter((item) => {
        if (
          (this.selectedType() === "todos" || this.selectedType() === "categories") &&
          item.user
        ) {
          const { profile, username } = item.user;
          const firstName = profile?.name?.toLowerCase() || "";
          const lastName = profile?.lastName?.toLowerCase() || "";
          const userName = username?.toLowerCase() || "";
          return (
            firstName.includes(filter) || lastName.includes(filter) || userName.includes(filter)
          );
        }
        return false;
      });
    }

    if (this.categoriesFilter() && this.selectedType() === "todos") {
      const filter = this.categoriesFilter().toLowerCase();
      data = data.filter((item) => {
        if (item.categories && Array.isArray(item.categories)) {
          return item.categories.some((cat: any) => cat.title?.toLowerCase().includes(filter));
        }
        return false;
      });
    }

    if (this.startDateFilter()) {
      const filterDate = new Date(this.startDateFilter());
      data = data.filter((item) => {
        const itemDate = new Date(item.startDate || item.createdAt);
        return itemDate >= filterDate;
      });
    }

    if (this.endDateFilter()) {
      const filterDate = new Date(this.endDateFilter());
      data = data.filter((item) => {
        const itemDate = new Date(item.endDate || item.createdAt);
        return itemDate <= filterDate;
      });
    }

    if (this.todoIdFilter() && this.selectedType() === "tasks") {
      const filter = this.todoIdFilter().toLowerCase();
      data = data.filter((item) => {
        return item.todoId && item.todoId.toLowerCase().includes(filter);
      });
    }

    if (this.taskIdFilter() && this.selectedType() === "subtasks") {
      const filter = this.taskIdFilter().toLowerCase();
      data = data.filter((item) => {
        return item.taskId && item.taskId.toLowerCase().includes(filter);
      });
    }

    // Sort using SortService
    data = this.sortService.sortByField(data, { field: this.sortBy(), order: this.sortOrder() });

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

  toggleMobileSidebar() {
    this.showMobileSidebar.update((val) => !val);
  }

  closeMobileSidebar() {
    this.showMobileSidebar.set(false);
  }

  closeFilters() {
    this.showFilters.set(false);
  }

  async deleteRecord(record: any) {
    if (
      confirm(`Are you sure you want to delete this ${this.selectedType().slice(0, -1)} record?`)
    ) {
      try {
        const response = await this.adminService.permanentlyDeleteRecord(
          this.selectedType(),
          record.id
        );

        if (response.status === ResponseStatus.SUCCESS) {
          this.notifyService.showSuccess("Record permanently deleted");

          await this.loadAdminData();
        } else {
          this.notifyService.showError(response.message || "Failed to delete record");
        }
      } catch (error) {
        this.notifyService.showError("Error deleting record: " + error);
      }
    }
  }

  async toggleDeleteStatus(record: any) {
    try {
      const response = await this.adminService.toggleDeleteStatus(this.selectedType(), record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record status updated");
        await this.loadAdminData();
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
    this.titleFilter.set("");
    this.descriptionFilter.set("");
    this.priorityFilter.set("");
    this.startDateFilter.set("");
    this.endDateFilter.set("");
    this.statusFilter.set("all");
    this.isCompletedFilter.set("all");
    this.userFilter.set("");
    this.categoriesFilter.set("");
    this.todoIdFilter.set("");
    this.taskIdFilter.set("");
    this.sortBy.set("createdAt");
    this.sortOrder.set("desc");
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

    const plural = count > 1 ? "records" : "record";
    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    if (
      !confirm(
        `Are you sure you want to permanently delete ${count} ${typeSingular} ${plural}? This cannot be undone.`
      )
    )
      return;

    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.selectedRecords().has(item.id));

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
          this.loadAdminData();
        }

        if (result.errorCount > 0) {
          this.notifyService.showError(
            `Failed to delete ${result.errorCount} ${result.errorCount === 1 ? "record" : "records"}`
          );
        }
      });
  }
}
