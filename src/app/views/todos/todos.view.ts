/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  signal,
  inject,
  computed,
  OnDestroy,
  HostListener,
} from "@angular/core";
import { RouterModule, ActivatedRoute, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { Subscription } from "rxjs";
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
import { DataSyncService } from "@services/data/data-sync.service";
import { BulkActionService } from "@services/bulk-action.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

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

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [DataSyncProvider],
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
  ],
  templateUrl: "./todos.view.html",
})
export class TodosView extends BaseListView implements OnInit {
  // Services
  public templateService = inject(TemplateService);
  public blueprintService = inject(TodosBlueprintService);
  public bulkService = inject(BulkActionService);
  private shortcutService = inject(ShortcutService);
  private dragDropService = inject(DragDropOrderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private adminStorageService = inject(AdminStorageService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private dataSyncService = inject(DataSyncService);
  constructor() {
    super();
  }

  // State
  todos = this.storageService.todos;
  highlightTodoId = signal<string | null>(null);
  userId = signal("");
  private routeSub?: Subscription;

  // Bulk selection state (like admin page)
  selectedTodos = signal<Set<string>>(new Set());

  // Computed signals
  listTodos = computed(() => {
    // Filter only private visibility todos
    let filtered = this.storageService.privateTodos();

    // Filter out todos from deleted users
    const deletedUserIds = new Set(
      this.adminStorageService
        .users()
        .filter((u) => u.isDeleted)
        .map((u) => u.id)
    );
    filtered = filtered.filter((todo) => !deletedUserIds.has(todo.userId));

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
      filtered = filtered.filter(
        (todo) =>
          todo.title.toLowerCase().includes(query) || todo.description.toLowerCase().includes(query)
      );
    }

    const result = SortHelper.sortByOrder(filtered, "desc");
    return result;
  });

  // Get unread comments count for a todo (from all tasks, not subtasks)
  // Only counts comments where user is NOT the author AND hasn't read
  getTodoUnreadCommentsCount(todo: Todo): number {
    const userId = this.authService.getValueByKey("id");
    if (!userId || !todo.tasks || todo.tasks.length === 0) return 0;

    let count = 0;
    for (const task of todo.tasks) {
      if (!task.comments || task.comments.length === 0) continue;
      count += task.comments.filter((c: any) => {
        // Skip deleted comments
        if (c.isDeleted) return false;
        // Skip if user is the author (they've read their own comment)
        if (c.authorId === userId) return false;
        // Skip if user has read the comment
        if (c.readBy && c.readBy.includes(userId)) return false;
        // Only count task comments (not subtask comments)
        if (c.subtaskId) return false;
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

  get filterOptionsWithCounts(): FilterOption[] {
    return this.filterOptions.map((option) => ({
      ...option,
      count: this.getFilteredCount(option.key),
    }));
  }

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));

    // Initialize bulk action service
    this.bulkService.setMode("todos");
    this.bulkService.updateTotalCount(this.storageService.privateTodos().length);

    // Subscribe to refresh shortcut (Ctrl+R)
    this.shortcutService.refresh$.subscribe(() => {
      this.dataSyncService.loadAllData(true).subscribe(() => {
        this.notifyService.showSuccess("Data refreshed");
      });
    });

    // Clear selection when navigating away from this view
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.clearSelection();
    });

    // Handle highlight from query params
    this.routeSub = this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.highlightTodoId) {
        this.highlightTodoId.set(queryParams.highlightTodoId);
        setTimeout(() => {
          const element = document.getElementById("todo-" + queryParams.highlightTodoId);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-4", "ring-blue-500", "animate-pulse");
            setTimeout(() => {
              element.classList.remove("ring-4", "ring-blue-500", "animate-pulse");
            }, 2000);
          }
          this.highlightTodoId.set(null);
        }, 500);
      }
    });

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

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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

  deleteTodoById(todoId: string): void {
    if (confirm("Are you sure you want to delete this project?")) {
      this.dataSyncProvider
        .crud("delete", "todos", { id: todoId, isOwner: true, isPrivate: true })
        .subscribe({
          next: () => {
            this.notifyService.showSuccess("Todo deleted successfully");
            // No need to reload - storage is already updated by archiveTodoWithCascade()
            // The deleted todo will be filtered out by the computed signal
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to delete todo");
          },
        });
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
    const listTasks = todo?.tasks ?? [];
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
    this.selectedTodos.update((todoIds) => {
      const newSelected = new Set(todoIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      // Sync with bulk service for display
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  /**
   * Toggle select all todos in current view
   */
  toggleSelectAll(): void {
    const allIds = this.listTodos();
    const allSelected = this.isAllSelected();

    this.selectedTodos.update((selected) => {
      const newSelected = new Set(selected);
      if (allSelected) {
        // Deselect all in current view
        allIds.forEach((todo) => newSelected.delete(todo.id));
      } else {
        // Select all in current view
        allIds.forEach((todo) => newSelected.add(todo.id));
      }
      // Sync with bulk service for display
      this.bulkService.setSelectionState(newSelected.size, !allSelected);
      return newSelected;
    });
  }

  /**
   * Check if all todos are selected
   */
  isAllSelected(): boolean {
    const currentList = this.listTodos();
    return currentList.length > 0 && currentList.every((todo) => this.selectedTodos().has(todo.id));
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedTodos.set(new Set());
    this.bulkService.setSelectionState(0, false);
  }

  /**
   * Bulk archive selected todos (move to archive)
   */
  bulkArchive(): void {
    const selected = this.selectedTodos();
    if (selected.size === 0) return;

    if (confirm(`Are you sure you want to archive ${selected.size} project(s)?`)) {
      const archiveRequests = Array.from(selected).map((todoId) =>
        this.dataSyncProvider.crud("delete", "todos", { id: todoId })
      );

      Promise.all(archiveRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} project(s) archived successfully`);
          this.clearSelection();
          this.dataSyncService.loadAllData(true).subscribe();
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to archive projects");
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
      const deleteRequests = Array.from(selected).map((todoId) =>
        this.dataSyncProvider.crud("delete", "todos", { id: todoId })
      );

      Promise.all(deleteRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} project(s) deleted successfully`);
          this.selectedTodos.set(new Set());
          this.bulkService.setSelectionState(0, false);
          this.dataSyncService.loadAllData(true).subscribe();
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to delete projects");
        });
    }
  }
}
