/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
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
import { DataLoaderService } from "@services/data/data-loader.service";
import { BulkActionService } from "@services/bulk-action.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

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

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [ApiProvider],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    TodoComponent,
    FilterBarComponent,
    DragDropModule,
    CheckboxComponent,
    BulkActionsComponent,
    TableViewComponent,
    ViewModeSwitcherComponent,
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

  public templateService = inject(TemplateService);
  public blueprintService = inject(TodosBlueprintService);
  public bulkService = inject(BulkActionService);
  private dragDropService = inject(DragDropOrderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private adminStorageService = inject(AdminStorageService);
  private dataSyncProvider = inject(ApiProvider);

  // State
  todos = this.storageService.todos;
  highlightTodoId = signal<string | null>(null);
  userId = signal("");
  showStats = signal(false);

  // Bulk selection state (like admin page)
  selectedTodos = this.selectedItems;

  // Computed signals
  isSharedMode = computed(() => {
    return this.route.snapshot.url[0]?.path === "shared-tasks";
  });

  listTodos = computed(() => {
    // Filter based on mode - private vs team visibility todos
    let filtered = this.isSharedMode()
      ? this.storageService.sharedTodos()
      : this.storageService.privateTodos();

    // Filter out todos from deleted users
    const deletedUserIds = new Set(
      this.adminStorageService
        .users()
        .filter((u) => u.deleted_at)
        .map((u) => u.id)
    );
    filtered = filtered.filter((todo) => !deletedUserIds.has(todo.user_id));

    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

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

    const result = SortHelper.sortByOrder(filtered, "desc");
    return result;
  });

  // Get unread comments count for a todo (from all tasks, not subtasks)
  // Only counts comments where user is NOT the author AND hasn't read
  getTodoUnreadCommentsCount(todo: Todo): number {
    const userId = this.authService.getValueByKey("id");
    const tasks = Array.isArray(todo.tasks) ? todo.tasks : [];
    if (!userId || tasks.length === 0) return 0;

    let count = 0;
    for (const task of tasks) {
      const comments = Array.isArray(task.comments) ? task.comments : [];
      if (comments.length === 0) continue;
      count += comments.filter((c: any) => {
        // Skip deleted comments
        if (c.deleted_at) return false;
        // Skip if user is the author (they've read their own comment)
        if (c.user_id === userId) return false;
        // Skip if user has read the comment
        if (c.read_by && c.read_by.includes(userId)) return false;
        // Only count task comments (not subtask comments)
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

  override ngOnInit(): void {
    super.ngOnInit();

    this.userId.set(this.authService.getValueByKey("id"));
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
        super.handleHighlightQueryParams(queryParams, "highlightTodoId", "todo-", "ring-blue-500");
      })
    );

    document.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        this.showFilter.set(true);
        setTimeout(() => {
          const searchField = document.getElementById("searchField");
          if (searchField) searchField.focus();
        }, 100);
      }
    });
  }

  @HostListener("window:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "f") {
      event.preventDefault();
      this.toggleFilter();
    }
  }

  getFilteredCount(filter: string): number {
    // Count only private visibility todos
    const todos = this.storageService.privateTodos();

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
      this.dataSyncProvider
        .crud("delete", "todos", { id: todoId, isOwner: isOwner, isPrivate: !this.isSharedMode() })
        .subscribe({
          next: () => {
            this.notifyService.showSuccess("Todo deleted successfully");
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to delete todo");
          },
        });
    }
  }

  onUpdateTodo(todo: any, event: { field: string; value: any }): void {
    const { field, value } = event;
    this.dataSyncProvider
      .crud("update", "todos", {
        id: todo.id,
        data: { [field]: value },
        isOwner: todo.user_id === this.userId(),
        isPrivate: !this.isSharedMode(),
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
    this.router.navigate(["/todos", todo.id, "tasks"]);
  }

  onTableAction(event: { action: string; item: any }): void {
    const { action, item } = event;
    switch (action) {
      case "blueprint":
        this.saveAsBlueprint(item);
        break;
      case "edit":
        this.router.navigate(["/todos", item.id, "edit_todo"]);
        break;
      case "delete":
        this.deleteTodoById(item.id, item.user_id === this.userId());
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
    if (!this.dragTarget || !this.todoPlaceholder?.element?.nativeElement) return;

    const placeholderEl = this.todoPlaceholder.element.nativeElement as HTMLElement;
    const parent = placeholderEl.parentElement;
    if (parent) {
      placeholderEl.style.display = "none";
      parent.removeChild(placeholderEl);
      parent.appendChild(placeholderEl);
      const sourceEl = this.dragSource?.element.nativeElement as HTMLElement;
      if (sourceEl) {
        parent.insertBefore(sourceEl, parent.children[this.dragSourceIndex]);
      }
    }

    if (this.todoPlaceholder._dropListRef.isDragging() && this.dragRef) {
      this.todoPlaceholder._dropListRef.exit(this.dragRef);
    }

    const prev = this.dragSourceIndex;
    const curr = this.dragTargetIndex;
    this.dragTarget = null;
    this.dragSource = null;
    this.dragRef = null;

    if (prev !== curr) {
      const syntheticEvent = {
        previousIndex: prev,
        currentIndex: curr,
      } as CdkDragDrop<Todo[]>;
      this.dragDropService
        .handleDrop(syntheticEvent, this.listTodos(), "todos", "todos", undefined, {
          isOwner: true,
          isPrivate: true,
        })
        .subscribe();
    }
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.listTodos(), "todos", "todos", undefined, {
        isOwner: true,
        isPrivate: true,
      })
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
    this.blueprintService.confirmCreateFromBlueprint(this.userId()).subscribe();
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
    const listTasks = Array.isArray(todo?.tasks) ? todo.tasks : [];
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
          isOwner: true,
          isPrivate: true,
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
          isOwner: true,
          isPrivate: true,
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
