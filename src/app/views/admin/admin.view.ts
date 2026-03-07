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

/* models */
import { ResponseStatus } from "@models/response.model";

/* services */
import { AdminService } from "@services/admin.service";
import { NotifyService } from "@services/notify.service";
import { AdminFiltersService } from "@services/admin-filters.service";
import { AdminRecordsService } from "@services/admin-records.service";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
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
    CheckboxComponent,
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
    private adminFiltersService: AdminFiltersService,
    private adminRecordsService: AdminRecordsService
  ) {}

  adminData = signal<AdminData>({});
  selectedType = signal<string>("todos");
  loading = signal<boolean>(false);
  selectedRecords = signal<Set<string>>(new Set());
  showFilters = signal<boolean>(false);

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
    this.showFilters.set(false);
  }

  getCurrentData(): any[] {
    let data = this.adminData()[this.selectedType()] || [];

    // Apply status filter for tasks/subtasks
    if (this.selectedType() === "tasks" || this.selectedType() === "subtasks") {
      data = this.adminFiltersService.filterByStatus(
        data,
        this.isCompletedFilter(),
        this.selectedType()
      );
    }

    // Build filter state
    const filterState = {
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

    // Apply all filters
    data = this.adminFiltersService.applyFilters(data, filterState, this.selectedType());

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
    const success = await this.adminRecordsService.deleteRecord(this.selectedType(), record);
    if (success) {
      await this.loadAdminData();
    }
  }

  async toggleDeleteStatus(record: any) {
    const success = await this.adminRecordsService.toggleDeleteStatus(
      this.selectedType(),
      record.id
    );
    if (success) {
      await this.loadAdminData();
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
    const cleared = this.adminFiltersService.clearFilters();
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
    this.adminRecordsService
      .deleteSelected(this.selectedType(), this.selectedRecords(), this.getCurrentData())
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
