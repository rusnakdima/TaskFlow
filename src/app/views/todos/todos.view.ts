/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  signal,
  inject,
  computed,
  HostListener,
  DestroyRef,
} from "@angular/core";
import { RouterModule, ActivatedRoute, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import {
  CdkDragDrop,
  CdkDragEnter,
  CdkDropList,
  DragDropModule,
  DragRef,
} from "@angular/cdk/drag-drop";
import { forkJoin } from "rxjs";
import { filter, map } from "rxjs/operators";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MatMenuModule } from "@angular/material/menu";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Comment } from "@models/comment.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageService } from "@services/storage.service";
import { TemplateService } from "@services/features/template.service";
import { TodosBlueprintService } from "@services/features/todos-blueprint.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { BulkActionService } from "@services/bulk-action.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TodoComponent } from "@components/todo/todo.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField, TableFieldActionButton } from "@components/table-view/table-field.model";
import { StatsCardComponent } from "@components/stats-card/stats-card.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { FilterField } from "@models/filter-config.model";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { BlueprintCreateDialogComponent } from "@components/blueprint-dialogs/blueprint-create-dialog.component";
import { BlueprintSelectionDialogComponent } from "@components/blueprint-dialogs/blueprint-selection-dialog.component";
import { BlueprintApplyDialogComponent } from "@components/blueprint-dialogs/blueprint-apply-dialog.component";
import { TABLE_ACTIONS } from "@constants/table-field.constants";

@Component({
  selector: "app-todos",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatSelectModule,
    MatMenuModule,
    TodoComponent,
    DragDropModule,
    BulkActionsComponent,
    TableViewComponent,
    StatsCardComponent,
    EmptyStateComponent,
    SegmentSelectorComponent,
    PageToolbarComponent,
    ItemExpandDetailsComponent,
    BlueprintCreateDialogComponent,
    BlueprintSelectionDialogComponent,
    BlueprintApplyDialogComponent,
  ],
  templateUrl: "./todos.view.html",
})
export class TodosView extends BaseListView implements OnInit, AfterViewInit {
  @ViewChild("todoPlaceholder", { read: CdkDropList }) private todoPlaceholder!: CdkDropList;

  private dragTarget: CdkDropList | null = null;
  private dragTargetIndex = 0;
  private dragSource: CdkDropList | null = null;
  private dragSourceIndex = 0;
  private dragRef: DragRef | null = null;
  private keydownHandler = (event: KeyboardEvent): void => {
    if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
      event.preventDefault();
      this.showFilter.set(true);
      setTimeout(() => {
        const searchField = document.getElementById("searchField");
        if (searchField) searchField.focus();
      }, 100);
    }
  };

  public templateService = inject(TemplateService);
  public blueprintService = inject(TodosBlueprintService);
  public bulkService = inject(BulkActionService);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adminStorageService = inject(StorageService);

  private requestService = inject(REQUEST_SERVICE);
  private destroyRef = inject(DestroyRef);
  private mongoConnectionService = inject(MongoConnectionService);
  private confirmDialogService = inject(ConfirmDialogService);

  protected getItems(): { id: string }[] {
    return [];
  }

  private getTodosList(): Todo[] {
    return this.storageService.todos();
  }

  private getTasksList(): Task[] {
    return this.storageService.tasks();
  }

  private getCommentsList(): Comment[] {
    return this.storageService.comments();
  }

  private getPrivateTodos(): Todo[] {
    return this.storageService.privateTodos().filter((t) => !t.deleted_at);
  }

  private getSharedTodos(): Todo[] {
    return this.storageService.sharedTodos().filter((t) => !t.deleted_at);
  }

  private getPublicTodos(): Todo[] {
    return this.storageService.publicTodos().filter((t) => !t.deleted_at);
  }

  private getTodosForVisibility(visibility: string): Todo[] {
    switch (visibility) {
      case "all":
        return this.allTodosFlat();
      case "private":
        return this.getPrivateTodos();
      case "shared":
        return this.getSharedTodos();
      case "public":
        return this.getPublicTodos();
      default:
        return this.getPrivateTodos();
    }
  }

  private getTasksByTodoId(todoId: string): Task[] {
    return this.storageService.getTasksByTodoId(todoId);
  }
  highlightTodoId = signal<string | null>(null);
  userId = signal("");
  showStats = signal(false);
  activeVisibility = signal<"all" | "private" | "shared" | "public">("all");
  statusFilter = signal("all");
  priorityFilter = signal("all");

  todoPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  visibilityOptions: SegmentOption[] = [
    { id: "all", label: "All", icon: "apps" },
    { id: "private", label: "Private", icon: "lock" },
    { id: "shared", label: "Shared", icon: "group" },
    { id: "public", label: "Public", icon: "public" },
  ];

  groupedTodos = computed(() => {
    const privateTodos = this.getPrivateTodos();
    const sharedTodos = this.getSharedTodos();
    const publicTodos = this.getPublicTodos();

    const deletedUserIds = new Set(
      this.adminStorageService
        .users()
        .filter((u) => u.deleted_at)
        .map((u) => u.id)
    );

    const statusFilter = this.statusFilter();
    const priorityFilter = this.priorityFilter();
    const query = this.searchQuery().toLowerCase().trim();

    const applyFilters = (todos: Todo[]): Todo[] => {
      let filtered = todos.filter((todo) => !deletedUserIds.has(todo.user_id));

      if (statusFilter && statusFilter !== "all") {
        switch (statusFilter) {
          case "active":
            filtered = filtered.filter((todo) => !this.isCompleted(todo));
            break;
          case "completed":
            filtered = filtered.filter((todo) => this.isCompleted(todo));
            break;
          case "week":
            filtered = FilterHelper.filterThisWeek(filtered);
            break;
        }
      }

      if (priorityFilter && priorityFilter !== "all") {
        filtered = FilterHelper.filterByPriority(filtered, priorityFilter);
      }

      if (query) {
        filtered = filtered.filter((todo) => todo.title.toLowerCase().includes(query));
      }

      return SortHelper.sortByOrder(filtered, "desc");
    };

    return {
      private: applyFilters(privateTodos),
      shared: applyFilters(sharedTodos),
      public: applyFilters(publicTodos),
    };
  });

  allTodosFlat = computed(() => {
    return [
      ...this.groupedTodos().private,
      ...this.groupedTodos().shared,
      ...this.groupedTodos().public,
    ];
  });

  // Bulk selection state (like admin page)
  selectedTodos = this.selectedItems;

  // Computed signals
  isSharedMode = computed(() => {
    return this.route.snapshot.url[0]?.path === "shared-tasks";
  });

  listTodos = computed(() => {
    const visibility = this.activeVisibility();
    const grouped = this.groupedTodos();

    if (visibility === "all") {
      return this.allTodosFlat();
    } else if (visibility === "private") {
      return grouped.private;
    } else if (visibility === "shared") {
      return grouped.shared;
    } else if (visibility === "public") {
      return grouped.public;
    }
    return [];
  });

  // Get unread comments count for a todo (from all tasks, not subtasks)
  // Only counts comments where user is NOT the author AND hasn't read
  getTodoUnreadCommentsCount(todo: Todo): number {
    const userId = this.authService.getValueByKey("id");
    const tasks = this.getTasksByTodoId(todo.id);
    if (!userId || tasks.length === 0) return 0;

    let count = 0;
    for (const task of tasks) {
      const taskComments = this.getCommentsList().filter(
        (c: Comment) => c.task_id === task.id && !c.deleted_at
      );
      if (taskComments.length === 0) continue;
      count += taskComments.filter((c: Comment) => {
        if (c.user_id === userId) return false;
        if (c.read_by && c.read_by.includes(userId)) return false;
        if (c.subtask_id) return false;
        return true;
      }).length;
    }
    return count;
  }

  filterFields: FilterField[] = [
    {
      key: "status",
      label: "Status",
      type: "radio",
      options: [
        { key: "all", label: "All" },
        { key: "active", label: "Active" },
        { key: "completed", label: "Completed" },
        { key: "week", label: "This Week" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "radio",
      options: [
        { key: "all", label: "All" },
        { key: "low", label: "Low" },
        { key: "medium", label: "Medium" },
        { key: "high", label: "High" },
        { key: "urgent", label: "Urgent" },
      ],
    },
  ];

  todoTableFields: TableField[] = [
    { key: "title", label: "Project", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    {
      key: "status",
      label: "Status",
      type: "status",
      getValue: (item) => this.computeTodoStatus(item),
    },
    { key: "tasks", label: "Tasks", type: "number", getValue: (item) => item.tasks_count || 0 },
  ];

  tableActions: TableFieldActionButton[] = [
    TABLE_ACTIONS.BLUEPRINT,
    TABLE_ACTIONS.EDIT,
    TABLE_ACTIONS.ARCHIVE,
  ];

  computeTodoStatus(todo: Todo): string {
    const tasks = this.getTasksByTodoId(todo.id);
    if (!tasks || tasks.length === 0) return "Pending";
    const pending = tasks.filter((t) => t.status === TaskStatus.PENDING).length;
    const completed = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.SKIPPED
    ).length;
    if (completed === tasks.length) return "Completed";
    if (pending === tasks.length) return "Pending";
    return "In Progress";
  }

  getVisibilityLabel(): string {
    const option = this.visibilityOptions.find((o) => o.id === this.activeVisibility());
    return option?.label || "All";
  }

  getToolbarConfig(): PageToolbarConfig {
    return {
      selectAll:
        this.viewMode() !== "table"
          ? {
              onToggle: () => this.toggleSelectAll(),
              isAllSelected: this.isAllSelected(),
              count: this.selectedTodos().size,
              highlight: this.selectedTodos().size > 0 && !this.isAllSelected(),
            }
          : undefined,
      stats: {
        onToggle: () => this.showStats.update((v) => !v),
        isActive: this.showStats(),
      },
      filter: {
        onToggle: () => this.toggleFilter(),
        isActive: this.showFilter(),
      },
      newButtonWithMenu: {
        label: "New",
        icon: "add",
        menuItems: [
          {
            label: "Blank Project",
            icon: "add",
            action: () => this.router.navigate(["/todos/create_todo"]),
          },
          {
            label: "From Blueprint",
            icon: "account_tree",
            action: () => this.blueprintService.showBlueprintDialog.set(true),
          },
        ],
      },
      viewMode: {
        mode: this.viewMode(),
        pageKey: this.isSharedMode() ? "shared-tasks" : "todos",
        onModeChange: (mode) => this.setViewMode(mode),
      },
      filterFields: this.filterFields,
      showFilter: this.showFilter(),
      onFiltersChange: (filters) => this.onFiltersChange(filters),
    };
  }

  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this._activeFilters.set(filters);
    if (filters["status"]) {
      this.statusFilter.set(filters["status"] as string);
    }
    if (filters["priority"]) {
      this.priorityFilter.set(filters["priority"] as string);
    }
  }

  private _activeFilters = signal<Record<string, string | string[] | any>>({});

  get visibility() {
    return this.activeVisibility();
  }

  getProgress(todo: Todo): string {
    if (todo.tasks_count === 0) return "No tasks";
    return `${todo.completed_tasks_count}/${todo.tasks_count} completed`;
  }

  getChatsCount(todo: Todo): number {
    return todo.chats_count;
  }

  loadInitialTodos() {
    const hasTodos = this.storageService.todos().length > 0;
    if (hasTodos && this.storageService.isCacheValid(300000)) {
      console.log("[TodosView] Using cached todos, skipping API call");
      this.todoPagination.update((p) => ({
        ...p,
        skip: this.storageService.todos().length,
        hasMore: this.storageService.hasMoreTodos,
        total: this.storageService.todos().length,
        loading: false,
      }));
      return;
    }

    const sub = this.requestService
      .loadPage<Todo>("todos", {
        visibility: "all",
        limit: this.todoPagination().limit,
        skip: 0,
        load: ["user", "categories", "assignees"],
      })
      .subscribe({
        next: (todos: Todo[]) => {
          console.log("[TodosView] Loaded todos:", todos.length);
          this.todoPagination.update((p) => ({
            ...p,
            skip: todos.length,
            hasMore: todos.length === p.limit,
            total: todos.length,
            loading: false,
          }));
        },
        error: (err) => {
          console.error("[TodosView] Failed to load todos:", err);
          this.todoPagination.update((p) => ({
            ...p,
            loading: false,
          }));
        },
        complete: () => {
          this.todoPagination.update((p) => ({
            ...p,
            loading: false,
          }));
        },
      });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  loadMore() {
    if (this.todoPagination().loading || !this.todoPagination().hasMore) return;

    this.todoPagination.update((p) => ({ ...p, loading: true }));

    this.requestService.loadMore<Todo>("todos").subscribe({
      next: (todos: Todo[]) => {
        this.todoPagination.update((p) => ({
          ...p,
          skip: p.skip + todos.length,
          loading: false,
          hasMore: todos.length === p.limit,
          total: p.total + todos.length,
        }));
      },
      error: () => {
        this.todoPagination.update((p) => ({
          ...p,
          loading: false,
          hasMore: false,
        }));
      },
    });
  }

  getCurrentVisibilityIcon(): string {
    const option = this.visibilityOptions.find((o) => o.id === this.activeVisibility());
    return option?.icon || "apps";
  }

  onVisibilityChange(visibility: string): void {
    this.activeVisibility.set(visibility as any);
    const cachedTodos = this.getTodosForVisibility(visibility);
    if (cachedTodos.length > 0 && this.storageService.isCacheValid(300000)) {
      console.log("[TodosView] Using cached todos for visibility:", visibility);
      return;
    }
    this.requestService
      .loadPage<Todo>("todos", {
        visibility: visibility as Visibility,
        limit: this.todoPagination().limit,
        skip: 0,
        load: ["user", "categories", "assignees"],
      })
      .subscribe();
  }

  override ngOnInit(): void {
    super.ngOnInit();

    this.pageKey = this.isSharedMode() ? "shared-tasks" : "todos";

    // Load view mode preference
    this.viewMode.set(this.loadViewModePreference());

    // Initialize bulk action service
    this.bulkService.setMode(this.isSharedMode() ? "shared" : "todos");
    this.bulkService.updateTotalCount(
      this.isSharedMode() ? this.getSharedTodos().length : this.getPrivateTodos().length
    );

    // Clear selection when navigating away from this view
    this.subscriptions.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
        this.clearSelection();
      })
    );

    // Handle highlight from query params
    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: any) => {
        // TODO: type queryParams
        super.handleHighlightQueryParams(queryParams, "highlightTodoId", "todo-", "ring-blue-500");
      })
    );

    document.addEventListener("keydown", this.keydownHandler);
    this.userId.set(this.authService.getValueByKey("id"));

    // Subscribe to refresh shortcut (Ctrl+R)
    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
      if (!this.storageService.isCacheValid(300000) || this.storageService.todos().length === 0) {
        this.loadInitialTodos();
      }
    });
    this.destroyRef.onDestroy(() => refreshSub.unsubscribe());

    // Load initial todos
    this.loadInitialTodos();
  }

  override ngOnDestroy(): void {
    document.removeEventListener("keydown", this.keydownHandler);
    super.ngOnDestroy();
  }

  @HostListener("window:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "f") {
      event.preventDefault();
      this.toggleFilter();
    }
  }

  getFilteredCount(filter: string): number {
    const visibility = this.activeVisibility();
    let todos: Todo[] = [];

    switch (visibility) {
      case "all":
        todos = this.allTodosFlat();
        break;
      case "private":
        todos = this.getPrivateTodos();
        break;
      case "shared":
        todos = this.getSharedTodos();
        break;
      case "public":
        todos = this.getPublicTodos();
        break;
    }

    switch (filter) {
      case "all":
        return todos.length;
      case "active":
        return todos.filter((todo) => !this.isCompleted(todo)).length;
      case "completed":
        return todos.filter((todo) => this.isCompleted(todo)).length;
      case "week":
        return FilterHelper.filterThisWeek(todos).length;
      case "low":
      case "medium":
      case "high":
      case "urgent":
        return FilterHelper.filterByPriority(todos, filter).length;
      default:
        return 0;
    }
  }

  deleteTodoById(todoId?: string, isOwner: boolean = true): void {
    if (confirm("Are you sure you want to delete this project?")) {
      const sub = this.requestService.delete("todos", todoId!).subscribe({
        next: () => {
          this.notifyService.showSuccess("Todo deleted successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete todo");
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }

  async archiveTodoById(todoId?: string): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Project",
      message: "Are you sure you want to archive this project?",
      confirmText: "Archive",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      const sub = this.requestService.delete("todos", todoId!).subscribe({
        next: () => {
          this.notifyService.showSuccess("Todo archived successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to archive todo");
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }

  async restoreTodoById(todoId?: string): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Restore Project",
      message:
        "Are you sure you want to restore this project? It will be returned to its original location.",
      confirmText: "Restore",
      confirmClass: "bg-green-600 hover:bg-green-700",
    });
    if (confirmed) {
      const todo = this.getTodosList().find((t: Todo) => t.id === todoId);
      if (!todo) {
        this.notifyService.showError("Todo not found");
        return;
      }
      const sub = this.requestService
        .update<Todo>(
          "todos",
          todoId!,
          { deleted_at: null },
          { visibility: todo.visibility as Visibility }
        )
        .subscribe({
          next: () => {
            this.notifyService.showSuccess("Todo restored successfully");
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to restore todo");
          },
        });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }

  onUpdateTodo(todo: any, event: { field: string; value: any }): void {
    // TODO: type todo and event properly
    const { field, value } = event;
    const sub = this.requestService
      .update<Todo>(
        "todos",
        todo.id,
        { [field]: value },
        { visibility: todo.visibility as Visibility }
      )
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Project updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update project");
        },
      });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  onRowClick(todo: any): void {
    // TODO: type todo properly
    this.router.navigate(["/todos", todo.id, "tasks"]);
  }

  async onTableAction(event: { action: string; item: any }): Promise<void> {
    // TODO: type item properly
    const { action, item } = event;
    switch (action) {
      case "blueprint":
        this.saveAsBlueprint(item);
        break;
      case "edit":
        this.router.navigate(["/todos", item.id, "edit_todo"]);
        break;
      case "archive":
        const archiveConfirmed = await this.confirmDialogService.confirm({
          title: "Archive Project",
          message: "Are you sure you want to archive this project?",
          confirmText: "Archive",
          confirmClass: "bg-orange-600 hover:bg-orange-700",
        });
        if (archiveConfirmed) {
          const sub = this.requestService.delete("todos", item.id).subscribe({
            next: () => this.notifyService.showSuccess("Project archived successfully"),
            error: (err) =>
              this.notifyService.showError(err.message || "Failed to archive project"),
          });
          this.destroyRef.onDestroy(() => sub.unsubscribe());
        }
        break;
      case "delete":
        this.deleteTodoById(item.id, item.user_id === this.currentUserId);
        break;
    }
  }

  ngAfterViewInit(): void {
    if (!this.todoPlaceholder?.element?.nativeElement) return;
    const el = this.todoPlaceholder.element.nativeElement as HTMLElement;
    el.style.display = "none";
    el.parentNode?.removeChild(el);
  }

  onTodoListEntered(event: CdkDragEnter): void {
    const { item, container } = event;
    if (container === this.todoPlaceholder) return;
    if (!this.todoPlaceholder?.element?.nativeElement) return;

    const placeholderEl = this.todoPlaceholder.element.nativeElement as HTMLElement;
    const sourceEl = item.dropContainer.element.nativeElement as HTMLElement;
    const dropEl = container.element.nativeElement as HTMLElement;
    const parent = dropEl.parentElement;
    if (!parent) return;

    const dragIndex = Array.prototype.indexOf.call(
      parent.children,
      this.dragSource ? placeholderEl : sourceEl
    );
    const dropIndex = Array.prototype.indexOf.call(parent.children, dropEl);

    if (!this.dragSource) {
      this.dragSourceIndex = dragIndex;
      this.dragSource = item.dropContainer;
      placeholderEl.style.width = sourceEl.offsetWidth + "px";
      placeholderEl.style.minHeight = sourceEl.offsetHeight + "px";
      sourceEl.parentElement?.removeChild(sourceEl);
    }

    this.dragTargetIndex = dropIndex;
    this.dragTarget = container;
    this.dragRef = item._dragRef;

    placeholderEl.style.display = "";
    parent.insertBefore(placeholderEl, dropIndex > dragIndex ? dropEl.nextSibling : dropEl);

    this.todoPlaceholder._dropListRef.enter(
      item._dragRef,
      item.element.nativeElement.offsetLeft,
      item.element.nativeElement.offsetTop
    );
  }

  onTodoListDropped(event: CdkDragDrop<Todo[]>): void {
    this.dragDropHandlerService.onListDropped<Todo>(
      this.todoPlaceholder,
      (prev: number, curr: number) => {
        if (prev !== curr) {
          const syntheticEvent = {
            previousIndex: prev,
            currentIndex: curr,
            item: null,
            container: null,
            previousContainer: null,
            distance: { x: 0, y: 0 },
          } as unknown as CdkDragDrop<Todo[]>;
          const todos = this.activeVisibility() === "all" ? this.allTodosFlat() : this.listTodos();
          this.dragDropService
            .handleDrop(syntheticEvent, todos, "todos", "todos", undefined, "private")
            .subscribe();
        }
      }
    );
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    const todos = this.activeVisibility() === "all" ? this.allTodosFlat() : this.listTodos();
    this.dragDropService
      .handleDrop(event, todos, "todos", "todos", undefined, "private")
      .subscribe();
  }

  // Blueprint logic delegated to service
  saveAsBlueprint(todo: Todo) {
    this.blueprintService.saveAsBlueprint(todo);
  }

  confirmSaveAsBlueprint() {
    this.blueprintService.confirmSaveAsBlueprint();
  }

  closeCreateBlueprintDialog() {
    this.blueprintService.closeCreateBlueprintDialog();
  }

  confirmCreateFromBlueprint() {
    this.blueprintService.confirmCreateFromBlueprint(this.currentUserId).subscribe();
  }

  openApplyBlueprint(template: any) {
    this.blueprintService.openApplyBlueprint(template);
  }

  resolveUserName(userId: string): string {
    return this.storageService.getUsername(userId);
  }

  removeBlueprint(templateId: string) {
    this.blueprintService.removeBlueprint(templateId);
  }

  getSubtasksCount(template: any): number {
    return this.blueprintService.getSubtasksCount(template);
  }

  /**
   * Check if todo is completed
   */
  isCompleted(todo: Todo): boolean {
    const listTasks = this.getTasksByTodoId(todo.id);
    if (listTasks.length === 0) return false;
    const listCompletedTasks = listTasks.filter(
      (task: Task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
    );
    return listCompletedTasks.length === listTasks.length;
  }

  // Bulk Actions Methods

  /**
   * Toggle selection of a single todo
   */
  toggleTodoSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    this.selectedItems.update((todoIds) => {
      const newSelected = new Set(todoIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  /**
   * Toggle select all todos in current view
   */
  override toggleSelectAll(): void {
    super.toggleSelectAll(
      () => this.listTodos(),
      () => this.isAllSelected()
    );
  }

  override isAllSelected(): boolean {
    return super.isAllSelected(() => this.listTodos());
  }

  /**
   * Bulk archive selected todos (move to archive)
   */
  async bulkArchive(): Promise<void> {
    const selected = this.selectedTodos();
    if (selected.size === 0) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Projects",
      message: `Are you sure you want to archive ${selected.size} project(s)?`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      const requests = Array.from(selected).map((todoId) =>
        this.requestService.delete("todos", todoId)
      );

      const sub = forkJoin(requests).subscribe({
        next: () => {
          this.notifyService.showSuccess(`${selected.size} project(s) archived successfully`);
          this.clearSelection();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to archive projects");
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }

  /**
   * Bulk delete selected todos
   */
  async bulkDelete(): Promise<void> {
    const selected = this.selectedTodos();
    if (selected.size === 0) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Projects",
      message: `Are you sure you want to delete ${selected.size} project(s)?`,
      confirmText: "Delete",
    });
    if (confirmed) {
      const requests = Array.from(selected).map((todoId) =>
        this.requestService.delete("todos", todoId)
      );

      const sub = forkJoin(requests).subscribe({
        next: () => {
          this.notifyService.showSuccess(`${selected.size} project(s) deleted successfully`);
          this.clearSelection();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete projects");
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }
}
