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
  NO_ERRORS_SCHEMA,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, CdkDragEnter, CdkDropList, DragDropModule } from "@angular/cdk/drag-drop";
import { filter } from "rxjs/operators";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { Todo } from "@models/generated/api.types";
import { Task, TaskStatus } from "@models/generated/api.types";
import { Subtask } from "@models/generated/api.types";
import { Chat } from "@models/generated/api.types";
import { RepeatInterval } from "@models/task-enums.model";

/* services */
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { Visibility } from "@services/api.service";
import { ApiService } from "@services/api.service";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";

import { AppStateService } from "@services/core/app-state.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { PromptDialogService } from "@services/core/prompt-dialog.service";
import { PermissionService, TodoPermission } from "@services/core/permission.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { SearchService } from "@services/core/search.service";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

/* helpers - tasks view */
import { TasksKanbanHelper } from "@helpers/tasks-kanban.helper";
import { TasksFiltersHelper } from "@helpers/tasks-filters.helper";
import { TasksActionsHelper } from "@helpers/tasks-actions.helper";
import { TasksCommentsHelper } from "@helpers/tasks-comments.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { LoadingStateComponent } from "@components/loading-state/loading-state.component";
import { ItemCardComponent } from "@components/item-card/item-card.component";
import { TASK_CARD_CONFIG } from "@constants/item-display.constants";
import { KanbanTaskCardComponent } from "@components/kanban-task-card/kanban-task-card.component";
import {
  PullToRefreshDirective,
  PullToRefreshIndicatorComponent,
} from "@components/pull-to-refresh";

@Component({
  selector: "app-tasks",
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    RouterModule,
    TodoInformationComponent,
    DragDropModule,
    BulkActionsComponent,
    TableViewComponent,
    EmptyStateComponent,
    PageToolbarComponent,
    ItemExpandDetailsComponent,
    LoadingStateComponent,
    ItemCardComponent,
    KanbanTaskCardComponent,
    PullToRefreshDirective,
    PullToRefreshIndicatorComponent,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView extends BaseListView implements OnInit, AfterViewInit {
  @ViewChild("taskPlaceholder", { read: CdkDropList }) private taskPlaceholder!: CdkDropList;

  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private promptDialogService = inject(PromptDialogService);

  public bulkService = inject(BulkActionService);

  private appStateService = inject(AppStateService);

  kanbanHelper = inject(TasksKanbanHelper);
  filtersHelper = inject(TasksFiltersHelper);
  actionsHelper = inject(TasksActionsHelper);
  commentsHelper = inject(TasksCommentsHelper);
  private syncService = inject(UnifiedSyncService);
  private permissionService = inject(PermissionService);
  private jwtTokenService = inject(JwtTokenService);
  private searchService = inject(SearchService);

  refreshState = signal<"idle" | "pulling" | "triggered" | "refreshing" | "complete">("idle");
  refreshDistance = signal(0);

  userPermission = signal<TodoPermission>(TodoPermission.VIEWER);

  canCreateTask = computed(() =>
    [
      TodoPermission.EDITOR,
      TodoPermission.ADMIN,
      TodoPermission.MODERATOR,
      TodoPermission.OWNER,
    ].includes(this.userPermission())
  );

  protected get selectedTasks() {
    return this.selectedItems;
  }

  protected getItems(): { id: string }[] {
    return this.listTasks();
  }

  userId: string = "";

  get filterFields() {
    return this.filtersHelper.filterFields;
  }

  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this.filtersHelper.onFiltersChange(filters);
  }

  showInfoBlock = computed(() => this.appStateService.showInfoBlock());
  showMobileInfo = signal(false);
  highlightTaskId = signal<string | null>(null);
  openComments = signal(false);

  taskCardConfig = TASK_CARD_CONFIG;

  todo = signal<Todo | null>(null);
  todoId = signal<string | null>(null);
  visibilityParam = signal<Visibility>("private");

  isOwner(): boolean {
    return this.userPermission() === TodoPermission.OWNER;
  }

  canEditTask(task: Task): boolean {
    return this.permissionService.canEditTask(task, this.userPermission(), this.userId);
  }

  canDeleteTask(task: Task): boolean {
    return this.permissionService.canDeleteTask(task, this.userPermission(), this.userId);
  }

  isPrivate(): boolean {
    const todo = this.todo();
    return todo?.visibility !== "shared";
  }

  todoTasks = signal<Task[]>([]);
  allTasksForTodo = computed(() => this.todoTasks());

  private async loadInitialTodo(todoId: string): Promise<void> {
    this.apiService.todos.get(todoId, this.visibilityParam()).subscribe({
      next: (todo) => {
        if (todo) {
          this.todo.set(todo);
          this.commentsHelper.setTodoVisibility((todo.visibility || "private") as Visibility);
          this.setUserPermission(todo);
          const tasks = todo.tasks || [];
          if (tasks.length > 0) {
            this.todoTasks.set(tasks);
            this.taskPagination.update((p) => ({
              ...p,
              skip: tasks.length,
              total: tasks.length,
              hasMore: false,
              loading: false,
            }));
          } else {
            this.loadInitialTasks();
          }
        } else {
          this.notifyService.showError("Todo not found.");
        }
      },
      error: () => {
        this.notifyService.showError("Failed to load todo.");
      },
    });
  }

  private async setUserPermission(todo: Todo): Promise<void> {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";
    const profileId =
      this.jwtTokenService.getProfileId(this.jwtTokenService.getToken() || "") || "";

    if (todo.user_id === userId) {
      this.userPermission.set(TodoPermission.OWNER);
      return;
    }

    if ((todo as any).assignee_roles && (todo as any).assignee_roles[userId]) {
      this.userPermission.set(this.permissionService.fromStr((todo as any).assignee_roles[userId]));
      return;
    }

    if (!todo.assignees?.includes(userId)) {
      this.userPermission.set(TodoPermission.VIEWER);
      return;
    }

    if (todo.visibility === "public") {
      this.userPermission.set(TodoPermission.VIEWER);
      return;
    }

    const token = this.jwtTokenService.getToken() || "";
    const assigneeRoles = await this.permissionService.getTodoPermissionsAsync(
      todo.id,
      todo.visibility || "private",
      token
    );

    const role = assigneeRoles[userId] || (profileId ? assigneeRoles[profileId] : null) || "viewer";
    this.userPermission.set(this.permissionService.fromStr(role));
  }

  taskPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  loadInitialTasks(forceRefresh = false) {
    const todoId = this.todoId();
    if (!todoId) return;

    const cachedTasks = this.storageService.tasksByTodoId().get(todoId) || [];

    if (cachedTasks.length > 0 && !forceRefresh) {
      const storedTotal = this.taskPagination().total;
      if (storedTotal > 0 && cachedTasks.length >= storedTotal) {
        this.todoTasks.set(cachedTasks);
        this.taskPagination.update((p) => ({
          ...p,
          skip: cachedTasks.length,
          total: storedTotal,
          hasMore: false,
          loading: false,
        }));
        return;
      }
    }

    this.taskPagination.update((p) => ({ ...p, loading: true }));
    const visibility = this.visibilityParam();
    this.apiService.tasks.getAll({ visibility, limit: 10, todoId }).subscribe({
      next: (tasks) => {
        this.todoTasks.set(tasks);
        this.taskPagination.update((p) => ({
          ...p,
          skip: tasks.length,
          total: tasks.length,
          hasMore: tasks.length >= 10,
          loading: false,
        }));
      },
      error: () => {
        this.taskPagination.update((p) => ({ ...p, loading: false }));
        this.notifyService.showError("Failed to load tasks");
      },
    });
  }

  loadMoreTasks() {
    if (this.taskPagination().loading || !this.taskPagination().hasMore) return;
    const todoId = this.todoId();
    if (!todoId) return;
    this.storageService.ensureTasksLoaded(this.visibilityParam(), 10, todoId);
  }

  override onSearchChange(query: string): void {
    super.onSearchChange(query);
    this.searchService.search("tasks", query);
  }

  listTasks = computed(() => {
    const query = this.searchQuery();
    if (query.trim()) {
      const searchResults = this.searchService.tasksResults();
      if (searchResults.length > 0) {
        return this.filtersHelper.listTasks(searchResults, "");
      }
    }
    return this.filtersHelper.listTasks(this.todoTasks(), query);
  });

  getTaskUnreadCommentsCount(task: Task): number {
    const userId = this.authService.getValueByKey("id");
    if (!userId) return 0;

    const currentChats = this.storageService.chats();
    if (currentChats.length === 0) return 0;

    let count = 0;
    const taskSubtasks = this.getTaskSubtasks(task.id);
    for (const _subtask of taskSubtasks) {
      const subtaskComments = currentChats.filter((c) => !c.deleted_at);
      if (subtaskComments.length === 0) continue;
      count += subtaskComments.filter((c: Chat) => {
        if (c.user_id === userId) return false;
        if (c.read_by && c.read_by.includes(userId)) return false;
        return true;
      }).length;
    }
    return count;
  }

  getTaskSubtasks(taskId: string): Subtask[] {
    return this.storageService.subtasksByTaskId().get(taskId) || [];
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
        count: this.selectedTasks().size,
        highlight: this.selectedTasks().size > 0 && !this.isAllSelected(),
      },
      filter: {
        onToggle: () => this.toggleFilter(),
        isActive: this.showFilter(),
      },
      newButton: this.canCreateTask()
        ? {
            onClick: () =>
              this.router.navigate(["create_task"], {
                relativeTo: this.route,
                queryParams: { visibility: this.todo()?.visibility },
              }),
            label: "New Task",
            icon: "add",
          }
        : undefined,
      viewMode: {
        mode: this.viewMode(),
        pageKey: "tasks",
        onModeChange: (mode) => this.setViewMode(mode),
        modes: ["card", "grid", "table", "kanban"],
      },
      refresh: {
        onClick: () => {
          this.refreshState.set("refreshing");
          this.syncService.refreshLocal().finally(() => {
            this.refreshState.set("idle");
          });
          this.loadInitialTasks(true);
        },
        loading: this.refreshState() === "refreshing",
      },
      filterFields: this.filtersHelper.filterFields,
      showFilter: this.showFilter(),
      onFiltersChange: (filters) => this.filtersHelper.onFiltersChange(filters),
    };
  }

  taskTableFields: TableField[] = [
    { key: "title", label: "Task", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", onClick: (item) => this.cycleStatus(item) },
  ];

  override ngOnInit(): void {
    super.ngOnInit();

    this.userId = this.authService.getValueByKey("id");
    this.pageKey = "tasks";

    this.viewMode.set(this.loadViewModePreference());

    this.bulkService.setMode("tasks");
    this.bulkService.updateTotalCount(0);

    this.subscriptions.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
        this.clearSelection();
      })
    );

    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: any) => {
        if (queryParams.visibility) {
          this.visibilityParam.set(queryParams.visibility as Visibility);
        }
        const highlightId = queryParams.highlightTaskId;
        if (highlightId) {
          this.highlightTaskId.set(highlightId);
        }
        super.handleHighlightQueryParams(queryParams, "highlightTaskId", "task-", () =>
          this.highlightTaskId.set(null)
        );
        if (queryParams.highlightCommentId) {
          this.commentsHelper["_highlightCommentId"].set(queryParams.highlightCommentId);
          this.openComments.set(true);
        }
        if (queryParams.openComments) {
          this.openComments.set(true);
        }
      })
    );

    const routeData = this.route.snapshot.data;
    if (!routeData?.["todo"] && !this.route.snapshot.paramMap.get("todoId")) {
      this.notifyService.showError("Invalid todo ID.");
    } else {
      const todoId = this.route.snapshot.paramMap.get("todoId") || routeData?.["todo"]?.id;
      if (todoId) {
        this.todoId.set(todoId);
        this.loadInitialTodo(todoId);
      }
    }

    this.loading.set(false);

    const filterSub = this.shortcutService.filter$.subscribe(() => {
      this.toggleFilter();
    });
    this.subscriptions.add(filterSub);

    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
      if (!this.authService.isLoggedIn()) {
        this.router.navigate(["/login"]);
        return;
      }
      this.refreshState.set("refreshing");
      this.syncService.refreshLocal().finally(() => {
        this.refreshState.set("idle");
      });
    });
    this.subscriptions.add(refreshSub);
  }

  onPullToRefresh(): Promise<void> {
    return this.syncService.syncAll() as unknown as Promise<void>;
  }

  toggleTaskCompletion(task: Task): void {
    this.actionsHelper.toggleTaskCompletion(
      task,
      this.todo(),
      (fn) => this.todoTasks.update(fn),
      (dependsOn) => this.checkDependenciesCompleted(dependsOn)
    );
  }

  cycleStatus(task: Task) {
    if (!this.canEditTask(task)) {
      this.notifyService.showError("You don't have permission to change task status");
      return;
    }
    this.toggleTaskCompletion(task);
  }

  onTaskStatusToggle(payload: { item: Task; status: TaskStatus }): void {
    const task = payload.item;
    if (!this.canEditTask(task)) {
      this.notifyService.showError("You don't have permission to change task status");
      return;
    }
    const status = payload.status;
    const todo = this.todo();
    if (!todo) return;

    this.apiService.tasks.update(task.id, { status }, todo.visibility || "private").subscribe({
      next: (updatedTask) => {
        this.storageService.modify("tasks", "update", { ...updatedTask, id: task.id });
        this.todoTasks.update((tasks) =>
          tasks.map((t) => (t.id === task.id ? { ...t, status } : t))
        );
      },
      error: () => {
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
    const parentTask = this.todoTasks().find((t) => t.id === subtask.task_id);
    if (!parentTask) {
      this.notifyService.showError("Parent task not found");
      return;
    }

    const todo = this.todo();
    if (!todo) {
      this.notifyService.showError("Parent todo not found");
      return;
    }

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    this.apiService.subtasks
      .update(subtask.id, { status: newStatus }, todo.visibility || "private")
      .subscribe({
        next: (updatedSubtask) => {
          this.storageService.modify("subtasks", "update", { ...updatedSubtask, id: subtask.id });
        },
        error: () => {
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
    const todoId = this.todoId();
    if (!todoId) return;

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

    this.apiService.tasks.create(nextTask as any, this.todo()?.visibility || "private").subscribe({
      next: (createdTask) => {
        this.notifyService.showInfo(`Next recurring task created: ${task.title}`);
        if (createdTask?.todo_id) {
          const parentTodo = this.todo();
          if (parentTodo) {
            this.storageService.modify("todos", "update", {
              id: createdTask.todo_id,
              tasks_count: (parentTodo.tasks_count || 0) + 1,
            });
          }
        }
      },
      error: () => {
        this.notifyService.showError("Failed to create recurring task");
      },
    });
  }

  toggleMobileInfo() {
    this.showMobileInfo.update((v) => !v);
  }

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
  }

  updateTaskInline(event: { task: Task; field: string; value: any }) {
    const todo = this.todo();
    if (!todo) return;

    this.apiService.tasks
      .update(event.task.id, { [event.field]: event.value }, todo.visibility || "private")
      .subscribe({
        next: (updatedTask) => {
          this.storageService.modify("tasks", "update", { ...updatedTask, id: event.task.id });
        },
        error: () => {
          this.notifyService.showError("Failed to update task");
        },
      });
  }

  onRowClick(event: { event: MouseEvent; item: any } | any): void {
    const task = event.item || event;
    if (!task?.id) return;

    const mouseEvent = event.event;

    if (mouseEvent?.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, task.id, this.listTasks());
        return;
      }
    } else if (mouseEvent?.ctrlKey || mouseEvent?.metaKey) {
      this.toggleItemSelection(task.id);
      this.lastSelectedId.set(task.id);
      return;
    }

    this.lastSelectedId.set(task.id);
    this.router.navigate([task.id, "subtasks"], {
      relativeTo: this.route,
      queryParams: { visibility: this.visibilityParam() },
    });
  }

  onCardClick(event: { event: MouseEvent; id: string }): void {
    if (event.event.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, event.id, this.listTasks());
        return;
      }
    } else if (event.event.ctrlKey || event.event.metaKey) {
      this.toggleItemSelection(event.id);
      this.lastSelectedId.set(event.id);
      return;
    }

    this.lastSelectedId.set(event.id);
    this.router.navigate([event.id, "subtasks"], {
      relativeTo: this.route,
      queryParams: { visibility: this.visibilityParam() },
    });
  }

  onRangeSelect(event: { anchorId: string; targetId: string }): void {
    this.selectRange(event.anchorId, event.targetId, this.listTasks());
  }

  onAdditiveSelect(id: string): void {
    this.toggleItemSelection(id);
    this.lastSelectedId.set(id);
  }

  getTaskTableActions(): TableFieldActionButton[] {
    return this.actionsHelper.getTaskTableActions(this.todo());
  }

  getTaskCardActions() {
    return this.actionsHelper.getTaskCardActions();
  }

  onTaskTableAction(event: { action: string; item: Task }): void {
    if (event.action === "delete") {
      if (!this.canDeleteTask(event.item)) {
        this.notifyService.showError("You don't have permission to delete this task");
        return;
      }
    }
    if (event.action === "edit") {
      if (!this.canEditTask(event.item)) {
        this.notifyService.showError("You don't have permission to edit this task");
        return;
      }
    }
    this.actionsHelper.onTaskTableAction(
      event,
      this.todo(),
      (fn) => this.todoTasks.update(fn),
      (dependsOn) => this.checkDependenciesCompleted(dependsOn),
      this.router,
      this.route,
      (taskId, visibility) => this.deleteTask(taskId, visibility),
      (taskId, visibility) => this.archiveTask(taskId, visibility),
      (task) => this.createOrUpdateGithubIssueFromTask(task)
    );
  }

  onTaskItemAction(event: { action: string; item: Task }): void {
    if (event.action === "delete") {
      if (!this.canDeleteTask(event.item)) {
        this.notifyService.showError("You don't have permission to delete this task");
        return;
      }
    }
    if (event.action === "edit") {
      if (!this.canEditTask(event.item)) {
        this.notifyService.showError("You don't have permission to edit this task");
        return;
      }
    }
    this.onTaskTableAction(event);
  }

  private createOrUpdateGithubIssueFromTask(task: Task): void {
    this.actionsHelper.createOrUpdateGithubIssueFromTask(task, this.todo());
  }

  onCommentToggle(taskId?: string): void {
    this.commentsHelper.onCommentToggle(taskId);
  }

  onTaskCommentAdd(event: { content: string; itemId: string }): void {
    if (this.userPermission() === TodoPermission.VIEWER) {
      this.notifyService.showError("Viewers cannot add comments");
      return;
    }
    this.commentsHelper.onTaskCommentAdd(event);
  }

  onTaskCommentDelete(commentId: string): void {
    this.commentsHelper.onTaskCommentDelete(commentId);
    this.apiService.comments.delete(commentId).subscribe();
  }

  onTaskCommentMarkAsRead(commentIds: string[]): void {
    this.commentsHelper.onTaskCommentMarkAsRead(commentIds);
  }

  onTaskSubtaskCommentAdd(event: { content: string; subtask_id: string; itemId: string }): void {
    if (this.userPermission() === TodoPermission.VIEWER) {
      this.notifyService.showError("Viewers cannot add comments");
      return;
    }
    this.commentsHelper.onTaskSubtaskCommentAdd(event);
  }

  async deleteTask(taskId?: string, visibility?: string) {
    await this.actionsHelper.deleteTask(
      taskId!,
      this.todoId(),
      (fn) => this.todoTasks.update(fn),
      visibility
    );
  }

  async archiveTask(taskId?: string, visibility?: string) {
    await this.actionsHelper.archiveTask(
      taskId!,
      this.todoId(),
      this.todo(),
      (fn) => this.todoTasks.update(fn),
      () => this.isOffline(),
      visibility
    );
  }

  ngAfterViewInit(): void {
    if (!this.taskPlaceholder?.element?.nativeElement) return;
    const el = this.taskPlaceholder.element.nativeElement as HTMLElement;
    el.style.display = "none";
    el.parentNode?.removeChild(el);
  }

  onTaskListEntered(event: CdkDragEnter): void {
    this.dragDropHandlerService.onListEntered(event, this.taskPlaceholder);
  }

  onTaskListDropped(): void {
    this.dragDropHandlerService.onListDropped(
      this.taskPlaceholder,
      (prev: number, curr: number) => {
        const todoId = this.todoId();
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
          .handleDrop(syntheticEvent, this.listTasks(), "tasks", "tasks", todoId, this.isPrivate())
          .subscribe({
            next: (updatedTasks) => {
              if (updatedTasks && Array.isArray(updatedTasks)) {
                this.todoTasks.update((current) => {
                  const updatedMap = new Map(updatedTasks.map((t) => [t.id, t]));
                  return current.map((task) => updatedMap.get(task.id) || task);
                });
              }
            },
            error: () => {
              this.notifyService.showError("Failed to reorder tasks");
            },
          });
      }
    );
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    const todoId = this.todoId();
    if (!todoId) return;

    this.dragDropService
      .handleDrop(event, this.listTasks(), "tasks", "tasks", todoId, this.isPrivate())
      .subscribe({
        next: (updatedTasks) => {
          if (updatedTasks && Array.isArray(updatedTasks)) {
            this.todoTasks.update((current) => {
              const updatedMap = new Map(updatedTasks.map((t) => [t.id, t]));
              return current.map((task) => updatedMap.get(task.id) || task);
            });
          }
        },
        error: () => {
          this.notifyService.showError("Failed to drop task");
        },
      });
  }

  toggleTaskSelection(event: { id: string; selected: boolean }) {
    const { id, selected } = event;
    if (selected) {
      this.lastSelectedId.set(id);
    }
    this.selectedTasks.update((selectedIds) => {
      const newSelected = new Set(selectedIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  override clearSelection() {
    super.clearSelection();
  }

  onTableSelectAll(selectAll: boolean): void {
    this.selectedTasks.update((taskIds) => {
      const newSelected = new Set(taskIds);
      if (selectAll) {
        this.listTasks().forEach((task) => newSelected.add(task.id));
      } else {
        this.listTasks().forEach((task) => newSelected.delete(task.id));
      }
      return newSelected;
    });
  }

  bulkUpdatePriority(priority: string) {
    this.actionsHelper.bulkUpdatePriority(
      this.selectedTasks(),
      priority,
      () => this.clearSelection(),
      (msg) => this.notifyService.showSuccess(msg),
      (id, data) => this.apiService.tasks.update(id, data)
    );
  }

  async bulkUpdateStatus(status: string) {
    await this.actionsHelper.bulkUpdateStatus(
      this.selectedTasks(),
      status,
      this.todo(),
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (id, data, options) => this.apiService.tasks.update(id, data, options?.visibility)
    );
  }

  async bulkDelete(): Promise<void> {
    await this.actionsHelper.bulkDelete(
      this.selectedTasks(),
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (id) => this.apiService.tasks.delete(id)
    );
  }

  async bulkArchive(): Promise<void> {
    await this.actionsHelper.bulkArchive(
      this.selectedTasks(),
      () => this.listTasks(),
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (forceRefresh) => this.loadInitialTasks(forceRefresh)
    );
  }

  async bulkRestoreTasks(selectedIds: string[]): Promise<void> {
    await this.actionsHelper.bulkRestoreTasks(
      selectedIds,
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (forceRefresh) => this.loadInitialTasks(forceRefresh)
    );
  }

  isAllSelectedArchivedTasks(): boolean {
    return this.actionsHelper.isAllSelectedArchivedTasks(this.selectedTasks(), () =>
      this.listTasks()
    );
  }

  async onBulkAction(actionId: string) {
    if (actionId === "delete") {
      await this.bulkDelete();
    } else {
      const val = await this.promptDialogService.prompt({
        title: `Enter new ${actionId}`,
        message: `Enter value for ${actionId}:`,
        required: true,
        validateFn: (v: string) => {
          if (!v.trim()) return "Value is required";
          return null;
        },
      });
      if (val) {
        actionId === "priority" ? this.bulkUpdatePriority(val) : await this.bulkUpdateStatus(val);
      }
    }
  }

  resolveTodoTitle(todoId: string): string {
    const todo = this.storageService.todoMap().get(todoId);
    return todo?.title || "-";
  }

  getKanbanColumns() {
    return this.kanbanHelper.getKanbanColumns();
  }

  getColumnColorClass = this.kanbanHelper.getColumnColorClass;

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.kanbanHelper.getTasksByStatus(this.listTasks(), status);
  }

  getConnectedKanbanDropLists(currentStatus: TaskStatus): string[] {
    return this.kanbanHelper.getConnectedKanbanDropLists(currentStatus);
  }

  onKanbanTaskDrop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    this.kanbanHelper.onKanbanTaskDrop(event, targetStatus, this.todo(), (taskId, newStatus) =>
      this.updateTaskStatus(taskId, newStatus)
    );
  }

  private updateTaskStatus(taskId: string, newStatus: TaskStatus): void {
    this.kanbanHelper.updateTaskStatus(taskId, newStatus, this.todo(), (fn) =>
      this.todoTasks.update(fn)
    );
  }

  onKanbanStatusCycle(task: Task): void {
    if (!this.canEditTask(task)) {
      this.notifyService.showError("You don't have permission to change task status");
      return;
    }
    this.kanbanHelper.onKanbanStatusCycle(task, (taskId, newStatus) =>
      this.updateTaskStatus(taskId, newStatus)
    );
  }

  onKanbanTaskClick(task: Task): void {
    this.kanbanHelper.onKanbanTaskClick(task, this.router, this.route);
  }

  onKanbanSelectionChange(taskId: string, isSelected: boolean): void {
    this.kanbanHelper.onKanbanSelectionChange(taskId, isSelected, (event) =>
      this.toggleTaskSelection(event)
    );
  }

  isKanbanTaskSelected(taskId: string): boolean {
    return this.kanbanHelper.isKanbanTaskSelected(taskId, this.selectedTasks());
  }
}
