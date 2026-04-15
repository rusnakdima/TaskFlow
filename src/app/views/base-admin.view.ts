/* sys lib */
import { Directive, signal, inject } from "@angular/core";

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

export interface AdminDataMap {
  [key: string]: any[];
}

@Directive()
export abstract class BaseAdminView {
  protected bulkActionService = new BulkActionHelper();

  protected adminStorageService = inject(AdminStorageService);
  protected notifyService = inject(NotifyService);
  protected adminService = inject(AdminService);
  protected shortcutService = inject(ShortcutService);

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
    { key: "updated_at", label: "Last Updated", type: "date" },
  ];

  taskFields: AdminFieldConfig[] = [
    { key: "description", label: "Description", type: "text" },
    { key: "priority", label: "Priority", type: "priority" },
    { key: "status", label: "Status", type: "text" },
    { key: "startDate", label: "Start Date", type: "date" },
    { key: "endDate", label: "End Date", type: "date" },
    { key: "todoId", label: "Todo ID", type: "text" },
    { key: "subtasks", label: "Subtasks", type: "array-count" },
    { key: "updated_at", label: "Last Updated", type: "date" },
  ];

  subtaskFields: AdminFieldConfig[] = [
    { key: "description", label: "Description", type: "text" },
    { key: "priority", label: "Priority", type: "priority" },
    { key: "status", label: "Status", type: "text" },
    { key: "taskId", label: "Task ID", type: "text" },
    { key: "updated_at", label: "Last Updated", type: "date" },
  ];

  categoryFields: AdminFieldConfig[] = [
    { key: "user", label: "Owner", type: "user" },
    { key: "updated_at", label: "Last Updated", type: "date" },
  ];

  dailyActivityFields: AdminFieldConfig[] = [
    { key: "userId", label: "User ID", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "updated_at", label: "Last Updated", type: "date" },
  ];

  commentFields: AdminFieldConfig[] = [
    { key: "content", label: "Comment", type: "text" },
    { key: "authorName", label: "Author", type: "text" },
    { key: "taskId", label: "Task ID", type: "text" },
    { key: "subtaskId", label: "Subtask ID", type: "text" },
    { key: "updated_at", label: "Last Updated", type: "date" },
  ];

  chatFields: AdminFieldConfig[] = [
    { key: "content", label: "Message", type: "text" },
    { key: "authorName", label: "Author", type: "text" },
    { key: "todoId", label: "Todo ID", type: "text" },
    { key: "created_at", label: "Created", type: "date" },
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
  sortBy = signal<string>("created_at");
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

  abstract getCurrentData(): any[];

  selectDataType(typeId: string) {
    this.selectedType.set(typeId);
    this.clearSelection();
    this.clearFilters();
    this.showFilters.set(false);
  }

  protected buildFilteredData(rawData: any[]): any[] {
    let data = rawData;

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
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
    };

    const filterConfigs = FilterHelper.buildAdminFilterConfigs(filterState, this.selectedType());
    data = FilterHelper.applyFilters(data, filterConfigs);
    data = FilterHelper.applyAdminCustomFilters(data, filterState, this.selectedType());

    data = SortHelper.sortByField(data, {
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
}
