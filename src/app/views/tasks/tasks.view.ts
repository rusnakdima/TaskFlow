/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  signal,
  effect,
  inject,
  computed,
  HostListener,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import {
  CdkDragDrop,
  CdkDragEnter,
  CdkDropList,
  DragDropModule,
  DragRef,
} from "@angular/cdk/drag-drop";
import { Subscription, firstValueFrom } from "rxjs";
import { filter, map } from "rxjs/operators";
import { toSignal } from "@angular/core/rxjs-interop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus, RepeatInterval } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

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
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilterHelper } from "@helpers/filter.helper";
import { FilteredListHelper } from "@helpers/filtered-list.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper, BulkOperationResult } from "@helpers/bulk-action.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";
import { TableField } from "@components/table-view/table-field.model";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";

@Component({
  selector: "app-tasks",
  standalone: true,
  providers: [ApiProvider],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    RouterModule,
    TaskComponent,
    TodoInformationComponent,
    FilterBarComponent,
    ChatWindowComponent,
    DragDropModule,
    CheckboxComponent,
    BulkActionsComponent,
    TableViewComponent,
    ViewModeSwitcherComponent,
    EmptyStateComponent,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView extends BaseListView implements OnInit, AfterViewInit {
  @ViewChild("taskPlaceholder", { read: CdkDropList }) private taskPlaceholder!: CdkDropList;

  private dragTarget: CdkDropList | null = null;
  private dragTargetIndex = 0;
  private dragSource: CdkDropList | null = null;
  private dragSourceIndex = 0;
  private dragRef: DragRef | null = null;

  private storageService = inject(StorageService);
  private dataSyncProvider = inject(ApiProvider);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private bulkActionHelper = inject(BulkActionHelper);
  public bulkService = inject(BulkActionService);
  private dataLoaderService = inject(DataLoaderService);
  private appStateService = inject(AppStateService);
  private authorizationService = inject(AuthorizationService);

  protected getItems(): { id: string }[] {
    return this.listTasks();
  }

  protected get selectedTasks() {
    return this.selectedItems;
  }

  // State signals
  showInfoBlock = computed(() => this.appStateService.showInfoBlock());
  showMobileInfo = signal(false);
  highlightTaskId = signal<string | null>(null);
  highlightCommentId = signal<string | null>(null);
  openComments = signal(false);
  openChat = signal(false);
  chats = signal<any[]>([]);
  private routeSub?: Subscription;
  private loadingRelations = signal<Set<string>>(new Set());

  // Bulk selection state (like admin page)

  // Reactive route param — updates when navigating between todos without component destroy (H-11)
  private readonly routeTodoId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("todoId") ?? null)),
    { initialValue: this.route.snapshot.paramMap.get("todoId") ?? null }
  );

  private chatEffect = effect(() => {
    const tid = this.todo()?.id;
    if (tid) {
      const reactiveChats = this.storageService.getChatsByTodoReactive(tid)();
      this.chats.set(reactiveChats);
    }
  });

  private taskLoadEffect = effect(() => {
    const todoId = this.todo()?.id;
    if (todoId) {
      this.loadInitialTasks();
    }
  });

  todo = computed(() => {
    const tid = this.routeTodoId() || this.route.snapshot.data["todo"]?.id;
    if (!tid) return null;
    return this.storageService.getTodoReactive(tid)() || null;
  });

  isOwner = computed(() => this.todo()?.user_id === this.userId);
  isPrivate = computed(() => this.todo()?.visibility === "private");

  allTasksForTodo = computed(() => {
    const tid = this.todo()?.id;
    if (!tid) return [];
    return this.storageService.getTasksByTodoId(tid);
  });

  // Pagination state
  taskPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  // Lazy-loaded tasks signal
  todoTasks = signal<Task[]>([]);

  // Prevent infinite requests
  private isLoadingTasks = false;
  private lastLoadedTodoId: string | null = null;

  loadInitialTasks() {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    // Prevent infinite loading - skip if already loading same todo
    if (this.isLoadingTasks && this.lastLoadedTodoId === todoId) return;

    this.isLoadingTasks = true;
    this.lastLoadedTodoId = todoId;

    this.dataLoaderService.loadInitialTasksForTodo(todoId).subscribe({
      next: (tasks: Task[]) => {
        this.todoTasks.set(tasks);
        this.taskPagination.update((p) => ({
          ...p,
          skip: tasks.length,
          hasMore: tasks.length === p.limit,
        }));
      },
      error: () => {
        console.error("Failed to load tasks");
      },
      complete: () => {
        this.isLoadingTasks = false;
      },
    });
  }

  loadMoreTasks() {
    if (this.taskPagination().loading || !this.taskPagination().hasMore) return;
    const todoId = this.todo()?.id;
    if (!todoId) return;

    this.dataLoaderService.loadMoreTasksForTodo(todoId).subscribe({
      next: (tasks: Task[]) => {
        this.todoTasks.update((current) => [...current, ...tasks]);
        this.taskPagination.update((p) => ({
          ...p,
          skip: p.skip + tasks.length,
          loading: false,
          hasMore: tasks.length === p.limit,
        }));
      },
    });
  }

  listTasks = computed(() => {
    return FilteredListHelper.filterAndSort(this.todoTasks(), {
      filter: this.activeFilter(),
      query: this.searchQuery(),
      filterType: "status",
    });
  });

  // Get unread comments count for a task (from all subtasks, NOT task's own comments)
  // Only counts comments where user is NOT the author AND hasn't read
  getTaskUnreadCommentsCount(task: Task): number {
    const userId = this.authService.getValueByKey("id");
    if (!userId) return 0;

    const subtasks = this.storageService.getSubtasksByTaskId(task.id);
    if (subtasks.length === 0) return 0;

    let count = 0;
    for (const subtask of subtasks) {
      const subtaskComments = this.storageService
        .comments()
        .filter((c) => c.subtask_id === subtask.id && !c.deleted_at);
      if (subtaskComments.length === 0) continue;
      count += subtaskComments.filter((c: any) => {
        if (c.user_id === userId) return false;
        if (c.read_by && c.read_by.includes(userId)) return false;
        return true;
      }).length;
    }
    return count;
  }

  getTaskSubtasks(taskId: string): Subtask[] {
    return this.storageService.getSubtasksByTaskId(taskId);
  }

  userId: string = "";

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

  taskTableFields: TableField[] = [
    { key: "title", label: "Task", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status" },
    { key: "subtasks", label: "Subtasks", type: "array-count" },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "Due Date", type: "date", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
  ];

  override ngOnInit(): void {
    super.ngOnInit();

    this.userId = this.authService.getValueByKey("id");
    this.pageKey = "tasks";

    // Load view mode preference
    this.viewMode.set(this.loadViewModePreference());

    // Initialize bulk action service
    this.bulkService.setMode("tasks");
    this.bulkService.updateTotalCount(0);

    // Clear selection when navigating away from this view
    this.subscriptions.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
        this.clearSelection();
      })
    );

    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: any) => {
        super.handleHighlightQueryParams(queryParams, "highlightTaskId", "task-", "ring-green-500");
        if (queryParams.highlightCommentId) {
          this.highlightCommentId.set(queryParams.highlightCommentId);
          this.openComments.set(true);
        }
        if (queryParams.openComments) {
          this.openComments.set(true);
        }
        if (queryParams.openChat) {
          this.openChat.set(true);
        }
      })
    );

    // Get resolved todo data from route - todo is now computed from storage
    const routeData = this.route.snapshot.data;
    if (!routeData?.["todo"] && !this.route.snapshot.paramMap.get("todoId")) {
      this.notifyService.showError("Invalid todo ID.");
    }

    this.loading.set(false);
  }

  toggleTaskCompletion(task: Task) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    if (
      task.status === TaskStatus.PENDING &&
      !this.checkDependenciesCompleted(task.depends_on || [])
    ) {
      this.notifyService.showError("Cannot complete task: waiting for dependencies");
      return;
    }

    const newStatus = BaseItemHelper.getNextStatus(task.status);

    // Update task status via ApiProvider (storage updated automatically)
    this.dataSyncProvider
      .crud<Task>("update", "tasks", {
        id: task.id,
        data: { ...task, status: newStatus },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error("Update task status failed:", err);
          this.notifyService.showError("Failed to update task status");
        },
      });
  }

  toggleExpandTask(task: Task) {
    this.toggleExpandItem(task.id);
  }

  isTaskExpanded(taskId?: string): boolean {
    return this.isItemExpanded(taskId);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    // Update subtask status via ApiProvider (storage updated automatically)
    this.dataSyncProvider
      .crud<Subtask>("update", "subtasks", {
        id: subtask.id,
        data: { status: newStatus },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error("Update subtask status failed:", err);
          this.notifyService.showError("Failed to update subtask status");
        },
      });
  }

  checkDependenciesCompleted(dependsOn: string[]): boolean {
    if (!dependsOn?.length) return true;
    const tasks = this.todoTasks();
    return dependsOn.every((depId) => {
      const depTask = tasks.find((t) => t.id === depId);
      return (
        depTask &&
        (depTask.status === TaskStatus.COMPLETED || depTask.status === TaskStatus.SKIPPED)
      );
    });
  }

  generateNextRecurringTask(task: Task): void {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const todo = this.todo();
    const isPrivate = todo?.visibility !== "shared";

    const nextTask = { ...task };
    delete (nextTask as any)._id;
    nextTask.id = "";
    nextTask.status = TaskStatus.PENDING;
    nextTask.created_at = new Date().toISOString();
    nextTask.updated_at = nextTask.created_at;

    if (task.start_date) {
      const nextStart = new Date(task.start_date);
      const nextEnd = task.end_date ? new Date(task.end_date) : null;
      switch (task.repeat) {
        case RepeatInterval.DAILY:
          nextStart.setDate(nextStart.getDate() + 1);
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 1);
          break;
        case RepeatInterval.WEEKLY:
          nextStart.setDate(nextStart.getDate() + 7);
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 7);
          break;
        case RepeatInterval.MONTHLY:
          nextStart.setMonth(nextStart.getMonth() + 1);
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 1);
          break;
      }
      nextTask.start_date = nextStart.toISOString();
      if (nextEnd) nextTask.end_date = nextEnd.toISOString();
    }

    this.dataSyncProvider
      .crud<Task>("create", "tasks", {
        data: nextTask,
        parentTodoId: todoId,
        visibility: isPrivate ? "private" : "shared",
      })
      .subscribe({
        next: (result: Task) => {
          // Storage updated automatically by ApiProvider
          this.notifyService.showInfo(`Next recurring task created: ${task.title}`);
        },
        error: () => {
          this.notifyService.showError("Failed to create recurring task");
        },
      });
  }

  toggleChat() {
    this.openChat.update((v) => !v);
  }

  toggleMobileInfo() {
    this.showMobileInfo.update((v) => !v);
  }

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
  }

  getUnreadCount(): number {
    const todoId = this.todo()?.id;
    if (!todoId) return 0;
    const currentUserId = this.authService.getValueByKey("id");
    return this.storageService.getUnreadChatCount(todoId, currentUserId);
  }

  updateTaskInline(event: { task: Task; field: string; value: any }) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    // Update task via ApiProvider (storage updated automatically)
    this.dataSyncProvider
      .crud<Task>("update", "tasks", {
        id: event.task.id,
        data: { [event.field]: event.value },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error("Update task failed:", err);
          this.notifyService.showError("Failed to update task");
        },
      });
  }

  onRowClick(task: any): void {
    this.router.navigate([task.id, "subtasks"], { relativeTo: this.route });
  }

  onCommentToggle(taskId: string): void {
    this.highlightCommentId.set(null);
  }

  deleteTask(taskId?: string) {
    const todoId = this.todo()?.id;
    if (!todoId || !taskId) return;

    if (!confirm("Are you sure?")) return;

    this.dataSyncProvider.crud("delete", "tasks", { id: taskId, parentTodoId: todoId }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Task deleted successfully");
      },
    });
  }

  ngAfterViewInit(): void {
    if (!this.taskPlaceholder?.element?.nativeElement) return;
    const el = this.taskPlaceholder.element.nativeElement as HTMLElement;
    el.style.display = "none";
    el.parentNode?.removeChild(el);
  }

  onTaskListEntered(event: CdkDragEnter): void {
    const { item, container } = event;
    if (container === this.taskPlaceholder) return;
    if (!this.taskPlaceholder?.element?.nativeElement) return;

    const placeholderEl = this.taskPlaceholder.element.nativeElement as HTMLElement;
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

    this.taskPlaceholder._dropListRef.enter(
      item._dragRef,
      item.element.nativeElement.offsetLeft,
      item.element.nativeElement.offsetTop
    );
  }

  onTaskListDropped(): void {
    this.dragDropHandlerService.onListDropped<Task>(
      this.taskPlaceholder,
      (prev: number, curr: number) => {
        const todoId = this.todo()?.id;
        if (!todoId) return;

        const syntheticEvent = {
          previousIndex: prev,
          currentIndex: curr,
          item: null,
          container: null,
          previousContainer: null,
          distance: { x: 0, y: 0 },
        } as unknown as CdkDragDrop<Task[]>;

        this.dragDropService
          .handleDrop(
            syntheticEvent,
            this.listTasks(),
            "tasks",
            "tasks",
            todoId,
            this.isPrivate() ? "private" : "shared"
          )
          .subscribe({
            next: () => {},
            error: (err) => {
              console.error("Reorder tasks failed:", err);
              this.notifyService.showError("Failed to reorder tasks");
            },
          });
      }
    );
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    this.dragDropService
      .handleDrop(
        event,
        this.listTasks(),
        "tasks",
        "tasks",
        todoId,
        this.isPrivate() ? "private" : "shared"
      )
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error("Task drop failed:", err);
          this.notifyService.showError("Failed to drop task");
        },
      });
  }

  /**
   * Toggle selection of a single task
   */
  toggleTaskSelection(event: { id: string; selected: boolean }) {
    const { id, selected } = event;
    this.selectedTasks.update((selectedIds) => {
      const newSelected = new Set(selectedIds);
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

  override clearSelection() {
    super.clearSelection();
    this.bulkService.setSelectionState(0, false);
  }

  bulkUpdatePriority(priority: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());

    this.bulkActionHelper
      .bulkUpdateField(
        selectedIds.map((id) => ({ id })),
        "priority",
        priority,
        (id, data) =>
          this.dataSyncProvider.crud<Task>("update", "tasks", { id, data, parentTodoId: todoId })
      )
      .subscribe({
        next: (result: BulkOperationResult) => {
          // Storage updated automatically by ApiProvider for each successful update
          this.clearSelection();
          if (result.errorCount > 0) {
            this.notifyService.showWarning(
              `Updated ${result.successCount} tasks, ${result.errorCount} failed.`
            );
          } else {
            this.notifyService.showSuccess(`Updated ${result.successCount} tasks.`);
          }
        },
      });
  }

  bulkUpdateStatus(status: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());

    if (selectedIds.length === 0) {
      return;
    }

    const updatePromises = Array.from(selectedIds).map((id) => {
      return firstValueFrom(
        this.bulkActionHelper.bulkUpdateStatus([{ id, status: "" }], status, (id, data) => {
          return this.dataSyncProvider.crud<Task>("update", "tasks", {
            id,
            data: { status: status as TaskStatus },
            parentTodoId: todoId,
          });
        })
      );
    });

    Promise.all(updatePromises)
      .then(() => {
        this.clearSelection();
        this.notifyService.showSuccess(`${selectedIds.length} task(s) updated`);
      })
      .catch((err) => {
        this.notifyService.showError("Failed to update tasks");
      });
  }

  bulkDelete() {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (!confirm(`Delete ${selectedIds.length} tasks?`)) return;

    this.bulkActionHelper
      .bulkDelete(
        selectedIds.map((id) => ({ id })),
        (id) => this.dataSyncProvider.crud("delete", "tasks", { id, parentTodoId: todoId })
      )
      .subscribe({
        next: (result) => {
          // Storage updated automatically by ApiProvider for each successful delete
          this.clearSelection();
          if (result.errorCount > 0) {
            this.notifyService.showWarning(
              `Deleted ${result.successCount} tasks, ${result.errorCount} failed.`
            );
          } else {
            this.notifyService.showSuccess(`Deleted ${result.successCount} tasks.`);
          }
        },
      });
  }

  /**
   * Bulk archive selected tasks (move to archive)
   */
  bulkArchive() {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (selectedIds.length === 0) return;

    if (confirm(`Archive ${selectedIds.length} task(s)?`)) {
      this.bulkActionHelper
        .bulkDelete(
          selectedIds.map((id) => ({ id })),
          (id) => this.dataSyncProvider.crud("delete", "tasks", { id, parentTodoId: todoId })
        )
        .subscribe({
          next: (result) => {
            this.clearSelection();
            if (result.errorCount > 0) {
              this.notifyService.showWarning(
                `Archived ${result.successCount} tasks, ${result.errorCount} failed.`
              );
            } else {
              this.notifyService.showSuccess(`Archived ${result.successCount} tasks.`);
            }
          },
        });
    }
  }

  onBulkAction(actionId: string) {
    if (actionId === "delete") this.bulkDelete();
    else {
      const val = prompt(`Enter new ${actionId}:`);
      if (val) actionId === "priority" ? this.bulkUpdatePriority(val) : this.bulkUpdateStatus(val);
    }
  }
}
