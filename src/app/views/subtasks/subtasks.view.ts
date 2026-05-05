/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  signal,
  effect,
  ChangeDetectorRef,
  inject,
  computed,
  OnDestroy,
  HostListener,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { Subscription, firstValueFrom } from "rxjs";
import { filter, map } from "rxjs/operators";
import { toSignal } from "@angular/core/rxjs-interop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

interface QueryParams {
  fromKanban?: string;
  highlightSubtask?: string;
  openComments?: string;
  highlightComment?: string;
}

/* services */
import { AuthService } from "@services/auth/auth.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageService } from "@services/core/storage.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { AppStateService } from "@services/core/app-state.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilteredListHelper } from "@helpers/filtered-list.helper";
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField } from "@components/table-view/table-field.model";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";

@Component({
  selector: "app-subtasks",
  standalone: true,
  providers: [ApiProvider],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SubtaskComponent,
    TaskInformationComponent,
    FilterBarComponent,
    DragDropModule,
    ChatWindowComponent,
    BulkActionsComponent,
    TableViewComponent,
    EmptyStateComponent,
    PageToolbarComponent,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksView extends BaseListView implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dataSyncProvider = inject(ApiProvider);
  private cdr = inject(ChangeDetectorRef);
  private storageService = inject(StorageService);
  private dragDropService = inject(DragDropOrderService);
  public bulkService = inject(BulkActionService);
  private appStateService = inject(AppStateService);
  private authorizationService = inject(AuthorizationService);
  private dataLoaderService = inject(DataLoaderService);
  private bulkActionHelper = inject(BulkActionHelper);

  protected getItems(): { id: string }[] {
    return this.listSubtasks();
  }

  protected get selectedSubtasks() {
    return this.selectedItems;
  }

  // State signals
  showChat = signal(false);
  showMobileInfo = signal(false);
  showInfoBlock = computed(() => this.appStateService.showInfoBlock());
  todoId = signal("");
  projectTitle = signal("");
  chats = signal<any[]>([]);

  private chatEffect = effect(() => {
    const tid = this.todoId();
    if (tid) {
      const reactiveChats = this.storageService.getChatsByTodoReactive(tid)();
      this.chats.set(reactiveChats);
    }
  });

  // Reactive route param — re-evaluates when the route changes or data refreshes
  private readonly routeTaskId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("taskId") ?? null)),
    { initialValue: this.route.snapshot.paramMap.get("taskId") ?? null }
  );

  task = computed(() => {
    const taskId = this.routeTaskId() || this.route.snapshot.paramMap.get("taskId");
    if (!taskId) return null;
    return this.storageService.getTaskReactive(taskId)() || null;
  });

  todo = computed(() => {
    const t = this.task();
    if (!t?.todo_id) return null;
    return this.storageService.getTodoReactive(t.todo_id)() || null;
  });

  fromKanban = signal(false);
  highlightSubtask = signal<string | null>(null);
  highlightComment = signal<string | null>(null);
  /** When set, only this subtask should auto-open its comment block */
  openCommentsForSubtaskId = signal<string | null>(null);
  private routeSub?: Subscription;

  // Bulk selection state (like admin page)

  commentExpandedSubtasks = signal<Set<string>>(new Set());

  subtaskPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  taskSubtasks = signal<Subtask[]>([]);

  // Prevent infinite requests
  private isLoadingSubtasks = false;
  private lastLoadedTaskId: string | null = null;

  loadInitialSubtasks() {
    const taskId = this.task()?.id;
    const visibility = this.todo()?.visibility || "private";
    if (!taskId) return;

    // Prevent infinite loading - skip if already loading same task
    if (this.isLoadingSubtasks && this.lastLoadedTaskId === taskId) return;

    this.isLoadingSubtasks = true;
    this.lastLoadedTaskId = taskId;

    this.subtaskPagination.update((p) => ({ ...p, loading: true }));

    this.dataLoaderService.loadInitialSubtasksForTask(taskId, visibility).subscribe({
      next: (subtasks) => {
        this.taskSubtasks.set(subtasks);
        this.subtaskPagination.update((p) => ({
          ...p,
          skip: subtasks.length,
          loading: false,
          hasMore: subtasks.length === p.limit,
        }));
      },
      error: () => {
        this.subtaskPagination.update((p) => ({ ...p, loading: false }));
      },
      complete: () => {
        this.isLoadingSubtasks = false;
      },
    });
  }

  loadMoreSubtasks() {
    if (this.subtaskPagination().loading || !this.subtaskPagination().hasMore) return;
    const taskId = this.task()?.id;
    const visibility = this.todo()?.visibility || "private";
    if (!taskId) return;

    this.subtaskPagination.update((p) => ({ ...p, loading: true }));

    this.dataLoaderService.loadMoreSubtasksForTask(taskId, visibility).subscribe({
      next: (subtasks) => {
        this.taskSubtasks.update((current) => [...current, ...subtasks]);
        this.subtaskPagination.update((p) => ({
          ...p,
          skip: p.skip + subtasks.length,
          loading: false,
          hasMore: subtasks.length === p.limit,
        }));
      },
    });
  }

  constructor() {
    super();
    effect(() => {
      const taskId = this.task()?.id;
      if (taskId) {
        this.loadInitialSubtasks();
      }
    });
  }

  listSubtasks = computed(() => {
    return FilteredListHelper.filterAndSort(this.taskSubtasks(), {
      filter: this.activeFilter(),
      query: this.searchQuery(),
      filterType: "status",
    });
  });

  userId: string = "";

  isOwner = computed(() => this.todo()?.user_id === this.userId);
  isPrivate = computed(() => this.todo()?.visibility === "private");

  @HostListener("window:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "f") {
      event.preventDefault();
      this.toggleFilter();
    }
  }

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];

  subtaskTableFields: TableField[] = [
    { key: "title", label: "Subtask", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status" },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "Due Date", type: "date", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
  ];

  override ngOnInit(): void {
    super.ngOnInit();

    this.userId = this.authService.getValueByKey("id");
    this.pageKey = "subtasks";

    // Load view mode preference
    this.viewMode.set(this.loadViewModePreference());

    // Initialize bulk action service
    this.bulkService.setMode("subtasks");
    this.bulkService.updateTotalCount(0);

    // Clear selection when navigating away from this view
    this.subscriptions.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
        this.clearSelection();
      })
    );

    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: QueryParams) => {
        if (queryParams.fromKanban !== undefined) {
          this.fromKanban.set(queryParams.fromKanban === "true");
        }
        if (queryParams.highlightSubtask) {
          const id = queryParams.highlightSubtask;
          this.highlightSubtask.set(id);
          if (queryParams.openComments) {
            this.openCommentsForSubtaskId.set(id);
          }
          super.handleHighlightQueryParams(
            queryParams,
            "highlightSubtask",
            "subtask-",
            "ring-purple-500"
          );
          this.highlightSubtask.set(null);
        }
        if (queryParams.highlightComment) {
          this.highlightComment.set(queryParams.highlightComment);
          // Best-effort: when deep-linking to a comment, open all comment blocks
          this.openCommentsForSubtaskId.set("*");
        }
        if (
          !queryParams.openComments &&
          !queryParams.highlightSubtask &&
          !queryParams.highlightComment
        ) {
          this.openCommentsForSubtaskId.set(null);
        }
      })
    );

    const routeData = this.route.snapshot.data;
    if (routeData?.["task"]) {
      const dataResolve = routeData["task"];
      if (dataResolve?.["todo"]) {
        const todoData = dataResolve["todo"];
        this.todoId.set(todoData.id);
        this.projectTitle.set(todoData.title);
      }
      this.loading.set(false);
      this.cdr.detectChanges();
    } else {
      // Fallback: check storage directly
      const taskId = this.route.snapshot.paramMap.get("taskId");
      if (taskId) {
        const task = this.storageService.getById("tasks", taskId);
        if (task) {
          const todo = this.storageService.getById("todos", task.todo_id);
          if (todo) {
            this.todoId.set(todo.id);
            this.projectTitle.set(todo.title);
          }
        } else {
          this.notifyService.showError("Task not found. Please refresh.");
        }
        this.loading.set(false);
      } else {
        this.notifyService.showError("Invalid task ID.");
        this.loading.set(false);
      }
    }
  }

  onRowClick(subtask: any): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { highlightSubtask: subtask.id, openComments: "true" },
    });
  }

  onCommentToggle(subtaskId: string): void {
    this.highlightComment.set(null);
  }

  toggleChat() {
    this.showChat.update((v) => !v);
  }

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
  }

  getToolbarConfig(): PageToolbarConfig {
    return {
      infoToggle: {
        onToggle: () => this.toggleInfoBlock(),
        isActive: this.showInfoBlock(),
        label: "Info",
      },
      selectAll: {
        onToggle: () => this.toggleSelectAll(),
        isAllSelected: this.isAllSelected(),
        count: this.selectedSubtasks().size,
        highlight: this.selectedSubtasks().size > 0 && !this.isAllSelected(),
      },
      filter: {
        onToggle: () => this.toggleFilter(),
        isActive: this.showFilter(),
      },
      newButton: {
        onClick: () => this.router.navigate(["create_subtask"], { relativeTo: this.route }),
        label: "New Subtask",
        icon: "add",
      },
      viewMode: {
        mode: this.viewMode(),
        pageKey: "subtasks",
        onModeChange: (mode) => this.setViewMode(mode),
      },
    };
  }

  getUnreadCount(): number {
    const todoId = this.todoId();
    if (!todoId) return 0;
    const currentUserId = this.authService.getValueByKey("id");
    return this.storageService.getUnreadChatCount(todoId, currentUserId);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const todoId = this.todoId();

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    this.dataSyncProvider
      .crud<Subtask>("update", "subtasks", {
        id: subtask.id,
        data: { status: newStatus },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {
          // Storage updated automatically by ApiProvider
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to update subtask";
          this.notifyService.showError(message);
        },
      });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: unknown }) {
    const todoId = this.todoId();

    this.dataSyncProvider
      .crud<Subtask>("update", "subtasks", {
        id: event.subtask.id,
        data: { [event.field]: event.value },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {
          // Storage updated automatically by ApiProvider
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to update subtask";
          this.notifyService.showError(message);
        },
      });
  }

  deleteSubtask(id: string) {
    const todoId = this.todoId();

    if (!confirm("Are you sure?")) return;

    this.dataSyncProvider.crud("delete", "subtasks", { id, parentTodoId: todoId }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Subtask deleted successfully");
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to delete subtask";
        this.notifyService.showError(message);
      },
    });
  }

  onSubtaskDrop(event: CdkDragDrop<Subtask[]>): void {
    const taskId = this.task()?.id;
    if (!taskId) return;

    this.dragDropService
      .handleDrop(
        event,
        this.listSubtasks(),
        "subtasks",
        "subtasks",
        taskId,
        this.isPrivate() ? "private" : "shared"
      )
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error("Reorder subtasks failed:", err);
          this.notifyService.showError("Failed to reorder subtasks");
        },
      });
  }

  // Bulk Actions Methods

  /**
   * Toggle selection of a single subtask
   */
  toggleSubtaskSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    this.selectedSubtasks.update((subtaskIds) => {
      const newSelected = new Set(subtaskIds);
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
   * Bulk update status of selected subtasks
   */
  bulkUpdateStatus(status: string): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const todoId = this.todoId();

    const updatePromises = Array.from(selected).map((subtaskId) => {
      return firstValueFrom(
        this.dataSyncProvider.crud<Subtask>("update", "subtasks", {
          id: subtaskId,
          data: { status: status as TaskStatus },
          parentTodoId: todoId,
        })
      );
    });

    Promise.all(updatePromises)
      .then((results) => {
        // Storage is updated automatically by ApiProvider via Tauri
        this.notifyService.showSuccess(`${selected.size} subtask(s) updated`);
        this.clearSelection();
      })
      .catch((err) => {
        this.notifyService.showError(err.message || "Failed to update subtasks");
      });
  }

  /**
   * Bulk delete selected subtasks
   */
  bulkDelete(): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const todoId = this.todoId();

    if (confirm(`Are you sure you want to delete ${selected.size} subtask(s)?`)) {
      this.bulkActionHelper
        .bulkDelete(
          Array.from(selected).map((id) => ({ id })),
          (id) => this.dataSyncProvider.crud("delete", "subtasks", { id, parentTodoId: todoId })
        )
        .subscribe({
          next: (result) => {
            this.clearSelection();
            if (result.errorCount > 0) {
              this.notifyService.showWarning(
                `Deleted ${result.successCount} subtask(s), ${result.errorCount} failed.`
              );
            } else {
              this.notifyService.showSuccess(
                `${result.successCount} subtask(s) deleted successfully`
              );
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to delete subtasks");
          },
        });
    }
  }

  /**
   * Bulk archive selected subtasks (move to archive)
   */
  bulkArchive(): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const todoId = this.todoId();

    if (confirm(`Archive ${selected.size} subtask(s)?`)) {
      this.bulkActionHelper
        .bulkDelete(
          Array.from(selected).map((id) => ({ id })),
          (id) => this.dataSyncProvider.crud("delete", "subtasks", { id, parentTodoId: todoId })
        )
        .subscribe({
          next: (result) => {
            this.clearSelection();
            if (result.errorCount > 0) {
              this.notifyService.showWarning(
                `Archived ${result.successCount} subtask(s), ${result.errorCount} failed.`
              );
            } else {
              this.notifyService.showSuccess(
                `${result.successCount} subtask(s) archived successfully`
              );
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to archive subtasks");
          },
        });
    }
  }

  /**
   * Clear selection
   */
  override clearSelection(): void {
    super.clearSelection();
    this.bulkService.setSelectionState(0, false);
  }
}
