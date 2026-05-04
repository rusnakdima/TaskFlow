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
import { filter } from "rxjs/operators";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MatMenuModule } from "@angular/material/menu";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageService } from "@services/core/storage.service";
import { AdminStorageService } from "@services/core/admin-storage.service";
import { TemplateService } from "@services/features/template.service";
import { TodosBlueprintService } from "@services/features/todos-blueprint.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { BulkActionService } from "@services/bulk-action.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* providers */
import { ApiProvider, Operation } from "@providers/api.provider";

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TodoComponent } from "@components/todo/todo.component";
import { FilterBarComponent, FilterOption } from "@components/filter-bar/filter-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";
import { TableField } from "@components/table-view/table-field.model";
import { VisibilityToggleComponent } from "@components/visibility-toggle/visibility-toggle.component";
import { StatsCardComponent } from "@components/stats-card/stats-card.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [ApiProvider],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatSelectModule,
    MatMenuModule,
    TodoComponent,
    FilterBarComponent,
    DragDropModule,
    CheckboxComponent,
    BulkActionsComponent,
    TableViewComponent,
    ViewModeSwitcherComponent,
    VisibilityToggleComponent,
    StatsCardComponent,
    EmptyStateComponent,
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
  private storageService = inject(StorageService);
  private adminStorageService = inject(AdminStorageService);
  private dataSyncProvider = inject(ApiProvider);
  private dataLoaderService = inject(DataLoaderService);

  protected getItems(): { id: string }[] {
    return [];
  }

  // State
  todos = this.storageService.todos;
  highlightTodoId = signal<string | null>(null);
  userId = signal("");
  showStats = signal(false);
  activeVisibility = signal<"all" | "private" | "shared" | "public">("all");

  todoPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  visibilityOptions = [
    { key: "all", label: "All", icon: "apps" },
    { key: "private", label: "Private", icon: "lock" },
    { key: "shared", label: "Shared", icon: "group" },
    { key: "public", label: "Public", icon: "public" },
  ];

  groupedTodos = computed(() => {
    const privateTodos = this.storageService.privateTodos();
    const sharedTodos = this.storageService.sharedTodos();
    const publicTodos = this.storageService.publicTodos();

    const deletedUserIds = new Set(
      this.adminStorageService
        .users()
        .filter((u) => u.deleted_at)
        .map((u) => u.id)
    );

    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    const applyFilters = (todos: Todo[]) => {
      let filtered = todos.filter((todo) => !deletedUserIds.has(todo.user_id));

      switch (filter) {
        case "active":
          filtered = filtered.filter((todo) => !this.isCompleted(todo));
          break;
        case "completed":
          filtered = filtered.filter((todo) => this.isCompleted(todo));
          break;
        case "week":
          filtered = FilterHelper.filterThisWeek(filtered);
          break;
        case "low":
        case "medium":
        case "high":
        case "urgent":
          filtered = FilterHelper.filterByPriority(filtered, filter);
          break;
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
      return [];
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
    const tasks = this.storageService.getTasksByTodoId(todo.id);
    if (!userId || tasks.length === 0) return 0;

    let count = 0;
    for (const task of tasks) {
      const taskComments = this.storageService
        .comments()
        .filter((c) => c.task_id === task.id && !c.deleted_at);
      if (taskComments.length === 0) continue;
      count += taskComments.filter((c: any) => {
        if (c.user_id === userId) return false;
        if (c.read_by && c.read_by.includes(userId)) return false;
        if (c.subtask_id) return false;
        return true;
      }).length;
    }
    return count;
  }

  filterOptions: FilterOption[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "week", label: "This Week" },
    { key: "low", label: "Low Priority" },
    { key: "medium", label: "Medium Priority" },
    { key: "high", label: "High Priority" },
    { key: "urgent", label: "Urgent Priority" },
  ];

  todoTableFields: TableField[] = [
    { key: "title", label: "Project", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status" },
    { key: "tasks", label: "Tasks", type: "array-count" },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "Due Date", type: "date", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
  ];

  get filterOptionsWithCounts(): FilterOption[] {
    return this.filterOptions.map((option) => ({
      ...option,
      count: this.getFilteredCount(option.key),
    }));
  }

  getVisibilityLabel(): string {
    const option = this.visibilityOptions.find((o) => o.key === this.activeVisibility());
    return option?.label || "All";
  }

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
    this.dataLoaderService
      .loadInitialTodos(this.visibility, this.todoPagination().limit)
      .subscribe({
        next: (todos: Todo[]) => {
          this.todoPagination.update((p) => ({
            ...p,
            skip: todos.length,
            hasMore: todos.length === p.limit,
            total: todos.length,
          }));
        },
      });
  }

  loadMore() {
    if (this.todoPagination().loading || !this.todoPagination().hasMore) return;

    this.todoPagination.update((p) => ({ ...p, loading: true }));

    this.dataLoaderService.loadMoreTodos(this.visibility).subscribe({
      next: (todos: Todo[]) => {
        this.todoPagination.update((p) => ({
          ...p,
          skip: p.skip + todos.length,
          loading: false,
          hasMore: todos.length === p.limit,
          total: p.total + todos.length,
        }));
      },
    });
  }

  getCurrentVisibilityIcon(): string {
    const option = this.visibilityOptions.find((o) => o.key === this.activeVisibility());
    return option?.icon || "apps";
  }

  override ngOnInit(): void {
    super.ngOnInit();

    this.pageKey = this.isSharedMode() ? "shared-tasks" : "todos";

    // Load view mode preference
    this.viewMode.set(this.loadViewModePreference());

    // Initialize bulk action service
    this.bulkService.setMode(this.isSharedMode() ? "shared" : "todos");
    this.bulkService.updateTotalCount(
      this.isSharedMode()
        ? this.storageService.sharedTodos().length
        : this.storageService.privateTodos().length
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
        todos = this.storageService.privateTodos();
        break;
      case "shared":
        todos = this.storageService.sharedTodos();
        break;
      case "public":
        todos = this.storageService.publicTodos();
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
      const visibility = this.isSharedMode() ? "shared" : "private";
      this.dataSyncProvider.crud("delete", "todos", { id: todoId, visibility }).subscribe({
        next: () => {
          this.notifyService.showSuccess("Todo deleted successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete todo");
        },
      });
    }
  }

  archiveTodoById(todoId?: string): void {
    if (confirm("Are you sure you want to archive this project?")) {
      const visibility = this.isSharedMode() ? "shared" : "private";
      this.dataSyncProvider.crud("delete", "todos", { id: todoId, visibility }).subscribe({
        next: () => {
          this.notifyService.showSuccess("Todo archived successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to archive todo");
        },
      });
    }
  }

  restoreTodoById(todoId?: string): void {
    const visibility = this.isSharedMode() ? "shared" : "private";
    this.dataSyncProvider
      .crud("update", "todos", { id: todoId, visibility, data: { deleted_at: null } })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Todo restored successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to restore todo");
        },
      });
  }

  onUpdateTodo(todo: any, event: { field: string; value: any }): void {
    // TODO: type todo and event properly
    const { field, value } = event;
    const visibility = this.isSharedMode() ? "shared" : "private";
    this.dataSyncProvider
      .crud("update", "todos", {
        id: todo.id,
        data: { [field]: value },
        visibility,
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Project updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update project");
        },
      });
  }

  onRowClick(todo: any): void {
    // TODO: type todo properly
    this.router.navigate(["/todos", todo.id, "tasks"]);
  }

  onTableAction(event: { action: string; item: any }): void {
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
        if (confirm(`Are you sure you want to archive this project?`)) {
          this.dataSyncProvider
            .crud("delete", "todos", {
              id: item.id,
              visibility: "private",
            })
            .subscribe({
              next: () => this.notifyService.showSuccess("Project archived successfully"),
              error: (err) =>
                this.notifyService.showError(err.message || "Failed to archive project"),
            });
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

  onTodoListDropped(): void {
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
          this.dragDropService
            .handleDrop(syntheticEvent, this.listTodos(), "todos", "todos", undefined, "private")
            .subscribe();
        }
      }
    );
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.listTodos(), "todos", "todos", undefined, "private")
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
    const listTasks = this.storageService.getTasksByTodoId(todo.id);
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

  override clearSelection(): void {
    super.clearSelection();
    this.bulkService.setSelectionState(0, false);
  }

  /**
   * Bulk archive selected todos (move to archive)
   */
  bulkArchive(): void {
    const selected = this.selectedTodos();
    if (selected.size === 0) return;

    if (confirm(`Are you sure you want to archive ${selected.size} project(s)?`)) {
      const requests = Array.from(selected).map((todoId) =>
        this.dataSyncProvider.crud("delete", "todos", {
          id: todoId,
          visibility: "private",
        })
      );

      forkJoin(requests).subscribe({
        next: () => {
          this.notifyService.showSuccess(`${selected.size} project(s) archived successfully`);
          this.clearSelection();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to archive projects");
        },
      });
    }
  }

  /**
   * Bulk delete selected todos
   */
  bulkDelete(): void {
    const selected = this.selectedTodos();
    if (selected.size === 0) return;

    if (confirm(`Are you sure you want to delete ${selected.size} project(s)?`)) {
      const requests = Array.from(selected).map((todoId) =>
        this.dataSyncProvider.crud("delete", "todos", {
          id: todoId,
          visibility: "private",
        })
      );

      forkJoin(requests).subscribe({
        next: () => {
          this.notifyService.showSuccess(`${selected.size} project(s) deleted successfully`);
          this.clearSelection();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete projects");
        },
      });
    }
  }
}
