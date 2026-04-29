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
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";
import { TableField } from "@components/table-view/table-field.model";

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
    CheckboxComponent,
    BulkActionsComponent,
    TableViewComponent,
    ViewModeSwitcherComponent,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksView extends BaseListView implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private dataSyncProvider = inject(ApiProvider);
  private cdr = inject(ChangeDetectorRef);
  private storageService = inject(StorageService);
  private dragDropService = inject(DragDropOrderService);
  public bulkService = inject(BulkActionService);
  private appStateService = inject(AppStateService);

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
    const taskId = this.routeTaskId();
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
  selectedSubtasks = this.selectedItems;

  // Computed signals for data flow - Always use storage as the single source of truth
  taskSubtasks = computed(() => {
    const taskFromSignal = this.task();
    const taskId = taskFromSignal?.id;
    if (!taskId) return [];
    // Always use storage data for real-time updates
    return this.storageService.getSubtasksByTaskId(taskId);
  });

  listSubtasks = computed(() => {
    let filtered = this.taskSubtasks();
    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    if (filter !== "all") {
      switch (filter) {
        case "active":
          filtered = FilterHelper.filterByStatus(filtered, "pending");
          break;
        case "completed":
          filtered = FilterHelper.filterByStatus(filtered, "completed");
          break;
        case "skipped":
          filtered = FilterHelper.filterByStatus(filtered, "skipped");
          break;
        case "failed":
          filtered = FilterHelper.filterByStatus(filtered, "failed");
          break;
        case "done":
          filtered = filtered.filter(
            (s) =>
              s.status === TaskStatus.COMPLETED ||
              s.status === TaskStatus.SKIPPED ||
              s.status === TaskStatus.FAILED
          );
          break;
        case "high":
          filtered = filtered.filter((s) => s.priority === "high");
          break;
      }
    }

    if (query) {
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          (s.description && s.description.toLowerCase().includes(query))
      );
    }

    const result = SortHelper.sortByOrder(filtered, "desc");
    return result;
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
          super.handleHighlightQueryParams(queryParams, "highlightSubtask", "subtask-", "ring-purple-500");
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

  toggleChat() {
    this.showChat.update((v) => !v);
  }

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
  }

  getUnreadCount(): number {
    const todoId = this.todoId();
    if (!todoId) return 0;
    const currentUserId = this.authService.getValueByKey("id");
    const chats = this.chats();
    return chats.filter((c) => !c.read_by || !c.read_by.includes(currentUserId)).length;
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
      .handleDrop(event, this.listSubtasks(), "subtasks", "subtasks", taskId, {
        isOwner: this.isOwner(),
        isPrivate: this.isPrivate(),
      })
      .subscribe();
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
   * Toggle select all subtasks in current view
   */
  override toggleSelectAll(): void {
    super.toggleSelectAll(
      () => this.listSubtasks(),
      () => this.isAllSelected()
    );
  }

  /**
   * Check if all subtasks are selected
   */
  override isAllSelected(): boolean {
    return super.isAllSelected(() => this.listSubtasks());
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
        // Storage is updated automatically by ApiProvider via WebSocket/Tauri
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
      const deleteRequests = Array.from(selected).map((subtaskId) =>
        this.dataSyncProvider.crud("delete", "subtasks", { id: subtaskId, parentTodoId: todoId })
      );

      Promise.all(deleteRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} subtask(s) deleted successfully`);
          this.clearSelection();
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to delete subtasks");
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
      const deleteRequests = Array.from(selected).map((subtaskId) =>
        this.dataSyncProvider.crud("delete", "subtasks", { id: subtaskId, parentTodoId: todoId })
      );

      Promise.all(deleteRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} subtask(s) archived successfully`);
          this.clearSelection();
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to archive subtasks");
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
