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
import { NotifyService } from "@services/notifications/notify.service";
import { AdminService } from "@services/data/admin.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { AdminStorageService } from "@services/core/admin-storage.service";
import { StorageService } from "@services/core/storage.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* components */
import { AdminDataTableComponent } from "@components/admin-records/admin-data-table.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* models */
import { AdminFieldConfig, AdminFilterState } from "@models/admin-table.model";
import { ResponseStatus } from "@models/response.model";
import { from } from "rxjs";

interface ArchiveData {
  [key: string]: any[];
}

@Component({
  selector: "app-archive-view",
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
  templateUrl: "./archive.view.html",
})
export class ArchiveView implements OnInit {
  private filterService: FilterHelper;
  private sortService: SortHelper;
  private bulkActionService: BulkActionHelper;

  constructor(
    private notifyService: NotifyService,
    private adminService: AdminService,
    private dataSyncService: DataSyncService,
    private adminStorageService: AdminStorageService,
    private storageService: StorageService,
    private shortcutService: ShortcutService
  ) {
    this.filterService = new FilterHelper();
    this.sortService = new SortHelper();
    this.bulkActionService = new BulkActionHelper();
  }

  archiveData = signal<ArchiveData>({});
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
    this.loadArchiveData();

    // Subscribe to refresh shortcut (Ctrl+R)
    this.shortcutService.refresh$.subscribe(() => {
      this.loadArchiveData();
      this.notifyService.showSuccess("Data refreshed");
    });
  }

  loadArchiveData() {
    this.loading.set(true);
    // Always force reload from backend when explicitly called by user
    this.adminService.getAllDataForArchive().subscribe({
      next: (response) => {
        const data = response.data as unknown as ArchiveData;
        this.archiveData.set(data);

        this.dataTypes.forEach((type) => {
          const tableData = data[type.id];
          type.count = tableData ? tableData.length : 0;
        });

        // Sync to main storage - set all data (including deleted for archive view)
        // But main storage should filter out deleted records
        this.syncArchiveToStorage(data);

        this.loading.set(false);
      },
      error: (error) => {
        this.notifyService.showError("Failed to load archive data: " + error);
        this.loading.set(false);
      },
    });
  }

  /**
   * Sync archive data to main storage
   * Filters out deleted records for main storage
   */
  syncArchiveToStorage(data: ArchiveData) {
    // Set private todos (filtering out deleted)
    const privateTodos = (data["todos"] || []).filter((t: any) => !t.isDeleted);
    this.storageService.setCollection("privateTodos", privateTodos);

    // For now, clear shared todos (can be updated based on your logic)
    this.storageService.setCollection("sharedTodos", []);

    // Categories
    this.storageService.setCollection("categories", data["categories"] || []);
  }

  selectDataType(typeId: string) {
    this.selectedType.set(typeId);
    this.clearSelection();
    this.clearFilters();
    this.showFilters.set(false);
  }

  getCurrentData(): any[] {
    let data = this.archiveData()[this.selectedType()] || [];

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

  getSelectedTypeLabel(): string {
    const type = this.dataTypes.find((t) => t.id === this.selectedType());
    return type ? type.label : this.selectedType();
  }

  closeFilters() {
    this.showFilters.set(false);
  }

  async deleteRecord(record: any) {
    const typeSingular = this.selectedType().slice(0, -1);
    const table = this.selectedType();

    const confirmMessage = `WARNING: This will permanently delete this ${typeSingular} and ALL related data (tasks, subtasks, comments, chats). This action cannot be undone. Are you sure?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await this.adminService.permanentlyDeleteRecordLocal(table, record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record permanently deleted from local database");
        this.adminStorageService.removeRecordWithCascade(table, record.id);
        this.storageService.removeRecordWithCascade(table, record.id);
        this.loadArchiveData();
      } else {
        this.notifyService.showError(response.message || "Failed to delete record");
      }
    } catch (error) {
      this.notifyService.showError("Error deleting record: " + error);
    }
  }

  async toggleDeleteStatus(record: any) {
    try {
      const response = await this.adminService.toggleDeleteStatusLocal(this.selectedType(), record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record status updated");
        const isDeleted = response.data === true;
        if (this.selectedType() === "todos") {
          if (isDeleted) {
            this.storageService.removeTodoWithCascade(record.id);
          } else {
            this.adminService.getAllDataForArchive().subscribe({
              next: (archiveResponse) => {
                const data = archiveResponse.data as any;
                const restoredTodo = data["todos"]?.find((t: any) => t.id === record.id);
                if (restoredTodo) {
                  const taskIds = restoredTodo.tasks?.map((t: any) => t.id) || [];
                  const subtaskIds =
                    restoredTodo.tasks?.flatMap(
                      (t: any) => t.subtasks?.map((s: any) => s.id) || []
                    ) || [];

                  const relatedTasks =
                    data["tasks"]?.filter((t: any) => taskIds.includes(t.id)) || [];
                  const relatedSubtasks =
                    data["subtasks"]?.filter((s: any) => subtaskIds.includes(s.id)) || [];
                  const relatedComments =
                    data["comments"]?.filter(
                      (c: any) =>
                        c.taskId === record.id ||
                        taskIds.includes(c.taskId) ||
                        subtaskIds.includes(c.subtaskId)
                    ) || [];
                  const relatedChats =
                    data["chats"]?.filter((c: any) => c.todoId === record.id) || [];

                  this.adminStorageService.restoreTodoWithCascade({
                    todo: restoredTodo,
                    tasks: relatedTasks,
                    subtasks: relatedSubtasks,
                    comments: relatedComments,
                    chats: relatedChats,
                  });

                  this.storageService.restoreTodoWithCascade({
                    todo: restoredTodo,
                    tasks: relatedTasks,
                    subtasks: relatedSubtasks,
                    comments: relatedComments,
                  });
                }
              },
            });
          }
        } else {
          this.storageService.updateItem(this.selectedType() as any, record.id, { isDeleted });
        }
        this.loadArchiveData();
      } else {
        this.notifyService.showError(response.message || "Failed to update record status");
      }
    } catch (error: any) {
      const errorMsg =
        error?.message || (typeof error === "object" ? JSON.stringify(error) : String(error));
      this.notifyService.showError("Error updating record status: " + errorMsg);
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

  async toggleArchiveStatus(): Promise<void> {
    const count = this.selectedRecords().size;
    if (count === 0) return;

    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";

    if (
      !confirm(
        `Are you sure you want to toggle archive status for ${count} ${typeSingular} ${plural}?`
      )
    ) {
      return;
    }

    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.isSelected(item.id));

    this.bulkActionService
      .bulkUpdateField(selectedItems, "isDeleted", false, (id: string, data: any) =>
        from(this.adminService.toggleDeleteStatus(this.selectedType(), id))
      )
      .subscribe((result) => {
        this.clearSelection();
        if (result.successCount > 0) {
          this.notifyService.showSuccess(
            `${result.successCount} ${result.successCount === 1 ? "record" : "records"} status toggled`
          );
          // Reload all data after toggling
          this.loadArchiveData();
        }

        if (result.errorCount > 0) {
          this.notifyService.showError(
            `Failed to toggle ${result.errorCount} ${result.errorCount === 1 ? "record" : "records"}`
          );
        }
      });
  }

  async deleteSelected(): Promise<void> {
    const count = this.selectedRecords().size;
    if (count === 0) return;

    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";
    const table = this.selectedType();

    const confirmMessage = `WARNING: This will permanently delete ${count} ${typeSingular} ${plural} and ALL related data (tasks, subtasks, comments, chats). This action cannot be undone. Are you sure?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.isSelected(item.id));

    // Delete all records (always uses cascade) - local JSON only
    const deleteObservable = this.bulkActionService.bulkDelete(selectedItems, (id: string) =>
      from(this.adminService.permanentlyDeleteRecordLocal(table, id))
    );

    deleteObservable.subscribe((result) => {
      if (result.successCount > 0) {
        // Update archive data directly by removing deleted items
        this.archiveData.update((data) => {
          const updated = { ...data };
          selectedItems.forEach((item) => {
            if (updated[table]) {
              updated[table] = updated[table].filter((record: any) => record.id !== item.id);
            }

            // Also remove related data for cascade deletes
            if (table === "todos") {
              // Remove tasks for this todo
              if (updated["tasks"]) {
                const todoTasks = updated["tasks"].filter((t: any) => t.todoId === item.id);
                const todoTaskIds = todoTasks.map((t: any) => t.id);
                updated["tasks"] = updated["tasks"].filter((t: any) => t.todoId !== item.id);

                // Remove subtasks for these tasks
                if (updated["subtasks"]) {
                  updated["subtasks"] = updated["subtasks"].filter(
                    (s: any) => !todoTaskIds.includes(s.taskId)
                  );
                }
              }
              // Remove comments for this todo
              if (updated["comments"]) {
                updated["comments"] = updated["comments"].filter((c: any) => c.todoId !== item.id);
              }
              // Remove chats for this todo
              if (updated["chats"]) {
                updated["chats"] = updated["chats"].filter((c: any) => c.todoId !== item.id);
              }
            } else if (table === "tasks") {
              // Remove subtasks for this task
              if (updated["subtasks"]) {
                updated["subtasks"] = updated["subtasks"].filter((s: any) => s.taskId !== item.id);
              }
              // Remove comments for this task
              if (updated["comments"]) {
                updated["comments"] = updated["comments"].filter((c: any) => c.taskId !== item.id);
              }
            } else if (table === "subtasks") {
              // Remove comments for this subtask
              if (updated["comments"]) {
                updated["comments"] = updated["comments"].filter(
                  (c: any) => c.subtaskId !== item.id
                );
              }
            }
          });
          return updated;
        });

        // Also update admin storage
        selectedItems.forEach((item) => {
          this.adminStorageService.removeRecordWithCascade(table, item.id);
          this.storageService.removeRecordWithCascade(table, item.id);
        });

        this.clearSelection();
        this.notifyService.showSuccess(
          `${result.successCount} ${result.successCount === 1 ? "record" : "records"} permanently deleted`
        );
        // Update data type counts
        this.dataTypes.forEach((type) => {
          const tableData = this.archiveData()[type.id];
          type.count = tableData ? tableData.length : 0;
        });
      }

      if (result.errorCount > 0) {
        this.notifyService.showError(
          `Failed to delete ${result.errorCount} ${result.errorCount === 1 ? "record" : "records"}`
        );
      }
    });
  }
}
