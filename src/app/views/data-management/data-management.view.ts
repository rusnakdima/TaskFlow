import {
  Component,
  OnInit,
  signal,
  inject,
  ViewChild,
  TemplateRef,
  DestroyRef,
  WritableSignal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

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
import { EntityStoreService } from "@services/core/entity-store.service";
import { AdminStorageService } from "@services/core/admin-storage.service";
import { ArchiveStorageService } from "@services/core/archive-storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { AdminService } from "@services/data/admin.service";
import { AdminCascadeService } from "@services/admin/admin-cascade.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { ApiService } from "@services/api.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { TodoPermission } from "@services/core/permission.service";
import { VisibilitySyncService } from "@services/core/visibility-sync.service";

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* models */
import { AdminFilterState } from "@models/admin-table.model";
import { ResponseStatus } from "@models/response.model";

/* constants */
import { ActionColors } from "@shared/utils/constants";
import { FILTER_CONFIGS } from "@shared/utils/constants";

/* components */
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { TABLE_ACTIONS } from "@shared/utils/constants";
import { TableFieldFactory } from "@helpers/table-field.factory";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { FilterSidebarComponent } from "@components/filter-sidebar/filter-sidebar.component";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";

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
    TableViewComponent,
    BulkActionsComponent,
    FilterSidebarComponent,
    SegmentSelectorComponent,
    PageToolbarComponent,
    ItemExpandDetailsComponent,
  ],
  templateUrl: "./data-management.view.html",
})
export class DataManagementView implements OnInit {
  @ViewChild("expandRowTemplate") expandRowTemplate!: TemplateRef<any>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  protected entityStore = inject(EntityStoreService);
  protected adminStorageService = inject(AdminStorageService);
  protected archiveStorageService = inject(ArchiveStorageService);
  protected notifyService = inject(NotifyService);
  protected adminService = inject(AdminService);
  protected adminCascadeService = inject(AdminCascadeService);
  protected shortcutService = inject(ShortcutService);
  protected bulkActionService = inject(BulkActionHelper);
  protected requestService = inject(ApiService);
  private confirmDialogService = inject(ConfirmDialogService);
  private visibilitySyncService = inject(VisibilitySyncService);

  paginationState = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  mode: "admin" | "archive" = "admin";
  dataMap = signal<any>({});
  userPermission = signal<TodoPermission>(TodoPermission.OWNER);

  selectedType = signal<string>("todos");
  loading = signal<boolean>(false);
  selectedRecords = signal<Set<string>>(new Set());
  showFilters = signal<boolean>(false);
  expandedRecords = signal<Set<string>>(new Set());

  adminTableFields = TableFieldFactory.createAdminFields();

  dataSourceOptions = signal<SegmentOption[]>([
    { id: "all", label: "All Sources", icon: "apps" },
    { id: "local", label: "Local JSON DB", icon: "folder" },
    { id: "cloud", label: "Cloud MongoDB", icon: "cloud" },
  ]);

  activeDataSource = signal<"all" | "local" | "cloud">("all");

  private localTodoIds = signal<Set<string>>(new Set());
  private cloudTodoIds = signal<Set<string>>(new Set());

  getAdminActions(): TableFieldActionButton[] {
    return [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.TOGGLE_DELETE, TABLE_ACTIONS.DELETE_FOREVER];
  }

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
  deletedFilter = signal<string>("all");
  sortBy = signal<string>("createdAt");
  sortOrder = signal<"asc" | "desc">("desc");

  userList = signal<{ id: string; label: string }[]>([]);
  categoryList = signal<{ id: string; label: string }[]>([]);
  todoList = signal<{ id: string; label: string }[]>([]);
  taskList = signal<{ id: string; label: string }[]>([]);
  subtaskList = signal<{ id: string; label: string }[]>([]);

  dataTypes: SegmentOption[] = [
    { id: "todos", label: "Todos", icon: "list_alt" },
    { id: "tasks", label: "Tasks", icon: "checklist" },
    { id: "subtasks", label: "Subtasks", icon: "assignment" },
    { id: "comments", label: "Comments", icon: "forum" },
    { id: "categories", label: "Categories", icon: "category" },
    { id: "daily_activities", label: "Daily Activities", icon: "schedule" },
  ];

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.mode = data["mode"] || "admin";
      this.loadData();
    });

    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
      this.loadData(true);
      this.notifyService.showSuccess("Data refreshed");
    });
    this.destroyRef.onDestroy(() => refreshSub.unsubscribe());
  }

  loadData(force: boolean = false) {
    this.loading.set(true);

    if (this.mode === "admin") {
      this.loadAdminData(force);
    } else {
      this.loadArchiveData(force);
    }
  }

  private loadAdminData(force: boolean = false) {
    const type = this.selectedType();
    const limit = 10;

    if (!force && this.adminStorageService.isTypeLoaded(type)) {
      const data = this.getAdminData();
      this.paginationState.set({
        skip: 0,
        limit,
        total: data.length,
        hasMore: data.length >= limit,
        loading: false,
      });
      this.loading.set(false);
      this.populateFilterLists();
      return;
    }

    const sub = this.adminStorageService.loadInitialData(type, limit).subscribe({
      next: (response: any) => {
        const data = response?.data || [];
        if (type === "todos") this.adminStorageService.todosSignal.set(data);
        else if (type === "tasks") this.adminStorageService.tasksSignal.set(data);
        else if (type === "subtasks") this.adminStorageService.subtasksSignal.set(data);
        else if (type === "comments") this.adminStorageService.commentsSignal.set(data);
        else if (type === "categories") this.adminStorageService.categoriesSignal.set(data);
        else if (type === "daily_activities")
          this.adminStorageService.dailyActivitiesSignal.set(data);

        this.adminStorageService.setTypeLoaded(type, true);
        this.paginationState.set({
          skip: data.length,
          limit,
          total: data.length,
          hasMore: data.length >= limit,
          loading: false,
        });
        this.populateFilterLists();
        this.loading.set(false);
      },
      error: (error) => {
        this.notifyService.showError(`Failed to load admin data: ${error}`);
        this.loading.set(false);
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private loadArchiveData(force: boolean = false) {
    const type = this.selectedType();
    const limit = 10;

    if (!force && this.archiveStorageService.isTypeLoaded(type)) {
      const data = this.getArchiveData();
      this.paginationState.set({
        skip: 0,
        limit,
        total: data.length,
        hasMore: data.length >= limit,
        loading: false,
      });
      this.loading.set(false);
      this.populateFilterLists();
      return;
    }

    const sub = this.archiveStorageService.loadInitialData(type, limit).subscribe({
      next: (response: any) => {
        const data = response?.data || [];
        if (type === "todos") this.archiveStorageService.todosSignal.set(data);
        else if (type === "tasks") this.archiveStorageService.tasksSignal.set(data);
        else if (type === "subtasks") this.archiveStorageService.subtasksSignal.set(data);
        else if (type === "comments") this.archiveStorageService.commentsSignal.set(data);
        else if (type === "categories") this.archiveStorageService.categoriesSignal.set(data);
        else if (type === "daily_activities")
          this.archiveStorageService.dailyActivitiesSignal.set(data);

        this.archiveStorageService.setTypeLoaded(type, true);
        this.paginationState.set({
          skip: data.length,
          limit,
          total: data.length,
          hasMore: data.length >= limit,
          loading: false,
        });
        this.populateFilterLists();
        this.loading.set(false);
      },
      error: (error) => {
        this.notifyService.showError(`Failed to load archive data: ${error}`);
        this.loading.set(false);
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  loadMore() {
    if (this.paginationState().loading || !this.paginationState().hasMore) {
      return;
    }

    this.paginationState.update((s) => ({ ...s, loading: true }));

    const type = this.selectedType();
    const skip = this.paginationState().skip;
    const limit = this.paginationState().limit;

    if (this.mode === "admin") {
      const sub = this.adminStorageService.loadMoreData(type, skip, limit).subscribe({
        next: (response: any) => {
          const newData = response?.data || [];
          this.appendDataToSignal(type, this.adminStorageService, newData);
          const currentTotal = this.paginationState().total + newData.length;
          this.paginationState.set({
            skip: skip + newData.length,
            limit,
            total: currentTotal,
            hasMore: newData.length >= limit,
            loading: false,
          });
        },
        error: (error) => {
          this.notifyService.showError(`Failed to load more: ${error}`);
          this.paginationState.update((s) => ({ ...s, loading: false }));
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    } else {
      const sub = this.archiveStorageService.loadMoreData(type, skip, limit).subscribe({
        next: (response: any) => {
          const newData = response?.data || [];
          this.appendDataToSignal(type, this.archiveStorageService, newData);
          const currentTotal = this.paginationState().total + newData.length;
          this.paginationState.set({
            skip: skip + newData.length,
            limit,
            total: currentTotal,
            hasMore: newData.length >= limit,
            loading: false,
          });
        },
        error: (error) => {
          this.notifyService.showError(`Failed to load more: ${error}`);
          this.paginationState.update((s) => ({ ...s, loading: false }));
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }

  private appendDataToSignal(type: string, storage: any, newData: any[]): void {
    switch (type) {
      case "todos":
        storage.todosSignal.update((items: any[]) => [...items, ...newData]);
        break;
      case "tasks":
        storage.tasksSignal.update((items: any[]) => [...items, ...newData]);
        break;
      case "subtasks":
        storage.subtasksSignal.update((items: any[]) => [...items, ...newData]);
        break;
      case "comments":
        storage.commentsSignal.update((items: any[]) => [...items, ...newData]);
        break;
      case "categories":
        storage.categoriesSignal.update((items: any[]) => [...items, ...newData]);
        break;
      case "daily_activities":
        storage.dailyActivitiesSignal.update((items: any[]) => [...items, ...newData]);
        break;
    }
  }

  getFieldConfig(): TableField[] {
    if (this.mode === "archive") {
      return TableFieldFactory.getArchiveColumns(this.selectedType());
    }
    return TableFieldFactory.getColumns(this.selectedType());
  }

  getTitleField(): string {
    if (this.selectedType() === "daily_activities") return "date";
    if (this.selectedType() === "comments" || this.selectedType() === "chats") return "content";
    return "title";
  }

  onAdminAction(event: { action: string; item: any }): void {
    if (event.action === "edit") {
      this.onEditRecord(event.item);
    } else if (event.action === "toggleDelete") {
      this.toggleDeleteStatus(event.item);
    } else if (
      event.action === "delete" ||
      event.action === "delete_forever" ||
      event.action === "deleteRecord"
    ) {
      this.deleteRecord(event.item);
    }
  }

  onEditRecord(item: any): void {
    const type = this.selectedType();
    const visibility = this.mode === "admin" ? "public" : "private";

    switch (type) {
      case "todos":
        this.router.navigate(["/todos", item.id, "edit_todo"], {
          queryParams: { visibility },
        });
        break;
      case "tasks":
        const todoId = item.todo_id;
        if (todoId) {
          this.router.navigate(["/todos", todoId, "tasks", item.id, "edit_task"], {
            queryParams: { visibility },
          });
        } else {
          this.notifyService.showError("Cannot edit task: missing todo reference");
        }
        break;
      case "subtasks":
        const taskId = item.task_id;
        const taskTodoId = item.todo_id;
        if (taskId && taskTodoId) {
          this.router.navigate(
            ["/todos", taskTodoId, "tasks", taskId, "subtasks", item.id, "edit_subtask"],
            { queryParams: { visibility } }
          );
        } else {
          this.notifyService.showInfo("Cannot edit subtask: missing parent references");
        }
        break;
      default:
        this.notifyService.showInfo(`Inline edit for ${type} is not yet implemented`);
        break;
    }
  }

  onRecordSelect(event: { id: string; selected: boolean }): void {
    this.toggleSelect(event);
  }

  getFilteredData(): any[] {
    let data: any[];

    if (this.mode === "admin") {
      data = this.getAdminData();
    } else {
      data = this.getArchiveData();
    }

    if (!data || data.length === 0) return [];

    const source = this.activeDataSource();
    if (source !== "all" && this.mode === "admin") {
      if (source === "local") {
        data = this.filterByDataSource(data, "local");
      } else if (source === "cloud") {
        data = this.filterByDataSource(data, "cloud");
      }
    }

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

  private filterByDataSource(data: any[], source: "local" | "cloud"): any[] {
    if (this.selectedType() === "todos") {
      if (source === "local") {
        return data.filter((item) => this.localTodoIds().has(item.id));
      } else {
        return data.filter((item) => this.cloudTodoIds().has(item.id));
      }
    }
    return data;
  }

  getCurrentData(): any[] {
    return this.getFilteredData();
  }

  private getData(source: "admin" | "archive"): any[] {
    const service = source === "admin" ? this.adminStorageService : this.archiveStorageService;
    switch (this.selectedType()) {
      case "todos":
        return service.todos();
      case "tasks":
        return service.tasks();
      case "subtasks":
        return service.subtasks();
      case "comments":
        return service.comments();
      case "categories":
        return service.categories();
      case "daily_activities":
        return service.dailyActivities();
      default:
        return [];
    }
  }

  private getAdminData(): any[] {
    return this.getData("admin");
  }

  private getArchiveData(): any[] {
    return this.getData("archive");
  }

  getSelectedTypeLabel(): string {
    const type = this.dataTypes.find((t) => t.id === this.selectedType());
    return type ? type.label : this.selectedType();
  }

  getSelectedTypeIcon(): string {
    const type = this.dataTypes.find((t) => t.id === this.selectedType());
    return type ? type.icon || "list_alt" : "list_alt";
  }

  getToolbarConfig(): PageToolbarConfig {
    const sortOptions: { key: string; label: string; icon?: string }[] = [
      { key: "createdAt", label: "Created Date", icon: "schedule" },
      { key: "updatedAt", label: "Updated Date", icon: "update" },
      { key: "title", label: "Title", icon: "sort_by_alpha" },
    ];

    if (
      this.selectedType() === "todos" ||
      this.selectedType() === "tasks" ||
      this.selectedType() === "subtasks"
    ) {
      sortOptions.push({ key: "priority", label: "Priority", icon: "flag" });
    }

    if (this.selectedType() === "todos" || this.selectedType() === "tasks") {
      sortOptions.push({ key: "startDate", label: "Start Date", icon: "play_arrow" });
      sortOptions.push({ key: "endDate", label: "End Date", icon: "stop" });
    }

    return {
      ...(this.mode !== "admin" &&
        this.mode !== "archive" && {
          selectAll: {
            onToggle: () => this.onBulkSelectAll(),
            isAllSelected: this.isAllSelected(),
            count: this.selectedRecords().size,
            highlight: this.selectedRecords().size > 0 && !this.isAllSelected(),
          },
        }),
      sortMenu: {
        sortBy: this.sortBy(),
        sortOrder: this.sortOrder(),
        sortOptions,
        onSort: (key) => {
          this.sortBy.set(key);
          this.sortOrder.set("desc");
        },
      },
      sortOrder: {
        onToggle: () => this.sortOrder.set(this.sortOrder() === "asc" ? "desc" : "asc"),
        currentOrder: this.sortOrder(),
      },
      refresh: {
        onClick: () => this.loadData(true),
        loading: this.loading(),
      },
      filter: {
        onToggle: () => this.showFilters.update((v) => !v),
        isActive: this.showFilters(),
      },
    };
  }

  selectDataType(typeId: string) {
    this.selectedType.set(typeId);
    this.clearSelection();
    this.clearFilters();
    this.showFilters.set(false);
    this.paginationState.set({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });
    this.loadData(true);
  }

  onDataSourceChange(source: "all" | "local" | "cloud") {
    this.activeDataSource.set(source);
    this.clearSelection();
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

  onCardClick(event: { event: MouseEvent; id: string }): void {
    this.toggleSelectById(event.id);
  }

  onItemAction(event: { action: string; item: any }): void {
    const { action, item } = event;
    switch (action) {
      case "edit":
        break;
      case "archive":
      case "restore":
        this.toggleDeleteStatus(item);
        break;
      case "delete":
        this.deleteRecord(item);
        break;
      default:
        break;
    }
  }

  getItemType(): any {
    const typeMap: { [key: string]: string } = {
      todos: "todo",
      tasks: "task",
      subtasks: "subtask",
      comments: "comment",
      categories: "category",
      daily_activities: "daily_activity",
    };
    return typeMap[this.selectedType()] || "todo";
  }

  toggleSelectById(id: string): void {
    const isSelected = this.selectedRecords().has(id);
    this.selectedRecords.update((records) => {
      const newRecords = new Set(records);
      if (isSelected) newRecords.delete(id);
      else newRecords.add(id);
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

  onBulkSelectAllRecords(selectAll: boolean): void {
    const currentData = this.getCurrentData();
    if (selectAll) {
      this.selectedRecords.update((records) => {
        const newRecords = new Set(records);
        currentData.forEach((item) => newRecords.add(item.id));
        return newRecords;
      });
    } else {
      this.selectedRecords.update((records) => {
        const newRecords = new Set(records);
        currentData.forEach((item) => newRecords.delete(item.id));
        return newRecords;
      });
    }
  }

  isAllSelected(): boolean {
    const currentData = this.getCurrentData();
    return currentData.length > 0 && currentData.every((item) => this.isSelected(item.id));
  }

  async deleteRecord(record: any) {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Permanently Delete",
      message:
        "WARNING: This action cannot be undone. This will permanently remove the selected record(s) from the database.",
      confirmText: "Delete Permanently",
    });
    if (!confirmed) return;

    const table = this.selectedType();
    const visibility = this.mode === "admin" ? "public" : "private";
    try {
      const response =
        this.mode === "admin"
          ? await this.adminService.permanentlyDeleteRecord(table, record.id, visibility)
          : await this.adminService.permanentlyDeleteRecordLocal(table, record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record permanently deleted");
        this.removeRecordFromStorage(table, record.id);
      } else {
        this.notifyService.showError(response.message || "Permanent delete failed");
      }
    } catch (error) {
      this.notifyService.showError(error instanceof Error ? error.message : String(error));
    }
  }

  async toggleDeleteStatus(record: any) {
    try {
      const table = this.selectedType();
      const visibility = this.mode === "admin" ? "public" : "private";
      const response =
        this.mode === "admin"
          ? await this.adminService.toggleDeleteStatus(table, record.id, visibility)
          : await this.adminService.toggleDeleteStatusLocal(table, record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record status updated");
        const isDeleted = response.data === true;
        this.updateRecordInStorage(table, record.id, {
          deleted_at: isDeleted ? new Date().toISOString() : null,
        });
      } else {
        this.notifyService.showError(response.message || "Operation failed");
      }
    } catch (error) {
      this.notifyService.showError(error instanceof Error ? error.message : String(error));
    }
  }

  async onBulkSoftDelete(): Promise<void> {
    const selectedIds = Array.from(this.selectedRecords());
    const allSelected = this.getCurrentData().filter((item) => selectedIds.includes(item.id));
    const allArchived = allSelected.every((item) => item.deleted_at);
    const visibility = this.mode === "admin" ? "public" : "private";
    const table = this.selectedType();

    if (allArchived) {
      await this.adminCascadeService.restoreBatch(table, selectedIds, visibility);
      selectedIds.forEach((id) => this.updateRecordInStorage(table, id, { deleted_at: null }));
    } else {
      await this.adminCascadeService.softDeleteBatch(table, selectedIds, visibility);
      selectedIds.forEach((id) =>
        this.updateRecordInStorage(table, id, { deleted_at: new Date().toISOString() })
      );
    }
    this.selectedRecords.set(new Set());
  }

  async onBulkHardDelete(): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Permanently Delete",
      message:
        "WARNING: This action cannot be undone. This will permanently remove the selected record(s) from the database.",
      confirmText: "Delete Permanently",
    });
    if (!confirmed) return;
    const visibility = this.mode === "admin" ? "public" : "private";
    const table = this.selectedType();
    const idsToDelete = Array.from(this.selectedRecords());

    await this.adminCascadeService.hardDeleteBatch(table, idsToDelete, visibility);
    idsToDelete.forEach((id) => this.removeRecordFromStorage(table, id));
    this.selectedRecords.set(new Set());
  }

  onBulkCancel(): void {
    this.clearSelection();
  }

  toggleExpand(recordId: string): void {
    this.expandedRecords.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(recordId)) {
        newExpanded.delete(recordId);
      } else {
        newExpanded.add(recordId);
      }
      return newExpanded;
    });
  }

  isExpanded(recordId: string): boolean {
    return this.expandedRecords().has(recordId);
  }

  formatFieldDate(dateStr: string): string {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr || "-";
    }
  }

  getValue(item: any, field: any): any {
    return item[field.key];
  }

  getPriorityBadgeClass(priority: string): string {
    switch (priority?.toLowerCase()) {
      case "urgent":
        return "bg-transparent text-purple-600 border border-purple-500 dark:text-purple-400 dark:border-purple-400/50";
      case "high":
        return "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50";
      case "medium":
        return "bg-transparent text-yellow-600 border border-yellow-500 dark:text-yellow-400 dark:border-yellow-400/50";
      case "low":
        return "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50";
      default:
        return "bg-transparent text-gray-600 border border-gray-400 dark:text-gray-400 dark:border-gray-400/50";
    }
  }

  getUserDisplayName(user: any): string {
    if (!user) return "-";
    if (user.profile?.name) {
      return `${user.profile.name} ${user.profile.last_name || ""}`.trim();
    }
    return user.username || "-";
  }

  getActionButtonClass(action: string): string {
    const colorKey = action as keyof typeof ActionColors;
    return ActionColors[colorKey] || ActionColors.default;
  }

  resolveUserName(userId: string): string {
    return this.entityStore.getUsername(userId);
  }

  resolveTodoTitle(todoId: string): string {
    const todo = this.entityStore.todoMap().get(todoId);
    return todo?.title || "-";
  }

  resolveTaskTitle(taskId: string): string {
    const task = this.entityStore.taskMap().get(taskId);
    return task?.title || "-";
  }

  resolveSubtaskTitle(subtaskId: string): string {
    const subtask = this.entityStore.subtaskMap().get(subtaskId);
    return subtask?.title || "-";
  }

  populateFilterLists(): void {
    this.userList.set(
      this.entityStore.users().map((u) => ({
        id: u.id,
        label: this.entityStore.getUsername(u.id),
      }))
    );

    const todos = this.entityStore.todos();
    this.todoList.set(
      todos.map((t) => ({
        id: t.id,
        label: t.title || t.id,
      }))
    );

    const tasks = this.entityStore.tasks();
    this.taskList.set(
      tasks.map((t) => ({
        id: t.id,
        label: t.title || t.id,
      }))
    );

    const subtasks = this.entityStore.subtasks();
    this.subtaskList.set(
      subtasks.map((s) => ({
        id: s.id,
        label: s.title || s.id,
      }))
    );

    const categories = this.entityStore.categories();
    this.categoryList.set(
      categories.map((c) => ({
        id: c.id,
        label: c.title || c.id,
      }))
    );
  }

  getFiltersForCurrentType(): any[] {
    const selectedType = this.selectedType();
    return FILTER_CONFIGS.filter(
      (f) => !f.dataType || f.dataType.length === 0 || f.dataType.includes(selectedType)
    );
  }

  getFilterSignal(key: string): WritableSignal<string> {
    switch (key) {
      case "deletedFilter":
        return this.deletedFilter;
      case "titleFilter":
        return this.titleFilter;
      case "descriptionFilter":
        return this.descriptionFilter;
      case "priorityFilter":
        return this.priorityFilter;
      case "statusFilter":
        return this.statusFilter;
      case "isCompletedFilter":
        return this.isCompletedFilter;
      case "userFilter":
        return this.userFilter;
      case "categoriesFilter":
        return this.categoriesFilter;
      case "todoIdFilter":
        return this.todoIdFilter;
      case "taskIdFilter":
        return this.taskIdFilter;
      case "subtaskIdFilter":
        return this.subtaskIdFilter;
      case "visibilityFilter":
        return this.visibilityFilter;
      case "startDateFilter":
        return this.startDateFilter;
      case "endDateFilter":
        return this.endDateFilter;
      default:
        return signal("");
    }
  }

  getFilterOptions(filterKey: string): any[] {
    switch (filterKey) {
      case "userFilter": {
        const opts = this.userList();
        return [
          { value: "", label: "All Users" },
          ...opts.map((o) => ({ value: o.id, label: o.label })),
        ];
      }
      case "categoriesFilter": {
        const opts = this.categoryList();
        return [
          { value: "", label: "All Categories" },
          ...opts.map((o) => ({ value: o.id, label: o.label })),
        ];
      }
      case "todoIdFilter": {
        const opts = this.todoList();
        return [
          { value: "", label: "All Projects" },
          ...opts.map((o) => ({ value: o.id, label: o.label })),
        ];
      }
      case "taskIdFilter": {
        const opts = this.taskList();
        return [
          { value: "", label: "All Tasks" },
          ...opts.map((o) => ({ value: o.id, label: o.label })),
        ];
      }
      case "subtaskIdFilter": {
        const opts = this.subtaskList();
        return [
          { value: "", label: "All Subtasks" },
          ...opts.map((o) => ({ value: o.id, label: o.label })),
        ];
      }
      default:
        return [];
    }
  }

  getFilterValuesObject(): Record<string, string> {
    return {
      deletedFilter: this.deletedFilter(),
      titleFilter: this.titleFilter(),
      descriptionFilter: this.descriptionFilter(),
      priorityFilter: this.priorityFilter(),
      statusFilter: this.statusFilter(),
      isCompletedFilter: this.isCompletedFilter(),
      userFilter: this.userFilter(),
      categoriesFilter: this.categoriesFilter(),
      todoIdFilter: this.todoIdFilter(),
      taskIdFilter: this.taskIdFilter(),
      subtaskIdFilter: this.subtaskIdFilter(),
      visibilityFilter: this.visibilityFilter(),
      startDateFilter: this.startDateFilter(),
      endDateFilter: this.endDateFilter(),
    };
  }

  getDynamicOptionsFn = (key: string): any[] => {
    return this.getFilterOptions(key);
  };

  onDynamicFilterChange(event: { key: string; value: string }): void {
    const signal = this.getFilterSignal(event.key);
    signal.set(event.value);
    this.showFilters.set(true);
  }

  getOriginalData(): any[] {
    if (this.mode === "admin") {
      return this.getAdminData();
    } else {
      return this.getArchiveData();
    }
  }

  private removeRecordFromStorage(table: string, id: string): void {
    const storage = this.mode === "admin" ? this.adminStorageService : this.archiveStorageService;
    storage.removeRecord(table, id);
  }

  private updateRecordInStorage(table: string, id: string, updates: Partial<any>): void {
    const storage = this.mode === "admin" ? this.adminStorageService : this.archiveStorageService;
    storage.updateRecord(table, id, updates);
  }

  async cleanupNonPrivateFromJson(): Promise<void> {
    try {
      await this.visibilitySyncService.cleanupNonPrivateFromJson();
      this.notifyService.showSuccess("Cleanup completed - non-private todos removed from JSON");
      this.loadData(true);
    } catch (error) {
      this.notifyService.showError(`Cleanup failed: ${error}`);
    }
  }
}
