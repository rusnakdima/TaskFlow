import { Component, OnInit, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Observable } from "rxjs";

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
import { ShortcutService } from "@services/ui/shortcut.service";

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* models */
import { AdminFieldConfig, AdminFilterState } from "@models/admin-table.model";
import { ResponseStatus } from "@models/response.model";

/* components */
import { AdminDataTableComponent } from "@components/admin-records/admin-data-table.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-data-management-view",
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
  templateUrl: "./data-management.view.html",
  styles: [
    `
      .filter-sidebar-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        animation: fadeIn 0.2s ease-out;
      }
      .filter-sidebar {
        position: fixed;
        top: 0;
        right: -320px;
        width: 320px;
        max-width: 85vw;
        height: 100vh;
        background: white;
        z-index: 1000;
        box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
        transition: right 0.3s ease-in-out;
        overflow-y: auto;
      }
      :host-context(.dark) .filter-sidebar {
        background: rgb(39 39 42);
      }
      .filter-sidebar.open {
        right: 0;
      }
      .filter-sidebar-content {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 1.5rem;
      }
      .filter-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 1rem;
        border-bottom: 1px solid rgb(229 231 235);
        margin-bottom: 1.5rem;
      }
      :host-context(.dark) .filter-sidebar-header {
        border-bottom-color: rgb(64 64 64);
      }
      .filter-sidebar-section {
        margin-bottom: 1.5rem;
      }
      .filter-sidebar-actions {
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid rgb(229 231 235);
      }
      :host-context(.dark) .filter-sidebar-actions {
        border-top-color: rgb(64 64 64);
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @media (max-width: 640px) {
        .filter-sidebar {
          width: 100%;
          max-width: 100%;
        }
      }
    `,
  ],
})
export class DataManagementView implements OnInit {
  private route = inject(ActivatedRoute);

  protected adminStorageService = inject(AdminStorageService);
  protected notifyService = inject(NotifyService);
  protected adminService = inject(AdminService);
  protected shortcutService = inject(ShortcutService);
  protected bulkActionService = new BulkActionHelper();

  mode: "admin" | "archive" = "admin";
  dataMap = signal<any>({});

  selectedType = signal<string>("todos");
  loading = signal<boolean>(false);
  selectedRecords = signal<Set<string>>(new Set());
  showFilters = signal<boolean>(false);

  // Field configurations
  todoFields: AdminFieldConfig[] = [
    { key: "description", label: "Description", type: "text" },
    { key: "priority", label: "Priority", type: "priority" },
    { key: "visibility", label: "Visibility", type: "select", options: ["private", "team"] },
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

  // Filter state
  titleFilter = signal<string>("");
  descriptionFilter = signal<string>("");
  priorityFilter = signal<string>("");
  startDateFilter = signal<string>("");
  endDateFilter = signal<string>("");
  statusFilter = signal<string>("active");
  isCompletedFilter = signal<string>("all");
  userFilter = signal<string>("");
  categoriesFilter = signal<string>("");
  todoIdFilter = signal<string>("");
  taskIdFilter = signal<string>("");
  subtaskIdFilter = signal<string>("");
  visibilityFilter = signal<string>("all");

  userList = signal<{ id: string; label: string }[]>([]);
  categoryList = signal<{ id: string; label: string }[]>([]);
  todoList = signal<{ id: string; label: string }[]>([]);
  taskList = signal<{ id: string; label: string }[]>([]);
  subtaskList = signal<{ id: string; label: string }[]>([]);
  deletedFilter = signal<string>("all");
  sortBy = signal<string>("createdAt");
  sortOrder = signal<"asc" | "desc">("desc");

  dataTypes = [
    { id: "todos", label: "Todos", icon: "list_alt", count: 0 },
    { id: "tasks", label: "Tasks", icon: "checklist", count: 0 },
    { id: "subtasks", label: "Subtasks", icon: "assignment", count: 0 },
    { id: "comments", label: "Comments", icon: "forum", count: 0 },
    { id: "chats", label: "Chats", icon: "chat", count: 0 },
    { id: "categories", label: "Categories", icon: "category", count: 0 },
    { id: "daily_activities", label: "Daily Activities", icon: "schedule", count: 0 },
  ];

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.mode = data["mode"] || "admin";
      this.loadData();
    });

    this.shortcutService.refresh$.subscribe(() => {
      this.loadData(true);
      this.notifyService.showSuccess("Data refreshed");
    });
  }

  loadData(force: boolean = false) {
    this.loading.set(true);
    const obs: Observable<any> =
      this.mode === "admin"
        ? this.adminStorageService.loadAdminData(force)
        : this.adminService.getAllDataForArchive();

    obs.subscribe({
      next: (response: any) => {
        const data = this.mode === "admin" ? response : response.data;
        this.dataMap.set(data);

        const users = data["users"] || [];
        this.userList.set(
          users
            .map((u: any) => ({ id: u.id, label: u.username || u.email }))
            .sort((a: any, b: any) => a.label.localeCompare(b.label))
        );

        const categories = data["categories"] || [];
        this.categoryList.set(
          categories
            .map((c: any) => ({ id: c.id, label: c.title }))
            .sort((a: any, b: any) => a.label.localeCompare(b.label))
        );

        const todos = data["todos"] || [];
        this.todoList.set(
          todos
            .filter((t: any) => !t.deleted_at)
            .map((t: any) => ({ id: t.id, label: t.title || t.id }))
            .sort((a: any, b: any) => a.label.localeCompare(b.label))
        );

        const tasks = data["tasks"] || [];
        this.taskList.set(
          tasks
            .filter((t: any) => !t.deleted_at)
            .map((t: any) => ({
              id: t.id,
              label: t.title || t.id,
            }))
            .sort((a: any, b: any) => (a.label || "").localeCompare(b.label || ""))
        );

        const subtasks = data["subtasks"] || [];
        this.subtaskList.set(
          subtasks
            .filter((s: any) => !s.deleted_at)
            .map((s: any) => ({
              id: s.id,
              label: s.description || s.id,
            }))
            .sort((a: any, b: any) => (a.label || "").localeCompare(b.label || ""))
        );

        // Calculate counts based on ALL data
        this.dataTypes.forEach((type) => {
          const tableData = data[type.id] || [];
          type.count = tableData.length;
        });

        this.loading.set(false);
      },
      error: (error: any) => {
        this.notifyService.showError(`Failed to load ${this.mode} data: ${error}`);
        this.loading.set(false);
      },
    });
  }

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

  getCurrentData(): any[] {
    let data = this.dataMap()[this.selectedType()] || [];

    if (this.selectedType() === "tasks" || this.selectedType() === "subtasks") {
      data = FilterHelper.filterAdminByStatus(data, this.isCompletedFilter());
    }

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
      visibilityFilter: this.visibilityFilter(),
      deletedFilter: this.deletedFilter(),
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
    };

    const filterConfigs = FilterHelper.buildAdminFilterConfigs(filterState, this.selectedType());
    data = FilterHelper.applyFilters(data, filterConfigs);
    data = FilterHelper.applyAdminCustomFilters(data, filterState, this.selectedType());

    return SortHelper.sortByField(data, {
      field: this.sortBy(),
      order: this.sortOrder(),
    });
  }

  getSelectedTypeLabel(): string {
    const type = this.dataTypes.find((t) => t.id === this.selectedType());
    return type ? type.label : this.selectedType();
  }

  selectDataType(typeId: string) {
    this.selectedType.set(typeId);
    this.clearSelection();
    this.clearFilters();
    this.showFilters.set(false);
  }

  closeFilters() {
    this.showFilters.set(false);
  }

  toggleSelect(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    this.selectedRecords.update((records) => {
      const newRecords = new Set(records);
      if (selected) newRecords.add(id);
      else newRecords.delete(id);
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
    const cleared = FilterHelper.getDefaultAdminFilterState();
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
    this.subtaskIdFilter.set("");
    this.visibilityFilter.set(cleared.visibilityFilter);
    this.deletedFilter.set("all");
    this.sortBy.set(cleared.sortBy);
    this.sortOrder.set(cleared.sortOrder);
  }

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

  isAllSelected(): boolean {
    const currentData = this.getCurrentData();
    return currentData.length > 0 && currentData.every((item) => this.isSelected(item.id));
  }

  async deleteRecord(record: any) {
    const table = this.selectedType();
    try {
      const response =
        this.mode === "admin"
          ? await this.adminService.permanentlyDeleteRecord(table, record.id)
          : await this.adminService.permanentlyDeleteRecordLocal(table, record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record permanently deleted");
        this.adminStorageService.removeRecordWithCascade(table, record.id);

        this.dataMap.update((data) => {
          const updated = { ...data };
          if (updated[table]) {
            updated[table] = updated[table].filter((r: any) => r.id !== record.id);
          }
          return updated;
        });
      }
    } catch (error) {
      this.notifyService.showError("Error: " + error);
    }
  }

  async toggleDeleteStatus(record: any) {
    try {
      const response =
        this.mode === "admin"
          ? await this.adminService.toggleDeleteStatus(this.selectedType(), record.id)
          : await this.adminService.toggleDeleteStatusLocal(this.selectedType(), record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record status updated");
        this.loadData(true); // Force reload to bypass cache
      }
    } catch (error) {
      this.notifyService.showError("Error: " + error);
    }
  }

  async onBulkSoftDelete(): Promise<void> {
    const table = this.selectedType();
    const selected = Array.from(this.selectedRecords());
    const promises = selected.map((id) =>
      this.mode === "admin"
        ? this.adminService.toggleDeleteStatus(table, id)
        : this.adminService.toggleDeleteStatusLocal(table, id)
    );
    await Promise.all(promises);
    this.notifyService.showSuccess("Bulk update successful");
    this.clearSelection();
    this.loadData(true);
  }

  async onBulkHardDelete(): Promise<void> {
    const table = this.selectedType();
    const selected = Array.from(this.selectedRecords());
    const promises = selected.map((id) =>
      this.mode === "admin"
        ? this.adminService.permanentlyDeleteRecord(table, id)
        : this.adminService.permanentlyDeleteRecordLocal(table, id)
    );
    await Promise.all(promises);
    this.notifyService.showSuccess("Bulk delete successful");
    this.clearSelection();
    this.loadData(true);
  }

  onBulkCancel(): void {
    this.clearSelection();
  }
}
