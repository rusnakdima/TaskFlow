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
import { ActivatedRoute } from "@angular/router";

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
import { StorageService } from "@services/storage.service";
import { AdminStorageService } from "@services/core/admin-storage.service";
import { ArchiveStorageService } from "@services/core/archive-storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { AdminService } from "@services/data/admin.service";
import { AdminCascadeService } from "@services/admin/admin-cascade.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { ApiService } from "@services/api.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* models */
import { AdminFilterState } from "@models/admin-table.model";
import { ResponseStatus } from "@models/response.model";

/* constants */
import { ActionColors } from "@constants/table-field.constants";
import { FILTER_CONFIGS } from "@constants/filter.constants";

/* components */
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { TABLE_ACTIONS } from "@constants/table-field.constants";
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
  private destroyRef = inject(DestroyRef);

  protected adminStorageService = inject(AdminStorageService);
  protected archiveStorageService = inject(ArchiveStorageService);
  protected storageService = inject(StorageService);
  protected notifyService = inject(NotifyService);
  protected adminService = inject(AdminService);
  protected adminCascadeService = inject(AdminCascadeService);
  protected shortcutService = inject(ShortcutService);
  protected bulkActionService = inject(BulkActionHelper);
  protected requestService = inject(ApiService);
  private confirmDialogService = inject(ConfirmDialogService);

  private archiveLoadedSignal = signal<{ [type: string]: boolean }>({});

  paginationState = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  mode: "admin" | "archive" = "admin";
  dataMap = signal<any>({});

  selectedType = signal<string>("todos");
  loading = signal<boolean>(false);
  selectedRecords = signal<Set<string>>(new Set());
  showFilters = signal<boolean>(false);
  expandedRecords = signal<Set<string>>(new Set());

  adminTableFields = TableFieldFactory.createAdminFields();

  getAdminActions(): TableFieldActionButton[] {
    return [TABLE_ACTIONS.TOGGLE_DELETE, TABLE_ACTIONS.DELETE_FOREVER];
  }

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

  dataTypes: SegmentOption[] = [
    { id: "todos", label: "Todos", icon: "list_alt" },
    { id: "tasks", label: "Tasks", icon: "checklist" },
    { id: "subtasks", label: "Subtasks", icon: "assignment" },
    { id: "comments", label: "Comments", icon: "forum" },
    { id: "chats", label: "Chats", icon: "chat" },
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

  private loadAdminData(force: boolean) {
    const sub = this.adminStorageService.loadAdminData(force).subscribe({
      next: () => {
        this.paginationState.set({
          skip: 0,
          limit: 0,
          total: this.getAdminDataCount(),
          hasMore: false,
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

  private loadArchiveData(force: boolean) {
    const type = this.selectedType();
    const alreadyLoaded = !force && this.archiveLoadedSignal()[type];

    if (alreadyLoaded && this.hasArchiveData(type)) {
      this.loading.set(false);
      this.paginationState.set({
        skip: 0,
        limit: 0,
        total: this.getArchiveDataCount(type),
        hasMore: false,
        loading: false,
      });
      this.populateFilterLists();
      return;
    }

    const sub = this.archiveStorageService.loadArchiveData(force).subscribe({
      next: () => {
        this.archiveLoadedSignal.update((s) => ({ ...s, [type]: true }));
        this.paginationState.set({
          skip: 0,
          limit: 0,
          total: this.getArchiveDataCount(type),
          hasMore: false,
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

  private hasArchiveData(type: string): boolean {
    switch (type) {
      case "todos":
        return this.archiveStorageService.todos().length > 0;
      case "tasks":
        return this.archiveStorageService.tasks().length > 0;
      case "subtasks":
        return this.archiveStorageService.subtasks().length > 0;
      case "comments":
        return this.archiveStorageService.comments().length > 0;
      case "chats":
        return this.archiveStorageService.chats().length > 0;
      case "categories":
        return this.archiveStorageService.categories().length > 0;
      case "daily_activities":
        return this.archiveStorageService.dailyActivities().length > 0;
      default:
        return false;
    }
  }

  private getDataCount(source: "admin" | "archive", type?: string): number {
    const service = source === "admin" ? this.adminStorageService : this.archiveStorageService;
    const dataType = type || this.selectedType();
    switch (dataType) {
      case "todos":
        return service.todos().length;
      case "tasks":
        return service.tasks().length;
      case "subtasks":
        return service.subtasks().length;
      case "comments":
        return service.comments().length;
      case "chats":
        return service.chats().length;
      case "categories":
        return service.categories().length;
      case "daily_activities":
        return service.dailyActivities().length;
      default:
        return 0;
    }
  }

  private getAdminDataCount(): number {
    return this.getDataCount("admin");
  }

  private getArchiveDataCount(type: string): number {
    return this.getDataCount("archive", type);
  }

  loadMore() {
    // No longer needed - we load all data at once
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
    if (event.action === "toggleDelete") {
      this.toggleDeleteStatus(event.item);
    } else if (
      event.action === "delete" ||
      event.action === "delete_forever" ||
      event.action === "deleteRecord"
    ) {
      this.deleteRecord(event.item);
    }
  }

  onRecordSelect(event: { id: string; selected: boolean }): void {
    this.toggleSelect(event);
  }

  getCurrentData(): any[] {
    let data: any[];

    if (this.mode === "admin") {
      data = this.getAdminData();
    } else {
      data = this.getArchiveData();
    }

    if (!data || data.length === 0) return [];

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
      case "chats":
        return service.chats();
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
      selectAll: {
        onToggle: () => this.onBulkSelectAll(),
        isAllSelected: this.isAllSelected(),
        count: this.selectedRecords().size,
        highlight: this.selectedRecords().size > 0 && !this.isAllSelected(),
      },
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
        this.deleteRecord(item.id);
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
      chats: "chat",
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
        this.loadData(true);
      }
    } catch (error) {
      this.notifyService.showError("Error: " + error);
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
        this.loadData(true);
      }
    } catch (error) {
      this.notifyService.showError("Error: " + error);
    }
  }

  async onBulkSoftDelete(): Promise<void> {
    const selectedIds = Array.from(this.selectedRecords());
    const allSelected = this.getCurrentData().filter((item) => selectedIds.includes(item.id));
    const allArchived = allSelected.every((item) => item.deleted_at);
    const visibility = this.mode === "admin" ? "public" : "private";

    if (allArchived) {
      await this.adminCascadeService.restoreBatch(this.selectedType(), selectedIds, visibility);
    } else {
      await this.adminCascadeService.softDeleteBatch(this.selectedType(), selectedIds, visibility);
    }
    this.selectedRecords.set(new Set());
    this.loadData(true);
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

    await this.adminCascadeService.hardDeleteBatch(
      this.selectedType(),
      Array.from(this.selectedRecords()),
      visibility
    );
    this.selectedRecords.set(new Set());
    this.loadData(true);
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
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "high":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "low":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-zinc-700 dark:text-gray-300";
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
    return this.storageService.getUsername(userId);
  }

  resolveTodoTitle(todoId: string): string {
    const todo = this.storageService.todoMap().get(todoId);
    return todo?.title || "-";
  }

  resolveTaskTitle(taskId: string): string {
    const task = this.storageService.taskMap().get(taskId);
    return task?.title || "-";
  }

  resolveSubtaskTitle(subtaskId: string): string {
    const subtask = this.storageService.subtaskMap().get(subtaskId);
    return subtask?.title || "-";
  }

  populateFilterLists(): void {
    this.userList.set(
      this.storageService.users().map((u) => ({
        id: u.id,
        label: this.storageService.getUsername(u.id),
      }))
    );

    const todos = this.storageService.todos();
    this.todoList.set(
      todos.map((t) => ({
        id: t.id,
        label: t.title || t.id,
      }))
    );

    const tasks = this.storageService.tasks();
    this.taskList.set(
      tasks.map((t) => ({
        id: t.id,
        label: t.title || t.id,
      }))
    );

    const subtasks = this.storageService.subtasks();
    this.subtaskList.set(
      subtasks.map((s) => ({
        id: s.id,
        label: s.title || s.id,
      }))
    );

    const categories = this.storageService.categories();
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
}
